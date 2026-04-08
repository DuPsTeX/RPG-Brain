// index.js — RPG-Brain SillyTavern Extension Entry Point
// Wires into ST events and manages LightRAG connection

import { LightRAGClient } from './src/lightrag-client.js';
import { EntityTypeRegistry } from './src/entity-registry.js';
import { EntityManager } from './src/entity-manager.js';
import { ExtractionTrigger } from './src/extraction-trigger.js';
import { PromptInjector } from './src/prompt-injector.js';
import { SceneTracker } from './src/scene-tracker.js';
import { PartyManager } from './src/party-manager.js';
import { getActiveTemplate, getTemplateFields, PRESET_TEMPLATES } from './src/stat-templates.js';
import { getDefaultExtractionPromptTemplate } from './src/extraction-prompts.js';
import { RPGBrainPanel } from './src/panel/panel.js';
import { initI18n, setLocale } from './src/i18n/i18n-loader.js';

const MODULE_NAME = 'rpg-brain';
const lightrag = new LightRAGClient();
const registry = new EntityTypeRegistry(() => getSettings(), () => saveSettings());
const entityManager = new EntityManager(registry, lightrag);
const extractionTrigger = new ExtractionTrigger(registry, entityManager, lightrag, () => getSettings());
const partyManager = new PartyManager();
const sceneTracker = new SceneTracker(entityManager, () => getSettings(), partyManager);
const promptInjector = new PromptInjector(entityManager, lightrag, () => getSettings(), () => saveSettings(), sceneTracker);
const panel = new RPGBrainPanel(entityManager, registry, promptInjector, lightrag, sceneTracker, partyManager, () => getSettings());

// Globaler Zugriff für Console-Tests und andere Module
window.rpgBrain = { lightrag, registry, entityManager, extractionTrigger, promptInjector, sceneTracker, partyManager, panel };

let currentChatId = null;
let isInitialized = false;
let healthCheckInterval = null;
let broadcastChannel = null;

// --- Default Settings ---

const DEFAULT_SETTINGS = {
  lightragUrl: 'http://localhost:9621',
  extractionLlm: {
    apiUrl: '',
    apiKey: '',
    model: '',
  },
  triggerMode: 'every_5',
  tokenBudget: 2000,
  language: 'de',
  statsEnabled: true,
  statTemplate: 'dnd',
  statTemplateCustom: null,
  customSceneInstruction: null,
  customExtractionPrompt: null,
};

// --- Settings Persistence ---

function getSettings() {
  const context = SillyTavern.getContext();
  if (!context.extensionSettings[MODULE_NAME]) {
    context.extensionSettings[MODULE_NAME] = { ...DEFAULT_SETTINGS };
  }
  return context.extensionSettings[MODULE_NAME];
}

function saveSettings() {
  const context = SillyTavern.getContext();
  context.saveSettingsDebounced();
}

function applySettingsToUI() {
  const settings = getSettings();

  $('#rpg-brain-lightrag-url').val(settings.lightragUrl);
  $('#rpg-brain-extraction-url').val(settings.extractionLlm?.apiUrl || '');
  $('#rpg-brain-extraction-key').val(settings.extractionLlm?.apiKey || '');
  $('#rpg-brain-extraction-model').val(settings.extractionLlm?.model || '');
  $('#rpg-brain-trigger-mode').val(settings.triggerMode);
  $('#rpg-brain-token-budget').val(settings.tokenBudget);
  $('#rpg-brain-budget-display').text(settings.tokenBudget);
  $('#rpg-brain-language').val(settings.language);
  $('#rpg-brain-stats-enabled').prop('checked', settings.statsEnabled !== false);
  $('#rpg-brain-stat-template').val(settings.statTemplate || 'dnd');
  updateTemplateInfo();

  // Custom Prompts in Textareas laden (oder Default anzeigen)
  const sceneTpl = settings.customSceneInstruction || getDefaultSceneTemplate(settings);
  $('#rpg-brain-custom-scene-prompt').val(sceneTpl);
  const extractionTpl = settings.customExtractionPrompt || getDefaultExtractionPromptTemplate(settings.language || 'de');
  $('#rpg-brain-custom-extraction-prompt').val(extractionTpl);
}

