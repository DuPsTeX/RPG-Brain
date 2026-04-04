// tabs.js — 5 Tab-Ansichten für das RPG-Brain Seitenpanel

import { renderCharacterCard } from './components/character-card.js';
import { renderQuestCard } from './components/quest-card.js';
import { renderEntityCard } from './components/entity-card.js';
import { renderEntityForm } from './components/entity-form.js';

export class Tabs {
  constructor(entityManager, registry, promptInjector) {
    this.entityManager = entityManager;
    this.registry = registry;
    this.promptInjector = promptInjector;
  }

  /**
   * Tab rendern.
   * @param {string} tabId - 'szene' | 'chars' | 'quests' | 'welt' | 'alle'
   * @param {string} containerSelector
   */
  renderTab(tabId, containerSelector) {
    const container = $(containerSelector);
    container.empty();

    switch (tabId) {
      case 'szene': this._renderSzene(container); break;
      case 'chars': this._renderChars(container); break;
      case 'quests': this._renderQuests(container); break;
      case 'welt': this._renderWelt(container); break;
      case 'alle': this._renderAlle(container); break;
    }
  }

  // --- Szene Tab ---

  _renderSzene(container) {
    // Ort
    const orte = this.entityManager.getEntitiesByType('ort');
    if (orte.length > 0) {
      container.append(this._sectionHeader('📍', 'Aktueller Ort'));
      container.append(renderEntityCard(orte[orte.length - 1], this.registry.getType('ort')));
    }

    // Aktive Charaktere (die letzten/relevantesten)
    const chars = this.entityManager.getEntitiesByType('charakter');
    if (chars.length > 0) {
      container.append(this._sectionHeader('🧙', 'Charaktere in Szene'));
      const recentChars = chars.slice(-5); // Letzte 5
      for (const char of recentChars) {
        container.append(renderCharacterCard(char));
      }
    }

    // Aktive Quests
    const quests = this.entityManager.getEntitiesByType('quest')
      .filter(q => q.data.status === 'aktiv');
    if (quests.length > 0) {
      container.append(this._sectionHeader('📜', 'Aktive Quests'));
      for (const quest of quests) {
        container.append(renderQuestCard(quest));
      }
    }

    // Beziehungen
    const beziehungen = this.entityManager.getEntitiesByType('beziehung');
    if (beziehungen.length > 0) {
      container.append(this._sectionHeader('🕸️', 'Beziehungen'));
      for (const bez of beziehungen.slice(-6)) {
        container.append(renderEntityCard(bez, this.registry.getType('beziehung')));
      }
    }

    if (container.children().length === 0) {
      container.append('<div class="rpg-brain-empty">Noch keine Daten. Starte einen Chat und die Extraktion füllt das Panel automatisch.</div>');
    }
  }

  // --- Chars Tab ---

  _renderChars(container) {
    const chars = this.entityManager.getEntitiesByType('charakter');
    if (chars.length === 0) {
      container.append('<div class="rpg-brain-empty">Keine Charaktere gefunden.</div>');
      return;
    }
    for (const char of chars) {
      container.append(renderCharacterCard(char));
    }
  }

  // --- Quests Tab ---

  _renderQuests(container) {
    const quests = this.entityManager.getEntitiesByType('quest');
    if (quests.length === 0) {
      container.append('<div class="rpg-brain-empty">Keine Quests gefunden.</div>');
      return;
    }

    // Aktive zuerst
    const aktive = quests.filter(q => q.data.status === 'aktiv');
    const andere = quests.filter(q => q.data.status !== 'aktiv');

    if (aktive.length > 0) {
      container.append(this._sectionHeader('📜', 'Aktiv'));
      for (const quest of aktive) {
        container.append(renderQuestCard(quest));
      }
    }
    if (andere.length > 0) {
      container.append(this._sectionHeader('📋', 'Abgeschlossen / Fehlgeschlagen'));
      for (const quest of andere) {
        container.append(renderQuestCard(quest));
      }
    }
  }

  // --- Welt Tab ---

