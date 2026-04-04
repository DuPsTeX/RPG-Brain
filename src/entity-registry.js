// entity-registry.js — Dynamische Entity-Type Registry
// Verwaltet Entity-Schemas: 11 Defaults + beliebige Custom-Typen

import { DEFAULT_ENTITY_TYPES } from './default-types.js';

export class EntityTypeRegistry {
  /**
   * @param {Function} getSettings - Gibt die Extension-Settings zurück
   * @param {Function} saveSettings - Persistiert die Settings
   */
  constructor(getSettings, saveSettings) {
    this._getSettings = getSettings;
    this._saveSettings = saveSettings;
    this._types = new Map();
    this._initialized = false;
  }

  /**
   * Registry initialisieren: Defaults laden, dann gespeicherte Custom-Typen drüber legen.
   */
  initialize() {
    this._types.clear();

    // Defaults laden
    for (const type of DEFAULT_ENTITY_TYPES) {
      this._types.set(type.id, structuredClone(type));
    }

    // Gespeicherte Typen laden (überschreibt Defaults falls bearbeitet, fügt Custom hinzu)
    const settings = this._getSettings();
    const savedTypes = settings.typeRegistry;
    if (Array.isArray(savedTypes)) {
      for (const saved of savedTypes) {
        if (saved.id) {
          // Bei builtIn-Typen: nur die editierbaren Felder übernehmen
          if (saved.builtIn && this._types.has(saved.id)) {
            const existing = this._types.get(saved.id);
            existing.fields = saved.fields || existing.fields;
            existing.icon = saved.icon || existing.icon;
            existing.color = saved.color || existing.color;
            existing.active = saved.active !== undefined ? saved.active : true;
          } else {
            this._types.set(saved.id, saved);
          }
        }
      }
    }

    // Aktivierungsstatus setzen (Default: aktiv)
    for (const type of this._types.values()) {
      if (type.active === undefined) {
        type.active = true;
      }
    }

    this._initialized = true;
    console.log(`[RPG-Brain] Type Registry: ${this._types.size} Typen geladen`);
  }

  /**
   * Alle Typen als Array.
   * @param {boolean} activeOnly - Nur aktive Typen
   * @returns {object[]}
   */
  getAllTypes(activeOnly = false) {
    const types = Array.from(this._types.values());
    return activeOnly ? types.filter(t => t.active !== false) : types;
  }

  /**
   * Einzelnen Typ anhand ID holen.
   * @param {string} typeId
   * @returns {object|null}
   */
  getType(typeId) {
    return this._types.get(typeId) || null;
  }

  /**
   * Neuen Custom-Typ registrieren.
   * @param {object} schema - { id, name, icon, color, fields }
   * @returns {object} Der registrierte Typ
   */
  registerType(schema) {
    if (!schema.id || !schema.name) {
      throw new Error('Entity-Typ braucht mindestens id und name');
    }
    if (this._types.has(schema.id)) {
      throw new Error(`Entity-Typ "${schema.id}" existiert bereits`);
    }

    const type = {
      ...schema,
      builtIn: false,
      active: true,
      fields: schema.fields || [],
    };

    this._types.set(type.id, type);
    this._persist();

    console.log(`[RPG-Brain] Neuer Typ registriert: ${type.name} (${type.id})`);
    return type;
  }

  /**
   * Existierenden Typ bearbeiten (Felder, Icon, Farbe).
   * @param {string} typeId
   * @param {object} updates - Partielle Updates { fields?, icon?, color?, name? }
   * @returns {object} Der aktualisierte Typ
   */
  updateType(typeId, updates) {
    const type = this._types.get(typeId);
    if (!type) {
      throw new Error(`Entity-Typ "${typeId}" nicht gefunden`);
    }

    if (updates.fields !== undefined) type.fields = updates.fields;
    if (updates.icon !== undefined) type.icon = updates.icon;
    if (updates.color !== undefined) type.color = updates.color;
    if (updates.name !== undefined && !type.builtIn) type.name = updates.name;

    this._persist();
    return type;
  }