/**
 * Default Scene-Instruction Template für die UI-Anzeige.
 */
function getDefaultSceneTemplate(settings) {
  const template = getActiveTemplate(settings);
  const fields = template.fields || [];
  const withStats = settings.statsEnabled !== false && fields.length > 0;
  return PromptInjector.getDefaultSceneInstructionTemplate(settings.language || 'de', withStats);
}

function readSettingsFromUI() {
  const settings = getSettings();

  settings.lightragUrl = $('#rpg-brain-lightrag-url').val() || DEFAULT_SETTINGS.lightragUrl;
  settings.extractionLlm = {
    apiUrl: $('#rpg-brain-extraction-url').val() || '',
    apiKey: $('#rpg-brain-extraction-key').val() || '',
    model: $('#rpg-brain-extraction-model').val() || '',
  };
  settings.triggerMode = $('#rpg-brain-trigger-mode').val();
  settings.tokenBudget = parseInt($('#rpg-brain-token-budget').val()) || 2000;
  settings.language = $('#rpg-brain-language').val();
  settings.statsEnabled = $('#rpg-brain-stats-enabled').is(':checked');
  settings.statTemplate = $('#rpg-brain-stat-template').val() || 'dnd';

  lightrag.setBaseUrl(settings.lightragUrl);
  syncTemplateFields();
  saveSettings();
}

/**
 * Zeigt Info über das aktive Template an.
 */
function updateTemplateInfo() {
  const settings = getSettings();
  const template = getActiveTemplate(settings);
  const fields = template.fields || [];
  if (fields.length > 0) {
    const fieldNames = fields.map(f => f.label).join(', ');
    $('#rpg-brain-template-info').text(`Felder: ${fieldNames}`);
  } else {
    $('#rpg-brain-template-info').text('Keine Felder definiert (Custom Template)');
  }
}

/**
 * Synchronisiert Template-Felder zum Panel.
 */
function syncTemplateFields() {
  const settings = getSettings();
  const fields = getTemplateFields(settings);
  if (panel?.tabs) {
    panel.tabs.setTemplateFields(fields);
  }
}

// --- Connection Management ---

async function testConnection() {
  const dot = $('#rpg-brain-status-dot');
  const text = $('#rpg-brain-status-text');

  dot.removeClass('rpg-brain-dot--connected rpg-brain-dot--disconnected')
     .addClass('rpg-brain-dot--checking');
  text.text('Verbinde...');

  const result = await lightrag.healthCheck();

  dot.removeClass('rpg-brain-dot--checking');

  if (result.connected) {
    dot.addClass('rpg-brain-dot--connected');
    text.text('Verbunden');
    updateStats();
  } else {
    dot.addClass('rpg-brain-dot--disconnected');
    text.text(`Nicht verbunden: ${result.error}`);
  }

  return result.connected;
}

async function updateStats() {
  try {
    const stats = await lightrag.getGraphStats();
    $('#rpg-brain-node-count').text(stats.nodeCount);
  } catch {
    // Ignore — stats are non-critical
  }
  // Entity-Count aktualisieren
  $('#rpg-brain-entity-count').text(entityManager.getEntityCount());
}

// --- Chat ID Helper ---

function getChatId(context) {
  if (context.chatId) return context.chatId;
  if (context.characters && context.characterIndex >= 0) {
    return `char-${context.characters[context.characterIndex]?.avatar || 'unknown'}`;
  }
  return null;
}

// --- Event Handlers ---

async function onMessageReceived(messageIndex) {
  if (!isInitialized) return;

  const context = SillyTavern.getContext();
  const message = context.chat?.[messageIndex];
  if (!message) return;

  console.log('[RPG-Brain] Nachricht empfangen:', messageIndex);

  // Szene-Analyse (leichtgewichtig, jede Nachricht)
  await sceneTracker.onMessageReceived(messageIndex);

  // Extraktion (nur alle X Nachrichten)
  await extractionTrigger.onMessageReceived(messageIndex);
  updateStats();
  panel.refresh();

  // Injection sofort aktualisieren für den nächsten Generate
  await updateInjection();
}

