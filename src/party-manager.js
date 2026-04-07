// party-manager.js — Verwaltet Gruppenmitgliedschaft (LLM-Vorschlag + User-Override)

import { getContext } from '../../../../extensions.js';

export class PartyManager {
  constructor() {
    this._members = [];       // Aktuelle Gruppen-Namen (vom LLM vorgeschlagen)
    this._userOverrides = {};  // { "Name": true/false } — User-Korrekturen
    this._loaded = false;
  }

  /**
   * Lädt Party-State für den aktuellen Chat.
   */
  loadForChat() {
    const context = getContext();
    const saved = context.chatMetadata?.rpgBrainParty;
    if (saved) {
      this._members = saved.members || [];
      this._userOverrides = saved.userOverrides || {};
    } else {
      this._members = [];
      this._userOverrides = {};
    }
    this._loaded = true;
  }

  /**
   * Aktualisiert die Gruppe basierend auf LLM-Vorschlag (aus <scene> JSON).
   * User-Overrides werden NICHT überschrieben.
   * @param {string[]} gruppeArray - Namen aus dem scene.gruppe Feld
   */
  updateFromScene(gruppeArray) {
    if (!Array.isArray(gruppeArray)) return;
    this._members = gruppeArray.map(n => n.trim()).filter(Boolean);
    this._persist();
  }

  /**
   * Prüft ob ein Charakter zur Gruppe gehört.
   * User-Override > LLM-Vorschlag.
   * @param {string} name
   * @returns {boolean}
   */
  isPartyMember(name) {
    const nameLower = name.toLowerCase();

    // User-Override prüfen (hat Vorrang)
    for (const [overrideName, inParty] of Object.entries(this._userOverrides)) {
      if (overrideName.toLowerCase() === nameLower) {
        return inParty;
      }
    }

    // LLM-Vorschlag prüfen
    return this._members.some(m => m.toLowerCase() === nameLower);
  }

  /**
   * Gibt alle aktuellen Gruppenmitglieder zurück (nach Overrides).
   * @returns {string[]}
   */
  getPartyMembers() {
    const result = new Set();

    // Erst LLM-Vorschläge
    for (const name of this._members) {
      const nameLower = name.toLowerCase();
      const override = this._findOverride(nameLower);
      if (override === null || override === true) {
        result.add(name);
      }
      // override === false → explizit ausgeschlossen
    }

    // Dann User-Overrides die positiv sind (manuell hinzugefügt)
    for (const [name, inParty] of Object.entries(this._userOverrides)) {
      if (inParty && !this._members.some(m => m.toLowerCase() === name.toLowerCase())) {
        result.add(name);
      }
    }

    return Array.from(result);
  }

  /**
   * Setzt einen User-Override für ein Gruppenmitglied.
   * @param {string} name
   * @param {boolean} inParty
   */
  setUserOverride(name, inParty) {
    this._userOverrides[name] = inParty;
    this._persist();
  }

  /**
   * Entfernt einen User-Override (zurück zu LLM-Entscheidung).
   * @param {string} name
   */
  clearOverride(name) {
    delete this._userOverrides[name];
    this._persist();
  }

  /**
   * Gibt den rohen Party-State für den History-Stack zurück.
   * @returns {object}
   */
  getState() {
    return {
      members: [...this._members],
      userOverrides: { ...this._userOverrides },
    };
  }

  /**
   * Stellt Party-State aus History wieder her (Rollback).
   * @param {object} state
   */
  restoreState(state) {
    if (state) {
      this._members = state.members || [];
      this._userOverrides = state.userOverrides || {};
      this._persist();
    }
  }

  /**
   * Prüft ob ein User-Override existiert.
   * @param {string} nameLower - lowercase Name
   * @returns {boolean|null} true/false für Override, null wenn keiner existiert
   */
  _findOverride(nameLower) {
    for (const [name, val] of Object.entries(this._userOverrides)) {
      if (name.toLowerCase() === nameLower) return val;
    }
    return null;
  }

  _persist() {
    try {
      const context = getContext();
      if (!context.chatMetadata) return;
      context.chatMetadata.rpgBrainParty = {
        members: this._members,
        userOverrides: this._userOverrides,
      };
      context.saveChatDebounced?.();
    } catch (e) {
      console.error('[RPG-Brain] PartyManager persist error:', e);
    }
  }
}
