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
// through its fold when it has one.
export function foldedSettings(def, saved) {
  const s = saved || {};
  return typeof def?.foldSettings === "function" ? def.foldSettings(s) : s;
}
