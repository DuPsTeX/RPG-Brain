// dashboard.js — RPG-Brain Dashboard App-Logik + Cross-Tab Sync
// Standalone-Seite, kommuniziert über BroadcastChannel mit dem SillyTavern Panel

import { LightRAGClient } from '../src/lightrag-client.js';
import { EntityTypeRegistry } from '../src/entity-registry.js';
import { EntityManager } from '../src/entity-manager.js';
import { GraphView } from './graph-view.js';
import { EntityTypeManager } from './entity-type-manager.js';
import { InjectionManager } from './injection-manager.js';

// --- Globals ---

const lightrag = new LightRAGClient();
let registry = null;
let entityManager = null;
let graphView = null;
let typeManager = null;
let injectionManager = null;

/** BroadcastChannel für Cross-Tab Sync */
let channel = null;

/** Settings aus localStorage (Dashboard hat kein SillyTavern context) */
const STORAGE_KEY = 'rpg-brain-dashboard';

function getStoredSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch { return {}; }
}

function saveStoredSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// --- Settings-Stubs für Registry (Dashboard-Standalone) ---

let _dashboardSettings = {};

function getSettings() {
  return _dashboardSettings;
}

function saveSettings() {
  saveStoredSettings(_dashboardSettings);
  broadcastSync('settings-updated', _dashboardSettings);
}

// --- BroadcastChannel ---

function initBroadcastChannel() {
  try {
    channel = new BroadcastChannel('rpg-brain-sync');
    channel.onmessage = (event) => {
      const { type, payload } = event.data || {};
      console.log('[Dashboard] Sync empfangen:', type);

      switch (type) {
        case 'entity-created':
        case 'entity-updated':
        case 'entity-deleted':
          // Entity-Änderung vom Panel — Entities neu laden
          requestEntitiesFromPanel();
          break;

        case 'entities-sync':
          // Vollständiger Entity-Satz vom Panel
          if (payload?.entities) {
            entityManager.importEntities(payload.entities);
            refreshCurrentTab();
          }
          break;

        case 'settings-sync':
          // Settings vom Panel
          if (payload) {
            _dashboardSettings = payload;
            lightrag.setBaseUrl(payload.lightragUrl || 'http://localhost:9621');
            registry.initialize();
            refreshCurrentTab();
          }
          break;

        case 'types-updated':
          registry.initialize();
          refreshCurrentTab();
          break;
      }
    };

    // Initial: Settings + Entities vom Panel anfordern
    broadcastSync('request-settings');
    broadcastSync('request-entities');
  } catch (err) {
    console.warn('[Dashboard] BroadcastChannel nicht verfügbar:', err);
  }
}

function broadcastSync(type, payload = null) {
  try {
    channel?.postMessage({ type, payload });
  } catch { /* ignore */ }
}

function requestEntitiesFromPanel() {
  broadcastSync('request-entities');
}

// --- Tab Navigation ---

function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(`tab-${tabId}`)?.classList.add('active');

      refreshTab(tabId);
    });
  });
}

function getActiveTab() {
  return document.querySelector('.nav-tab.active')?.dataset.tab || 'graph';
}

function refreshCurrentTab() {
  refreshTab(getActiveTab());
}

function refreshTab(tabId) {
  switch (tabId) {
    case 'graph':
      graphView?.refresh();
      break;
    case 'entities':
      renderEntitiesList();
      break;
    case 'types':
      typeManager?.render();
      break;
    case 'injection':
      injectionManager?.render();
      break;
  }
  updateHeaderStats();
}

// --- Connection Status ---

async function checkConnection() {
  const dot = document.getElementById('dashboard-status-dot');
  const text = document.getElementById('dashboard-status-text');

  dot.className = 'status-dot status-dot--checking';
  text.textContent = 'Verbinde...';

  const result = await lightrag.healthCheck();

  dot.className = result.connected
    ? 'status-dot status-dot--connected'
    : 'status-dot status-dot--disconnected';
  text.textContent = result.connected ? 'Verbunden' : 'Nicht verbunden';

  return result.connected;
}

