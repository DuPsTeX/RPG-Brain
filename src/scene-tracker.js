// scene-tracker.js — Trackt die aktuelle Szene (Ort, anwesende Charaktere, Quest-Status)
// Wird nach jeder Nachricht aktualisiert via leichtgewichtigen LLM-Call

export class SceneTracker {
  /**
   * @param {EntityManager} entityManager
   * @param {Function} getSettings
   */
  constructor(entityManager, getSettings) {
    this.entityManager = entityManager;
    this._getSettings = getSettings;

    // Aktuelle Szene
    this._currentScene = {
      ort: null,           // Name des aktuellen Orts
      anwesende: [],       // Namen der anwesenden Charaktere
      questUpdates: [],    // [{name, status}] — Quest-Änderungen
      messageIndex: -1,    // Zu welcher Nachricht gehört diese Szene
    };

    // History-Stack für Undo (max 50 Einträge)
    this._history = [];
    this._maxHistory = 50;

    this._isAnalyzing = false;
  }

  /**
   * Aktuelle Szene abrufen.
   * @returns {{ort: string|null, anwesende: string[], questUpdates: Array, messageIndex: number}}
   */
  getCurrentScene() {
    return { ...this._currentScene };
  }

  /**
   * Prüft ob ein Charakter-Name in der aktuellen Szene anwesend ist.
   * @param {string} name
   * @returns {boolean}
   */
  isPresent(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return this._currentScene.anwesende.some(n => n.toLowerCase() === lower);
  }

  /**
   * Nach einer neuen Nachricht: Szene analysieren.
   * @param {number} messageIndex
   */
  async onMessageReceived(messageIndex) {
    if (this._isAnalyzing) return;
    this._isAnalyzing = true;

    try {
      const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
      if (!context?.chat || context.chat.length === 0) return;

      // Letzte 3 Nachrichten als Kontext für Szene-Analyse
      const recentMessages = context.chat.slice(-3)
        .filter(msg => msg.mes && !msg.is_system)
        .map(msg => {
          const sender = msg.is_user ? 'User' : (msg.name || 'Character');
          return `[${sender}]: ${msg.mes}`;
        })
        .join('\n');

      if (!recentMessages.trim()) return;

      // Bekannte Entity-Namen sammeln für Kontext
      const knownNames = this.entityManager.getKnownNames();
      const knownCharacters = knownNames.charakter || [];
      const knownOrte = knownNames.ort || [];
      const knownQuests = knownNames.quest || [];

      // Aktive Quests für Kontext
      const activeQuests = this.entityManager.getEntitiesByType('quest')
        .filter(q => q.data.status === 'aktiv')
        .map(q => q.data.name);

      // Szene-Analyse Prompt
      const sceneResult = await this._analyzeScene(
        recentMessages, knownCharacters, knownOrte, activeQuests,
      );

      if (!sceneResult) return;

      // Alte Szene in History pushen
      this._pushHistory();

      // Neue Szene setzen
      this._currentScene = {
        ort: sceneResult.ort || this._currentScene.ort,
        anwesende: sceneResult.anwesende || this._currentScene.anwesende,
        questUpdates: sceneResult.quest_updates || [],
        messageIndex,
      };

      // Quest-Status automatisch aktualisieren
      await this._applyQuestUpdates(sceneResult.quest_updates || []);

      // Szene persistieren
      this._persist();

      console.log(`[RPG-Brain] Szene aktualisiert: Ort="${this._currentScene.ort}", Anwesende=[${this._currentScene.anwesende.join(', ')}]`);

    } catch (err) {
      console.warn('[RPG-Brain] Szene-Analyse fehlgeschlagen:', err.message);
    } finally {
      this._isAnalyzing = false;
    }
  }

  /**
   * Nachricht gelöscht → Szene auf vorherigen Stand zurücksetzen.
   * @param {number} remainingCount — Anzahl verbleibender Nachrichten
   */
  onMessageDeleted(remainingCount) {
    // History durchsuchen: letzte Szene VOR der gelöschten Nachricht finden
    while (this._history.length > 0) {
      const prev = this._history[this._history.length - 1];
      if (prev.messageIndex < remainingCount) {
        // Diese Szene ist noch gültig → wiederherstellen
        this._currentScene = { ...prev };
        this._persist();
        console.log(`[RPG-Brain] Szene zurückgesetzt auf Index ${prev.messageIndex}: Ort="${prev.ort}", Anwesende=[${prev.anwesende.join(', ')}]`);
        return;
      }
      // Diese Szene gehört zu einer gelöschten Nachricht → auch entfernen
      this._history.pop();
    }

    // Kein History mehr → Reset
    this._currentScene = {
      ort: null,
      anwesende: [],
      questUpdates: [],
      messageIndex: -1,
    };
    console.log('[RPG-Brain] Szene komplett zurückgesetzt (keine History)');
  }

