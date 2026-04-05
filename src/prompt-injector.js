// prompt-injector.js — Smart Retrieval + Priority-basierte Prompt Injection
// Baut den RPG-Kontext auf der vor jeder LLM-Antwort injiziert wird

import { InjectionSectionsManager } from './injection-sections.js';

export class PromptInjector {
  /**
   * @param {EntityManager} entityManager
   * @param {LightRAGClient} lightragClient
   * @param {Function} getSettings
   * @param {Function} saveSettings
   */
  constructor(entityManager, lightragClient, getSettings, saveSettings) {
    this.entityManager = entityManager;
    this.lightrag = lightragClient;
    this._getSettings = getSettings;
    this.sectionsManager = new InjectionSectionsManager(getSettings, saveSettings);

    this._lastInjection = '';
    this._lastInjectionTokens = 0;
  }

  initialize() {
    this.sectionsManager.initialize();
  }

  /**
   * Baut die vollständige Injection für den aktuellen Kontext.
   * Wird proaktiv aufgerufen (nach Nachricht, Chat-Wechsel etc.)
   * und setzt dann via setExtensionPrompt den Kontext persistent.
   *
   * @returns {Promise<string>} Der formatierte Injection-Text
   */
  async buildInjection() {
    const settings = this._getSettings();
    const tokenBudget = settings.tokenBudget || 1500;

    // Alle aktiven Sektionen holen (sortiert nach Priorität)
    const sections = this.sectionsManager.getAllSections(true);

    // Relevante Entities ermitteln (inkl. LightRAG wenn verfügbar)
    const relevantEntities = await this._getRelevantEntities();

    // Sektionen aufbauen, Token-Budget beachten
    const parts = [];
    let estimatedTokens = 0;
    const headerLine = '🧠 [RPG-Brain Kontext]';
    estimatedTokens += this._estimateTokens(headerLine);

    for (const section of sections) {
      // Entities für diese Sektion filtern
      const sectionEntities = this._filterEntitiesForSection(section, relevantEntities);
      if (sectionEntities.length === 0) continue;

      // Sektion formatieren
      let sectionText;
      try {
        sectionText = section.format(sectionEntities);
      } catch (err) {
        console.warn(`[RPG-Brain] Format-Fehler in Sektion "${section.name}":`, err.message);
        continue;
      }

      if (!sectionText || !sectionText.trim()) continue;

      // Token-Budget prüfen
      const sectionTokens = this._estimateTokens(sectionText);
      if (estimatedTokens + sectionTokens > tokenBudget) {
        // Versuche gekürzt
        const remaining = tokenBudget - estimatedTokens;
        if (remaining > 50) {
          const truncated = this._truncateToTokens(sectionText, remaining);
          parts.push(truncated);
          estimatedTokens += this._estimateTokens(truncated);
        }
        break; // Budget erschöpft
      }

      parts.push(sectionText);
      estimatedTokens += sectionTokens;
    }

    if (parts.length === 0) {
      this._lastInjection = '';
      this._lastInjectionTokens = 0;
      return '';
    }

    const injection = `${headerLine}\n${parts.join('\n\n')}\n[/RPG-Brain Kontext]`;

    this._lastInjection = injection;
    this._lastInjectionTokens = estimatedTokens;

    return injection;
  }

  /**
   * Letzte Injection + Token-Count abrufen (für UI-Anzeige).
   */
  getLastInjectionInfo() {
    return {
      text: this._lastInjection,
      tokens: this._lastInjectionTokens,
    };
  }

  /**
   * Relevante Entities ermitteln.
   * Kombiniert: lokale Entities + LightRAG-Query basierend auf letzten Nachrichten.
   */
  async _getRelevantEntities() {
    const allEntities = this.entityManager.getAllEntities();

    // LightRAG-Query für Relevanz-Scoring
    let lightragResults = [];
    try {
      const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
      const chat = context?.chat;
      if (chat && chat.length > 0) {
        const recentMessages = chat.slice(-5)
          .filter(msg => msg.mes && !msg.is_system)
          .map(msg => msg.mes)
          .join(' ');

        if (recentMessages.trim() && this.lightrag.connected) {
          const queryResult = await this.lightrag.query(recentMessages, 'hybrid');
          if (queryResult?.response) {
            lightragResults = this._extractNamesFromResponse(queryResult.response);
          }
        }
      }
    } catch (err) {
      console.debug('[RPG-Brain] LightRAG-Query fehlgeschlagen:', err.message);
    }

    // Entities priorisieren basierend auf LightRAG-Relevanz
    const scored = allEntities.map(entity => {
      let score = 1; // Basis-Score

      // Boost wenn in LightRAG-Ergebnissen erwähnt
      if (entity.data.name && lightragResults.some(n =>
        n.toLowerCase().includes(entity.data.name.toLowerCase()) ||
        entity.data.name.toLowerCase().includes(n.toLowerCase())
      )) {
        score += 5;
      }

      // Boost für aktive Quests
      if (entity.typeId === 'quest' && entity.data.status === 'aktiv') {
        score += 3;
      }

      // Boost für Rückblicke (immer relevant)
      if (entity.typeId === 'rueckblick') {
        score += 2;
      }

      // Boost für kürzlich aktualisierte Entities
      const ageMinutes = (Date.now() - (entity.updatedAt || 0)) / 60000;
      if (ageMinutes < 10) score += 2;
      else if (ageMinutes < 30) score += 1;

      return { ...entity, _score: score };
    });

    // Nach Score sortieren (höchster zuerst)
    scored.sort((a, b) => b._score - a._score);

    return scored;
  }

  /**
   * Entities für eine bestimmte Sektion filtern.
   */
  _filterEntitiesForSection(section, entities) {
    if (!section.entityTypes || section.entityTypes.length === 0) {
      return entities;
    }
    return entities.filter(e => section.entityTypes.includes(e.typeId));
  }

  /**
   * Versucht Entity-Namen aus einer LightRAG-Antwort zu extrahieren.
   */
  _extractNamesFromResponse(response) {
    if (typeof response !== 'string') return [];
    // Einfache Heuristik: Wörter mit Großbuchstaben am Anfang
    const words = response.match(/\b[A-ZÄÖÜ][a-zäöüß]{2,}/g) || [];
    return [...new Set(words)];
  }

  /**
   * Grobe Token-Schätzung (ca. 4 Zeichen pro Token).
   */
  _estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Text auf ungefähre Token-Anzahl kürzen.
   */
  _truncateToTokens(text, maxTokens) {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;

    // Am letzten Zeilenumbruch vor dem Limit abschneiden
    const truncated = text.slice(0, maxChars);
    const lastNewline = truncated.lastIndexOf('\n');
    if (lastNewline > maxChars * 0.5) {
      return truncated.slice(0, lastNewline) + '\n  [...]';
    }
    return truncated + ' [...]';
  }
}
