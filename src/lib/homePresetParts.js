// Home-board preset parts: LAYOUT (widgets & arrangement) vs LOOK
// (background / wallpaper / widget style), captured and applied
// INDEPENDENTLY. (v0.186.0)
//
// A user built a home layout under one theme, made a second theme for
// another headmate, and "lost the layout" — because a preset carried the
// whole ui_v2_home (widgets AND background) as one blob, so applying the
// second theme replaced the board wholesale. Their wish is exactly the
// split below: keep ONE layout, let each theme bring its own background.
//
// AdvancedAppearanceNew + UiEditSheet (manual apply) and AppLayout (apply
// on fronter change) MUST go through applyHomePresetToBoard so they can't
// diverge. Legacy presets that carry a full `uiV2Home` still apply whole
// (unchanged behaviour), so nothing already saved breaks.

// Keys of ui_v2_home that are the board's LOOK. Everything else is layout.
export const HOME_LOOK_KEYS = ["styleMode", "wallpaper", "background"];

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}
function omit(obj, keys) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (!keys.includes(k)) out[k] = v;
  return out;
}

// What the SAVE form puts on the preset for each part.
export function captureHomeLayout(board) {
  return board && typeof board === "object" ? omit(board, HOME_LOOK_KEYS) : null;
}
export function captureHomeLook(board) {
  return board && typeof board === "object" ? pick(board, HOME_LOOK_KEYS) : null;
}

// Merge a preset's home parts onto the CURRENT board and return the next
// board — or null when the preset says nothing about the home board.
//   preset.uiV2Home       → legacy: the whole board (replace, as before)
//   preset.uiV2HomeLayout → layout keys only, current look kept
//   preset.uiV2HomeLook   → look keys only, current layout kept
// When both new parts are present they compose. `current` may be undefined
// on a fresh install; the result is still well-formed.
export function applyHomePresetToBoard(rawPreset, current, { wide = isWideScreen() } = {}) {
  if (!rawPreset || typeof rawPreset !== "object") return null;
  const preset = presetBoardParts(rawPreset, wide);
  const cur = current && typeof current === "object" ? current : {};
  if (preset.uiV2Home && typeof preset.uiV2Home === "object") return preset.uiV2Home;
  let next = null;
  if (preset.uiV2HomeLayout && typeof preset.uiV2HomeLayout === "object") {
    next = { ...cur, ...preset.uiV2HomeLayout, ...pick(cur, HOME_LOOK_KEYS) };
  }
  if (preset.uiV2HomeLook && typeof preset.uiV2HomeLook === "object") {
    next = { ...(next || cur), ...preset.uiV2HomeLook };
  }
  return next;
}
// One board per device (v0.248.0): presets saved before then may carry a
// separate desktop board (uiV2HomeDesktop*). On a wide screen those desktop
// parts are what the person was looking at when they saved, so they win;
// on a phone the phone parts do. Returns a preset with only the main keys.
export function presetBoardParts(preset, wide) {
  if (!preset || typeof preset !== "object") return preset;
  const hasDesk = preset.uiV2HomeDesktop || preset.uiV2HomeDesktopLayout || preset.uiV2HomeDesktopLook;
  if (!wide || !hasDesk) return preset;
  return {
    ...preset,
    uiV2Home: preset.uiV2HomeDesktop || null,
    uiV2HomeLayout: preset.uiV2HomeDesktopLayout || (preset.uiV2HomeDesktop ? null : preset.uiV2HomeLayout),
    uiV2HomeLook: preset.uiV2HomeDesktopLook || (preset.uiV2HomeDesktop ? null : preset.uiV2HomeLook),
  };
}

export const isWideScreen = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 1024px)").matches;
