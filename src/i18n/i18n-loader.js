// i18n-loader.js — Internationalisierung für RPG-Brain
// Lädt Locale-Dateien und exportiert t(key) Helper

let _currentLocale = 'de';
let _translations = {};
let _fallback = {};

/**
 * i18n initialisieren: Locale-Dateien laden.
 * @param {string} language - 'de' oder 'en'
 */
export async function initI18n(language = 'de') {
  _currentLocale = language;

  const basePath = getBasePath();

  // Fallback (Deutsch) immer laden
  try {
    const deResp = await fetch(`${basePath}/src/i18n/de.json`);
    _fallback = await deResp.json();
  } catch (err) {
    console.warn('[RPG-Brain i18n] Fallback-Locale konnte nicht geladen werden:', err);
    _fallback = {};
  }

  // Gewählte Sprache laden
  if (language !== 'de') {
    try {
      const resp = await fetch(`${basePath}/src/i18n/${language}.json`);
      _translations = await resp.json();
    } catch (err) {
      console.warn(`[RPG-Brain i18n] Locale "${language}" nicht gefunden, nutze Fallback`);
      _translations = {};
    }
  } else {
    _translations = _fallback;
  }

  console.log(`[RPG-Brain i18n] Sprache geladen: ${language}`);
}

/**
 * Übersetzung für einen Key holen.
 * @param {string} key - Translation key
 * @param {object} params - Ersetzungen: { name: 'Thorin' } → {{name}} wird ersetzt
 * @returns {string}
 */
export function t(key, params = {}) {
  let text = _translations[key] || _fallback[key] || key;

  // Parameter ersetzen
  for (const [param, value] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{\\{${param}\\}\\}`, 'g'), value);
  }

  return text;
}

/**
 * Aktuelle Sprache.
 * @returns {string}
 */
export function getCurrentLocale() {
  return _currentLocale;
}

/**
 * Sprache wechseln.
 * @param {string} language
 */
export async function setLocale(language) {
  await initI18n(language);
}

/**
 * Basis-Pfad zur Extension ermitteln.
 */
function getBasePath() {
  // Im Dashboard (standalone)
  if (window.location.pathname.includes('/dashboard/')) {
    return window.location.pathname.replace('/dashboard/index.html', '').replace('/dashboard/', '');
  }
  // Im SillyTavern-Kontext
  return '/scripts/extensions/third-party/rpg-brain';
}
