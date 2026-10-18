// Mood indicator + custom-emotion colour helpers.
//
// moodDot(labels, customEmotions, catLabels) → { color, title } | null
//   green  = every emotion is positive
//   red    = every emotion is negative
//   gray   = every emotion is neutral
//   orange = mixed, body-state or uncategorised
// Positive/negative comes from the wheel (a core or sub-emotion's root),
// or — for custom emotions — the category the user filed it under.

import { WHEEL } from "@/components/emotions/EmotionWheelPicker";

export const MOOD_GREEN = "#22c55e";
export const MOOD_ORANGE = "#f97316";
export const MOOD_RED = "#ef4444";
export const MOOD_GRAY = "#6b7280";

import { normalizeHex } from "@/lib/hexColor";
export { normalizeHex };

// Valence root of any label: "good" | "bad" | "neutral" | "body" | null.
function valenceOf(label, customEmotions = [], catLabels = {}) {
  const l = String(label || "").toLowerCase();
  for (const key of ["good", "bad", "neutral"]) {
    if (l === key || l === String(catLabels[key] || "").toLowerCase()) return key;
  }
  for (const [key, v] of Object.entries(WHEEL)) {
    if (v.flat?.some((e) => e.toLowerCase() === l)) return key;
    if (v.cores) {
      for (const [core, { subs }] of Object.entries(v.cores)) {
        if (core.toLowerCase() === l || subs.some((s) => s.toLowerCase() === l)) return key;
      }
    }
  }
  const ce = customEmotions.find((c) => String(c.label).toLowerCase() === l);
  if (ce?.category) {
    if (WHEEL[ce.category]) return ce.category;
    for (const [key, v] of Object.entries(WHEEL)) if (v.cores?.[ce.category]) return key;
  }
  return null;
}

export function moodDot(labels, customEmotions = [], catLabels = {}) {
  const list = (Array.isArray(labels) ? labels : []).filter(Boolean);
  if (list.length === 0) return null;
  const vals = list.map((l) => valenceOf(l, customEmotions, catLabels));
  const allGood = vals.every((v) => v === "good");
  const allBad = vals.every((v) => v === "bad");
  if (allGood) return { color: MOOD_GREEN, title: `Mood: ${list.join(", ")}` };
  if (vals.every((v) => v === "neutral")) return { color: MOOD_GRAY, title: `Mood: ${list.join(", ")}` };
  if (allBad) return { color: MOOD_RED, title: `Mood: ${list.join(", ")}` };
  return { color: MOOD_ORANGE, title: `Mood: ${list.join(", ")}` };
}

// Per-note mood dots: one dot per DISTINCT valence present in the labels,
// in a fixed order (red, green, gray, orange) so a note with every kind
// shows all four and a note with only one kind shows just that one.
// Unknown labels (no valence) show as orange.
export function moodDots(labels, customEmotions = [], catLabels = {}) {
  const list = (Array.isArray(labels) ? labels : []).filter(Boolean);
  if (list.length === 0) return [];
  const byColor = { bad: MOOD_RED, good: MOOD_GREEN, neutral: MOOD_GRAY, other: MOOD_ORANGE };
  const seen = {};
  for (const l of list) {
    const v = valenceOf(l, customEmotions, catLabels);
    // Unknown / uncategorised labels count as "other" (orange), as the old
    // single dot did, so a note with emotions never shows no dot at all.
    const k = v && byColor[v] ? v : "other";
    (seen[k] = seen[k] || []).push(l);
  }
  return ["bad", "good", "neutral", "other"]
    .filter((k) => seen[k])
    .map((k) => ({ color: byColor[k], title: `Mood: ${seen[k].join(", ")}` }));
}

// A custom emotion's own colour (hex) if the user set one, else fallback.
export function customEmotionColor(label, customEmotions = [], fallback = null) {
  const l = String(label || "").toLowerCase();
  const ce = customEmotions.find((c) => String(c.label).toLowerCase() === l);
  return normalizeHex(ce?.color) || fallback;
}