  _renderWelt(container) {
    const weltTypes = ['ort', 'fraktion', 'geschaeft', 'dungeon'];

    for (const typeId of weltTypes) {
      const entities = this.entityManager.getEntitiesByType(typeId);
      if (entities.length === 0) continue;

      const type = this.registry.getType(typeId);
      container.append(this._sectionHeader(type.icon, type.name));

      for (const entity of entities) {
        container.append(renderEntityCard(entity, type));
      }
    }

    if (container.children().length === 0) {
      container.append('<div class="rpg-brain-empty">Keine Welt-Daten gefunden.</div>');
    }
  }

  // --- Alle Tab ---

  _renderAlle(container) {
    const types = this.registry.getAllTypes(true);
    let hasContent = false;

    for (const type of types) {
      const entities = this.entityManager.getEntitiesByType(type.id);
      if (entities.length === 0) continue;

      hasContent = true;
      container.append(this._sectionHeader(type.icon, `${type.name} (${entities.length})`));

      for (const entity of entities) {
        if (type.id === 'charakter') {
          container.append(renderCharacterCard(entity));
        } else if (type.id === 'quest') {
          container.append(renderQuestCard(entity));
        } else {
          container.append(renderEntityCard(entity, type));
        }
      }
    }

    if (!hasContent) {
      container.append('<div class="rpg-brain-empty">Noch keine Entities. Starte einen Chat!</div>');
    }
  }

  // --- Entity Forms ---

  showAddEntityForm(containerSelector) {
    const container = $(containerSelector);
    container.empty();

    // Typ-Auswahl
    const types = this.registry.getAllTypes(true);
    const typeOptions = types.map(t => `<option value="${t.id}">${t.icon} ${t.name}</option>`).join('');

    container.append(`
      <div class="rpg-brain-form-wrapper">
        <h4>Neue Entity erstellen</h4>
        <label>Typ:</label>
        <select id="rpg-brain-new-type" class="rpg-brain-select">${typeOptions}</select>
        <div id="rpg-brain-form-fields"></div>
      </div>
    `);

    // Initial Felder für ersten Typ rendern
    const firstType = types[0];
    if (firstType) {
      this._renderFormFields(firstType, {}, '#rpg-brain-form-fields');
    }

    // Typ-Wechsel
    $(document).off('change.rpgform').on('change.rpgform', '#rpg-brain-new-type', (e) => {
      const typeId = $(e.target).val();
      const type = this.registry.getType(typeId);
      if (type) {
        this._renderFormFields(type, {}, '#rpg-brain-form-fields');
      }
    });
  }

  showEditEntityForm(entityId, containerSelector) {
    const entity = this.entityManager.getEntity(entityId);
    if (!entity) return;

    const type = this.registry.getType(entity.typeId);
    if (!type) return;

    const container = $(containerSelector);
    container.empty();

    container.append(`
      <div class="rpg-brain-form-wrapper">
        <h4>${type.icon} ${entity.data.name || 'Bearbeiten'}</h4>
        <div id="rpg-brain-form-fields"></div>
      </div>
    `);

    this._renderFormFields(type, entity.data, '#rpg-brain-form-fields', entityId);
  }

  _renderFormFields(type, data, containerSelector, entityId = null) {
    const container = $(containerSelector);
    container.empty();
    container.append(renderEntityForm(type, data, entityId));
  }

  async handleFormSubmit(formEl) {
    const form = $(formEl);
    const typeId = form.data('type-id');
    const entityId = form.data('entity-id') || null;

    const type = this.registry.getType(typeId);
    if (!type) return;

    // Daten aus Form lesen
    const data = {};
    for (const field of type.fields) {
      if (field.type === 'boolean') {
        data[field.key] = form.find(`[name="${field.key}"]`).is(':checked');
        continue;
      }
      const value = form.find(`[name="${field.key}"]`).val();
      if (value !== undefined && value !== '') {
        data[field.key] = field.type === 'number' ? Number(value) : value;
      }
    }

    try {
      if (entityId) {
        await this.entityManager.updateEntity(entityId, data);
      } else {
        await this.entityManager.createEntity(typeId, data);
      }
    } catch (err) {
      console.error('[RPG-Brain] Formular-Fehler:', err.message);
      alert(err.message);
    }
  }

  // --- Helpers ---

  _sectionHeader(icon, title) {
    return `<div class="rpg-brain-section-header">${icon} ${title}</div>`;
  }
}
