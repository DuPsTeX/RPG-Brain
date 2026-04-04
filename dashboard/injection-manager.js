// injection-manager.js — Injection-Sektionen im Dashboard verwalten
// Sektionen erstellen, Priorität per Drag & Drop, Templates bearbeiten, aktivieren/deaktivieren

import { InjectionSectionsManager } from '../src/injection-sections.js';

export class InjectionManager {
  /**
   * @param {Function} getSettings
   * @param {Function} saveSettings
   */
  constructor(getSettings, saveSettings) {
    this.manager = new InjectionSectionsManager(getSettings, saveSettings);
    this.manager.initialize();
    this._bindEvents();
    this._dragState = null;
  }

  render() {
    const container = document.getElementById('injection-sections');
    if (!container) return;

    const sections = this.manager.getAllSections(false);

    if (sections.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div>Keine Injection-Sektionen</div></div>';
      return;
    }

    container.innerHTML = sections.map((section, index) => this._renderSection(section, index)).join('');

    // Drag & Drop initialisieren
    this._initDragDrop(container);
  }

  _renderSection(section, index) {
    const typeTags = (section.entityTypes || [])
      .map(t => `<span class="injection-type-tag">${esc(t)}</span>`)
      .join('');

    const templateHtml = section.template
      ? `<div class="injection-section-template">${esc(section.template)}</div>`
      : '';

    return `
      <div class="injection-section${section.enabled ? '' : ' text-muted'}" data-section-id="${section.id}" draggable="true">
        <div class="injection-section-header">
          <div class="injection-section-left">
            <span class="injection-section-drag" title="Ziehen zum Sortieren">⠿</span>
            <span class="injection-section-priority">${section.priority}</span>
            <span class="injection-section-name">${section.icon || ''} ${esc(section.name)}</span>
            ${section.builtIn ? '<span class="type-badge type-badge--builtin">Built-in</span>' : ''}
          </div>
          <div class="injection-section-right">
            <div class="injection-section-toggle${section.enabled ? ' active' : ''}" data-section-id="${section.id}" title="${section.enabled ? 'Deaktivieren' : 'Aktivieren'}"></div>
            ${!section.builtIn ? `
              <button class="dash-btn dash-btn--small injection-edit-btn" data-section-id="${section.id}">Bearbeiten</button>
              <button class="dash-btn dash-btn--small dash-btn--danger injection-delete-btn" data-section-id="${section.id}">Löschen</button>
            ` : ''}
          </div>
        </div>
        <div class="injection-section-details">
          <span>Entity-Typen:</span>
          <div class="injection-section-types">${typeTags || '<span class="text-muted">—</span>'}</div>
        </div>
        ${templateHtml}
      </div>
    `;
  }

  // --- Drag & Drop ---

  _initDragDrop(container) {
    const items = container.querySelectorAll('.injection-section');

    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        this._dragState = item.dataset.sectionId;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        this._dragState = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!this._dragState) return;

        const targetId = item.dataset.sectionId;
        if (this._dragState === targetId) return;

