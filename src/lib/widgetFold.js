// Folding duplicate widgets into the one that does the job (v0.280.0).
//
// A folded id keeps working on every board that already holds it: the
// placed widget stays at its spot with its settings, and renders the KEPT
// widget instead. The board itself is never rewritten — the instance keeps
// its old widgetId, so an older app version still shows the original.
// Folded ids are hidden from the add-widget list, so it offers one widget
// per job.
//
// `mapSettings(saved)` translates the old widget's settings into the kept
// widget's options (e.g. a "Setup & tour" tile → page buttons showing just
// the guide). Anything the person sets later in the options sheet is
// stored on the instance and wins over the translation. `extra` overrides
// parts of the kept definition that must stay as the old widget had them
// (e.g. one-per-page).

export function foldWidget(kept, mapSettings, extra = null) {
  if (!kept) return null;
  return {
    ...kept,
    ...extra,
    hiddenFromDrawer: true,
    foldSettings: (saved = {}) => ({ ...(mapSettings ? mapSettings(saved) : null), ...saved }),
  };
}

// The settings a widget actually renders with — its saved settings, run
// through its fold when it has one, over the old defaults an instance
// placed before a default changed keeps (pastDefaults, below).
export function foldedSettings(def, saved, instanceId) {
  const s = saved || {};
  const folded = typeof def?.foldSettings === "function" ? def.foldSettings(s) : s;
  const past = pastDefaultsFor(def, instanceId);
  return past ? { ...past, ...folded } : folded;
}

// ── Keeping placed widgets as they were (v0.327.0) ─────────────────────
// When an update changes what a widget shows by default, the widgets
// people ALREADY placed must keep looking the way they did — only new
// copies get the new default (owner: "new widget updates shouldn't mess
// up people's setups"). A definition lists those changes as
//   pastDefaults: [{ before: <ms the change shipped>, settings: { … } }]
// and every instance placed before `before` reads `settings` for any key
// it never set itself. Nothing is written to the board, so an older app
// version and a later "Reset" both still work.

// When a placed widget was added, from its instance id ("w_<time36>_…"),
// or null when the id doesn't say.
export function instanceCreatedAt(instanceId) {
  const m = /^w_([0-9a-z]+)_/.exec(typeof instanceId === "string" ? instanceId : "");
  if (!m) return null;
  const t = parseInt(m[1], 36);
  return t > 1.5e12 && t < 4e12 ? t : null;
}

// The old defaults this instance keeps. Profile seeds are drawn by the
// current code every open, so they take today's defaults; any other id
// that doesn't carry a time is treated as old (keeping what it showed is
// the safe side).
export function pastDefaultsFor(def, instanceId) {
  const list = Array.isArray(def?.pastDefaults) ? def.pastDefaults : null;
  if (!list || !instanceId || String(instanceId).startsWith("seed_")) return null;
  const born = instanceCreatedAt(instanceId);
  let out = null;
  for (const p of list) {
    if (born == null || born < p.before) out = { ...(out || {}), ...p.settings };
  }
  return out;
}
