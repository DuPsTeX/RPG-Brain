// injection-sections.js — Standard + Custom Injection-Sektionen
// Definiert wie RPG-Brain Infos in den Prompt formatiert werden

/**
 * Standard-Sektionen die in den Prompt injiziert werden.
 * Priorität: niedrigere Zahl = höhere Priorität = wird zuerst eingefügt.
 */
export const DEFAULT_SECTIONS = [
  {
    id: 'rueckblick',
    name: 'Rückblick',
    icon: '📖',
    priority: 1,
    enabled: true,
    builtIn: true,
    entityTypes: ['rueckblick'],
    format: formatRueckblick,
  },
  {
    id: 'aktive_charaktere',
    name: 'Aktive Charaktere',
    icon: '🧙',
    priority: 2,
    enabled: true,
    builtIn: true,
    entityTypes: ['charakter'],
    format: formatCharaktere,
  },
  {
    id: 'wichtige_infos',
    name: 'Wichtige Charakter-Infos',
    icon: '⚠️',
    priority: 3,
    enabled: true,
    builtIn: true,
    entityTypes: ['charakter'],
    format: formatWichtigeInfos,
  },
  {
    id: 'aktive_quests',
    name: 'Aktive Quests',
    icon: '📜',
    priority: 4,
    enabled: true,
    builtIn: true,
    entityTypes: ['quest'],
    format: formatQuests,
  },
  {
    id: 'aktueller_ort',
    name: 'Aktueller Ort',
    icon: '📍',
    priority: 5,
    enabled: true,
    builtIn: true,
    entityTypes: ['ort'],
    format: formatOrte,
  },
  {
    id: 'beziehungen',
    name: 'Relevante Beziehungen',
    icon: '💜',
    priority: 6,
    enabled: true,
    builtIn: true,
    entityTypes: ['beziehung'],
    format: formatBeziehungen,
  },
];

// --- Format-Funktionen ---

function formatRueckblick(entities) {
  if (entities.length === 0) return '';
  // Neuesten Rückblick nehmen (nach updatedAt, dann bis_nachricht)
  const latest = entities.sort((a, b) =>
    (b.updatedAt || 0) - (a.updatedAt || 0) ||
    (b.data.bis_nachricht || 0) - (a.data.bis_nachricht || 0)
  )[0];
  return `📖 RÜCKBLICK:\n${latest.data.zusammenfassung || latest.data.name}`;
}

function formatCharaktere(entities, scene) {
  if (entities.length === 0) return '';

  const hasStat = (v) => v !== undefined && v !== null && v !== '' && !isNaN(v);
  const anwesendeLower = (scene?.anwesende || []).map(n => n.toLowerCase());
  // Prüfe ob Scene-Status für diesen Charakter existiert (dann keine Entity-Stats duplizieren)
  const hasSceneStatus = (name) => scene?.status && name && scene.status[name];

  const lines = entities.map(e => {
    const d = e.data;
    const genderIcon = { 'männlich': '♂', 'weiblich': '♀', 'futa': '⚥' }[d.geschlecht] || '';
    const isInScene = anwesendeLower.includes(d.name?.toLowerCase());
    const parts = [`${d.name} [${genderIcon} ${d.rasse || ''} ${d.klasse || ''}]`.trim()];

    // Stats NICHT duplizieren wenn Scene-Status vorhanden (dort aktueller)
    if (!hasSceneStatus(d.name)) {
      const stats = [];
      if (hasStat(d.hp)) stats.push(`HP: ${d.hp}/100`);
      if (hasStat(d.mana)) stats.push(`Mana: ${d.mana}/100`);
      if (hasStat(d.hunger)) stats.push(`Hunger: ${d.hunger}/100`);
      if (hasStat(d.durst)) stats.push(`Durst: ${d.durst}/100`);
      if (hasStat(d.sauberkeit)) stats.push(`Sauberkeit: ${d.sauberkeit}/100`);
      if (hasStat(d.erregung)) stats.push(`Erregung: ${d.erregung}/100`);
      if (hasStat(d.sperma_menge) && (d.geschlecht === 'männlich' || d.geschlecht === 'futa')) {
        stats.push(`Sperma: ${d.sperma_menge}/100`);
      }
      if (stats.length > 0) parts.push(stats.join(' | '));
    }

    // Erweiterte Details NUR für anwesende Charaktere
    if (isInScene) {
      if (d.aussehen) parts.push(`Aussehen: ${d.aussehen}`);
      if (d.persoenlichkeit) parts.push(`Persönlichkeit: ${d.persoenlichkeit}`);
      // Inventar nicht duplizieren wenn in Scene-Status
      if (d.inventar && !hasSceneStatus(d.name)) parts.push(`Inventar: ${d.inventar}`);
      if (d.wichtig) parts.push(`Wichtig: ${d.wichtig}`);
    } else {
      if (d.inventar && !hasSceneStatus(d.name)) parts.push(`Inventar: ${d.inventar}`);
    }

    return parts.join('\n  ');
  });

  return `🧙 AKTIVE CHARAKTERE:\n${lines.join('\n')}`;
}

function formatWichtigeInfos(entities, scene) {
  // Szene-Filter: Nur Infos von anwesenden Charakteren
  const anwesendeLower = (scene?.anwesende || []).map(n => n.toLowerCase());

  let filtered = entities.filter(e => e.data.wichtig);

  if (anwesendeLower.length > 0) {
    filtered = filtered.filter(e =>
      anwesendeLower.includes(e.data.name?.toLowerCase())
    );
  }

  const infos = filtered.map(e => `- ${e.data.name}: ${e.data.wichtig}`);

  if (infos.length === 0) return '';
  return `⚠️ WICHTIGE CHARAKTER-INFOS:\n${infos.join('\n')}`;
}