async function onMessageDeleted(remainingCount) {
  if (!isInitialized) return;

  console.log('[RPG-Brain] Nachricht gelöscht, verbleibend:', remainingCount);

  // Szene auf vorherigen Stand zurücksetzen
  sceneTracker.onMessageDeleted(remainingCount);

  // Injection aktualisieren
  updateStats();
  panel.refresh();
  await updateInjection();
}

async function onChatChanged() {
  const context = SillyTavern.getContext();
  const newChatId = getChatId(context);

  if (newChatId === currentChatId) return;

  currentChatId = newChatId;
  console.log('[RPG-Brain] Chat gewechselt:', currentChatId);

  // Entity-Index + Extraktions-State + Szene + Party für den neuen Chat laden
  entityManager.loadForChat(currentChatId);
  extractionTrigger.loadStateForChat();
  sceneTracker.loadStateForChat();
  partyManager.loadForChat();
  syncTemplateFields();
  updateStats();

  // Injection für neuen Chat aktualisieren
  await updateInjection();
}

/**
 * Injection aktualisieren und via setExtensionPrompt persistent setzen.
 * Wird nach jeder relevanten Änderung aufgerufen (Nachricht, Chat-Wechsel, Extraktion).
 * setExtensionPrompt bleibt bis zur nächsten Änderung aktiv — kein Event nötig.
 */
async function updateInjection() {
  if (!isInitialized) return;

  try {
    const context = SillyTavern.getContext();
    const injection = await promptInjector.buildInjection();

    if (injection) {
      context.setExtensionPrompt(MODULE_NAME, injection, 1, 0);
      const info = promptInjector.getLastInjectionInfo();
      $('#rpg-brain-injection-tokens').text(info.tokens);
      console.log(`[RPG-Brain] Injection gesetzt: ${info.tokens} Tokens, ${injection.length} Zeichen`);
    } else {
      context.setExtensionPrompt(MODULE_NAME, '', 1, 0);
      console.log('[RPG-Brain] Injection leer (keine Entities)');
    }
  } catch (err) {
    console.error('[RPG-Brain] Injection-Fehler:', err);
  }
}

// --- BroadcastChannel (Cross-Tab Sync mit Dashboard) ---

function initBroadcastChannel() {
  try {
    broadcastChannel = new BroadcastChannel('rpg-brain-sync');
    broadcastChannel.onmessage = (event) => {
      const { type, payload } = event.data || {};

      switch (type) {
        case 'request-settings':
          broadcastChannel.postMessage({
            type: 'settings-sync',
            payload: getSettings(),
          });
          break;

        case 'request-entities':
          broadcastChannel.postMessage({
            type: 'entities-sync',
            payload: { entities: entityManager.exportEntities() },
          });
          break;

        case 'entity-created':
        case 'entity-updated':
        case 'entity-deleted':
        case 'types-updated':
          // Dashboard hat Änderungen gemacht — Panel aktualisieren
          registry.initialize();
          updateStats();
          panel.refresh();
          break;

        case 'settings-updated':
          if (payload) {
            const context = SillyTavern.getContext();
            context.extensionSettings[MODULE_NAME] = payload;
            saveSettings();
            applySettingsToUI();
          }
          break;
      }
    };
  } catch (err) {
    console.warn('[RPG-Brain] BroadcastChannel nicht verfügbar:', err);
  }
}

function broadcastSync(type, payload = null) {
  try {
    broadcastChannel?.postMessage({ type, payload });
  } catch { /* ignore */ }
}

// --- Dashboard ---

function openDashboard() {
  const port = window.location.port || '8000';
  const dashboardUrl = `${window.location.protocol}//${window.location.hostname}:${port}/scripts/extensions/third-party/rpg-brain/dashboard/index.html`;
  window.open(dashboardUrl, '_blank');
}

// --- UI Binding ---

