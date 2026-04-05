// extraction-prompts.js — LLM-Prompts für automatische Entity-Extraktion

/**
 * Baut den Extraktions-Prompt dynamisch basierend auf aktiven Typ-Schemas
 * und bekannten Entity-Namen.
 *
 * @param {string} messageText - Die zu analysierenden Chat-Nachrichten
 * @param {string} typeSchemas - Kompakte Schema-Beschreibung (von registry.getTypeSchemasForPrompt())
 * @param {object} knownNames - Bekannte Entity-Namen pro Typ (von entityManager.getKnownNames())
 * @param {string} language - 'de' oder 'en'
 * @returns {string} Der vollständige Extraktions-Prompt
 */
export function buildExtractionPrompt(messageText, typeSchemas, knownNames, language = 'de') {
  const knownSection = formatKnownNames(knownNames);

  if (language === 'en') {
    return buildEnglishPrompt(messageText, typeSchemas, knownSection);
  }
  return buildGermanPrompt(messageText, typeSchemas, knownSection);
}

function buildGermanPrompt(messageText, typeSchemas, knownSection) {
  return `Du bist ein RPG-Analyse-System. Analysiere den folgenden Chat-Text und extrahiere alle relevanten RPG-Entities.

## Verfügbare Entity-Typen
${typeSchemas}

## Bereits bekannte Entities
${knownSection || 'Keine bekannten Entities.'}

## Regeln
1. Extrahiere NEUE Entities die noch nicht bekannt sind (action: "create")
2. Erkenne UPDATES zu bekannten Entities (action: "update") — z.B. HP-Änderungen, neue Items, Beziehungsänderungen
3. Für Updates: gib nur die geänderten Felder an, nicht alle
4. Setze "confidence" zwischen 0.0 und 1.0 (wie sicher bist du?)
5. Bei Beziehungen: extrahiere BEIDE Richtungen wenn erkennbar
6. Inventar-Änderungen: wenn ein Charakter ein Item erhält oder verliert
7. Status-Änderungen: HP, Hunger, Durst, Sauberkeit, Erregung wenn beschrieben
8. Wichtige narrative Infos (Versprechen, Geheimnisse, Pläne) gehören in das "wichtig" Feld
9. QUESTS: Erkenne auch IMPLIZITE Aufträge, Ziele, Missionen, Versprechen. Wenn jemand sagt "finde X", "bringe Y zu Z", "beschütze A", "besorge B" — das ist eine Quest mit status "aktiv"
10. RÜCKBLICK: Erstelle IMMER genau einen Rückblick (type: "rueckblick") der die analysierten Nachrichten zusammenfasst. Felder: name (z.B. "Session-Zusammenfassung"), zusammenfassung (2-4 Sätze was passiert ist), wichtige_events (Stichpunkte), beteiligte (Komma-getrennte Namen)

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
${messageText}`;
}

function buildEnglishPrompt(messageText, typeSchemas, knownSection) {
  return `You are an RPG analysis system. Analyze the following chat text and extract all relevant RPG entities.

## Available Entity Types
${typeSchemas}

## Already Known Entities
${knownSection || 'No known entities.'}

## Rules
1. Extract NEW entities not yet known (action: "create")
2. Detect UPDATES to known entities (action: "update") — e.g. HP changes, new items, relationship changes
3. For updates: only include changed fields, not all fields
4. Set "confidence" between 0.0 and 1.0 (how certain are you?)
5. For relationships: extract BOTH directions if recognizable
6. Inventory changes: when a character receives or loses an item
7. Status changes: HP, hunger, thirst, cleanliness, arousal when described
8. Important narrative info (promises, secrets, plans) belong in the "wichtig" field
9. QUESTS: Also detect IMPLICIT tasks, goals, missions, promises. If someone says "find X", "bring Y to Z", "protect A", "get B" — that is a quest with status "aktiv"
10. RECAP: ALWAYS create exactly one recap (type: "rueckblick") summarizing the analyzed messages. Fields: name (e.g. "Session Summary"), zusammenfassung (2-4 sentences of what happened), wichtige_events (bullet points), beteiligte (comma-separated names)

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
${messageText}`;
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
