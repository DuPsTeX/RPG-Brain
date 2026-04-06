// scene-tracker.js — Trackt die aktuelle Szene (Ort, anwesende Charaktere, Quest-Status)
// Hybrid-Ansatz: Schnelles Pattern-Matching (immer) + optionaler LLM-Call (wenn verfügbar)

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
   */
  getCurrentScene() {
    return { ...this._currentScene };
  }

  /**
   * Prüft ob ein Charakter-Name in der aktuellen Szene anwesend ist.
   */
  isPresent(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return this._currentScene.anwesende.some(n => n.toLowerCase() === lower);
  }

  /**
   * Nach einer neuen Nachricht: Szene analysieren.
   * PHASE 1: Schnelles Pattern-Matching (immer, sofort)
   * PHASE 2: Optionaler LLM-Call für genauere Analyse (wenn konfiguriert)
   */
  async onMessageReceived(messageIndex) {
    if (this._isAnalyzing) return;
    this._isAnalyzing = true;

    try {
      const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
      if (!context?.chat || context.chat.length === 0) return;

      // Letzte 3 Nachrichten als Text
      const recentMessages = context.chat.slice(-3)
        .filter(msg => msg.mes && !msg.is_system)
        .map(msg => msg.mes)
        .join('\n');

      if (!recentMessages.trim()) return;

      // Letzte einzelne Nachricht (für Ort-Erkennung)
      const lastMessage = context.chat[context.chat.length - 1];
      const lastText = lastMessage?.mes || '';

      // PHASE 1: Pattern-Matching (sofort, kein LLM nötig)
      const patternResult = this._analyzeByPatternMatching(recentMessages, lastText);

      if (patternResult) {
        // Alte Szene in History pushen
        this._pushHistory();

        // Neue Szene setzen
        this._currentScene = {
          ort: patternResult.ort || this._currentScene.ort,
          anwesende: patternResult.anwesende.length > 0
            ? patternResult.anwesende
            : this._currentScene.anwesende,
          questUpdates: [],
          messageIndex,
        };

        this._persist();
        console.log(`[RPG-Brain] Szene (Pattern): Ort="${this._currentScene.ort}", Anwesende=[${this._currentScene.anwesende.join(', ')}]`);
      }

      // PHASE 2: LLM-Call (optional, asynchron, überschreibt Pattern-Ergebnis)
      this._tryLlmAnalysis(recentMessages, messageIndex);

    } catch (err) {
      console.warn('[RPG-Brain] Szene-Analyse fehlgeschlagen:', err.message);
    } finally {
      this._isAnalyzing = false;
    }
  }

  /**
   * PHASE 1: Schnelles Pattern-Matching basierend auf bekannten Entity-Namen.
   * Funktioniert IMMER, ohne LLM-Call.
   */
  _analyzeByPatternMatching(recentText, lastText) {
    const textLower = recentText.toLowerCase();
    const lastLower = lastText.toLowerCase();

    // --- Anwesende Charaktere erkennen ---
    const knownChars = this.entityManager.getEntitiesByType('charakter');
    const anwesende = [];

    for (const char of knownChars) {
      const name = char.data.name;
      if (!name) continue;
      const nameLower = name.toLowerCase();

      // Name kommt in den letzten Nachrichten vor?
      if (textLower.includes(nameLower)) {
        anwesende.push(name);
      }
    }

    // --- Aktueller Ort erkennen ---
    const knownOrte = this.entityManager.getEntitiesByType('ort');
    let bestOrt = null;
    let bestOrtScore = 0;

    for (const ort of knownOrte) {
      const ortName = ort.data.name;
      if (!ortName) continue;
      const ortLower = ortName.toLowerCase();

      // Ort in letzter Nachricht? (höherer Score)
      if (lastLower.includes(ortLower)) {
        const score = ortName.length + 10; // Längerer Name = spezifischer
        if (score > bestOrtScore) {
          bestOrt = ortName;
          bestOrtScore = score;
        }
      }
      // Ort in letzten 3 Nachrichten?
      else if (textLower.includes(ortLower)) {
        const score = ortName.length;
        if (score > bestOrtScore) {
          bestOrt = ortName;
          bestOrtScore = score;
        }
      }
    }

    // Ort-Hinweise in Beschreibungen suchen (z.B. "betritt die Gilde", "in der Taverne")
    if (!bestOrt) {
      const ortHinweise = this._detectLocationHints(lastLower, knownOrte);
      if (ortHinweise) bestOrt = ortHinweise;
    }

    return {
      ort: bestOrt,
      anwesende,
    };
  }

  /**
   * Erkennt Ort-Hinweise aus dem Text (Schlüsselwörter + bekannte Ort-Beschreibungen).
   */
  _detectLocationHints(textLower, knownOrte) {
    // Suche nach Ort-Typ-Wörtern in der Nähe von bekannten Orten
    const locationKeywords = [
      'betritt', 'betreten', 'ankommen', 'ankommt', 'erreicht', 'erreichen',
      'steht vor', 'stehen vor', 'geht in', 'gehen in', 'kommt in', 'kommen in',
      'befindet sich in', 'befinden sich in', 'ist in', 'sind in',
      'enter', 'arrive', 'reach', 'inside', 'walk into',
    ];

    for (const ort of knownOrte) {
      const ortName = ort.data.name;
      if (!ortName) continue;

      // Prüfe ob der Ort-Name teilweise im Text vorkommt
      const ortWords = ortName.toLowerCase().split(/\s+/);
      for (const word of ortWords) {
        if (word.length < 4) continue; // Zu kurze Wörter ignorieren
        if (textLower.includes(word)) {
          // Prüfe ob ein Location-Keyword in der Nähe ist
          for (const kw of locationKeywords) {
            if (textLower.includes(kw)) {
              return ortName;
            }
          }
        }
      }

      // Prüfe Ort-Beschreibung
      if (ort.data.beschreibung) {
        const beschrWords = ort.data.beschreibung.toLowerCase().split(/\s+/);
        const uniqueWords = beschrWords.filter(w => w.length > 5);
        const matchCount = uniqueWords.filter(w => textLower.includes(w)).length;
        if (matchCount >= 3) return ortName;
      }
    }

    return null;
  }

  /**
   * PHASE 2: Optionaler LLM-Call — verbessert Pattern-Matching Ergebnis.
   * Läuft asynchron im Hintergrund, überschreibt die Szene wenn erfolgreich.
   */
  async _tryLlmAnalysis(messageText, messageIndex) {
    const settings = this._getSettings();
    const llmConfig = settings.extractionLlm;

    // Nur wenn ein externer LLM konfiguriert ist
    if (!llmConfig?.apiUrl || !llmConfig?.model) return;

    try {
      const knownNames = this.entityManager.getKnownNames();
      const knownCharacters = knownNames.charakter || [];
      const knownOrte = knownNames.ort || [];
      const activeQuests = this.entityManager.getEntitiesByType('quest')
        .filter(q => q.data.status === 'aktiv')
        .map(q => q.data.name);

      const language = settings.language || 'de';
      const prompt = this._buildScenePrompt(
        messageText, knownCharacters, knownOrte, activeQuests, language,
      );

      const response = await this._callOpenAICompatible(prompt, llmConfig);
      if (!response) return;

      const sceneResult = this._parseSceneResponse(response);
      if (!sceneResult) return;

      // LLM-Ergebnis überschreibt Pattern-Matching
      this._currentScene = {
        ort: sceneResult.ort || this._currentScene.ort,
        anwesende: sceneResult.anwesende.length > 0
          ? sceneResult.anwesende
          : this._currentScene.anwesende,
        questUpdates: sceneResult.quest_updates || [],
        messageIndex,
      };

      // Quest-Status automatisch aktualisieren
      await this._applyQuestUpdates(sceneResult.quest_updates || []);

      this._persist();
      console.log(`[RPG-Brain] Szene (LLM): Ort="${this._currentScene.ort}", Anwesende=[${this._currentScene.anwesende.join(', ')}]`);

    } catch (err) {
      console.debug('[RPG-Brain] Scene-LLM fehlgeschlagen (Pattern-Match aktiv):', err.message);
    }
  }

  /**
   * Nachricht gelöscht → Szene auf vorherigen Stand zurücksetzen.
   */
  onMessageDeleted(remainingCount) {
    while (this._history.length > 0) {
      const prev = this._history[this._history.length - 1];
      if (prev.messageIndex < remainingCount) {
        this._currentScene = { ...prev };
        this._persist();
        console.log(`[RPG-Brain] Szene zurückgesetzt auf Index ${prev.messageIndex}: Ort="${prev.ort}", Anwesende=[${prev.anwesende.join(', ')}]`);
        return;
      }
      this._history.pop();
    }

    this._currentScene = {
      ort: null,
      anwesende: [],
      questUpdates: [],
      messageIndex: -1,
    };
    this._persist();
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

  _persist() {
    const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
    if (!context?.chatMetadata) return;

    context.chatMetadata.rpgBrainScene = { ...this._currentScene };
    context.chatMetadata.rpgBrainSceneHistory = this._history.slice(-this._maxHistory);
    context.saveMetadataDebounced();
  }

  _pushHistory() {
    if (this._currentScene.messageIndex >= 0) {
      this._history.push({ ...this._currentScene });
      if (this._history.length > this._maxHistory) {
        this._history.shift();
      }
    }
  }

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

  _buildScenePrompt(messageText, characters, orte, quests, language) {
    if (language === 'en') {
      return `Analyze the current RPG scene. Answer ONLY with JSON, no markdown.

Known characters: ${characters.join(', ') || 'none'}
Known locations: ${orte.join(', ') || 'none'}
Active quests: ${quests.join(', ') || 'none'}

Messages:
${messageText}

{"ort":"current location","anwesende":["ONLY physically present characters"],"quest_updates":[]}`;
    }

    return `Analysiere die aktuelle RPG-Szene. Antworte NUR mit JSON, kein Markdown.

Bekannte Charaktere: ${characters.join(', ') || 'keine'}
Bekannte Orte: ${orte.join(', ') || 'keine'}
Aktive Quests: ${quests.join(', ') || 'keine'}

Nachrichten:
${messageText}

{"ort":"aktueller Ort","anwesende":["NUR physisch anwesende Charaktere"],"quest_updates":[]}`;
  }

  _parseSceneResponse(response) {
    if (!response || typeof response !== 'string') return null;

    let text = response.trim();

    // Markdown Codeblock entfernen
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      text = codeBlockMatch[1].trim();
    }

    // JSON extrahieren
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        ort: typeof parsed.ort === 'string' ? parsed.ort : null,
        anwesende: Array.isArray(parsed.anwesende) ? parsed.anwesende.filter(n => typeof n === 'string') : [],
        quest_updates: Array.isArray(parsed.quest_updates) ? parsed.quest_updates : [],
      };
    } catch {
      console.warn('[RPG-Brain] Szene-JSON Parse-Fehler:', text.slice(0, 200));
      return null;
    }
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
}
