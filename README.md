# RPG-Brain — SillyTavern Extension

LLMs vergessen bei langen RPG-Sessions wichtige Informationen. RPG-Brain loest das Problem: automatische Extraktion von Charakteren, Quests, Orten und Beziehungen aus dem Chat, Speicherung in einem Knowledge Graph (LightRAG) und intelligente Kontext-Injection vor jeder LLM-Antwort.

## Features

- **Automatische Entity-Extraktion** — LLM analysiert Chat-Nachrichten und erkennt Charaktere, Orte, Quests, Items, Beziehungen und mehr
- **11 Entity-Typen** — Charakter, Beziehung, Ort, Quest, Item, Event, Fraktion, Geschaeft, Dungeon, Intimitaet, Rueckblick + eigene Custom-Typen
- **Smart Prompt Injection** — Relevanter RPG-Kontext wird automatisch in jeden Prompt injiziert (Token-Budget konfigurierbar)
- **Seitenpanel** — Live-Uebersicht aller Entities direkt neben dem Chat mit Stats-Balken, Charakter-Cards und Quest-Tracker
- **Dashboard** — Separater Tab mit interaktivem Knowledge Graph (vis.js), Entity-Type Manager und Injection Manager
- **LightRAG Integration** — Knowledge Graph + Vector Search fuer intelligentes Retrieval
- **Portrait-Upload** — Bilder fuer Charaktere hochladen
- **Import/Export** — Entities als JSON sichern und laden
- **Zweisprachig** — Deutsch (Standard) und Englisch
- **Konfigurierbarer Extraktions-LLM** — DeepSeek, Ollama, Claude, GPT oder jeder OpenAI-kompatible Endpoint

## Voraussetzungen

- [SillyTavern](https://github.com/SillyTavern/SillyTavern) (aktuelle Version)
- [LightRAG Server](https://github.com/HKUDS/LightRAG) auf Port 9621

### LightRAG installieren

```bash
pip install lightrag-hku
lightrag-server --port 9621
```

## Installation

1. SillyTavern oeffnen
2. Extensions (Puzzle-Icon) -> "Install Extension"
3. URL eingeben: `https://github.com/DuPsTeX/RPG-Brain`
4. Installieren — fertig!

Alternativ manuell:
```bash
cd SillyTavern/public/scripts/extensions/third-party/
git clone https://github.com/DuPsTeX/RPG-Brain rpg-brain
```

## Einrichtung

1. SillyTavern neu starten nach Installation
2. Extensions -> RPG-Brain Settings oeffnen
3. LightRAG URL pruefen (`http://localhost:9621`) -> "Test" klicken -> Gruener Punkt
4. Extraktions-LLM konfigurieren (API URL, Key, Modell)
5. Extraktions-Frequenz und Token-Budget nach Wunsch einstellen

## Nutzung

- **Automatisch**: Chat fuehren -> nach X Nachrichten werden Entities automatisch extrahiert
- **Manuell**: "Jetzt Extrahieren" Button in den Settings
- **Panel**: Brain-Icon in der Top-Bar klicken fuer die Seitenleiste
- **Dashboard**: Aus Panel oder Settings heraus im neuen Tab oeffnen
- **Entities bearbeiten**: Direkt im Panel oder Dashboard per Klick

## Dateistruktur

```
rpg-brain/
  manifest.json          — Extension-Manifest
  index.js               — Haupteintritt + Event-Wiring
  settings.html          — SillyTavern Settings-Panel
  style.css              — Alle Styles
  src/
    lightrag-client.js   — LightRAG REST API Client
    default-types.js     — 11 Standard Entity-Typen
    entity-registry.js   — Dynamische Type Registry
    entity-manager.js    — CRUD + LightRAG Mapping
    extraction-trigger.js — Auto-Extraktion aus Chat
    extraction-prompts.js — LLM Prompts fuer Extraktion
    prompt-injector.js   — Smart Context Injection
    injection-sections.js — Injection-Sektionen
    image-manager.js     — Portrait Upload/Resize
    i18n/
      de.json            — Deutsche Uebersetzungen
      en.json            — Englische Uebersetzungen
      i18n-loader.js     — Locale Loader
    panel/
      panel.js           — Seitenpanel
      tabs.js            — 5 Tab-Ansichten
      components/
        character-card.js — Charakter-Card
        quest-card.js     — Quest-Card
        entity-card.js    — Generische Entity-Card
        entity-form.js    — Dynamischer Form-Generator
  dashboard/
    index.html           — Standalone Dashboard
    style.css            — Dashboard Dark Theme
    dashboard.js         — App-Logik + Cross-Tab Sync
    graph-view.js        — vis.js Graph
    entity-type-manager.js — Custom-Typen CRUD
    injection-manager.js — Injection-Sektionen Manager
```

## Lizenz

MIT