function formatQuests(entities) {
  const aktive = entities.filter(e => e.data.status === 'aktiv');
  if (aktive.length === 0) return '';

  const lines = aktive.map(e => {
    const d = e.data;
    let line = `- ${d.name} [AKTIV]`;
    if (d.ziel) line += ` — ${d.ziel}`;
    if (d.naechstes_ziel) line += `\n  → Nächstes Ziel: ${d.naechstes_ziel}`;
    if (d.beteiligte) line += `\n  → Beteiligte: ${d.beteiligte}`;
    return line;
  });

  return `📜 AKTIVE QUESTS:\n${lines.join('\n')}`;
}

function formatOrte(entities, scene) {
  if (entities.length === 0) return '';

  // Szene-Ort priorisieren wenn vorhanden
  let ort = entities[0];
  if (scene?.ort) {
    const sceneOrt = entities.find(e =>
      e.data.name?.toLowerCase().includes(scene.ort.toLowerCase()) ||
      scene.ort.toLowerCase().includes(e.data.name?.toLowerCase())
    );
    if (sceneOrt) ort = sceneOrt;
  }

  const d = ort.data;
  let text = `📍 AKTUELLER ORT: ${d.name}`;
  if (d.typ) text += ` (${d.typ})`;
  if (d.beschreibung) text += ` — ${d.beschreibung}`;
  if (d.npcs) text += `\n  → NPCs hier: ${d.npcs}`;
  if (d.events) text += `\n  → Geschehen: ${d.events}`;
  return text;
}

function formatBeziehungen(entities) {
  if (entities.length === 0) return '';

  const lines = entities.map(e => {
    const d = e.data;
    return `- ${d.von} → ${d.art || 'kennt'} → ${d.zu}${d.beschreibung ? ': ' + d.beschreibung : ''}`;
  });

  return `💜 RELEVANTE BEZIEHUNGEN:\n${lines.join('\n')}`;
}

// --- Sections Manager ---

/**
 * Verwaltet Standard + Custom Injection-Sektionen.
 */
export class InjectionSectionsManager {
  constructor(getSettings, saveSettings) {
    this._getSettings = getSettings;
    this._saveSettings = saveSettings;
    this._sections = [];
  }

  initialize() {
    this._sections = [];

    // Defaults laden
    for (const section of DEFAULT_SECTIONS) {
      this._sections.push({ ...section });
    }

    // Custom-Sektionen aus Settings laden
    const settings = this._getSettings();
    const saved = settings.injectionSections;
    if (Array.isArray(saved)) {
      for (const s of saved) {
        if (s.builtIn) {
          // BuiltIn: enabled/priority übernehmen
          const existing = this._sections.find(sec => sec.id === s.id);
          if (existing) {
            existing.enabled = s.enabled !== undefined ? s.enabled : true;
            existing.priority = s.priority !== undefined ? s.priority : existing.priority;
          }
        } else {
          // Custom-Sektion hinzufügen
          this._sections.push({
            ...s,
            format: createCustomFormatter(s.template || ''),
          });
        }
      }
    }

    // Nach Priorität sortieren
    this._sections.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Alle Sektionen sortiert nach Priorität.
   * @param {boolean} enabledOnly
   * @returns {Array}
   */
  getAllSections(enabledOnly = false) {
    const sections = [...this._sections].sort((a, b) => a.priority - b.priority);
    return enabledOnly ? sections.filter(s => s.enabled) : sections;
  }

  /**
   * Custom-Sektion hinzufügen.
   * @param {object} config - { id, name, icon, priority, template, entityTypes }
   */
  addSection(config) {
    this._sections.push({
      ...config,
      enabled: true,
      builtIn: false,
      format: createCustomFormatter(config.template || ''),
    });
    this._persist();
  }

  /**
   * Sektion aktivieren/deaktivieren.
   */
  toggleSection(sectionId, enabled) {
    const section = this._sections.find(s => s.id === sectionId);
    if (section) {
      section.enabled = enabled;
      this._persist();
    }
  }

  /**
   * Sektion-Priorität ändern.
   */
  updatePriority(sectionId, priority) {
    const section = this._sections.find(s => s.id === sectionId);
    if (section) {
      section.priority = priority;
      this._sections.sort((a, b) => a.priority - b.priority);
      this._persist();
    }
  }

  /**
   * Custom-Sektion löschen.
   */
  deleteSection(sectionId) {
    const idx = this._sections.findIndex(s => s.id === sectionId && !s.builtIn);
    if (idx >= 0) {
      this._sections.splice(idx, 1);
      this._persist();
    }
  }

  _persist() {
    const settings = this._getSettings();
    settings.injectionSections = this._sections.map(s => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      priority: s.priority,
      enabled: s.enabled,
      builtIn: s.builtIn,
      entityTypes: s.entityTypes,
      template: s.template || null,
    }));
    this._saveSettings();
  }
}

/**
 * Erstellt eine Format-Funktion für Custom-Sektionen basierend auf einem Template-String.
 * Template kann {{name}}, {{beschreibung}} etc. Platzhalter enthalten.
 */
function createCustomFormatter(template) {
  return (entities) => {
    if (entities.length === 0) return '';

    const lines = entities.map(e => {
      let text = template;
      for (const [key, value] of Object.entries(e.data)) {
        text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
      }
      // Nicht-ersetzte Platzhalter entfernen
      text = text.replace(/\{\{[^}]+\}\}/g, '');
      return text.trim();
    });

    return lines.filter(l => l).join('\n');
  };
}
