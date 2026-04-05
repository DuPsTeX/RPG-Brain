// index.js — RPG-Brain SillyTavern Extension Entry Point
// Wires into ST events and manages LightRAG connection

import { LightRAGClient } from './src/lightrag-client.js';
import { EntityTypeRegistry } from './src/entity-registry.js';
import { EntityManager } from './src/entity-manager.js';
import { ExtractionTrigger } from './src/extraction-trigger.js';
import { PromptInjector } from './src/prompt-injector.js';
import { RPGBrainPanel } from './src/panel/panel.js';
import { initI18n, setLocale } from './src/i18n/i18n-loader.js';

const MODULE_NAME = 'rpg-brain';
const lightrag = new LightRAGClient();
const registry = new EntityTypeRegistry(() => getSettings(), () => saveSettings());
const entityManager = new EntityManager(registry, lightrag);
const extractionTrigger = new ExtractionTrigger(registry, entityManager, lightrag, () => getSettings());
const promptInjector = new PromptInjector(entityManager, lightrag, () => getSettings(), () => saveSettings());
const panel = new RPGBrainPanel(entityManager, registry, promptInjector, lightrag);

// Globaler Zugriff für Console-Tests und andere Module
window.rpgBrain = { lightrag, registry, entityManager, extractionTrigger, promptInjector, panel };

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
  tokenBudget: 1500,
  language: 'de',
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
  settings.tokenBudget = parseInt($('#rpg-brain-token-budget').val()) || 1500;
  settings.language = $('#rpg-brain-language').val();

  lightrag.setBaseUrl(settings.lightragUrl);
  saveSettings();
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
  await extractionTrigger.onMessageReceived(messageIndex);
  updateStats();
  panel.refresh();

  // Injection für nächsten Generate vorbereiten (LightRAG im Hintergrund)
  promptInjector.prepareInjection().catch(err =>
    console.debug('[RPG-Brain] prepareInjection Fehler:', err.message)
  );
}

async function onChatChanged() {
  const context = SillyTavern.getContext();
  const newChatId = getChatId(context);

  if (newChatId === currentChatId) return;

  currentChatId = newChatId;
  console.log('[RPG-Brain] Chat gewechselt:', currentChatId);

  // Entity-Index + Extraktions-State für den neuen Chat laden
  entityManager.loadForChat(currentChatId);
  extractionTrigger.loadStateForChat();
  updateStats();

  // Injection vorbereiten
  promptInjector.prepareInjection().catch(() => {});
}

async function onGenerateBeforeCombinePrompts() {
  if (!isInitialized) return;

  try {
    const context = SillyTavern.getContext();
    const injection = await promptInjector.buildInjection();

    if (injection) {
      context.setExtensionPrompt(MODULE_NAME, injection, 1, 0);
      const info = promptInjector.getLastInjectionInfo();
      $('#rpg-brain-injection-tokens').text(info.tokens);
      console.log(`[RPG-Brain] Injection: ${info.tokens} Tokens injiziert`);
    } else {
      context.setExtensionPrompt(MODULE_NAME, '', 1, 0);
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
  });

  $(document).on('click', '#rpg-brain-open-dashboard', openDashboard);
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
  }

  // Register ST event listeners
  const eventSource = context.eventSource;
  const eventTypes = context.eventTypes || context.event_types;

  if (eventSource && eventTypes) {
    eventSource.on(eventTypes.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(eventTypes.CHAT_CHANGED, onChatChanged);

    // Prompt injection hook
    if (eventTypes.GENERATE_BEFORE_COMBINE_PROMPTS) {
      eventSource.on(eventTypes.GENERATE_BEFORE_COMBINE_PROMPTS, onGenerateBeforeCombinePrompts);
    }

    console.log('[RPG-Brain] Event-Listener registriert');
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
