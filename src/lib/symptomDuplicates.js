// Spotting symptoms / habits that are really the same thing under slightly
// different names ("Energy", "Energy level", "Energy levels ", "energy
// level") — pure functions, no storage, so they're shared by the preset
// picker (never add a near-copy of something already in the list) and the
// "Tidy up duplicates" tool (merge the copies that already exist).
//
// Matching is deliberately conservative: two names match only when they
// reduce to the same words after dropping filler ("level", "feeling",
// "today"…), punctuation, case and plurals — or when they're a curated
// old-name → preset-name pair (LEGACY_TO_PRESET_EQUIVALENTS). Nothing
// fuzzier: "Low energy" and "Energy" mean opposite things.
//
// Tested by: node scripts/test-symptom-duplicates.mjs

import { isBipolarScale } from "./trackingModel.js";

// Legacy label → { bundleId, presetLabel }. Only concept-equivalent pairs;
// anything semantically ambiguous or direction-flipped is intentionally
// omitted so we never subtly change the meaning of a user's data.
// (Lives here so this module stays storage-free; legacyCatalogueMigration
// re-exports it.)
export const LEGACY_TO_PRESET_EQUIVALENTS = [
  // Mood rating symptoms
  { legacy: "Overall mood", bundleId: "mood", preset: "Overall mood" },
  { legacy: "Energy level", bundleId: "mood", preset: "Energy" },
  { legacy: "Self esteem", bundleId: "mood", preset: "Self esteem" },
  { legacy: "Anxiety", bundleId: "mood", preset: "Anxious / on edge" },
  { legacy: "Depression", bundleId: "mood", preset: "Low / depressed" },
  { legacy: "Feeling irritable", bundleId: "mood", preset: "Irritable" },
  { legacy: "Feeling manic / wired / elated", bundleId: "mood", preset: "Wired / elevated" },
  { legacy: "Feeling overwhelmed", bundleId: "mood", preset: "Overwhelmed" },
  { legacy: "Emotional numbness", bundleId: "mood", preset: "Emotionally numb / flat" },
  // Body / sleep
  { legacy: "Trouble sleeping", bundleId: "body", preset: "Trouble sleeping" },
  // Dissociation
  { legacy: "Amnesia / memory problems", bundleId: "dissociation", preset: "Memory gaps today" },
  // Context
  { legacy: "Work / school stress", bundleId: "context", preset: "Work / school stress" },
  // Habits (behaviour boolean → daily_care)
  { legacy: "Spoke to someone about feelings", bundleId: "daily_care", preset: "Talked to someone I trust" },
  { legacy: "Took care of chores", bundleId: "daily_care", preset: "Took care of a chore" },
  { legacy: "Attended therapy", bundleId: "daily_care", preset: "Attended therapy" },
  { legacy: "Used coping skills", bundleId: "daily_care", preset: "Used a coping skill" },
  { legacy: "Exercise / movement", bundleId: "daily_care", preset: "Moved my body" },
  { legacy: "Engaged in social activities", bundleId: "daily_care", preset: "Spent time with people" },
  { legacy: "Self-care", bundleId: "daily_care", preset: "Did something just for me" },
];

// Words that don't change what's being tracked.
const FILLER = new Set([
  "level", "levels", "feeling", "feelings", "felt", "today", "my", "i", "a", "an",
  "the", "of", "overall", "general", "some", "rating", "score",
]);

// Light plural folding: "levels" → "level", "nightmares" → "nightmare".
// Leaves "stress", "anxious", "chaos" alone.
const singular = (w) =>
  w.length > 3 && w.endsWith("s") && !/(ss|us|is|os)$/.test(w) ? w.slice(0, -1) : w;

function words(label) {
  return String(label || "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(singular);
}

// The comparable core of a name: filler dropped, plurals folded, word order
// ignored ("Energy level" = "level of energy" = "Energy"). Falls back to
// every word when the name is ONLY filler, so "Feeling" still has a key.
export function normalizeSymptomLabel(label) {
  const all = words(label);
  const core = all.filter((w) => !FILLER.has(w));
  return (core.length ? core : all).sort().join(" ");
}

// Old names resolve to their preset's key, so "Energy level" (old seed list)
// and "Energy" (Mood pack) land in the same group.
const EQUIVALENT_KEY = new Map(
  LEGACY_TO_PRESET_EQUIVALENTS.map((e) => [normalizeSymptomLabel(e.legacy), normalizeSymptomLabel(e.preset)])
);

// Habits stay apart from symptoms/context: same words can be a thing you
// DID ("Rested") vs a state you were in.
const bucketOf = (category) => (category === "habit" ? "habit" : "symptom");

export function symptomDuplicateKey(label, category) {
  const norm = normalizeSymptomLabel(label);
  if (!norm) return null;
  return `${bucketOf(category)}::${EQUIVALENT_KEY.get(norm) || norm}`;
}

// How a row's numbers read. Logs only merge between rows on the SAME scale:
// a −2..+2 "Energy" and a 0–5 "Energy level" store different numbers, so
// pooling their history would quietly change what old ratings mean.
export function scaleClass(symptom) {
  if (symptom?.type !== "rating") return "yesno";
  return isBipolarScale(symptom) ? "bipolar" : "rating";
}

export const SCALE_LABEL = { yesno: "yes/no", rating: "0–5", bipolar: "−2..+2" };

// Groups of live (not archived) rows that look like the same thing.
// `useCounts` = { [symptomId]: number of logs } — the busiest row is the
// suggested keeper (ties: linked to a preset pack, then oldest).
// Returns [{ key, rows: [row…] (keeper first), keeperId }], biggest first.
export function findDuplicateGroups(symptoms, useCounts = {}) {
  const groups = new Map();
  for (const s of symptoms || []) {
    if (!s || s.is_archived) continue;
    const key = symptomDuplicateKey(s.label, s.category);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const out = [];
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort(
      (a, b) =>
        (useCounts[b.id] || 0) - (useCounts[a.id] || 0) ||
        Number(!!b.bundle_id) - Number(!!a.bundle_id) ||
        String(a.created_date || "").localeCompare(String(b.created_date || ""))
    );
    out.push({ key, rows: sorted, keeperId: sorted[0].id });
  }
  return out.sort((a, b) => b.rows.length - a.rows.length);
}

// What happens to each row when `keeperId` is kept: same-scale rows MERGE
// (their logs move to the keeper), different-scale rows are only HIDDEN
// from check-ins (their logs stay on them, unchanged).
export function planGroup(group, keeperId = group.keeperId) {
  const keeper = group.rows.find((r) => r.id === keeperId) || group.rows[0];
  return group.rows
    .filter((r) => r.id !== keeper.id)
    .map((r) => ({ row: r, action: scaleClass(r) === scaleClass(keeper) ? "merge" : "hide" }));
}

// Count logs per symptom id from check-ins + sessions.
export function countSymptomUses(checkIns = [], sessions = []) {
  const counts = {};
  for (const c of checkIns) if (c?.symptom_id) counts[c.symptom_id] = (counts[c.symptom_id] || 0) + 1;
  for (const s of sessions) if (s?.symptom_id) counts[s.symptom_id] = (counts[s.symptom_id] || 0) + 1;
  return counts;
}

// Follow merged_into links so a saved reference to a merged-away row (a
// widget's chosen symptoms) still finds the row it was folded into.
export function resolveMergedSymptomId(id, byId) {
  let cur = id;
  for (let i = 0; i < 10; i++) {
    const next = byId[cur]?.merged_into;
    if (!next || next === cur) return cur;
    cur = next;
  }
  return cur;
}
