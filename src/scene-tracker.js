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
   * PHASE 1: <scene> Block aus LLM-Antwort parsen (beste Quelle, vom Chat-LLM generiert)
   * PHASE 2: Fallback Pattern-Matching auf bekannte Namen (immer verfügbar)
   */
  async onMessageReceived(messageIndex) {
    if (this._isAnalyzing) return;
    this._isAnalyzing = true;

    try {
      const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
      if (!context?.chat || context.chat.length === 0) return;

      const lastMessage = context.chat[context.chat.length - 1];
      const lastText = lastMessage?.mes || '';

      // PHASE 1: <scene> Block aus der letzten AI-Antwort parsen
      let sceneFromBlock = null;
      if (!lastMessage.is_user) {
        sceneFromBlock = this._parseSceneBlock(lastText);
        if (sceneFromBlock) {
          // <scene> Block aus der sichtbaren Nachricht entfernen
          this._cleanSceneBlockFromMessage(context, lastMessage);
        }
      }

      // PHASE 2: Fallback Pattern-Matching
      const recentMessages = context.chat.slice(-3)
        .filter(msg => msg.mes && !msg.is_system)
        .map(msg => msg.mes)
        .join('\n');

      const patternResult = recentMessages.trim()
        ? this._analyzeByPatternMatching(recentMessages, lastText)
        : null;

      // Ergebnis zusammenführen: <scene> Block > Pattern-Matching > Vorherige Szene
      const newOrt = sceneFromBlock?.ort || patternResult?.ort || this._currentScene.ort;
      const newAnwesende = sceneFromBlock?.anwesende?.length > 0
        ? sceneFromBlock.anwesende
        : (patternResult?.anwesende?.length > 0 ? patternResult.anwesende : this._currentScene.anwesende);
      const questUpdates = sceneFromBlock?.questUpdates || [];

      // Alte Szene in History pushen
      this._pushHistory();

      // Neue Szene setzen
      this._currentScene = {
        ort: newOrt,
        anwesende: newAnwesende,
        questUpdates,
        messageIndex,
      };

      // Quest-Status automatisch aktualisieren
      await this._applyQuestUpdates(questUpdates);

      this._persist();

      const source = sceneFromBlock ? 'LLM <scene>' : 'Pattern';
      console.log(`[RPG-Brain] Szene (${source}): Ort="${this._currentScene.ort}", Anwesende=[${this._currentScene.anwesende.join(', ')}]`);

    } catch (err) {
      console.warn('[RPG-Brain] Szene-Analyse fehlgeschlagen:', err.message);
    } finally {
      this._isAnalyzing = false;
    }
  }

  /**
   * Parst den <scene> Block aus einer LLM-Antwort.
   * Format:
   * <scene>
   * ort: Abenteurergilde von Aurion
   * anwesende: Tay, Lysandra, Nyx, Elara
   * quest_updates: Bürgschaft=abgeschlossen
   * </scene>
   */
  _parseSceneBlock(messageText) {
    if (!messageText) return null;

    const sceneMatch = messageText.match(/<scene>([\s\S]*?)<\/scene>/i);
    if (!sceneMatch) return null;

    const block = sceneMatch[1].trim();
    const result = { ort: null, anwesende: [], questUpdates: [] };

    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx < 0) continue;

      const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
      const value = trimmed.slice(colonIdx + 1).trim();

      if (key === 'ort' && value) {
        result.ort = value;
      } else if (key === 'anwesende' && value) {
        result.anwesende = value.split(',').map(n => n.trim()).filter(Boolean);
      } else if (key === 'quest_updates' && value) {
        // Format: "Questname=abgeschlossen, Andere Quest=fehlgeschlagen"
        const updates = value.split(',').map(u => u.trim()).filter(Boolean);
        for (const update of updates) {
          const eqIdx = update.indexOf('=');
          if (eqIdx > 0) {
            result.questUpdates.push({
              name: update.slice(0, eqIdx).trim(),
              status: update.slice(eqIdx + 1).trim(),
            });
          }
        }
      }
    }

    // Validierung: mindestens Ort oder Anwesende müssen gesetzt sein
    if (!result.ort && result.anwesende.length === 0) return null;

    return result;
  }

  /**
   * Entfernt den <scene> Block aus der sichtbaren Nachricht.
   * Block kann am Anfang oder Ende stehen.
   */
  _cleanSceneBlockFromMessage(context, message) {
    try {
      // Block entfernen + führende/trailing Whitespace/Newlines aufräumen
      const cleaned = message.mes.replace(/<scene>[\s\S]*?<\/scene>\s*/gi, '').replace(/^\s*\n+/, '').trimEnd();
      if (cleaned !== message.mes) {
        message.mes = cleaned;
        // DOM aktualisieren
        const messageId = context.chat.indexOf(message);
        if (messageId >= 0) {
          const messageBlock = $(`#chat .mes[mesid="${messageId}"] .mes_text`);
          if (messageBlock.length) {
            messageBlock.html(messageBlock.html().replace(/<scene>[\s\S]*?<\/scene>/gi, ''));
          }
        }
        // Nachricht speichern
        if (typeof context.saveChatDebounced === 'function') {
          context.saveChatDebounced();
        }
      }
    } catch (err) {
      console.debug('[RPG-Brain] Scene-Block Cleanup Fehler:', err.message);
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

}
