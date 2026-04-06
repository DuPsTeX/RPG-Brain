// character-card.js — Charakter-Card Komponente für das Seitenpanel

/**
 * Rendert eine Charakter-Card mit Portrait, Stats-Balken, Wichtig-Box und Inventar.
 * @param {object} entity - { id, typeId, data }
 * @param {boolean} inScene - Ob der Charakter in der aktuellen Szene anwesend ist
 * @returns {string} HTML
 */
export function renderCharacterCard(entity, inScene = true) {
  const d = entity.data;
  const id = entity.id;

  const genderIcon = { 'männlich': '♂', 'weiblich': '♀', 'futa': '⚥' }[d.geschlecht] || '';
  const defaultEmoji = { 'männlich': '🧙', 'weiblich': '🧝‍♀️', 'futa': '🧝' }[d.geschlecht] || '👤';

  // Portrait oder Default-Emoji
  const portrait = d.portrait
    ? `<img src="${d.portrait}" class="rpg-brain-char-portrait" alt="${d.name}" />`
    : `<div class="rpg-brain-char-portrait rpg-brain-char-portrait--emoji">${defaultEmoji}</div>`;

  // Tags
  const tags = [];
  if (d.rasse) tags.push(d.rasse);
  if (d.klasse) tags.push(d.klasse);
  const tagStr = d.tags ? d.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
  tags.push(...tagStr);
  const tagsHtml = tags.map(t => `<span class="rpg-brain-tag">${escapeHtml(t)}</span>`).join('');

  // Stats-Balken
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
  const barsHtml = bars.join('');

  // Wichtige Info
  const wichtigHtml = d.wichtig
    ? `<div class="rpg-brain-char-wichtig">
        <div class="rpg-brain-char-wichtig-label">⚠️ Wichtig</div>
        <div class="rpg-brain-char-wichtig-text">${escapeHtml(d.wichtig)}</div>
      </div>`
    : '';

  // Inventar
  const inventarHtml = d.inventar
    ? `<div class="rpg-brain-char-inventar">🎒 ${escapeHtml(d.inventar)}</div>`
    : '';

  return `
    <div class="rpg-brain-card rpg-brain-char-card${inScene ? ' rpg-brain-in-scene' : ' rpg-brain-absent'}" data-entity-id="${id}">
      <div class="rpg-brain-char-header">
        ${portrait}
        <div class="rpg-brain-char-info">
          <div class="rpg-brain-char-name">${escapeHtml(d.name || '?')} ${genderIcon}</div>
          <div class="rpg-brain-char-tags">${tagsHtml}</div>
        </div>
        <div class="rpg-brain-card-actions">
          <span class="rpg-brain-entity-edit rpg-brain-card-btn" data-entity-id="${id}" title="Bearbeiten">✏️</span>
          <span class="rpg-brain-entity-delete rpg-brain-card-btn" data-entity-id="${id}" title="Löschen">🗑️</span>
        </div>
      </div>
      ${barsHtml ? `<div class="rpg-brain-char-bars">${barsHtml}</div>` : ''}
      ${wichtigHtml}
      ${inventarHtml}
    </div>
  `;
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