function bindSettingsEvents() {
  // Connection test
  $(document).on('click', '#rpg-brain-test-connection', async () => {
    readSettingsFromUI();
    await testConnection();
  });

  // Settings changes
  $(document).on('change', '#rpg-brain-lightrag-url', readSettingsFromUI);
  $(document).on('change', '#rpg-brain-extraction-url', readSettingsFromUI);
  $(document).on('change', '#rpg-brain-extraction-key', readSettingsFromUI);
  $(document).on('change', '#rpg-brain-extraction-model', readSettingsFromUI);
  $(document).on('change', '#rpg-brain-trigger-mode', readSettingsFromUI);
  $(document).on('change', '#rpg-brain-language', async () => {
    readSettingsFromUI();
    const settings = getSettings();
    await setLocale(settings.language);
  });

  // Token budget slider
  $(document).on('input', '#rpg-brain-token-budget', function () {
    const val = $(this).val();
    $('#rpg-brain-budget-display').text(val);
  });
  $(document).on('change', '#rpg-brain-token-budget', readSettingsFromUI);

  // Actions
  $(document).on('click', '#rpg-brain-extract-now', async () => {
    console.log('[RPG-Brain] Manuelle Extraktion gestartet');
    await extractionTrigger.manualExtract();
    updateStats();
    panel.refresh();
    await updateInjection();
  });

  $(document).on('click', '#rpg-brain-open-dashboard', openDashboard);

  // Stats settings
  $(document).on('change', '#rpg-brain-stats-enabled', readSettingsFromUI);
  $(document).on('change', '#rpg-brain-stat-template', () => {
    readSettingsFromUI();
    updateTemplateInfo();
    panel.refresh();
  });

  // Custom Prompts: Scene-Injection
  $(document).on('click', '#rpg-brain-scene-prompt-reset', () => {
    const settings = getSettings();
    settings.customSceneInstruction = null;
    $('#rpg-brain-custom-scene-prompt').val(getDefaultSceneTemplate(settings));
    saveSettings();
    updateInjection();
  });
  $(document).on('click', '#rpg-brain-scene-prompt-save', () => {
    const settings = getSettings();
    const value = $('#rpg-brain-custom-scene-prompt').val() || '';
    settings.customSceneInstruction = value.trim() || null;
    saveSettings();
    updateInjection();
    toastr?.success?.('Scene-Prompt gespeichert');
  });

  // Custom Prompts: Extraktion
  $(document).on('click', '#rpg-brain-extraction-prompt-reset', () => {
    const settings = getSettings();
    settings.customExtractionPrompt = null;
    $('#rpg-brain-custom-extraction-prompt').val(getDefaultExtractionPromptTemplate(settings.language || 'de'));
    saveSettings();
  });
  $(document).on('click', '#rpg-brain-extraction-prompt-save', () => {
    const settings = getSettings();
    const value = $('#rpg-brain-custom-extraction-prompt').val() || '';
    settings.customExtractionPrompt = value.trim() || null;
    saveSettings();
    toastr?.success?.('Extraktions-Prompt gespeichert');
  });

  // Party-Badge Klick im Panel
  $(document).on('click', '.rpg-brain-party-badge', function () {
    const charName = $(this).data('char-name');
    if (!charName || !partyManager) return;
    const isCurrently = partyManager.isPartyMember(charName);
    partyManager.setUserOverride(charName, !isCurrently);
    panel.refresh();
    updateInjection();
  });

  // Inline-Edit für Stats im Panel
  $(document).on('click', '.rpg-brain-stat-editable', function () {
    const el = $(this);
    if (el.find('input').length) return; // Bereits im Edit-Modus

    const currentValue = el.text().trim();
    const charName = el.data('char');
    const fieldKey = el.data('field');

    const input = $(`<input type="text" class="rpg-brain-inline-edit" value="${currentValue}" />`);
    el.empty().append(input);
    input.focus().select();

    const save = () => {
      const newValue = input.val().trim();
      el.text(newValue || currentValue);

      // Scene-Status aktualisieren
      if (charName && fieldKey && sceneTracker) {
        const scene = sceneTracker.getCurrentScene();
        if (scene.status && scene.status[charName]) {
          // Equipment-Subfield: "ausruestung.waffe" → scene.status[char].ausruestung.waffe
          if (fieldKey.includes('.')) {
            const [parent, sub] = fieldKey.split('.', 2);
            if (scene.status[charName][parent] && typeof scene.status[charName][parent] === 'object') {
              scene.status[charName][parent][sub] = newValue;
            }
          } else {
            scene.status[charName][fieldKey] = newValue;
          }
          sceneTracker._persist();
          updateInjection();
        }
      }
    };

    input.on('blur', save);
    input.on('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { el.text(currentValue); }
    });
  });
}