async function updateHeaderStats() {
  document.getElementById('dashboard-entity-count').textContent =
    entityManager?.getEntityCount() || 0;

  try {
    const stats = await lightrag.getGraphStats();
    document.getElementById('dashboard-node-count').textContent = stats.nodeCount || 0;
  } catch { /* ignore */ }
}

// --- Entities Tab ---

function renderEntitiesList() {
  const container = document.getElementById('entities-list');
  const filterType = document.getElementById('entities-filter-type').value;
  const searchQuery = document.getElementById('entities-search').value.toLowerCase();

  let entities = entityManager.getAllEntities();

  // Filter
  if (filterType) {
    entities = entities.filter(e => e.typeId === filterType);
  }
  if (searchQuery) {
    entities = entities.filter(e => {
      const name = (e.data?.name || '').toLowerCase();
      return name.includes(searchQuery) || JSON.stringify(e.data).toLowerCase().includes(searchQuery);
    });
  }

  if (entities.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div>Keine Entities gefunden</div>
      </div>
    `;
    return;
  }

  container.innerHTML = entities.map(entity => {
    const type = registry.getType(entity.typeId);
    const icon = type?.icon || '📄';
    const color = type?.color || '#4ecca3';
    const typeName = type?.name || entity.typeId;

    // Zeige die ersten 4 nicht-leeren Felder
    const fieldLines = [];
    if (type) {
      for (const field of type.fields) {
        if (field.key === 'name' || field.type === 'image') continue;
        const val = entity.data[field.key];
        if (val === undefined || val === null || val === '') continue;
        if (fieldLines.length >= 4) break;

        if (field.display === 'bar') {
          fieldLines.push(`
            <div class="entity-bar">
              <span class="entity-bar-label">${esc(field.label)}</span>
              <div class="entity-bar-track">
                <div class="entity-bar-fill" style="width:${Number(val)}%;background:${color}"></div>
              </div>
              <span class="entity-bar-value">${val}%</span>
            </div>
          `);
        } else {
          const display = String(val).length > 60 ? String(val).slice(0, 60) + '...' : String(val);
          fieldLines.push(`
            <div class="entity-card-field">
              <span class="entity-card-field-label">${esc(field.label)}:</span>
              <span class="entity-card-field-value">${esc(display)}</span>
            </div>
          `);
        }
      }
    }

    return `
      <div class="entity-card" data-entity-id="${entity.id}" style="border-left-color:${color}">
        <div class="entity-card-header">
          <div class="entity-card-title">
            <span class="entity-card-icon">${icon}</span>
            <span class="entity-card-name">${esc(entity.data?.name || '(ohne Name)')}</span>
          </div>
          <div class="entity-card-actions">
            <span class="entity-card-type">${esc(typeName)}</span>
            <button class="entity-card-btn entity-edit-btn" data-entity-id="${entity.id}" title="Bearbeiten">✏️</button>
            <button class="entity-card-btn entity-delete-btn" data-entity-id="${entity.id}" title="Löschen">🗑️</button>
          </div>
        </div>
        ${fieldLines.length ? `<div class="entity-card-fields">${fieldLines.join('')}</div>` : ''}
      </div>
    `;
  }).join('');
}

function populateTypeFilters() {
  const types = registry.getAllTypes(true);
  const options = types.map(t => `<option value="${t.id}">${t.icon} ${t.name}</option>`).join('');

  document.getElementById('entities-filter-type').innerHTML =
    `<option value="">Alle Typen</option>${options}`;
  document.getElementById('graph-filter-type').innerHTML =
    `<option value="">Alle Typen</option>${options}`;
}

// --- Entity Modal ---

function openEntityModal(entityId = null, typeId = null) {
  const modal = document.getElementById('entity-modal');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');

  let entity = null;
  let type = null;

  if (entityId) {
    entity = entityManager.getEntity(entityId);
    if (!entity) return;
    type = registry.getType(entity.typeId);
    title.textContent = `${type?.icon || ''} ${entity.data?.name || 'Entity'} bearbeiten`;
  } else {
    // Create
    if (!typeId) {
      // Type auswählen
      const types = registry.getAllTypes(true);
      title.textContent = 'Neue Entity erstellen';
      body.innerHTML = `
        <div class="form-group">
          <label class="form-label">Entity-Typ</label>
          <select id="new-entity-type-select" class="form-select">
            ${types.map(t => `<option value="${t.id}">${t.icon} ${t.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-actions">
          <button class="dash-btn dash-btn--primary" id="modal-select-type">Weiter</button>
          <button class="dash-btn modal-close-btn">Abbrechen</button>
        </div>
      `;
      modal.classList.remove('hidden');

      document.getElementById('modal-select-type')?.addEventListener('click', () => {
        const selectedType = document.getElementById('new-entity-type-select').value;
        openEntityModal(null, selectedType);
      });
      return;
    }

    type = registry.getType(typeId);
    if (!type) return;
    title.textContent = `${type.icon} Neue ${type.name} erstellen`;
  }

  // Form rendern
  const data = entity?.data || {};
  const fields = type.fields
    .filter(f => f.type !== 'image')
    .map(f => renderFormField(f, data))
    .join('');

  body.innerHTML = `
    <form id="dashboard-entity-form" data-type-id="${type.id}" data-entity-id="${entityId || ''}">
      ${fields}
      <div class="form-actions">
        <button type="submit" class="dash-btn dash-btn--primary">${entityId ? 'Speichern' : 'Erstellen'}</button>
        <button type="button" class="dash-btn modal-close-btn">Abbrechen</button>
      </div>
    </form>
  `;

  modal.classList.remove('hidden');

  document.getElementById('dashboard-entity-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleEntityFormSubmit(e.target);
  });
}