  /**
   * Typ deaktivieren (wird bei Extraktion ignoriert, Daten bleiben erhalten).
   * @param {string} typeId
   */
  deactivateType(typeId) {
    const type = this._types.get(typeId);
    if (!type) return;
    type.active = false;
    this._persist();
    console.log(`[RPG-Brain] Typ deaktiviert: ${type.name}`);
  }

  /**
   * Typ aktivieren.
   * @param {string} typeId
   */
  activateType(typeId) {
    const type = this._types.get(typeId);
    if (!type) return;
    type.active = true;
    this._persist();
    console.log(`[RPG-Brain] Typ aktiviert: ${type.name}`);
  }

  /**
   * Custom-Typ löschen. BuiltIn-Typen können nicht gelöscht werden.
   * @param {string} typeId
   */
  deleteType(typeId) {
    const type = this._types.get(typeId);
    if (!type) return;
    if (type.builtIn) {
      throw new Error(`BuiltIn-Typ "${type.name}" kann nicht gelöscht werden — nur deaktiviert`);
    }
    this._types.delete(typeId);
    this._persist();
    console.log(`[RPG-Brain] Typ gelöscht: ${type.name}`);
  }

  /**
   * Entity-Daten gegen das Schema des Typs validieren.
   * @param {string} typeId
   * @param {object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateEntity(typeId, data) {
    const type = this._types.get(typeId);
    if (!type) {
      return { valid: false, errors: [`Unbekannter Typ: ${typeId}`] };
    }

    const errors = [];

    for (const field of type.fields) {
      const value = data[field.key];

      // Required-Prüfung
      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push(`"${field.label || field.key}" ist erforderlich`);
        continue;
      }

      // Condition-Prüfung (z.B. Sperma-Menge nur bei männlich/futa)
      if (field.condition) {
        const condValue = data[field.condition.field];
        if (field.condition.in && !field.condition.in.includes(condValue)) {
          continue; // Feld nicht relevant, skip
        }
      }

      if (value === undefined || value === null || value === '') continue;

      // Typ-Prüfung
      switch (field.type) {
        case 'number':
          if (typeof value !== 'number' && isNaN(Number(value))) {
            errors.push(`"${field.label || field.key}" muss eine Zahl sein`);
          } else {
            const num = Number(value);
            if (field.min !== undefined && num < field.min) {
              errors.push(`"${field.label || field.key}" minimum: ${field.min}`);
            }
            if (field.max !== undefined && num > field.max) {
              errors.push(`"${field.label || field.key}" maximum: ${field.max}`);
            }
          }
          break;

        case 'enum':
          if (field.options && !field.options.includes(value)) {
            errors.push(`"${field.label || field.key}" ungültiger Wert: ${value}`);
          }
          break;
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Alle aktiven Typ-Schemas als kompakten Text für LLM-Prompts.
   * @returns {string}
   */
  getTypeSchemasForPrompt() {
    const activeTypes = this.getAllTypes(true);
    return activeTypes.map(type => {
      const fieldDescs = type.fields
        .filter(f => f.type !== 'image')
        .map(f => {
          let desc = `${f.key} (${f.type}`;
          if (f.required) desc += ', required';
          if (f.options) desc += `: ${f.options.join('|')}`;
          desc += ')';
          return desc;
        })
        .join(', ');
      return `[${type.id}] ${type.name}: ${fieldDescs}`;
    }).join('\n');
  }

  /**
   * Registry in Extension-Settings persistieren.
   */
  _persist() {
    const settings = this._getSettings();
    settings.typeRegistry = Array.from(this._types.values()).map(type => ({
      id: type.id,
      name: type.name,
      icon: type.icon,
      color: type.color,
      builtIn: type.builtIn,
      active: type.active,
      fields: type.fields,
    }));
    this._saveSettings();
  }
}