// --- Initialization ---

async function initExtension() {
  const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
  if (!context) {
    console.warn('[RPG-Brain] SillyTavern context nicht verfügbar');
    return;
  }

  // Load settings & initialize entity system
  const settings = getSettings();
  lightrag.setBaseUrl(settings.lightragUrl);
  registry.initialize();
  promptInjector.initialize();

  // i18n laden
  await initI18n(settings.language || 'de');

  // Mount settings UI
  try {
    if (typeof context.renderExtensionTemplateAsync === 'function') {
      const settingsHtml = await context.renderExtensionTemplateAsync(
        'third-party/rpg-brain', 'settings', {}, true, true
      );
      $('#extensions_settings2').append(settingsHtml);
    }
  } catch (err) {
    console.error('[RPG-Brain] Settings-Panel konnte nicht geladen werden:', err);
  }

  // Apply settings to UI
  applySettingsToUI();
  bindSettingsEvents();

  // Side-Panel initialisieren
  panel.init();

  // Initial chat ID + Entity-Index laden
  currentChatId = getChatId(context);
  if (currentChatId) {
    entityManager.loadForChat(currentChatId);
    extractionTrigger.loadStateForChat();
    sceneTracker.loadStateForChat();
    partyManager.loadForChat();
  }

  // Template-Felder zum Panel synchronisieren
  syncTemplateFields();

  // Register ST event listeners
  const eventSource = context.eventSource;
  const eventTypes = context.eventTypes || context.event_types;

  if (eventSource && eventTypes) {
    eventSource.on(eventTypes.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(eventTypes.MESSAGE_DELETED, onMessageDeleted);
    eventSource.on(eventTypes.CHAT_CHANGED, onChatChanged);

    // Prompt injection: setExtensionPrompt wird proaktiv gesetzt (nach Nachricht/Chat-Wechsel)
    // Zusätzlich als Backup beim Generate-Event
    const combineEvent = eventTypes.GENERATE_BEFORE_COMBINE_PROMPTS || 'generate_before_combine_prompts';
    eventSource.on(combineEvent, () => updateInjection());
    console.log('[RPG-Brain] Event-Listener registriert (inkl. Scene-Tracking)');
  } else {
    console.error('[RPG-Brain] eventSource oder eventTypes nicht verfügbar!');
  }

  // Cross-Tab Sync
  initBroadcastChannel();

  // Test connection to LightRAG
  await testConnection();

  // Periodic health check (every 60s)
  healthCheckInterval = setInterval(async () => {
    const result = await lightrag.healthCheck();
    const dot = $('#rpg-brain-status-dot');
    const text = $('#rpg-brain-status-text');
    dot.removeClass('rpg-brain-dot--connected rpg-brain-dot--disconnected rpg-brain-dot--checking');
    if (result.connected) {
      dot.addClass('rpg-brain-dot--connected');
      text.text('Verbunden');
    } else {
      dot.addClass('rpg-brain-dot--disconnected');
      text.text('Nicht verbunden');
    }
  }, 60000);

  isInitialized = true;
  console.log('[RPG-Brain] Extension initialisiert für Chat:', currentChatId || '(kein Chat offen)');

  // Initiale Injection setzen
  if (currentChatId) {
    await updateInjection();
  }
}

// Log extension errors
window.addEventListener?.('error', (e) => {
  if (e.filename?.includes('rpg-brain')) {
    console.error('[RPG-Brain] Uncaught error:', e.message, e.filename, e.lineno);
  }
});

// Entry point — SillyTavern calls this when DOM is ready
jQuery(async () => {
  await initExtension();
});