function renderFormField(field, data) {
  const value = data[field.key] !== undefined ? data[field.key] : '';
  const required = field.required ? 'required' : '';
  const label = esc(field.label || field.key);

  let input;
  switch (field.type) {
    case 'string':
      input = `<input type="text" name="${field.key}" value="${esc(String(value))}" class="form-input" ${required} />`;
      break;
    case 'text':
      input = `<textarea name="${field.key}" class="form-textarea" ${required}>${esc(String(value))}</textarea>`;
      break;
    case 'number':
      input = `<input type="number" name="${field.key}" value="${value}" class="form-input" ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${required} />`;
      break;
    case 'enum':
      const opts = (field.options || []).map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('');
      input = `<select name="${field.key}" class="form-select" ${required}><option value="">-- Wählen --</option>${opts}</select>`;
      break;
    case 'boolean':
      input = `<label><input type="checkbox" name="${field.key}" ${value ? 'checked' : ''} /> ${label}</label>`;
      return `<div class="form-group">${input}</div>`;
    case 'relation':
      input = `<input type="text" name="${field.key}" value="${esc(String(value))}" class="form-input" placeholder="${field.relationType || 'Entity'}" />`;
      break;
    case 'date':
      input = `<input type="text" name="${field.key}" value="${esc(String(value))}" class="form-input" placeholder="Zeitpunkt" />`;
      break;
    default:
      input = `<input type="text" name="${field.key}" value="${esc(String(value))}" class="form-input" />`;
  }

  return `
    <div class="form-group">
      <label class="form-label">${label}${field.required ? ' *' : ''}</label>
      ${input}
    </div>
  `;
}

async function handleEntityFormSubmit(form) {
  const typeId = form.dataset.typeId;
  const entityId = form.dataset.entityId || null;
  const formData = new FormData(form);
  const data = {};

  const type = registry.getType(typeId);
  if (!type) return;

  for (const field of type.fields) {
    if (field.type === 'image') continue;
    if (field.type === 'boolean') {
      data[field.key] = formData.has(field.key);
    } else if (field.type === 'number') {
      const v = formData.get(field.key);
      data[field.key] = v !== '' && v !== null ? Number(v) : undefined;
    } else {
      data[field.key] = formData.get(field.key) || '';
    }
  }

  try {
    if (entityId) {
      await entityManager.updateEntity(entityId, data);
      broadcastSync('entity-updated', { entityId, data });
    } else {
      const newId = await entityManager.createEntity(typeId, data);
      broadcastSync('entity-created', { entityId: newId, typeId, data });
    }
  } catch (err) {
    console.error('[Dashboard] Entity-Fehler:', err);
    alert('Fehler: ' + err.message);
    return;
  }

  closeModals();
  refreshCurrentTab();
}

