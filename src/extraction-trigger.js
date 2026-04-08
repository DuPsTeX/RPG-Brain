// extraction-trigger.js — Steuert wann und wie Entities aus dem Chat extrahiert werden

import { buildExtractionPrompt, parseExtractionResponse } from './extraction-prompts.js';

export class ExtractionTrigger {
  /**
   * @param {EntityTypeRegistry} registry
   * @param {EntityManager} entityManager
   * @param {LightRAGClient} lightragClient
   * @param {Function} getSettings
   */
  constructor(registry, entityManager, lightragClient, getSettings) {
    this.registry = registry;
    this.entityManager = entityManager;
    this.lightrag = lightragClient;
    this._getSettings = getSettings;

    this._messagesSinceExtraction = 0;
    this._isExtracting = false;
    this._lastExtractedIndex = -1;
  }

  /**
   * Wird bei jeder empfangenen Nachricht aufgerufen.
   * Entscheidet ob eine Extraktion getriggert wird.
   * @param {number} messageIndex
   */
  async onMessageReceived(messageIndex) {
    this._messagesSinceExtraction++;

    const settings = this._getSettings();
    const mode = settings.triggerMode || 'every_5';

    if (mode === 'manual') return;

    const threshold = this._getThreshold(mode);
    if (this._messagesSinceExtraction >= threshold) {
      await this.extract();
    }
  }

  /**
   * Manuelle Extraktion — sofort ausführen.
   */
  async manualExtract() {
    await this.extract();
  }

  /**
   * Extraktion durchführen: Nachrichten sammeln, an LLM senden, Ergebnisse verarbeiten.
   */
  async extract() {
    if (this._isExtracting) {
      console.log('[RPG-Brain] Extraktion läuft bereits, überspringe');
      return;
    }

    this._isExtracting = true;

    try {
      const context = SillyTavern.getContext();
      const chat = context.chat;
      if (!chat || chat.length === 0) return;

      // Unverarbeitete Nachrichten sammeln
      const startIndex = Math.max(0, this._lastExtractedIndex + 1);
      const messages = chat.slice(startIndex);
      if (messages.length === 0) return;

      // Nachrichten-Text zusammenstellen
      const messageText = messages
        .filter(msg => msg.mes && !msg.is_system)
        .map(msg => {
          const sender = msg.is_user ? 'User' : (msg.name || 'Character');
          return `[${sender}]: ${msg.mes}`;
        })
        .join('\n\n');

      if (!messageText.trim()) return;

      console.log(`[RPG-Brain] Extraktion: ${messages.length} Nachrichten (ab Index ${startIndex})`);

      // LLM-Call für Extraktion
      const settings = this._getSettings();
      const typeSchemas = this.registry.getTypeSchemasForPrompt();
      const knownNames = this.entityManager.getKnownNames();
      const activeTypes = this.registry.getAllTypes(true).map(t => ({ id: t.id, name: t.name, icon: t.icon }));
      const prompt = buildExtractionPrompt(messageText, typeSchemas, knownNames, settings.language, activeTypes, settings.customExtractionPrompt);

      const llmResponse = await this._callExtractionLlm(prompt, settings);
      if (!llmResponse) {
        console.warn('[RPG-Brain] Keine Antwort vom Extraktions-LLM');
        return;
      }

      // Antwort parsen
      const extractions = parseExtractionResponse(llmResponse);
      console.log(`[RPG-Brain] ${extractions.length} Entities extrahiert`);

      // Ergebnisse verarbeiten
      const confidenceThreshold = settings.confidenceThreshold || 0.7;
      let created = 0;
      let updated = 0;

      for (const item of extractions) {
        try {
          if (!item.type || !item.data) continue;
          if (item.confidence !== undefined && item.confidence < confidenceThreshold) {
            console.log(`[RPG-Brain] Übersprungen (confidence ${item.confidence}): ${item.name || item.type}`);
            continue;
          }

          if (item.action === 'update' && item.name) {
            // Update: bestehende Entity suchen
            const existing = this.entityManager.findByName(item.type, item.name);
            if (existing) {
              await this.entityManager.updateEntity(existing.id, item.data);
              updated++;
            } else {
              // Nicht gefunden → als neue Entity erstellen
              await this.entityManager.createEntity(item.type, { name: item.name, ...item.data });
              created++;
            }
          } else {
            // Create: prüfen ob bereits vorhanden
            const duplicate = item.data.name
              ? this.entityManager.findByName(item.type, item.data.name)
              : null;

            if (duplicate) {
              // Existiert bereits → Update stattdessen
              await this.entityManager.updateEntity(duplicate.id, item.data);
              updated++;
            } else {
              await this.entityManager.createEntity(item.type, item.data);
              created++;
            }
          }
        } catch (err) {
          console.warn(`[RPG-Brain] Fehler bei Entity-Verarbeitung:`, err.message, item);
        }
      }

      // Roh-Text auch an LightRAG für Graph-Enrichment senden
      // Einzelne Nachrichten separat schicken (statt eines großen Blocks)
      // Verhindert Timeouts bei lokaler Ollama-Inferenz
      try {
        const singleMessages = messages
          .filter(msg => msg.mes && !msg.is_system)
          .map(msg => {
            const sender = msg.is_user ? 'User' : (msg.name || 'Character');
            return `[${sender}]: ${msg.mes}`;
          });

        for (const singleMsg of singleMessages) {
          // Max 1500 Zeichen pro Dokument — kürzen wenn nötig
          const trimmed = singleMsg.length > 1500 ? singleMsg.slice(0, 1500) + '...' : singleMsg;
          await this.lightrag.insertDocument(trimmed, {
            rpg_type: '_chat_message',
            message_range: `${startIndex}-${chat.length - 1}`,
          });
        }
      } catch (err) {
        console.warn('[RPG-Brain] LightRAG Chat-Insert fehlgeschlagen:', err.message);
      }

      // Index aktualisieren
      this._lastExtractedIndex = chat.length - 1;
      this._messagesSinceExtraction = 0;

      // In Chat-Metadata speichern
      const metadata = context.chatMetadata;
      if (metadata) {
        metadata.rpgBrainLastExtractedIndex = this._lastExtractedIndex;
        context.saveMetadataDebounced();
      }

      console.log(`[RPG-Brain] Extraktion abgeschlossen: ${created} erstellt, ${updated} aktualisiert`);

    } catch (err) {
      console.error('[RPG-Brain] Extraktionsfehler:', err);
    } finally {
      this._isExtracting = false;
    }
  }

