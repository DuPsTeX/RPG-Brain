// prompt-injector.js — Smart Retrieval + Priority-basierte Prompt Injection
// Baut den RPG-Kontext auf der vor jeder LLM-Antwort injiziert wird
// Nutzt Scene Tracker für szene-basierte Filterung

import { InjectionSectionsManager } from './injection-sections.js';

export class PromptInjector {
  /**
   * @param {EntityManager} entityManager
   * @param {LightRAGClient} lightragClient
   * @param {Function} getSettings
   * @param {Function} saveSettings
   * @param {SceneTracker} sceneTracker
   */
  constructor(entityManager, lightragClient, getSettings, saveSettings, sceneTracker) {
    this.entityManager = entityManager;
    this.lightrag = lightragClient;
    this._getSettings = getSettings;
    this.sceneTracker = sceneTracker;
    this.sectionsManager = new InjectionSectionsManager(getSettings, saveSettings);

    this._lastInjection = '';
    this._lastInjectionTokens = 0;
  }

  initialize() {
    this.sectionsManager.initialize();
  }

  /**
   * Baut die vollständige Injection für den aktuellen Kontext.
   * Filtert nach aktueller Szene (anwesende Charaktere, Ort, aktive Quests).
   *
   * @returns {Promise<string>} Der formatierte Injection-Text
   */
  async buildInjection() {
    const settings = this._getSettings();
    const tokenBudget = settings.tokenBudget || 1500;

    // Alle aktiven Sektionen holen (sortiert nach Priorität)
    const sections = this.sectionsManager.getAllSections(true);

    // Relevante Entities ermitteln (inkl. LightRAG + Szene-Filter)
    const relevantEntities = await this._getRelevantEntities();

    // Aktuelle Szene für Header-Info
    const scene = this.sceneTracker?.getCurrentScene();

    // Sektionen aufbauen, Token-Budget beachten
    const parts = [];
    let estimatedTokens = 0;
    const headerLine = '🧠 [RPG-Brain Kontext]';
    estimatedTokens += this._estimateTokens(headerLine);

    // Szene-Info als erstes (wenn verfügbar)
    if (scene?.ort) {
      const sceneLine = `📍 Aktuelle Szene: ${scene.ort} | Anwesend: ${scene.anwesende.join(', ') || 'unbekannt'}`;
      parts.push(sceneLine);
      estimatedTokens += this._estimateTokens(sceneLine);
    }

    for (const section of sections) {
      // Entities für diese Sektion filtern (szene-bewusst)
      const sectionEntities = this._filterEntitiesForSection(section, relevantEntities, scene);
      if (sectionEntities.length === 0) continue;

      // Sektion formatieren
      let sectionText;
      try {
        sectionText = section.format(sectionEntities, scene);
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
   * Priorisiert szene-anwesende Entities, dann LightRAG-Relevanz.
   */
  async _getRelevantEntities() {
    const allEntities = this.entityManager.getAllEntities();
    const scene = this.sceneTracker?.getCurrentScene();

    // LightRAG-Query für Relevanz-Scoring
    let lightragResults = [];
    try {
      const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
      const chat = context?.chat;
      if (chat && chat.length > 0) {
        const recentMessages = chat.slice(-3)
          .filter(msg => msg.mes && !msg.is_system)
          .map(msg => msg.mes)
          .join(' ');

        if (recentMessages.trim() && this.lightrag.connected) {
          const knownNames = Object.values(this.entityManager.getKnownNames()).flat();
          const mentionedNames = knownNames.filter(n => recentMessages.toLowerCase().includes(n.toLowerCase()));
          const queryText = mentionedNames.length > 0
            ? mentionedNames.join(', ')
            : recentMessages.slice(0, 200);

          const queryResult = await this.lightrag.query(queryText, 'hybrid');
          if (queryResult?.response) {
            lightragResults = this._extractNamesFromResponse(queryResult.response);
          }
        }
      }
    } catch (err) {
      console.debug('[RPG-Brain] LightRAG-Query fehlgeschlagen:', err.message);
    }

    // Szene-Daten für Matching vorbereiten
    const hasScene = scene && scene.anwesende && scene.anwesende.length > 0;
    const anwesendeLower = hasScene ? scene.anwesende.map(n => n.toLowerCase()) : [];
    const sceneOrtLower = scene?.ort?.toLowerCase() || '';

    // Entities priorisieren: Szene > LightRAG > Aktualität
    const scored = allEntities.map(entity => {
      let score = 1; // Basis-Score für alle

      if (hasScene) {
        const name = entity.data.name?.toLowerCase() || '';

        if (entity.typeId === 'charakter') {
          if (anwesendeLower.includes(name)) {
            score += 10; // In der Szene → höchste Priorität
            entity._inScene = true;
          } else {
            score = 0; // Nicht in Szene → rausfiltern
          }
        } else if (entity.typeId === 'beziehung') {
          const von = entity.data.von?.toLowerCase() || '';
          const zu = entity.data.zu?.toLowerCase() || '';
          // Beziehung relevant wenn BEIDE Personen anwesend
          const vonPresent = anwesendeLower.includes(von);
          const zuPresent = anwesendeLower.includes(zu);
          if (vonPresent && zuPresent) {
            score += 8;
          } else if (vonPresent || zuPresent) {
            score += 4; // Mindestens einer anwesend
          } else {
            score = 0;
          }
        } else if (entity.typeId === 'ort') {
          if (sceneOrtLower && this._ortMatchesScene(name, sceneOrtLower)) {
            score += 10;
            entity._isCurrentOrt = true;
          } else {
            score = 0;
          }
        }
        // Quests, Rückblicke etc. behalten ihren Basis-Score
      }

      // LightRAG-Boost
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

      // Boost für Rückblicke — nur den NEUESTEN
      if (entity.typeId === 'rueckblick') {
        score += 2;
        // Neuester Rückblick bekommt Extra-Boost
        const allRecaps = allEntities.filter(e => e.typeId === 'rueckblick');
        if (allRecaps.length > 0) {
          const newest = allRecaps.reduce((a, b) =>
            (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a
          );
          if (entity.id === newest.id) score += 5;
        }
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
   * Szene-bewusst: Charaktere/Beziehungen nur wenn in der Szene.
   */
  _filterEntitiesForSection(section, entities, scene) {
    let filtered = entities;

    // Typ-Filter
    if (section.entityTypes && section.entityTypes.length > 0) {
      filtered = filtered.filter(e => section.entityTypes.includes(e.typeId));
    }

    // Szene-Filter: Nur Entities mit positivem Score (in der Szene oder relevant)
    if (scene && scene.anwesende.length > 0) {
      const sceneTypes = ['charakter', 'beziehung', 'ort'];
      filtered = filtered.filter(e => {
        if (sceneTypes.includes(e.typeId)) {
          return e._score > 0;
        }
        return true; // Quests, Rückblicke etc. nicht filtern
      });
    }

    return filtered;
  }

  /**
   * Prüft ob ein Ort-Name zur aktuellen Szene passt.
   * Flexibles Matching: "Abenteurergilde" matched "Abenteurergilde von Aurion" etc.
   */
  _ortMatchesScene(entityNameLower, sceneOrtLower) {
    if (!entityNameLower || !sceneOrtLower) return false;
    // Direkte Übereinstimmung
    if (entityNameLower === sceneOrtLower) return true;
    // Einer enthält den anderen
    if (entityNameLower.includes(sceneOrtLower)) return true;
    if (sceneOrtLower.includes(entityNameLower)) return true;
    // Wort-basiertes Matching (mindestens 2 signifikante Wörter müssen übereinstimmen)
    const entityWords = entityNameLower.split(/\s+/).filter(w => w.length > 3);
    const sceneWords = sceneOrtLower.split(/\s+/).filter(w => w.length > 3);
    const matchingWords = entityWords.filter(w => sceneWords.includes(w));
    return matchingWords.length >= 1;
  }

  /**
   * Versucht Entity-Namen aus einer LightRAG-Antwort zu extrahieren.
   */
  _extractNamesFromResponse(response) {
    if (typeof response !== 'string') return [];
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

    const truncated = text.slice(0, maxChars);
    const lastNewline = truncated.lastIndexOf('\n');
    if (lastNewline > maxChars * 0.5) {
      return truncated.slice(0, lastNewline) + '\n  [...]';
    }
    return truncated + ' [...]';
  }
}
