// quest-card.js — Quest-Card Komponente

/**
 * Rendert eine Quest-Card mit Status-Badge, Beteiligte und Belohnung.
 * @param {object} entity - { id, typeId, data }
 * @returns {string} HTML
 */
export function renderQuestCard(entity) {
  const d = entity.data;
  const id = entity.id;

  const statusColors = {
    'aktiv': { bg: '#f0a500', text: '#000' },
    'abgeschlossen': { bg: '#4ecca3', text: '#000' },
    'fehlgeschlagen': { bg: '#e94560', text: '#fff' },
  };
  const statusStyle = statusColors[d.status] || statusColors['aktiv'];

  const statusBadge = d.status
    ? `<span class="rpg-brain-quest-status" style="background:${statusStyle.bg};color:${statusStyle.text};">${escapeHtml(d.status).toUpperCase()}</span>`
    : '';

  return `
    <div class="rpg-brain-card rpg-brain-quest-card" data-entity-id="${id}">
      <div class="rpg-brain-quest-header">
        <div class="rpg-brain-quest-title">
          <span>��</span>
          <span class="rpg-brain-quest-name">${escapeHtml(d.name || '?')}</span>
        </div>
        <div class="rpg-brain-quest-right">
          ${statusBadge}
          <span class="rpg-brain-entity-edit rpg-brain-card-btn" data-entity-id="${id}" title="Bearbeiten">✏️</span>
          <span class="rpg-brain-entity-delete rpg-brain-card-btn" data-entity-id="${id}" title="Löschen">🗑️</span>
        </div>
      </div>
      ${d.ziel ? `<div class="rpg-brain-quest-goal">${escapeHtml(d.ziel)}</div>` : ''}
      ${d.naechstes_ziel ? `<div class="rpg-brain-quest-next">→ Nächstes Ziel: ${escapeHtml(d.naechstes_ziel)}</div>` : ''}
      ${d.beteiligte ? `<div class="rpg-brain-quest-involved">→ Beteiligte: ${escapeHtml(d.beteiligte)}</div>` : ''}
      ${d.belohnung ? `<div class="rpg-brain-quest-reward">🏆 ${escapeHtml(d.belohnung)}</div>` : ''}
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