  /**
   * lastExtractedIndex aus Chat-Metadata wiederherstellen (bei Chat-Wechsel).
   */
  loadStateForChat() {
    const context = SillyTavern.getContext();
    const metadata = context.chatMetadata;
    this._lastExtractedIndex = metadata?.rpgBrainLastExtractedIndex ?? -1;
    this._messagesSinceExtraction = 0;
  }

  /**
   * LLM-Call an den konfigurierten Extraktions-Endpoint (OpenAI-kompatibel).
   */
  async _callExtractionLlm(prompt, settings) {
    const llmConfig = settings.extractionLlm;

    // Zuerst: Konfigurierten externen LLM versuchen
    if (llmConfig?.apiUrl && llmConfig?.model) {
      try {
        return await this._callOpenAICompatible(prompt, llmConfig);
      } catch (err) {
        console.warn('[RPG-Brain] Externer LLM-Call fehlgeschlagen:', err.message);
      }
    }

    // Fallback: SillyTavern's Backend nutzen (directLlmCall Muster)
    try {
      return await this._callViaSillyTavern(prompt);
    } catch (err) {
      console.warn('[RPG-Brain] ST Backend-Call fehlgeschlagen:', err.message);
    }

    // Letzter Fallback: generateQuietPrompt
    const context = SillyTavern.getContext();
    if (typeof context.generateQuietPrompt === 'function') {
      return context.generateQuietPrompt(prompt);
    }

    return null;
  }

  /**
   * Direkter Call an OpenAI-kompatiblen Endpoint (DeepSeek, Ollama, etc.)
   */
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
          { role: 'system', content: 'Du bist ein Analyse-Assistent. Antworte NUR mit dem geforderten JSON-Format.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  }

  /**
   * Call über SillyTavern's Backend (wie neurocore's directLlmCall).
   */
  async _callViaSillyTavern(prompt) {
    const ctx = SillyTavern.getContext();
    if (ctx.mainApi !== 'openai') return null;

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
        { role: 'system', content: 'Du bist ein Analyse-Assistent. Antworte NUR mit dem geforderten JSON-Format.' },
        { role: 'user', content: prompt },
      ],
      model,
      temperature: 0.3,
      max_tokens: 4000,
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
    if (msg?.reasoning_content) return msg.reasoning_content;
    return data.choices?.[0]?.text || null;
  }

  _getThreshold(mode) {
    const thresholds = {
      every: 1,
      every_3: 3,
      every_5: 5,
      every_10: 10,
      manual: Infinity,
    };
    return thresholds[mode] || 5;
  }
}
