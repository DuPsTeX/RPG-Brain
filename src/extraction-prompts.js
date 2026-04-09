// extraction-prompts.js — LLM-Prompts für automatische Entity-Extraktion

/**
 * Baut den Extraktions-Prompt dynamisch basierend auf aktiven Typ-Schemas
 * und bekannten Entity-Namen.
 *
 * @param {string} messageText - Die zu analysierenden Chat-Nachrichten
 * @param {string} typeSchemas - Kompakte Schema-Beschreibung (von registry.getTypeSchemasForPrompt())
 * @param {object} knownNames - Bekannte Entity-Namen pro Typ (von entityManager.getKnownNames())
 * @param {string} language - 'de' oder 'en'
 * @param {Array} activeTypes - Array von {id, name, icon} für dynamische Typ-Regeln
 * @returns {string} Der vollständige Extraktions-Prompt
 */
export function buildExtractionPrompt(messageText, typeSchemas, knownNames, language = 'de', activeTypes = [], customTemplate = null) {
  const knownSection = formatKnownNames(knownNames) || (language === 'en' ? 'No known entities.' : 'Keine bekannten Entities.');
  const typeReminder = buildTypeReminder(activeTypes, language);

  const template = (customTemplate && typeof customTemplate === 'string' && customTemplate.trim())
    ? customTemplate
    : getDefaultExtractionPromptTemplate(language);

  return template
    .replace(/\{\{type_schemas\}\}/g, typeSchemas || '')
    .replace(/\{\{known_names\}\}/g, knownSection)
    .replace(/\{\{type_reminder\}\}/g, typeReminder || '')
    .replace(/\{\{message_text\}\}/g, messageText || '');
}

/**
 * Default-Template für den Extraktions-Prompt mit Platzhaltern:
 * - {{type_schemas}}, {{known_names}}, {{type_reminder}}, {{message_text}}
 */
export function getDefaultExtractionPromptTemplate(language = 'de') {
  if (language === 'en') {
    return `You are an RPG analysis system. Analyze the following chat text and extract all relevant RPG entities.

## Available Entity Types
{{type_schemas}}

## Already Known Entities
{{known_names}}

## Rules
1. Extract NEW entities not yet known (action: "create")
2. Detect UPDATES to known entities (action: "update") — e.g. HP changes, new items, relationship changes
3. For updates: only include changed fields, not all fields
4. Set "confidence" between 0.0 and 1.0 (how certain are you?)
5. For relationships: extract BOTH directions if recognizable
6. Inventory changes: when a character receives or loses an item
7. Status changes: HP, hunger, thirst, cleanliness, arousal when described
8. Important narrative info (promises, secrets, plans) belong in the "wichtig" field
9. QUESTS: Also detect IMPLICIT tasks, goals, missions, promises
10. RECAP: ALWAYS create exactly one recap (type: "rueckblick") summarizing the analyzed messages

## IMPORTANT: Use ALL entity types!
Check for EACH of the following types whether it appears in the messages:
{{type_reminder}}
Do NOT ignore any type! Every mentioned object, location, NPC, quest etc. must be captured as an entity.

## Response Format
Respond ONLY with a JSON array. No explanations, no markdown.

[
  {
    "type": "entity_type_id",
    "action": "create" or "update",
    "name": "Entity name (for update matching)",
    "data": { "field1": "value1", "field2": "value2" },
    "confidence": 0.9
  }
]

If no entities are detected, respond with: []

## Chat Text to Analyze
{{message_text}}`;
  }

  return `Du bist ein RPG-Analyse-System. Analysiere den folgenden Chat-Text und extrahiere alle relevanten RPG-Entities.

## Verfügbare Entity-Typen
{{type_schemas}}

## Bereits bekannte Entities
{{known_names}}

## Regeln
1. Extrahiere NEUE Entities die noch nicht bekannt sind (action: "create")
2. Erkenne UPDATES zu bekannten Entities (action: "update") — z.B. HP-Änderungen, neue Items, Beziehungsänderungen
3. Für Updates: gib nur die geänderten Felder an, nicht alle
4. Setze "confidence" zwischen 0.0 und 1.0 (wie sicher bist du?)
5. Bei Beziehungen: extrahiere BEIDE Richtungen wenn erkennbar
6. Inventar-Änderungen: wenn ein Charakter ein Item erhält oder verliert
7. Status-Änderungen: HP, Hunger, Durst, Sauberkeit, Erregung wenn beschrieben
8. Wichtige narrative Infos (Versprechen, Geheimnisse, Pläne) gehören in das "wichtig" Feld
9. QUESTS: Erkenne auch IMPLIZITE Aufträge, Ziele, Missionen, Versprechen
10. RÜCKBLICK: Erstelle IMMER genau einen Rückblick (type: "rueckblick") der die analysierten Nachrichten zusammenfasst

## WICHTIG: Nutze ALLE Entity-Typen!
Prüfe für JEDEN der folgenden Typen ob er in den Nachrichten vorkommt:
{{type_reminder}}
Ignoriere KEINEN Typ! Jeder erwähnte Gegenstand, Ort, NPC, Quest etc. muss als Entity erfasst werden.

## Antwort-Format
Antworte NUR mit einem JSON-Array. Keine Erklärungen, kein Markdown.

[
  {
    "type": "entity_typ_id",
    "action": "create" oder "update",
    "name": "Name der Entity (für update-Matching)",
    "data": { "feld1": "wert1", "feld2": "wert2" },
    "confidence": 0.9
  }
]

Falls keine Entities erkannt werden, antworte mit: []

## Chat-Text zu analysieren
{{message_text}}`;
}

