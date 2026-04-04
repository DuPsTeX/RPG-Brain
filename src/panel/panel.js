// panel.js — RPG-Brain Seitenpanel (rechts neben dem Chat)

import { Tabs } from './tabs.js';
import { imageManager } from '../image-manager.js';

export class RPGBrainPanel {
  /**
   * @param {EntityManager} entityManager
   * @param {EntityTypeRegistry} registry
   * @param {PromptInjector} promptInjector
   * @param {LightRAGClient} lightrag
   */
  constructor(entityManager, registry, promptInjector, lightrag) {
    this.entityManager = entityManager;
    this.registry = registry;
    this.promptInjector = promptInjector;
    this.lightrag = lightrag;
    this.tabs = null;
    this._isOpen = false;
    this._onEntityChange = null;
  }

  /**
   * Panel erstellen und in den DOM einfügen.
   */
  init() {
    // Toggle-Button in SillyTavern Top-Bar
    const toggleBtn = $(`
      <div id="rpg-brain-toggle" class="fa-solid fa-brain interactable" title="RPG-Brain Panel" tabindex="0"></div>
    `);
    $('#leftSendForm .leftSendFormItems, #top-settings-holder').first().append(toggleBtn);

    // Panel HTML
    const panelHtml = `
      <div id="rpg-brain-panel" class="rpg-brain-panel">
        <div class="rpg-brain-panel-header">
          <div class="rpg-brain-panel-header-title">
            <span>🧠</span>
            <span>RPG-Brain</span>
          </div>
          <div class="rpg-brain-panel-header-actions">
            <span id="rpg-brain-panel-export" class="rpg-brain-panel-btn" title="Entities exportieren">💾</span>
            <span id="rpg-brain-panel-import" class="rpg-brain-panel-btn" title="Entities importieren">📂</span>
            <span id="rpg-brain-panel-dashboard" class="rpg-brain-panel-btn" title="Dashboard öffnen">📊</span>
            <span id="rpg-brain-panel-add" class="rpg-brain-panel-btn" title="Entity hinzufügen">➕</span>
            <span id="rpg-brain-panel-close" class="rpg-brain-panel-btn" title="Panel schließen">✕</span>
          </div>
        </div>
        <div class="rpg-brain-panel-tabs">
          <div class="rpg-brain-panel-tab active" data-tab="szene">Szene</div>
          <div class="rpg-brain-panel-tab" data-tab="chars">Chars</div>
          <div class="rpg-brain-panel-tab" data-tab="quests">Quests</div>
          <div class="rpg-brain-panel-tab" data-tab="welt">Welt</div>
          <div class="rpg-brain-panel-tab" data-tab="alle">Alle</div>
        </div>
        <div id="rpg-brain-panel-content" class="rpg-brain-panel-content">
          <!-- Tab content rendered here -->
        </div>
        <div class="rpg-brain-panel-footer">
          <span>🧠 <span id="rpg-brain-panel-tokens">0</span> Tok</span>
          <span>📊 <span id="rpg-brain-panel-entities">0</span> Entities</span>
          <span id="rpg-brain-panel-status" class="rpg-brain-panel-status">
            <span class="rpg-brain-dot rpg-brain-dot--disconnected"></span>
          </span>
        </div>
      </div>
    `;
    $('body').append(panelHtml);

    // Tabs initialisieren
    this.tabs = new Tabs(this.entityManager, this.registry, this.promptInjector);

    // Events binden
    this._bindEvents();

    // Initial rendern
    this.refresh();
  }

