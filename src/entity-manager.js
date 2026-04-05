// entity-manager.js — CRUD-Operationen für RPG Entities mit LightRAG-Mapping
// Verwaltet Entity-Index pro Chat in chatMetadata

export class EntityManager {
  /**
   * @param {EntityTypeRegistry} registry
   * @param {LightRAGClient} lightragClient
   */
  constructor(registry, lightragClient) {
    this.registry = registry;
    this.lightrag = lightragClient;
    this._entities = new Map(); // entityId → { typeId, data, lightragDocId, createdAt, updatedAt }
    this._chatId = null;
    this._getContext = () => typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
  }

  // --- Chat-Wechsel ---

  /**
   * Entity-Index für einen Chat laden.
   * @param {string} chatId
   */
  loadForChat(chatId) {
    this._chatId = chatId;
    this._entities.clear();

    const context = this._getContext();
    if (!context) return;

    const metadata = context.chatMetadata;
    if (metadata?.rpgBrainEntities) {
      const saved = metadata.rpgBrainEntities;
      for (const [id, entry] of Object.entries(saved)) {
        this._entities.set(id, entry);
      }
      console.log(`[RPG-Brain] ${this._entities.size} Entities geladen für Chat: ${chatId}`);
    }
  }

  /**
   * Entity-Index in chatMetadata persistieren.
   */
  _persist() {
    const context = this._getContext();
    if (!context) return;

    const obj = {};
    for (const [id, entry] of this._entities) {
      obj[id] = entry;
    }
    context.chatMetadata.rpgBrainEntities = obj;
    context.saveMetadataDebounced();
  }

  // --- CRUD ---

  /**
   * Neue Entity erstellen.
   * @param {string} typeId - Entity-Typ ID
   * @param {object} data - Entity-Daten
   * @returns {Promise<{id: string, entity: object}>}
   */
  async createEntity(typeId, data) {
    const type = this.registry.getType(typeId);
    if (!type) throw new Error(`Unbekannter Typ: ${typeId}`);

    // Validierung
    const validation = this.registry.validateEntity(typeId, data);
    if (!validation.valid) {
      throw new Error(`Validierungsfehler: ${validation.errors.join(', ')}`);
    }

    // Auto-Name für Beziehungen generieren
    if (!data.name && typeId === 'beziehung' && data.von && data.zu) {
      data.name = `${data.von} → ${data.zu}`;
    }

    const entityId = this._generateId();
    const now = Date.now();

    // In LightRAG einfügen
    let lightragDocId = null;
    try {
      const docText = this._formatEntityForLightRAG(type, data, entityId);
      const result = await this.lightrag.insertDocument(docText, {
        rpg_type: typeId,
        rpg_entity_id: entityId,
      });
      lightragDocId = result?.id || result?.doc_id || null;
    } catch (err) {
      console.warn('[RPG-Brain] LightRAG Insert fehlgeschlagen:', err.message);
      // Entity wird trotzdem lokal gespeichert
    }

    const entity = {
      typeId,
      data: { ...data },
      lightragDocId,
      createdAt: now,
      updatedAt: now,
    };

    this._entities.set(entityId, entity);
    this._persist();

    console.log(`[RPG-Brain] Entity erstellt: [${typeId}] ${data.name || entityId}`);
    return { id: entityId, entity };
  }

  /**
   * Entity aktualisieren.
   * @param {string} entityId
   * @param {object} updates - Partielle Daten-Updates
   * @returns {Promise<object>}
   */
  async updateEntity(entityId, updates) {
    const entity = this._entities.get(entityId);
    if (!entity) throw new Error(`Entity nicht gefunden: ${entityId}`);

    // Daten mergen
    entity.data = { ...entity.data, ...updates };
    entity.updatedAt = Date.now();

    // Auto-Name für Beziehungen nachträglich generieren
    if (!entity.data.name && entity.typeId === 'beziehung' && entity.data.von && entity.data.zu) {
      entity.data.name = `${entity.data.von} → ${entity.data.zu}`;
    }

    // Validierung
    const validation = this.registry.validateEntity(entity.typeId, entity.data);
    if (!validation.valid) {
      throw new Error(`Validierungsfehler: ${validation.errors.join(', ')}`);
    }

    // LightRAG aktualisieren: altes Dokument löschen, neues einfügen
    try {
      if (entity.lightragDocId) {
        await this.lightrag.deleteDocument(entity.lightragDocId).catch(() => {});
      }
      const type = this.registry.getType(entity.typeId);
      const docText = this._formatEntityForLightRAG(type, entity.data, entityId);
      const result = await this.lightrag.insertDocument(docText, {
        rpg_type: entity.typeId,
        rpg_entity_id: entityId,
      });
      entity.lightragDocId = result?.id || result?.doc_id || null;
    } catch (err) {
      console.warn('[RPG-Brain] LightRAG Update fehlgeschlagen:', err.message);
    }

    this._persist();

    console.log(`[RPG-Brain] Entity aktualisiert: [${entity.typeId}] ${entity.data.name || entityId}`);
    return entity;
  }