/**
 * Baut einen dynamischen Reminder für alle aktiven Entity-Typen.
 * Damit das LLM keinen Typ vergisst.
 */
function buildTypeReminder(activeTypes, language) {
  if (!activeTypes || activeTypes.length === 0) return '';

  // Beschreibungen pro Typ (was das LLM suchen soll)
  const typeHints = {
    charakter: { de: 'Jede Person, NPC, Kreatur mit Namen', en: 'Any person, NPC, creature with a name' },
    beziehung: { de: 'Wie Charaktere zueinander stehen (Freund, Feind, Romanze...)', en: 'How characters relate to each other (friend, enemy, romance...)' },
    erinnerung: {
      de: 'Spezifische, einprägsame Erlebnisse zwischen zwei Charakteren (von→zu + narrativer Text). Erstelle NEUE Erinnerungen für bedeutsame Momente: intime/emotionale Szenen, Versprechen, Verrat, erste Begegnungen, Kämpfe. Das Feld "text" enthält eine lebendige Beschreibung des Ereignisses aus der Perspektive von "von". Setze "wichtig" (0-100) nach narrativer Bedeutung: 80-100 für lebensverändernde Momente, 50-79 für wichtige Ereignisse, 20-49 für Alltagserinnerungen. Immer action:"create", niemals update — Erinnerungen werden gesammelt, nicht überschrieben.',
      en: 'Specific, memorable experiences between two characters (von→zu + narrative text). Create NEW memories for significant moments: intimate/emotional scenes, promises, betrayals, first meetings, battles. The "text" field contains a vivid description of the event from the perspective of "von". Set "wichtig" (0-100) by narrative importance: 80-100 for life-changing moments, 50-79 for important events, 20-49 for everyday memories. Always action:"create", never update — memories accumulate, they are not overwritten.',
    },
    ort: { de: 'Jeder Ort: Stadt, Raum, Gebäude, Wald, Dungeon...', en: 'Any location: city, room, building, forest, dungeon...' },
    quest: { de: 'Aufgaben, Ziele, Missionen, Versprechen', en: 'Tasks, goals, missions, promises' },
    item: { de: 'Waffen, Rüstungen, Tränke, Schlüssel, Werkzeuge, magische Gegenstände', en: 'Weapons, armor, potions, keys, tools, magical objects' },
    event: { de: 'Wichtige Ereignisse: Kämpfe, Entdeckungen, Plot-Twists', en: 'Important events: battles, discoveries, plot twists' },
    fraktion: { de: 'Gilden, Königreiche, Orden, Banden, Religionen', en: 'Guilds, kingdoms, orders, gangs, religions' },
    geschaeft: { de: 'Läden, Händler, Marktplätze, Tavernen', en: 'Shops, merchants, marketplaces, taverns' },
    dungeon: { de: 'Dungeons, Höhlen, Labyrinthe mit Räumen und Monstern', en: 'Dungeons, caves, labyrinths with rooms and monsters' },
    intimitaet: { de: 'Intime/romantische Szenen zwischen Charakteren', en: 'Intimate/romantic scenes between characters' },
    rueckblick: { de: 'Zusammenfassung der aktuellen Nachrichten (IMMER erstellen!)', en: 'Summary of current messages (ALWAYS create one!)' },
  };

  const lang = language === 'en' ? 'en' : 'de';

  return activeTypes.map(t => {
    const hint = typeHints[t.id]?.[lang] || '';
    return `- ${t.icon} ${t.name} (type: "${t.id}")${hint ? ': ' + hint : ''}`;
  }).join('\n');
}

/**
 * Formatiert bekannte Entity-Namen für den Prompt.
 */
function formatKnownNames(knownNames) {
  if (!knownNames || Object.keys(knownNames).length === 0) return '';

  const lines = [];
  for (const [typeId, names] of Object.entries(knownNames)) {
    if (names.length > 0) {
      lines.push(`- ${typeId}: ${names.join(', ')}`);
    }
  }
  return lines.join('\n');
}

/**
 * Parst die LLM-Antwort und extrahiert das JSON-Array.
 * Robust gegen Markdown-Codeblocks und Whitespace.
 *
 * @param {string} response - Die rohe LLM-Antwort
 * @returns {Array} Geparste Extraktions-Ergebnisse
 */
export function parseExtractionResponse(response) {
  if (!response || typeof response !== 'string') return [];

  let text = response.trim();

  // Markdown Codeblock entfernen
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  // Versuche JSON zu parsen
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    // Falls ein Objekt mit Array-Property zurückkommt
    if (parsed.entities && Array.isArray(parsed.entities)) return parsed.entities;
    if (parsed.results && Array.isArray(parsed.results)) return parsed.results;
    return [];
  } catch {
    // Versuche Array aus dem Text zu extrahieren
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        console.warn('[RPG-Brain] Konnte Extraktions-Antwort nicht parsen:', text.slice(0, 200));
        return [];
      }
    }
    return [];
  }
}