  /**
   * Szene aus Chat-Metadata laden (bei Chat-Wechsel).
   */
  loadStateForChat() {
    const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
    const metadata = context?.chatMetadata;

    if (metadata?.rpgBrainScene) {
      this._currentScene = { ...metadata.rpgBrainScene };
      this._history = metadata.rpgBrainSceneHistory || [];
      console.log(`[RPG-Brain] Szene geladen: Ort="${this._currentScene.ort}", Anwesende=[${this._currentScene.anwesende.join(', ')}]`);
    } else {
      this._currentScene = { ort: null, anwesende: [], questUpdates: [], messageIndex: -1 };
      this._history = [];
    }
  }

  /**
   * Szene in Chat-Metadata persistieren.
   */
  _persist() {
    const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
    if (!context?.chatMetadata) return;

    context.chatMetadata.rpgBrainScene = { ...this._currentScene };
    context.chatMetadata.rpgBrainSceneHistory = this._history.slice(-this._maxHistory);
    context.saveMetadataDebounced();
  }

  /**
   * Aktuelle Szene in History speichern.
   */
  _pushHistory() {
    if (this._currentScene.messageIndex >= 0) {
      this._history.push({ ...this._currentScene });
      if (this._history.length > this._maxHistory) {
        this._history.shift();
      }
    }
  }

  /**
   * Quest-Updates aus der Szene-Analyse anwenden.
   */
  async _applyQuestUpdates(updates) {
    if (!updates || updates.length === 0) return;

    for (const update of updates) {
      if (!update.name || !update.status) continue;

      const quest = this.entityManager.findByName('quest', update.name);
      if (quest && quest.data.status !== update.status) {
        try {
          await this.entityManager.updateEntity(quest.id, { status: update.status });
          console.log(`[RPG-Brain] Quest "${update.name}" → ${update.status}`);
        } catch (err) {
          console.warn(`[RPG-Brain] Quest-Update fehlgeschlagen:`, err.message);
        }
      }
    }
  }

  /**
   * Leichtgewichtiger LLM-Call für Szene-Analyse.
   * Nutzt die gleiche LLM-Konfiguration wie die Extraktion.
   */
  async _analyzeScene(messageText, knownCharacters, knownOrte, activeQuests) {
    const settings = this._getSettings();
    const language = settings.language || 'de';

    const prompt = this._buildScenePrompt(
      messageText, knownCharacters, knownOrte, activeQuests, language,
    );

    // LLM-Call (gleicher Fallback wie extraction-trigger)
    const response = await this._callSceneLlm(prompt, settings);
    if (!response) return null;

    return this._parseSceneResponse(response);
  }

  /**
   * Baut den Szene-Analyse Prompt.
   */
  _buildScenePrompt(messageText, characters, orte, quests, language) {
    if (language === 'en') {
      return `Analyze the current RPG scene from these messages and answer as JSON ONLY.

Known characters: ${characters.join(', ') || 'none'}
Known locations: ${orte.join(', ') || 'none'}
Active quests: ${quests.join(', ') || 'none'}

Messages:
${messageText}

Answer ONLY with this JSON (no markdown, no explanation):
{"ort":"current location name","anwesende":["character names present in scene"],"quest_updates":[{"name":"quest name","status":"aktiv or abgeschlossen or fehlgeschlagen"}]}

Rules:
- "anwesende": ONLY characters physically present/interacting RIGHT NOW
- "ort": The current location where the scene takes place
- "quest_updates": ONLY if a quest status clearly changed in these messages, otherwise empty []
- Use known names when possible`;
    }

    return `Analysiere die aktuelle RPG-Szene aus diesen Nachrichten und antworte NUR als JSON.

Bekannte Charaktere: ${characters.join(', ') || 'keine'}
Bekannte Orte: ${orte.join(', ') || 'keine'}
Aktive Quests: ${quests.join(', ') || 'keine'}

Nachrichten:
${messageText}

Antworte NUR mit diesem JSON (kein Markdown, keine Erklärung):
{"ort":"aktueller Ortsname","anwesende":["Charakternamen die in der Szene anwesend sind"],"quest_updates":[{"name":"Questname","status":"aktiv oder abgeschlossen oder fehlgeschlagen"}]}

Regeln:
- "anwesende": NUR Charaktere die JETZT GERADE physisch anwesend/aktiv in der Szene sind
- "ort": Der aktuelle Ort wo die Szene stattfindet
- "quest_updates": NUR wenn sich ein Quest-Status in diesen Nachrichten klar geändert hat, sonst leeres Array []
- Verwende bekannte Namen wenn möglich`;
  }