  _bindEvents() {
    // Toggle
    $(document).on('click', '#rpg-brain-toggle', () => this.toggle());
    $(document).on('click', '#rpg-brain-panel-close', () => this.close());

    // Tab-Wechsel
    $(document).on('click', '.rpg-brain-panel-tab', (e) => {
      const tab = $(e.currentTarget).data('tab');
      $('.rpg-brain-panel-tab').removeClass('active');
      $(e.currentTarget).addClass('active');
      this.tabs.renderTab(tab, '#rpg-brain-panel-content');
    });

    // Dashboard öffnen
    $(document).on('click', '#rpg-brain-panel-dashboard', () => {
      const port = window.location.port || '8000';
      const url = `${window.location.protocol}//${window.location.hostname}:${port}/scripts/extensions/third-party/rpg-brain/dashboard/index.html`;
      window.open(url, '_blank');
    });

    // Entity hinzufügen
    $(document).on('click', '#rpg-brain-panel-add', () => {
      this.tabs.showAddEntityForm('#rpg-brain-panel-content');
    });

    // Entity bearbeiten (delegiert)
    $(document).on('click', '.rpg-brain-entity-edit', (e) => {
      const entityId = $(e.currentTarget).data('entity-id');
      this.tabs.showEditEntityForm(entityId, '#rpg-brain-panel-content');
    });

    // Entity löschen (delegiert)
    $(document).on('click', '.rpg-brain-entity-delete', async (e) => {
      const entityId = $(e.currentTarget).data('entity-id');
      const entity = this.entityManager.getEntity(entityId);
      if (entity && confirm(`"${entity.data.name || entityId}" löschen?`)) {
        await this.entityManager.deleteEntity(entityId);
        this.refresh();
      }
    });

    // Formular absenden (delegiert)
    $(document).on('submit', '#rpg-brain-entity-form', async (e) => {
      e.preventDefault();
      await this.tabs.handleFormSubmit(e.target);
      this.refresh();
    });

    // Formular abbrechen
    $(document).on('click', '#rpg-brain-form-cancel', () => {
      const activeTab = $('.rpg-brain-panel-tab.active').data('tab') || 'szene';
      this.tabs.renderTab(activeTab, '#rpg-brain-panel-content');
    });

    // Export
    $(document).on('click', '#rpg-brain-panel-export', () => this._exportEntities());

    // Import
    $(document).on('click', '#rpg-brain-panel-import', () => this._importEntities());

    // Portrait Upload (delegiert)
    $(document).on('click', '.rpg-brain-portrait-upload', async (e) => {
      const field = $(e.currentTarget).closest('.rpg-brain-portrait-field');
      const dataUrl = await imageManager.pickAndResize();
      if (dataUrl) {
        field.find('input[type="hidden"]').val(dataUrl);
        field.find('.rpg-brain-portrait-preview').replaceWith(
          `<img src="${dataUrl}" class="rpg-brain-portrait-preview" alt="Portrait" />`
        );
        // Remove-Button einblenden
        if (!field.find('.rpg-brain-portrait-remove').length) {
          field.find('.rpg-brain-portrait-actions').append(
            '<button type="button" class="rpg-brain-portrait-remove menu_button">🗑️ Entfernen</button>'
          );
        }
      }
    });

    // Portrait Remove (delegiert)
    $(document).on('click', '.rpg-brain-portrait-remove', (e) => {
      const field = $(e.currentTarget).closest('.rpg-brain-portrait-field');
      field.find('input[type="hidden"]').val('');
      field.find('.rpg-brain-portrait-preview').replaceWith(
        '<div class="rpg-brain-portrait-preview rpg-brain-portrait-placeholder">📷</div>'
      );
      $(e.currentTarget).remove();
    });
  }

  toggle() {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    $('#rpg-brain-panel').addClass('active');
    this._isOpen = true;
    this.refresh();
  }

  close() {
    $('#rpg-brain-panel').removeClass('active');
    this._isOpen = false;
  }

  /**
   * Panel-Inhalt aktualisieren.
   */
  refresh() {
    if (!this._isOpen) return;

    // Aktiven Tab rendern
    const activeTab = $('.rpg-brain-panel-tab.active').data('tab') || 'szene';
    this.tabs.renderTab(activeTab, '#rpg-brain-panel-content');

    // Footer aktualisieren
    const injectionInfo = this.promptInjector.getLastInjectionInfo();
    $('#rpg-brain-panel-tokens').text(injectionInfo.tokens);
    $('#rpg-brain-panel-entities').text(this.entityManager.getEntityCount());

    // Verbindungsstatus
    const statusDot = $('#rpg-brain-panel-status .rpg-brain-dot');
    statusDot.removeClass('rpg-brain-dot--connected rpg-brain-dot--disconnected');
    statusDot.addClass(this.lightrag.connected ? 'rpg-brain-dot--connected' : 'rpg-brain-dot--disconnected');
  }

  // --- Import / Export ---

  _exportEntities() {
    const data = this.entityManager.exportEntities();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `rpg-brain-entities-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  _importEntities() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data || typeof data !== 'object') {
          throw new Error('Ungültiges Format');
        }

        const count = Object.keys(data).length;
        if (!confirm(`${count} Entities importieren? Bestehende Entities werden beibehalten.`)) return;

        // Entities mergen (nicht ersetzen)
        for (const [id, entry] of Object.entries(data)) {
          if (!this.entityManager.getEntity(id)) {
            this.entityManager._entities.set(id, entry);
          }
        }
        this.entityManager._persist();
        this.refresh();

        console.log(`[RPG-Brain] ${count} Entities importiert`);
      } catch (err) {
        console.error('[RPG-Brain] Import-Fehler:', err);
        alert('Import-Fehler: ' + err.message);
      }
    };

    input.click();
  }
}
