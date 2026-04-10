// character-card.js — Charakter-Card Komponente für das Seitenpanel
// Unterstützt Party-Badge, Scene-Status und Template-getriebene Stats

/**
 * Rendert eine Charakter-Card mit Portrait, Stats-Balken, Wichtig-Box und Inventar.
 * @param {object} entity - { id, typeId, data }
 * @param {boolean} inScene - Ob der Charakter in der aktuellen Szene anwesend ist
 * @param {object} [options] - { sceneStatus, isPartyMember, templateFields, onPartyToggle }
 * @returns {string} HTML
 */
export function renderCharacterCard(entity, inScene = true, options = {}) {
  const d = entity.data;
  const id = entity.id;
  const { sceneStatus, isPartyMember, templateFields } = options;

  const genderIcon = { 'männlich': '♂', 'weiblich': '♀', 'futa': '⚥' }[d.geschlecht] || '';
  const defaultEmoji = { 'männlich': '🧙', 'weiblich': '🧝‍♀️', 'futa': '🧝' }[d.geschlecht] || '👤';

  // Portrait oder Default-Emoji
  const portrait = d.portrait
    ? `<img src="${d.portrait}" class="rpg-brain-char-portrait" alt="${d.name}" />`
    : `<div class="rpg-brain-char-portrait rpg-brain-char-portrait--emoji">${defaultEmoji}</div>`;

  // Tags — klasse/rasse auch aus scene.status holen wenn Entity-Daten fehlen
  const tags = [];
  if (d.rasse || sceneStatus?.rasse) tags.push(d.rasse || sceneStatus.rasse);
  if (d.klasse || sceneStatus?.klasse) tags.push(d.klasse || sceneStatus.klasse);
  const tagStr = d.tags ? d.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
  tags.push(...tagStr);
  const tagsHtml = tags.map(t => `<span class="rpg-brain-tag">${escapeHtml(t)}</span>`).join('');

  // Party-Badge
  const partyBadgeHtml = isPartyMember !== undefined
    ? `<span class="rpg-brain-party-badge${isPartyMember ? ' rpg-brain-party-badge--active' : ''}" data-char-name="${escapeHtml(d.name)}" title="${isPartyMember ? 'Aus Gruppe entfernen' : 'Zur Gruppe hinzufügen'}">⭐</span>`
    : '';

  // Stats-Balken: Scene-Status hat Vorrang, sonst Entity-Daten, sonst Template-Felder
  let barsHtml = '';
  let inventarHtml = '';
  let equipmentHtml = '';
  let listFieldsHtml = '';

  if (sceneStatus && templateFields) {
    // Template-getriebene Stats aus Scene-Status
    const rendered = renderTemplateStats(sceneStatus, templateFields, d.name);
    barsHtml = rendered.bars;
    inventarHtml = rendered.lists;
    equipmentHtml = rendered.equipment;
  } else {
    // Fallback: Hardcoded Stats aus Entity-Daten
    const bars = [];
    addBar(bars, '❤️', 'HP', d.hp, '#e94560');
    addBar(bars, '💎', 'Mana', d.mana, '#00d2ff');
    addBar(bars, '🍖', 'Hunger', d.hunger, '#f0a500');
    addBar(bars, '💧', 'Durst', d.durst, '#00d2ff');
    addBar(bars, '🧹', 'Sauber', d.sauberkeit, '#6bcb77');
    addBar(bars, '😊', 'Erregung', d.erregung, '#ff69b4');
    if ((d.geschlecht === 'männlich' || d.geschlecht === 'futa') && d.sperma_menge !== undefined) {
      addBar(bars, '💦', 'Sperma', d.sperma_menge, '#c77dff');
    }
    barsHtml = bars.join('');

    inventarHtml = d.inventar
      ? `<div class="rpg-brain-char-inventar">🎒 ${escapeHtml(d.inventar)}</div>`
      : '';
  }

  // Wichtige Info
  const wichtigHtml = d.wichtig
    ? `<div class="rpg-brain-char-wichtig">
        <div class="rpg-brain-char-wichtig-label">⚠️ Wichtig</div>
        <div class="rpg-brain-char-wichtig-text">${escapeHtml(d.wichtig)}</div>
      </div>`
    : '';

  return `
    <div class="rpg-brain-card rpg-brain-char-card${inScene ? ' rpg-brain-in-scene' : ' rpg-brain-absent'}${isPartyMember ? ' rpg-brain-party-member' : ''}" data-entity-id="${id}">
      <div class="rpg-brain-char-header">
        ${portrait}
        <div class="rpg-brain-char-info">
          <div class="rpg-brain-char-name">${partyBadgeHtml}${escapeHtml(d.name || '?')} ${genderIcon}</div>
          <div class="rpg-brain-char-tags">${tagsHtml}</div>
        </div>
        <div class="rpg-brain-card-actions">
          <span class="rpg-brain-entity-edit rpg-brain-card-btn" data-entity-id="${id}" title="Bearbeiten">✏️</span>
          <span class="rpg-brain-entity-delete rpg-brain-card-btn" data-entity-id="${id}" title="Löschen">🗑️</span>
        </div>
      </div>
      ${barsHtml ? `<div class="rpg-brain-char-bars">${barsHtml}</div>` : ''}
      ${equipmentHtml}
      ${wichtigHtml}
      ${inventarHtml}
      ${listFieldsHtml}
    </div>
  `;
}

