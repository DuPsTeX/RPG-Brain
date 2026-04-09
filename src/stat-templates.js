// stat-templates.js — Preset-Templates für konfigurierbare Charakter-Stats im Scene Block

/**
 * Field Types:
 * - resource: Balken mit current/max (z.B. "45/100")
 * - currency: Zahl mit optionaler Einheit (einzelne Währung)
 * - currencies: Objekt mit Währungs-Slots (z.B. { gold: 5, silber: 20, kupfer: 50 })
 * - attributes: Kompaktes Objekt mit RPG-Attributen (z.B. { STR: 14, DEX: 12, ... })
 * - list: Array von Strings (Items, Fähigkeiten)
 * - equipment: Objekt mit benannten Slots
 * - number: Einfache Zahl
 * - text: Freitext
 */

const DEFAULT_DND_ATTRIBUTES = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };

export const PRESET_TEMPLATES = [
  {
    id: 'dnd',
    name: 'D&D / Fantasy',
    fields: [
      { key: 'hp', label: 'HP', type: 'resource', format: 'current/max', default: '100/100' },
      { key: 'mana', label: 'Mana', type: 'resource', format: 'current/max', default: '50/50' },
      { key: 'klasse', label: 'Klasse', type: 'text', default: '-' },
      { key: 'level', label: 'Level', type: 'number', default: 1 },
      { key: 'attribute', label: 'Attribute', type: 'attributes', subfields: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'], default: { ...DEFAULT_DND_ATTRIBUTES } },
      { key: 'geld', label: 'Geld', type: 'currencies', subfields: ['gold', 'silber', 'kupfer'], default: { gold: 0, silber: 0, kupfer: 0 } },
      { key: 'inventar', label: 'Inventar', type: 'list', default: [] },
      { key: 'ausruestung', label: 'Ausrüstung', type: 'equipment', subfields: ['waffe_rechts', 'waffe_links', 'ruestung', 'schild', 'helm', 'accessoire'], default: {} },
      { key: 'faehigkeiten', label: 'Fähigkeiten', type: 'list', default: [] },
    ],
  },
  {
    id: 'darksouls',
    name: 'Dark Souls / Action RPG',
    fields: [
      { key: 'hp', label: 'HP', type: 'resource', format: 'current/max', default: '100/100' },
      { key: 'stamina', label: 'Stamina', type: 'resource', format: 'current/max', default: '100/100' },
      { key: 'fp', label: 'FP', type: 'resource', format: 'current/max', default: '50/50' },
      { key: 'seelen', label: 'Seelen', type: 'currency', default: '0' },
      { key: 'level', label: 'Level', type: 'number', default: 1 },
      { key: 'inventar', label: 'Inventar', type: 'list', default: [] },
      { key: 'ausruestung', label: 'Ausrüstung', type: 'equipment', subfields: ['rechte_hand', 'linke_hand', 'ruestung', 'helm', 'ring_1', 'ring_2'], default: {} },
      { key: 'faehigkeiten', label: 'Fähigkeiten', type: 'list', default: [] },
      { key: 'estus', label: 'Estus', type: 'resource', format: 'current/max', default: '5/5' },
    ],
  },
  {
    id: 'survival',
    name: 'Survival',
    fields: [
      { key: 'hp', label: 'HP', type: 'resource', format: 'current/max', default: '100/100' },
      { key: 'hunger', label: 'Hunger', type: 'resource', format: 'current/max', default: '100/100' },
      { key: 'durst', label: 'Durst', type: 'resource', format: 'current/max', default: '100/100' },
      { key: 'energie', label: 'Energie', type: 'resource', format: 'current/max', default: '100/100' },
      { key: 'temperatur', label: 'Temperatur', type: 'text', default: 'normal' },
      { key: 'geld', label: 'Geld', type: 'currency', default: '0' },
      { key: 'inventar', label: 'Inventar', type: 'list', default: [] },
      { key: 'ausruestung', label: 'Ausrüstung', type: 'equipment', subfields: ['waffe', 'werkzeug', 'kleidung', 'rucksack'], default: {} },
      { key: 'faehigkeiten', label: 'Fähigkeiten', type: 'list', default: [] },
    ],
  },
  {
    id: 'scifi',
    name: 'Sci-Fi / Cyberpunk',
    fields: [
      { key: 'hp', label: 'HP', type: 'resource', format: 'current/max', default: '100/100' },
      { key: 'schild', label: 'Schild', type: 'resource', format: 'current/max', default: '50/50' },
      { key: 'energie', label: 'Energie', type: 'resource', format: 'current/max', default: '100/100' },
      { key: 'credits', label: 'Credits', type: 'currency', default: '0' },
      { key: 'inventar', label: 'Inventar', type: 'list', default: [] },
      { key: 'ausruestung', label: 'Ausrüstung', type: 'equipment', subfields: ['waffe', 'ruestung', 'implantat_1', 'implantat_2', 'gadget'], default: {} },
      { key: 'faehigkeiten', label: 'Fähigkeiten / Programme', type: 'list', default: [] },
    ],
  },
  {
    id: 'nsfw',
    name: 'NSFW / Adult RPG',
    fields: [
      { key: 'hp', label: 'HP', type: 'resource', format: 'current/max', default: '100/100' },
      { key: 'erregung', label: 'Erregung', type: 'resource', format: 'current/max', default: '0/100' },
      { key: 'hunger', label: 'Hunger', type: 'resource', format: 'current/max', default: '100/100' },
      { key: 'sauberkeit', label: 'Sauberkeit', type: 'resource', format: 'current/max', default: '100/100' },
      { key: 'klasse', label: 'Klasse', type: 'text', default: '-' },
      { key: 'level', label: 'Level', type: 'number', default: 1 },
      { key: 'attribute', label: 'Attribute', type: 'attributes', subfields: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'], default: { ...DEFAULT_DND_ATTRIBUTES } },
      { key: 'geld', label: 'Geld', type: 'currencies', subfields: ['gold', 'silber', 'kupfer'], default: { gold: 0, silber: 0, kupfer: 0 } },
      { key: 'inventar', label: 'Inventar', type: 'list', default: [] },
      { key: 'ausruestung', label: 'Ausrüstung / Kleidung', type: 'equipment', subfields: ['waffe_rechts', 'waffe_links', 'oberteil', 'unterteil', 'unterwaesche', 'schuhe', 'accessoire'], default: {} },
      { key: 'zustand', label: 'Körperlicher Zustand', type: 'text', default: 'normal' },
    ],
  },
  {
    id: 'custom',
    name: 'Custom (leer)',
    fields: [],
  },
];

/**
 * Gibt das aktive Template zurück basierend auf Settings.
 * @param {object} settings - extensionSettings.rpgBrain
 * @returns {object} Template mit gemergten Custom-Overrides
 */
export function getActiveTemplate(settings) {
  const templateId = settings?.statTemplate || 'dnd';
  const preset = PRESET_TEMPLATES.find(t => t.id === templateId);
  if (!preset) return PRESET_TEMPLATES[0]; // Fallback auf D&D

  // Custom-Overrides anwenden
  const customFields = settings?.statTemplateCustom;
  if (customFields && Array.isArray(customFields)) {
    return { ...preset, fields: customFields };
  }

  return preset;
}

/**
 * Gibt nur die Feld-Definitionen des aktiven Templates zurück.
 * @param {object} settings
 * @returns {Array} Array von Field-Definitionen
 */
export function getTemplateFields(settings) {
  return getActiveTemplate(settings).fields;
}

/**
 * Generiert ein Beispiel-Status-Objekt für die LLM-Instruktion.
 * Kompakt, eine Zeile pro Feld.
 * @param {Array} fields - Template-Felder
 * @returns {object} Beispiel-Objekt
 */
export function buildExampleStatus(fields) {
  const example = {};
  for (const field of fields) {
    switch (field.type) {
      case 'resource':
        example[field.key] = field.default || '0/100';
        break;
      case 'currency':
        example[field.key] = field.default || '0';
        break;
      case 'currencies':
        example[field.key] = {};
        if (field.subfields) {
          for (const sf of field.subfields) {
            example[field.key][sf] = 0;
          }
        }
        break;
      case 'attributes':
        example[field.key] = {};
        if (field.subfields) {
          for (const sf of field.subfields) {
            example[field.key][sf] = (field.default && field.default[sf]) || 10;
          }
        }
        break;
      case 'number':
        example[field.key] = field.default || 0;
        break;
      case 'list':
        example[field.key] = ['Beispiel1', 'Beispiel2'];
        break;
      case 'equipment':
        example[field.key] = {};
        if (field.subfields) {
          for (const sf of field.subfields.slice(0, 2)) {
            example[field.key][sf] = '...';
          }
        }
        break;
      case 'text':
        example[field.key] = '...';
        break;
    }
  }
  return example;
}

/**
 * Generiert eine kompakte Feld-Beschreibung für die LLM-Instruktion.
 * @param {Array} fields - Template-Felder
 * @param {string} language - 'de' oder 'en'
 * @returns {string}
 */
export function buildFieldDescription(fields, language) {
  if (fields.length === 0) return '';

  const lines = fields.map(f => {
    switch (f.type) {
      case 'resource':
        return `${f.key}: ${f.label} (${language === 'de' ? 'Format' : 'format'}: "${f.format || 'current/max'}", z.B. "45/100")`;
      case 'list':
        return `${f.key}: ${f.label} (Array, z.B. ["Item1", "Item2"])`;
      case 'equipment': {
        const slots = f.subfields ? f.subfields.join(', ') : '';
        return `${f.key}: ${f.label} (${language === 'de' ? 'Objekt mit Slots' : 'object with slots'}: ${slots})`;
      }
      case 'currencies': {
        const coins = f.subfields ? f.subfields.join(', ') : '';
        return `${f.key}: ${f.label} (${language === 'de' ? 'Objekt mit Münz-Slots, Zahlen' : 'object with coin slots, numbers'}: ${coins})`;
      }
      case 'attributes': {
        const attrs = f.subfields ? f.subfields.join(', ') : '';
        return `${f.key}: ${f.label} (${language === 'de' ? 'Objekt mit festen RPG-Attributen, Zahlen 3-20' : 'object with fixed RPG attributes, numbers 3-20'}: ${attrs})`;
      }
      default:
        return `${f.key}: ${f.label}`;
    }
  });

  return lines.join('\n');
}