async function deleteEntity(entityId) {
  if (!confirm('Entity wirklich löschen?')) return;

  try {
    await entityManager.deleteEntity(entityId);
    broadcastSync('entity-deleted', { entityId });
    refreshCurrentTab();
  } catch (err) {
    console.error('[Dashboard] Lösch-Fehler:', err);
  }
}

function closeModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

// --- Event Binding ---

function bindEvents() {
  // Tab filter changes
  document.getElementById('entities-filter-type')?.addEventListener('change', renderEntitiesList);
  document.getElementById('entities-search')?.addEventListener('input', renderEntitiesList);

  // Add entity
  document.getElementById('entities-add')?.addEventListener('click', () => openEntityModal());

  // Entity list: edit + delete via delegation
  document.getElementById('entities-list')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.entity-edit-btn');
    const deleteBtn = e.target.closest('.entity-delete-btn');
    const card = e.target.closest('.entity-card');

    if (editBtn) {
      openEntityModal(editBtn.dataset.entityId);
    } else if (deleteBtn) {
      deleteEntity(deleteBtn.dataset.entityId);
    } else if (card) {
      openEntityModal(card.dataset.entityId);
    }
  });

  // Modal close
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop') ||
        e.target.classList.contains('modal-close') ||
        e.target.classList.contains('modal-close-btn')) {
      closeModals();
    }
  });

  // Graph toolbar
  document.getElementById('graph-refresh')?.addEventListener('click', () => graphView?.refresh());
  document.getElementById('graph-fit')?.addEventListener('click', () => graphView?.fit());
  document.getElementById('graph-filter-type')?.addEventListener('change', () => graphView?.refresh());
  document.getElementById('graph-search')?.addEventListener('input', (e) => graphView?.search(e.target.value));

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModals();
  });
}

// --- Utilities ---

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Initialization ---

async function init() {
  console.log('[Dashboard] Initialisiere...');

  // Settings laden (aus localStorage oder defaults)
  const stored = getStoredSettings();
  _dashboardSettings = {
    lightragUrl: stored.lightragUrl || 'http://localhost:9621',
    typeRegistry: stored.typeRegistry || {},
    injectionSections: stored.injectionSections || null,
    ...stored,
  };

  lightrag.setBaseUrl(_dashboardSettings.lightragUrl);

  // Registry + EntityManager (ohne SillyTavern-Context)
  registry = new EntityTypeRegistry(getSettings, saveSettings);
  registry.initialize();

  // EntityManager: im Dashboard-Modus ohne SillyTavern
  entityManager = new EntityManager(registry, lightrag);
  entityManager._getContext = () => null; // Kein ST-Context
  entityManager._entities = new Map(); // Leerer Start, wird via Sync gefüllt

  // Module initialisieren
  graphView = new GraphView(lightrag, registry, entityManager);
  typeManager = new EntityTypeManager(registry, () => {
    saveSettings();
    populateTypeFilters();
    broadcastSync('types-updated');
    refreshCurrentTab();
  });
  injectionManager = new InjectionManager(getSettings, saveSettings);

  // UI initialisieren
  initTabs();
  bindEvents();
  populateTypeFilters();

  // Cross-Tab Sync
  initBroadcastChannel();

  // Connection check
  await checkConnection();
  updateHeaderStats();

  // Periodischer Health-Check
  setInterval(checkConnection, 60000);

  console.log('[Dashboard] Bereit');
}

// Start
document.addEventListener('DOMContentLoaded', init);
