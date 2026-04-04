// entity-card.js — Generische Entity-Card für jeden Typ basierend auf Schema

/**
 * Rendert eine generische Entity-Card.
 * @param {object} entity - { id, typeId, data }
 * @param {object} type - Entity-Typ Schema
 * @returns {string} HTML
 */
export function renderEntityCard(entity, type) {
  if (!type) return '';

  const d = entity.data;
  const id = entity.id;

  // Felder rendern (ohne image, ohne name)
  const fieldLines = [];
  for (const field of type.fields) {
    if (field.type === 'image') continue;
    if (field.key === 'name') continue;

    const value = d[field.key];
    if (value === undefined || value === null || value === '') continue;

    // Condition prüfen
    if (field.condition) {
      const condValue = d[field.condition.field];
      if (field.condition.in && !field.condition.in.includes(condValue)) continue;
    }

    // Kompakte Darstellung
    if (field.display === 'bar') {
      fieldLines.push(`
        <div class="rpg-brain-bar-row">
          <span class="rpg-brain-bar-label">${escapeHtml(field.label)}</span>
          <div class="rpg-brain-bar-track">
            <div class="rpg-brain-bar-fill" style="width: ${Number(value)}%; background: ${type.color};"></div>
          </div>
          <span class="rpg-brain-bar-value">${value}%</span>
        </div>
      `);
    } else {
      const displayValue = String(value).length > 100
        ? String(value).slice(0, 100) + '...'
        : String(value);
      fieldLines.push(`
        <div class="rpg-brain-field-row">
          <span class="rpg-brain-field-label">${escapeHtml(field.label)}:</span>
          <span class="rpg-brain-field-value">${escapeHtml(displayValue)}</span>
        </div>
      `);
    }
  }

  return `
    <div class="rpg-brain-card rpg-brain-generic-card" data-entity-id="${id}" style="border-left-color: ${type.color};">
      <div class="rpg-brain-card-header">
        <div class="rpg-brain-card-title">
          <span>${type.icon}</span>
          <span>${escapeHtml(d.name || '(ohne Name)')}</span>
        </div>
        <div class="rpg-brain-card-actions">
          <span class="rpg-brain-entity-edit rpg-brain-card-btn" data-entity-id="${id}" title="Bearbeiten">✏️</span>
          <span class="rpg-brain-entity-delete rpg-brain-card-btn" data-entity-id="${id}" title="Löschen">🗑️</span>
        </div>
      </div>
      ${fieldLines.length > 0 ? `<div class="rpg-brain-card-fields">${fieldLines.join('')}</div>` : ''}
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
