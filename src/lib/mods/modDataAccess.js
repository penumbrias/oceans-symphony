// What a mod may read of the person's records, and how it is cleaned first.
//
// Mods are like apps from a store: the app provides the capability, the
// person decides with every risk spelled out (Mods page consent sheet). This
// file is the catalogue the consent sheet shows and the filter every
// `symphony.appData` call goes through (broker.js). Pure apart from the
// whisper helper, so it can be tested in node.
//
// Shape and entity keys match ShineSpark330's Apeiron Zetta fork, so a mod
// written there (manifest `dataScopes: ["JournalEntry", …]`) works here.
//
// Rules, whatever a mod asks for:
//   • only the kinds listed here, and only the ones the person ticked;
//   • read-only — nothing here writes;
//   • whispers are masked, locked journal entries keep their contents hidden,
//     device secrets and the app's own bookkeeping fields are left out;
//   • trashed or removed rows never reach a mod (the entity layer hides them).

import { redactWhispers } from "../whisperRedact.js";

// key → what the person reads on the consent sheet. `{{…}}` are the
// person's own words (applyModTerms).
export const READABLE_DATA = {
  Alter: { label: "{{Alters}}' full profiles", detail: "Names, bios, ages, roles, custom fields and everything else on a profile." },
  FrontingSession: { label: "{{Fronting}} history", detail: "Who was {{fronting}} when, with notes, feelings and triggers written on it." },
  JournalEntry: { label: "Journals", detail: "Every journal entry. Locked entries stay locked: the mod sees only that they exist." },
  EmotionCheckIn: { label: "Emotion check-ins", detail: "Feelings, intensity, notes and distress flags." },
  SymptomCheckIn: { label: "Symptom check-ins", detail: "Symptoms you logged and how strong they were." },
  Activity: { label: "Activities and plans", detail: "What you did and planned, with times and notes." },
  Task: { label: "To-dos", detail: "Your to-do list, with notes." },
  StatusNote: { label: "Status notes", detail: "Every status you've set." },
  Location: { label: "Locations", detail: "Places you logged, including map coordinates when they were saved." },
  Sleep: { label: "Sleep", detail: "Bedtimes, wake times, quality and notes." },
  SystemChangeEvent: { label: "{{System}} changes", detail: "Splits, fusions, dormancy and other lineage events." },
  Group: { label: "Groups", detail: "Your groups and who is in them." },
  AlterNote: { label: "{{Alter}} notes", detail: "Notes written on {{alters}}' profiles." },
};

export const isReadableEntity = (key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(READABLE_DATA, key);

// The risks, said plainly. Shown in full before the person can allow it, and
// again on the mod's card. Keep them honest: nothing here is softened.
export const DATA_ACCESS_RISKS = [
  "It sees everything in the kinds of records you tick, including private and painful things you have written. It can't tell what you'd rather it didn't see.",
  "Mods have no internet access, so it can't send your data anywhere on its own. It can show it on screen, and if it may also save files, it can put your data into a file you choose to save.",
  "Mods are made by other people, not by this app. Nobody checks what a mod does with what it reads. Only allow this for someone you trust.",
  "Whispers are hidden and locked journal entries stay locked. You can take access away at any time on the mod's card.",
];

// Field names never handed to a mod, even inside an allowed record.
const STRIP_FIELD = /(^_)|secret|token|password|passphrase|private_key|api_?key|recovery|endpoint|trash|removed_at/i;
const MAX_DEPTH = 6;

function clean(value, depth) {
  if (typeof value === "string") return redactWhispers(value);
  if (!value || typeof value !== "object" || depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (STRIP_FIELD.test(k)) continue;
    out[k] = clean(v, depth + 1);
  }
  return out;
}

// The copy of one record a mod is given.
export function sanitizeForMod(entity, row) {
  if (!row || typeof row !== "object") return row;
  const out = clean(row, 0);
  if (entity === "JournalEntry" && row.is_encrypted) {
    out.content = null;
    out.locked = true;
  }
  return out;
}