/**
 * Rendert Stats basierend auf Template-Feldern und Scene-Status.
 */
function renderTemplateStats(status, fields, charName) {
  const bars = [];
  const lists = [];
  const equipments = [];

  const COLORS = ['#e94560', '#00d2ff', '#f0a500', '#6bcb77', '#ff69b4', '#c77dff', '#ffd93d', '#8b5cf6'];

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    let value = status[field.key];
    // Attribute sollen immer sichtbar sein — falls LLM nichts liefert, Default nutzen
    if ((value === undefined || value === null) && field.type === 'attributes' && field.default) {
      value = field.default;
    }
    if (value === undefined || value === null) continue;

    const color = COLORS[i % COLORS.length];

    switch (field.type) {
      case 'resource': {
        // Format: "45/100" → Balken
        const parsed = parseResource(value);
        if (parsed) {
          const pct = Math.min(100, Math.max(0, (parsed.current / parsed.max) * 100));
          bars.push(`
            <div class="rpg-brain-bar-row">
              <span class="rpg-brain-bar-label">${escapeHtml(field.label)}</span>
              <div class="rpg-brain-bar-track">
                <div class="rpg-brain-bar-fill" style="width: ${pct}%; background: ${color};"></div>
              </div>
              <span class="rpg-brain-bar-value rpg-brain-stat-editable" data-char="${escapeHtml(charName)}" data-field="${field.key}">${escapeHtml(String(value))}</span>
            </div>
          `);
        }
        break;
      }
      case 'currency':
      case 'number': {
        bars.push(`
          <div class="rpg-brain-stat-row">
            <span class="rpg-brain-stat-label">${escapeHtml(field.label)}:</span>
            <span class="rpg-brain-stat-value rpg-brain-stat-editable" data-char="${escapeHtml(charName)}" data-field="${field.key}">${escapeHtml(String(value))}</span>
          </div>
        `);
        break;
      }
      case 'attributes': {
        // RPG-Attribute: { STR: 14, DEX: 12, ... } → kompakte inline 6er-Grid
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const cells = Object.entries(value).map(([attr, num]) => {
            const label = String(attr).toUpperCase();
            return `<div class="rpg-brain-attr-cell">
              <span class="rpg-brain-attr-label">${escapeHtml(label)}</span>
              <span class="rpg-brain-attr-value rpg-brain-stat-editable" data-char="${escapeHtml(charName)}" data-field="${field.key}.${attr}">${escapeHtml(String(num ?? '-'))}</span>
            </div>`;
          }).join('');
          bars.push(`
            <div class="rpg-brain-attributes-block">
              <div class="rpg-brain-attributes-label">${escapeHtml(field.label)}</div>
              <div class="rpg-brain-attributes-grid">${cells}</div>
            </div>
          `);
        }
        break;
      }
      case 'currencies': {
        // Multi-Währung: { gold: 5, silber: 20, kupfer: 50 } → inline Pills pro Münze
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const coinIcons = { gold: '🟡', silber: '⚪', kupfer: '🟤', credits: '💠', seelen: '👻' };
          const entries = Object.entries(value)
            .map(([coin, amount]) => {
              const icon = coinIcons[coin] || '💰';
              const displayName = coin.charAt(0).toUpperCase() + coin.slice(1);
              return `<span class="rpg-brain-currency-pill">
                <span class="rpg-brain-currency-icon">${icon}</span>
                <span class="rpg-brain-currency-name">${escapeHtml(displayName)}:</span>
                <span class="rpg-brain-currency-value rpg-brain-stat-editable" data-char="${escapeHtml(charName)}" data-field="${field.key}.${coin}">${escapeHtml(String(amount ?? 0))}</span>
              </span>`;
            }).join('');
          bars.push(`
            <div class="rpg-brain-stat-row rpg-brain-currencies-row">
              <span class="rpg-brain-stat-label">${escapeHtml(field.label)}:</span>
              <div class="rpg-brain-currencies">${entries}</div>
            </div>
          `);
        }
        break;
      }
      case 'list': {
        if (Array.isArray(value) && value.length > 0) {
          const pills = value.map(item => `<span class="rpg-brain-inventory-pill">${escapeHtml(String(item))}</span>`).join('');
          lists.push(`
            <div class="rpg-brain-list-field">
              <div class="rpg-brain-list-label">${escapeHtml(field.label)}:</div>
              <div class="rpg-brain-inventory-tags">${pills}</div>
            </div>
          `);
        }
        break;
      }
      case 'equipment': {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const slots = Object.entries(value)
            .filter(([, v]) => v && v !== '...' && v !== '')
            .map(([slotName, slotVal]) =>
              `<div class="rpg-brain-equipment-slot">
                <span class="rpg-brain-equipment-slot-name">${escapeHtml(slotName)}:</span>
                <span class="rpg-brain-equipment-slot-value rpg-brain-stat-editable" data-char="${escapeHtml(charName)}" data-field="${field.key}.${slotName}">${escapeHtml(String(slotVal))}</span>
              </div>`
            ).join('');
          if (slots) {
            equipments.push(`
              <div class="rpg-brain-equipment-field">
                <div class="rpg-brain-equipment-label">${escapeHtml(field.label)}:</div>
                ${slots}
              </div>
            `);
          }
        }
        break;
      }
      case 'text': {
        if (value && value !== '...') {
          bars.push(`
            <div class="rpg-brain-stat-row">
              <span class="rpg-brain-stat-label">${escapeHtml(field.label)}:</span>
              <span class="rpg-brain-stat-value rpg-brain-stat-editable" data-char="${escapeHtml(charName)}" data-field="${field.key}">${escapeHtml(String(value))}</span>
            </div>
          `);
        }
        break;
      }
    }
  }

  return {
    bars: bars.join(''),
    lists: lists.join(''),
    equipment: equipments.join(''),
  };
}

/**
 * Parst einen Resource-Wert wie "45/100".
 */
function parseResource(value) {
  const str = String(value);
  const match = str.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (match) {
    return { current: parseFloat(match[1]), max: parseFloat(match[2]) };
  }
  // Einzelner Zahlenwert → als Prozent
  const num = parseFloat(str);
  if (!isNaN(num)) {
    return { current: num, max: 100 };
  }
  return null;
}

function addBar(bars, icon, label, value, color) {
  if (value === undefined || value === null) return;
  const val = Number(value);
  bars.push(`
    <div class="rpg-brain-bar-row">
      <span class="rpg-brain-bar-icon">${icon}</span>
      <div class="rpg-brain-bar-track">
        <div class="rpg-brain-bar-fill" style="width: ${val}%; background: ${color};"></div>
      </div>
      <span class="rpg-brain-bar-value">${val}%</span>
    </div>
  `);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