  /**
   * Entity löschen.
   * @param {string} entityId
   */
  async deleteEntity(entityId) {
    const entity = this._entities.get(entityId);
    if (!entity) return;

    // Aus LightRAG löschen
    try {
      if (entity.lightragDocId) {
        await this.lightrag.deleteDocument(entity.lightragDocId);
      }
    } catch (err) {
      console.warn('[RPG-Brain] LightRAG Delete fehlgeschlagen:', err.message);
    }

    this._entities.delete(entityId);
    this._persist();

    console.log(`[RPG-Brain] Entity gelöscht: [${entity.typeId}] ${entity.data.name || entityId}`);
  }

  /**
   * Entity anhand ID holen.
   * @param {string} entityId
   * @returns {object|null}
   */
  getEntity(entityId) {
    const entry = this._entities.get(entityId);
    if (!entry) return null;
    return { id: entityId, ...entry };
  }

  /**
   * Alle Entities eines bestimmten Typs.
   * @param {string} typeId
   * @returns {Array<{id: string, typeId: string, data: object}>}
   */
  getEntitiesByType(typeId) {
    const results = [];
    for (const [id, entry] of this._entities) {
      if (entry.typeId === typeId) {
        results.push({ id, ...entry });
      }
    }
    return results;
  }

  /**
   * Alle Entities.
   * @returns {Array<{id: string, typeId: string, data: object}>}
   */
  getAllEntities() {
    const results = [];
    for (const [id, entry] of this._entities) {
      results.push({ id, ...entry });
    }
    return results;
  }

  /**
   * Entity-Suche über Name und Daten.
   * @param {string} query - Suchbegriff
   * @returns {Array<{id: string, typeId: string, data: object}>}
   */
  searchEntities(query) {
    const lowerQuery = query.toLowerCase();
    const results = [];

    for (const [id, entry] of this._entities) {
      const dataStr = JSON.stringify(entry.data).toLowerCase();
      if (dataStr.includes(lowerQuery)) {
        results.push({ id, ...entry });
      }
    }
    return results;
  }

  /**
   * Entity anhand Name und Typ finden (für Extraktions-Matching).
   * @param {string} typeId
   * @param {string} name
   * @returns {{id: string, typeId: string, data: object}|null}
   */
  findByName(typeId, name) {
    const lowerName = name.toLowerCase();
    for (const [id, entry] of this._entities) {
      if (entry.typeId !== typeId) continue;
      if (entry.data.name?.toLowerCase() === lowerName) {
        return { id, ...entry };
      }
      // Beziehungen auch über "von → zu" matchen
      if (typeId === 'beziehung' && entry.data.von && entry.data.zu) {
        const autoName = `${entry.data.von} → ${entry.data.zu}`.toLowerCase();
        if (autoName === lowerName) return { id, ...entry };
      }
    }
    return null;
  }

  /**
   * Anzahl der Entities.
   * @returns {number}
   */
  getEntityCount() {
    return this._entities.size;
  }

  /**
   * Anzahl pro Typ.
   * @returns {object} { charakter: 5, quest: 2, ... }
   */
  getCountsByType() {
    const counts = {};
    for (const entry of this._entities.values()) {
      counts[entry.typeId] = (counts[entry.typeId] || 0) + 1;
    }
    return counts;
  }

  /**
   * Alle bekannten Entity-Namen (für Extraktions-Prompt).
   * @returns {object} { charakter: ['Thorin', 'Luna'], ort: ['Ravenshollow'], ... }
   */
  getKnownNames() {
    const names = {};
    for (const entry of this._entities.values()) {
      if (entry.data.name) {
        if (!names[entry.typeId]) names[entry.typeId] = [];
        names[entry.typeId].push(entry.data.name);
      }
    }
    return names;
  }

  // --- Export / Import (Cross-Tab Sync) ---

  /**
   * Alle Entities als serializierbares Objekt exportieren.
   * @returns {object} { entityId: { typeId, data, ... }, ... }
   */
  exportEntities() {
    const obj = {};
    for (const [id, entry] of this._entities) {
      obj[id] = { ...entry };
    }
    return obj;
  }

  /**
   * Entities aus einem Export-Objekt importieren (ersetzt lokale Daten).
   * @param {object} data - { entityId: { typeId, data, ... }, ... }
   */
  importEntities(data) {
    if (!data || typeof data !== 'object') return;
    this._entities.clear();
    for (const [id, entry] of Object.entries(data)) {
      this._entities.set(id, entry);
    }
    console.log(`[RPG-Brain] ${this._entities.size} Entities importiert`);
  }

  // --- LightRAG Format ---

  /**
   * Entity als strukturierten Text für LightRAG formatieren.
   */
  _formatEntityForLightRAG(type, data, entityId) {
    const parts = [`[TYPE: ${type.name}]`];

    for (const field of type.fields) {
      // Bilder und leere Felder überspringen
      if (field.type === 'image') continue;

      const value = data[field.key];
      if (value === undefined || value === null || value === '') continue;

      // Condition prüfen
      if (field.condition) {
        const condValue = data[field.condition.field];
        if (field.condition.in && !field.condition.in.includes(condValue)) continue;
      }

      parts.push(`${field.label || field.key}: ${value}`);
    }

    parts.push(`[Entity-ID: ${entityId}]`);
    return parts.join(' | ');
  }

  // --- Helpers ---

  _generateId() {
    // crypto.randomUUID() fallback
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback
    return 'rpg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }
}
