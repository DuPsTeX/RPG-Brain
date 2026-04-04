// entity-type-manager.js — Entity-Typ CRUD im Dashboard
// Custom-Typen erstellen, Felder bearbeiten, aktivieren/deaktivieren, löschen

const FIELD_TYPES = ['string', 'text', 'number', 'enum', 'relation', 'date', 'boolean', 'image'];

export class EntityTypeManager {
  /**
   * @param {EntityTypeRegistry} registry
   * @param {Function} onChanged - Callback nach Änderungen
   */
  constructor(registry, onChanged) {
    this.registry = registry;
    this.onChanged = onChanged;
    this._bindModalEvents();
  }

  render() {
    const container = document.getElementById('types-list');
    if (!container) return;

    const types = this.registry.getAllTypes(false); // inkl. inaktive

    if (types.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><div>Keine Entity-Typen vorhanden</div></div>';
      return;
    }

    container.innerHTML = types.map(type => this._renderTypeCard(type)).join('');

    // Event delegation
    container.querySelectorAll('.type-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openEditModal(btn.dataset.typeId));
    });
    container.querySelectorAll('.type-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => this.toggleType(btn.dataset.typeId));
    });
    container.querySelectorAll('.type-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteType(btn.dataset.typeId));
    });
  }

  _renderTypeCard(type) {
    const badges = [];
    if (type.builtIn) badges.push('<span class="type-badge type-badge--builtin">Built-in</span>');
    if (!type.active) badges.push('<span class="type-badge type-badge--inactive">Inaktiv</span>');

    const fields = type.fields.slice(0, 8).map(f => `
      <div class="type-card-field">
        <span class="type-card-field-name">${esc(f.label || f.key)}</span>
        <span class="type-card-field-type">${f.type}</span>
        ${f.required ? '<span class="type-card-field-required">*</span>' : ''}
      </div>
    `).join('');

    const moreFields = type.fields.length > 8 ? `<div class="text-muted" style="font-size:11px;padding-top:4px">+ ${type.fields.length - 8} weitere Felder</div>` : '';

    return `
      <div class="type-card" style="border-left-color:${type.color}">
        <div class="type-card-header">
          <div class="type-card-title">
            <span>${type.icon}</span>
            <span>${esc(type.name)}</span>
          </div>
          <div class="type-card-badges">${badges.join('')}</div>
        </div>
        <div class="type-card-fields">${fields}${moreFields}</div>
        <div class="type-card-actions">
          <button class="dash-btn dash-btn--small type-edit-btn" data-type-id="${type.id}">Bearbeiten</button>
          <button class="dash-btn dash-btn--small type-toggle-btn" data-type-id="${type.id}">
            ${type.active !== false ? 'Deaktivieren' : 'Aktivieren'}
          </button>
          ${!type.builtIn ? `<button class="dash-btn dash-btn--small dash-btn--danger type-delete-btn" data-type-id="${type.id}">Löschen</button>` : ''}
        </div>
      </div>
    `;
  }

  // --- Type CRUD ---

  toggleType(typeId) {
    const type = this.registry.getType(typeId);
    if (!type) return;

    if (type.active !== false) {
      this.registry.deactivateType(typeId);
    } else {
      this.registry.activateType(typeId);
    }
    this.onChanged();
  }

  deleteType(typeId) {
    const type = this.registry.getType(typeId);
    if (!type || type.builtIn) return;
    if (!confirm(`Typ "${type.name}" wirklich löschen?`)) return;

    this.registry.deleteType(typeId);
    this.onChanged();
  }

  // --- Modal ---

  openEditModal(typeId = null) {
    const modal = document.getElementById('type-modal');
    const title = document.getElementById('type-modal-title');
    const body = document.getElementById('type-modal-body');

    let type = typeId ? this.registry.getType(typeId) : null;
    const isNew = !type;

    title.textContent = isNew ? 'Neuen Entity-Typ erstellen' : `${type.icon} ${type.name} bearbeiten`;

    const data = type || {
      id: '',
      name: '',
      icon: '📄',
      color: '#4ecca3',
      builtIn: false,
      active: true,
      fields: [{ key: 'name', label: 'Name', type: 'string', required: true }],
    };

    body.innerHTML = `
      <form id="type-edit-form">
        <div class="form-group">
          <label class="form-label">ID (eindeutig, keine Leerzeichen)</label>
          <input type="text" name="id" value="${esc(data.id)}" class="form-input" ${typeId ? 'readonly' : 'required'} pattern="[a-z0-9_]+" />
          ${typeId ? '<div class="form-hint">ID kann nicht geändert werden</div>' : ''}
        </div>
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" name="name" value="${esc(data.name)}" class="form-input" required />
        </div>
        <div style="display:flex;gap:12px">
          <div class="form-group flex-1">
            <label class="form-label">Icon (Emoji)</label>
            <input type="text" name="icon" value="${data.icon}" class="form-input" maxlength="4" />
          </div>
          <div class="form-group flex-1">
            <label class="form-label">Farbe</label>
            <input type="color" name="color" value="${data.color}" class="form-input" style="height:38px;padding:4px" />
          </div>
        </div>

        <h4 style="margin:16px 0 8px;color:var(--accent)">Felder</h4>
        <div id="type-fields-list">
          ${data.fields.map((f, i) => this._renderFieldEditor(f, i)).join('')}
        </div>
        <button type="button" id="type-add-field" class="dash-btn" style="margin-top:8px">+ Feld hinzufügen</button>

        <div class="form-actions">
          <button type="submit" class="dash-btn dash-btn--primary">${isNew ? 'Erstellen' : 'Speichern'}</button>
          <button type="button" class="dash-btn modal-close-btn">Abbrechen</button>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');
  }

  _renderFieldEditor(field, index) {
    const typeOptions = FIELD_TYPES.map(t => `<option value="${t}" ${t === field.type ? 'selected' : ''}>${t}</option>`).join('');

    return `
      <div class="type-field-editor" data-index="${index}" style="background:var(--bg-tertiary);padding:10px;border-radius:var(--radius-sm);margin-bottom:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:end">
        <div style="flex:1;min-width:100px">
          <label class="form-label" style="font-size:10px">Key</label>
          <input type="text" class="form-input field-key" value="${esc(field.key)}" pattern="[a-z0-9_]+" required style="font-size:12px" />
        </div>
        <div style="flex:1;min-width:100px">
          <label class="form-label" style="font-size:10px">Label</label>
          <input type="text" class="form-input field-label" value="${esc(field.label || '')}" style="font-size:12px" />
        </div>
        <div style="width:100px">
          <label class="form-label" style="font-size:10px">Typ</label>
          <select class="form-select field-type" style="font-size:12px">${typeOptions}</select>
        </div>
        <div style="display:flex;align-items:center;gap:6px;padding-bottom:2px">
          <label style="font-size:11px;display:flex;align-items:center;gap:3px">
            <input type="checkbox" class="field-required" ${field.required ? 'checked' : ''} /> Pflicht
          </label>
          <button type="button" class="dash-btn dash-btn--small dash-btn--danger field-remove" title="Entfernen">&times;</button>
        </div>
        ${field.type === 'enum' ? `
          <div style="width:100%">
            <label class="form-label" style="font-size:10px">Optionen (kommagetrennt)</label>
            <input type="text" class="form-input field-options" value="${esc((field.options || []).join(', '))}" style="font-size:12px" />
          </div>
        ` : ''}
        ${field.type === 'number' ? `
          <div style="display:flex;gap:8px;width:100%">
            <div class="flex-1">
              <label class="form-label" style="font-size:10px">Min</label>
              <input type="number" class="form-input field-min" value="${field.min ?? ''}" style="font-size:12px" />
            </div>
            <div class="flex-1">
              <label class="form-label" style="font-size:10px">Max</label>
              <input type="number" class="form-input field-max" value="${field.max ?? ''}" style="font-size:12px" />
            </div>
            <div style="display:flex;align-items:end;padding-bottom:2px">
              <label style="font-size:11px;display:flex;align-items:center;gap:3px">
                <input type="checkbox" class="field-bar" ${field.display === 'bar' ? 'checked' : ''} /> Balken
              </label>
            </div>
          </div>
        ` : ''}
        ${field.type === 'relation' ? `
          <div style="width:100%">
            <label class="form-label" style="font-size:10px">Relation-Typ</label>
            <input type="text" class="form-input field-relation-type" value="${esc(field.relationType || '')}" style="font-size:12px" placeholder="z.B. charakter" />
          </div>
        ` : ''}
      </div>
    `;
  }

  _bindModalEvents() {
    // Add field button
    document.addEventListener('click', (e) => {
      if (e.target.id === 'type-add-field') {
        const list = document.getElementById('type-fields-list');
        if (!list) return;
        const index = list.children.length;
        const html = this._renderFieldEditor({ key: '', label: '', type: 'string', required: false }, index);
        list.insertAdjacentHTML('beforeend', html);
      }

      // Remove field
      if (e.target.classList.contains('field-remove')) {
        e.target.closest('.type-field-editor')?.remove();
      }

      // Add type button
      if (e.target.id === 'types-add') {
        this.openEditModal();
      }
    });

    // Form submit
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'type-edit-form') {
        e.preventDefault();
        this._handleFormSubmit(e.target);
      }
    });
  }

  _handleFormSubmit(form) {
    const id = form.querySelector('[name="id"]').value.trim();
    const name = form.querySelector('[name="name"]').value.trim();
    const icon = form.querySelector('[name="icon"]').value || '📄';
    const color = form.querySelector('[name="color"]').value || '#4ecca3';

    if (!id || !name) {
      alert('ID und Name sind Pflichtfelder');
      return;
    }

    // Felder auslesen
    const fieldEditors = form.querySelectorAll('.type-field-editor');
    const fields = [];

    fieldEditors.forEach(editor => {
      const key = editor.querySelector('.field-key')?.value.trim();
      const label = editor.querySelector('.field-label')?.value.trim();
      const type = editor.querySelector('.field-type')?.value;
      const required = editor.querySelector('.field-required')?.checked || false;

      if (!key) return;

      const field = { key, label: label || key, type, required };

      if (type === 'enum') {
        const optStr = editor.querySelector('.field-options')?.value || '';
        field.options = optStr.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (type === 'number') {
        const min = editor.querySelector('.field-min')?.value;
        const max = editor.querySelector('.field-max')?.value;
        if (min !== '') field.min = Number(min);
        if (max !== '') field.max = Number(max);
        if (editor.querySelector('.field-bar')?.checked) field.display = 'bar';
      }
      if (type === 'relation') {
        field.relationType = editor.querySelector('.field-relation-type')?.value || '';
      }

      fields.push(field);
    });

    if (fields.length === 0) {
      alert('Mindestens ein Feld ist erforderlich');
      return;
    }

    // Existierender Typ?
    const existing = this.registry.getType(id);

    if (existing) {
      this.registry.updateType(id, { name, icon, color, fields });
    } else {
      this.registry.registerType({ id, name, icon, color, builtIn: false, active: true, fields });
    }

    // Modal schliessen
    document.getElementById('type-modal')?.classList.add('hidden');
    this.onChanged();
  }
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