        this._reorderSections(this._dragState, targetId);
        this._dragState = null;
      });
    });
  }

  _reorderSections(draggedId, targetId) {
    const sections = this.manager.getAllSections(false);
    const draggedIdx = sections.findIndex(s => s.id === draggedId);
    const targetIdx = sections.findIndex(s => s.id === targetId);
    if (draggedIdx < 0 || targetIdx < 0) return;

    // Neue Prioritäten zuweisen basierend auf Position
    const targetPriority = sections[targetIdx].priority;
    this.manager.updatePriority(draggedId, targetPriority);

    // Alle anderen Prioritäten neu vergeben
    const allSections = this.manager.getAllSections(false);
    allSections.forEach((s, i) => {
      this.manager.updatePriority(s.id, i + 1);
    });

    this.render();
  }

  // --- Events ---

  _bindEvents() {
    document.addEventListener('click', (e) => {
      // Toggle
      const toggle = e.target.closest('.injection-section-toggle');
      if (toggle) {
        const id = toggle.dataset.sectionId;
        const isActive = toggle.classList.contains('active');
        this.manager.toggleSection(id, !isActive);
        this.render();
        return;
      }

      // Edit
      const editBtn = e.target.closest('.injection-edit-btn');
      if (editBtn) {
        this._openEditModal(editBtn.dataset.sectionId);
        return;
      }

      // Delete
      const deleteBtn = e.target.closest('.injection-delete-btn');
      if (deleteBtn) {
        if (confirm('Sektion wirklich löschen?')) {
          this.manager.deleteSection(deleteBtn.dataset.sectionId);
          this.render();
        }
        return;
      }

      // Add section
      if (e.target.id === 'injection-add-section') {
        this._openAddModal();
        return;
      }

      // Preview
      if (e.target.id === 'injection-preview') {
        this._togglePreview();
        return;
      }
    });
  }

  _openAddModal() {
    const modal = document.getElementById('entity-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    title.textContent = 'Neue Injection-Sektion';
    body.innerHTML = `
      <form id="injection-section-form">
        <div class="form-group">
          <label class="form-label">ID (eindeutig)</label>
          <input type="text" name="id" class="form-input" required pattern="[a-z0-9_]+" />
        </div>
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" name="name" class="form-input" required />
        </div>
        <div style="display:flex;gap:12px">
          <div class="form-group flex-1">
            <label class="form-label">Icon (Emoji)</label>
            <input type="text" name="icon" class="form-input" maxlength="4" value="📋" />
          </div>
          <div class="form-group flex-1">
            <label class="form-label">Priorität</label>
            <input type="number" name="priority" class="form-input" value="10" min="1" max="99" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Entity-Typen (kommagetrennt)</label>
          <input type="text" name="entityTypes" class="form-input" placeholder="z.B. charakter, quest" />
          <div class="form-hint">Welche Entity-Typen in diese Sektion einfließen</div>
        </div>
        <div class="form-group">
          <label class="form-label">Template</label>
          <textarea name="template" class="form-textarea" rows="5" placeholder="{{name}} — {{beschreibung}}&#10;Verwende {{feldname}} für Platzhalter"></textarea>
          <div class="form-hint">Platzhalter: {{name}}, {{beschreibung}}, {{status}} etc.</div>
        </div>
        <div class="form-actions">
          <button type="submit" class="dash-btn dash-btn--primary">Erstellen</button>
          <button type="button" class="dash-btn modal-close-btn">Abbrechen</button>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');

    document.getElementById('injection-section-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleAddSubmit(e.target);
    });
  }

  _openEditModal(sectionId) {
    const section = this.manager.getAllSections(false).find(s => s.id === sectionId);
    if (!section) return;

    const modal = document.getElementById('entity-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    title.textContent = `${section.icon} ${section.name} bearbeiten`;
    body.innerHTML = `
      <form id="injection-section-form" data-section-id="${section.id}">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" name="name" class="form-input" value="${esc(section.name)}" required />
        </div>
        <div style="display:flex;gap:12px">
          <div class="form-group flex-1">
            <label class="form-label">Icon</label>
            <input type="text" name="icon" class="form-input" value="${section.icon || ''}" maxlength="4" />
          </div>
          <div class="form-group flex-1">
            <label class="form-label">Priorität</label>
            <input type="number" name="priority" class="form-input" value="${section.priority}" min="1" max="99" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Entity-Typen (kommagetrennt)</label>
          <input type="text" name="entityTypes" class="form-input" value="${(section.entityTypes || []).join(', ')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Template</label>
          <textarea name="template" class="form-textarea" rows="5">${esc(section.template || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="dash-btn dash-btn--primary">Speichern</button>
          <button type="button" class="dash-btn modal-close-btn">Abbrechen</button>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');

    document.getElementById('injection-section-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleEditSubmit(e.target);
    });
  }

  _handleAddSubmit(form) {
    const id = form.querySelector('[name="id"]').value.trim();
    const name = form.querySelector('[name="name"]').value.trim();
    const icon = form.querySelector('[name="icon"]').value || '📋';
    const priority = parseInt(form.querySelector('[name="priority"]').value) || 10;
    const entityTypes = form.querySelector('[name="entityTypes"]').value
      .split(',').map(s => s.trim()).filter(Boolean);
    const template = form.querySelector('[name="template"]').value;

    if (!id || !name) return;

    this.manager.addSection({ id, name, icon, priority, entityTypes, template });

    document.getElementById('entity-modal')?.classList.add('hidden');
    this.render();
  }

  _handleEditSubmit(form) {
    const sectionId = form.dataset.sectionId;
    const sections = this.manager.getAllSections(false);
    const section = sections.find(s => s.id === sectionId);
    if (!section || section.builtIn) return;

    // Direkt im Manager aktualisieren — einfachste Methode: löschen + neu anlegen
    const name = form.querySelector('[name="name"]').value.trim();
    const icon = form.querySelector('[name="icon"]').value || '📋';
    const priority = parseInt(form.querySelector('[name="priority"]').value) || 10;
    const entityTypes = form.querySelector('[name="entityTypes"]').value
      .split(',').map(s => s.trim()).filter(Boolean);
    const template = form.querySelector('[name="template"]').value;

    this.manager.deleteSection(sectionId);
    this.manager.addSection({ id: sectionId, name, icon, priority, entityTypes, template });

    document.getElementById('entity-modal')?.classList.add('hidden');
    this.render();
  }

  _togglePreview() {
    const area = document.getElementById('injection-preview-area');
    const text = document.getElementById('injection-preview-text');

    if (area.classList.contains('hidden')) {
      // Vorschau generieren
      const sections = this.manager.getAllSections(true);
      const lines = sections.map(s => {
        return `[Prio ${s.priority}] ${s.icon} ${s.name}\n  Entity-Typen: ${(s.entityTypes || []).join(', ')}\n  ${s.template ? `Template: ${s.template.slice(0, 100)}...` : '(Built-in Formatter)'}`;
      });
      text.textContent = lines.length > 0
        ? lines.join('\n\n')
        : 'Keine aktiven Sektionen';
      area.classList.remove('hidden');
    } else {
      area.classList.add('hidden');
    }
  }
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
