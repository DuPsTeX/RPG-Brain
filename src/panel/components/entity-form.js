// entity-form.js — Dynamischer Form-Generator aus Entity-Schema

import { imageManager } from '../../image-manager.js';

/**
 * Rendert ein Formular für Create/Edit einer Entity.
 * @param {object} type - Entity-Typ Schema
 * @param {object} data - Vorhandene Daten (leer für Create)
 * @param {string|null} entityId - Entity-ID für Edit, null für Create
 * @returns {string} HTML
 */
export function renderEntityForm(type, data = {}, entityId = null) {
  const fields = type.fields
    .map(f => f.type === 'image' ? renderImageField(f, data) : renderField(f, data))
    .join('');

  const submitLabel = entityId ? 'Speichern' : 'Erstellen';

  return `
    <form id="rpg-brain-entity-form" class="rpg-brain-entity-form" data-type-id="${type.id}" data-entity-id="${entityId || ''}">
      ${fields}
      <div class="rpg-brain-form-actions">
        <button type="submit" class="menu_button rpg-brain-form-submit">${submitLabel}</button>
        <button type="button" id="rpg-brain-form-cancel" class="menu_button rpg-brain-form-cancel">Abbrechen</button>
      </div>
    </form>
  `;
}

function renderField(field, data) {
  const value = data[field.key] !== undefined ? data[field.key] : '';
  const required = field.required ? 'required' : '';
  const label = escapeHtml(field.label || field.key);

  // Condition-Attribute für Frontend-Logik
  const condAttr = field.condition
    ? `data-condition-field="${field.condition.field}" data-condition-in="${field.condition.in?.join(',') || ''}"`
    : '';

  let inputHtml;

  switch (field.type) {
    case 'string':
      inputHtml = `<input type="text" name="${field.key}" value="${escapeHtml(String(value))}" class="text_pole" ${required} />`;
      break;

    case 'text':
      inputHtml = `<textarea name="${field.key}" class="text_pole rpg-brain-textarea" rows="3" ${required}>${escapeHtml(String(value))}</textarea>`;
      break;

    case 'number':
      const min = field.min !== undefined ? `min="${field.min}"` : '';
      const max = field.max !== undefined ? `max="${field.max}"` : '';
      inputHtml = `<input type="number" name="${field.key}" value="${value}" class="text_pole" ${min} ${max} ${required} />`;
      if (field.display === 'bar' && field.min !== undefined && field.max !== undefined) {
        inputHtml = `
          <div class="rpg-brain-range-input">
            <input type="range" name="${field.key}" value="${value || field.min}" min="${field.min}" max="${field.max}"
              oninput="this.nextElementSibling.textContent = this.value" />
            <span class="rpg-brain-range-value">${value || field.min}</span>
          </div>
        `;
      }
      break;

    case 'enum':
      const options = (field.options || [])
        .map(opt => `<option value="${escapeHtml(opt)}" ${opt === value ? 'selected' : ''}>${escapeHtml(opt)}</option>`)
        .join('');
      inputHtml = `<select name="${field.key}" class="text_pole" ${required}><option value="">-- Wählen --</option>${options}</select>`;
      break;

    case 'relation':
      inputHtml = `<input type="text" name="${field.key}" value="${escapeHtml(String(value))}" class="text_pole" placeholder="${field.relationType || 'Entity'} Name" />`;
      break;

    case 'date':
      inputHtml = `<input type="text" name="${field.key}" value="${escapeHtml(String(value))}" class="text_pole" placeholder="Zeitpunkt" />`;
      break;

    case 'boolean':
      const checked = value ? 'checked' : '';
      inputHtml = `<label class="rpg-brain-checkbox"><input type="checkbox" name="${field.key}" ${checked} /> ${label}</label>`;
      return `<div class="rpg-brain-form-field" ${condAttr}>${inputHtml}</div>`;

    default:
      inputHtml = `<input type="text" name="${field.key}" value="${escapeHtml(String(value))}" class="text_pole" />`;
  }

  return `
    <div class="rpg-brain-form-field" ${condAttr}>
      <label class="rpg-brain-form-label">${label}${field.required ? ' *' : ''}</label>
      ${inputHtml}
    </div>
  `;
}

function renderImageField(field, data) {
  const value = data[field.key] || '';
  return imageManager.renderUploadField(value, field.key);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