  /**
   * Parst die LLM-Antwort der Szene-Analyse.
   */
  _parseSceneResponse(response) {
    if (!response || typeof response !== 'string') return null;

    let text = response.trim();

    // Markdown Codeblock entfernen
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      text = codeBlockMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(text);
      // Validierung
      if (typeof parsed.ort === 'string' && Array.isArray(parsed.anwesende)) {
        return {
          ort: parsed.ort || null,
          anwesende: parsed.anwesende.filter(n => typeof n === 'string'),
          quest_updates: Array.isArray(parsed.quest_updates) ? parsed.quest_updates : [],
        };
      }
    } catch {
      // JSON aus dem Text extrahieren
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            ort: parsed.ort || null,
            anwesende: Array.isArray(parsed.anwesende) ? parsed.anwesende : [],
            quest_updates: Array.isArray(parsed.quest_updates) ? parsed.quest_updates : [],
          };
        } catch {
          // Fallthrough
        }
      }
    }

    console.warn('[RPG-Brain] Szene-Antwort konnte nicht geparst werden:', text.slice(0, 200));
    return null;
  }

  /**
   * LLM-Call mit 3-Tier Fallback (wie extraction-trigger).
   * Aber mit kleinerem max_tokens da die Antwort kurz ist.
   */
  async _callSceneLlm(prompt, settings) {
    const llmConfig = settings.extractionLlm;

    // 1. Externer LLM
    if (llmConfig?.apiUrl && llmConfig?.model) {
      try {
        return await this._callOpenAICompatible(prompt, llmConfig);
      } catch (err) {
        console.warn('[RPG-Brain] Scene-LLM extern fehlgeschlagen:', err.message);
      }
    }

    // 2. SillyTavern Backend
    try {
      return await this._callViaSillyTavern(prompt);
    } catch (err) {
      console.warn('[RPG-Brain] Scene-LLM ST Backend fehlgeschlagen:', err.message);
    }

    // 3. generateQuietPrompt
    const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
    if (context && typeof context.generateQuietPrompt === 'function') {
      return context.generateQuietPrompt(prompt);
    }

    return null;
  }

  async _callOpenAICompatible(prompt, config) {
    const url = config.apiUrl.replace(/\/+$/, '');
    const endpoint = url.includes('/chat/completions') ? url : `${url}/chat/completions`;

    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: 'Du bist ein RPG-Szene-Analysator. Antworte NUR mit JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  }

  async _callViaSillyTavern(prompt) {
    const ctx = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
    if (!ctx || ctx.mainApi !== 'openai') return null;

    const settings = ctx.chatCompletionSettings;
    if (!settings) return null;

    const source = settings.chat_completion_source;
    const SOURCE_MODEL_MAP = {
      openai: 'openai_model', claude: 'claude_model', openrouter: 'openrouter_model',
      deepseek: 'deepseek_model', custom: 'custom_model', makersuite: 'google_model',
      mistralai: 'mistralai_model', cohere: 'cohere_model', groq: 'groq_model',
    };

    const modelField = SOURCE_MODEL_MAP[source];
    const model = modelField ? settings[modelField] : null;
    if (!model) return null;

    const headers = ctx.getRequestHeaders();

    const payload = {
      messages: [
        { role: 'system', content: 'Du bist ein RPG-Szene-Analysator. Antworte NUR mit JSON.' },
        { role: 'user', content: prompt },
      ],
      model,
      temperature: 0.2,
      max_tokens: 500,
      chat_completion_source: source,
      stream: false,
    };

    if (settings.reverse_proxy) {
      payload.reverse_proxy = settings.reverse_proxy;
      if (settings.proxy_password) payload.proxy_password = settings.proxy_password;
    }

    const response = await fetch('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`ST API ${response.status}`);

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (msg?.content) return msg.content;
    return data.choices?.[0]?.text || null;
  }
}
