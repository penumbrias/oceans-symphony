// Distress-emotion set — which emotions trigger the post-check-in support
// prompt. (Phase B2 of the onboarding/customization initiative.)
//
// Storage model:
// - localStorage (LS_KEY) is the fast SYNCHRONOUS cache — every read
//   surface (Quick Check-In save, settings toggles) stays sync.
// - SystemSettings.distress_emotions is the AUTHORITATIVE persisted copy:
//   it rides backups and restores across devices (the old localStorage-only
//   set silently vanished on Android localStorage wipes and never made it
//   into exports).
// - Writes go to both (localStorage sync, SystemSettings fire-and-forget).
// - reconcileDistressStore() runs once at boot: localStorage empty but
//   settings populated (fresh device / post-restore) → adopt settings;
//   localStorage populated but settings missing (pre-B2 customiser) →
//   migrate up. Neither → defaults apply, NOTHING is persisted, so future
//   default improvements keep reaching users who never customised.
// - localStorage is never deleted (data invariant — it stays a fallback).
//
// Matching is by lowercased emotion label — custom emotions carry their own
// `is_distressing` flag instead (see CustomEmotionsManager).

import { base44 } from "@/api/base44Client";

const LS_KEY = "symphony_system_distress";

// Expanded per the July 2026 research pass: the original 20 covered the
// Fearful corner well but missed most of Sad, the high-distress Angry subs,
// and the body wheel's Freeze/Collapse states — striking gaps for a
// dissociation-focused app. Mild negatives (annoyed, disappointed, bored)
// stay off by default; everything is user-toggleable in Settings.
const DEFAULT_DISTRESS = [
  // original set
  "anxious", "overwhelmed", "panicked", "scared", "terrified",
  "crisis", "unsafe", "dissociated", "numb", "frozen", "fearful",
  "hopeless", "worthless", "rejected", "excluded", "insecure",
  "desperate", "panic", "worried", "paralysed",
  // sad core + subs
  "depressed", "grieving", "helpless", "lonely", "hurt", "vulnerable",
  // high-distress angry subs
  "furious", "betrayed", "humiliated",
  // body wheel freeze / collapse states
  "stuck", "dread", "shut down", "despair", "powerless",
];

// Module cache so repeated sync reads don't re-parse localStorage.
let _cache = null; // array of lowercase labels, or null = not loaded

function readLocal() {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored !== null) return JSON.parse(stored);
  } catch { /* fall through */ }
  return null;
}

export function loadSystemDistressSet() {
  if (_cache) return new Set(_cache);
  const local = readLocal();
  if (local !== null) {
    _cache = [...local];
    return new Set(_cache);
  }
  return new Set(DEFAULT_DISTRESS);
}

export function saveSystemDistressSet(set) {
  const arr = [...set];
  _cache = arr;
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch { /* storage off */ }
  // Fire-and-forget persist to the backed-up settings row. Failure just
  // means the set stays device-local until the next successful save.
  persistToSettings(arr).catch(() => {});
}

async function persistToSettings(arr) {
  const rows = await base44.entities.SystemSettings.list();
  if (rows[0]?.id) {
    await base44.entities.SystemSettings.update(rows[0].id, { distress_emotions: arr });
  } else {
    await base44.entities.SystemSettings.create({ distress_emotions: arr });
  }
}

// One-shot boot reconcile (called from App's post-init effect).
export async function reconcileDistressStore() {
  try {
    const rows = await base44.entities.SystemSettings.list();
    const settingsSet = Array.isArray(rows[0]?.distress_emotions) ? rows[0].distress_emotions : null;
    const local = readLocal();
    if (local === null && settingsSet !== null) {
      // Fresh device / restored backup → adopt the persisted set.
      _cache = [...settingsSet];
      try { localStorage.setItem(LS_KEY, JSON.stringify(settingsSet)); } catch { /* storage off */ }
    } else if (local !== null && settingsSet === null) {
      // Pre-B2 customiser → migrate the device-local set into settings.
      await persistToSettings(local);
    }
    // Both present: device-local wins (newest edits happen here) — the next
    // user save re-syncs settings anyway. Neither: defaults, persist nothing.
  } catch { /* non-fatal — sync reads keep working off localStorage/defaults */ }
}

// ── Grounding handoff ─────────────────────────────────────────────────────
// Map logged emotion labels onto the StateCheckFlow EMOTIONAL_STATES ids
// (groundingDefaults.js: dissociation, derealization, anxiety, overwhelm,
// crisis, switching, stuck) so the post-check-in support prompt can land
// the user on the state check with their answers PRE-SELECTED instead of
// dumping them at the grounding entry screen.
const STATE_MATCHERS = [
  { id: "anxiety", re: /anxious|worried|panick|panic|scared|terrified|fearful|insecure|on edge|hypervigilant|jittery|racing heart|butterflies|shallow breath/ },
  { id: "overwhelm", re: /overwhelmed/ },
  { id: "dissociation", re: /dissociat|numb|spacey|foggy|detached|blank|eyes glazed|zoned/ },
  { id: "derealization", re: /unreal|derealiz/ },
  { id: "stuck", re: /frozen|stuck|paralysed|paralyzed|shut down|powerless|heavy limbs/ },
  { id: "crisis", re: /crisis|unsafe|hopeless|worthless|desperate|despair/ },
];

export function mapEmotionsToGroundingStates(emotions = [], { triggeredSwitch = false } = {}) {
  const ids = new Set();
  for (const raw of emotions) {
    const e = String(raw || "").toLowerCase();
    for (const m of STATE_MATCHERS) {
      if (m.re.test(e)) ids.add(m.id);
    }
  }
  if (triggeredSwitch) ids.add("switching");
  return [...ids];
}
