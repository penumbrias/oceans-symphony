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
// Both AdvancedAppearanceNew (manual apply) and AppLayout (apply on
// fronter change) MUST go through applyHomePresetToBoard so they can't
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
export function applyHomePresetToBoard(preset, current) {
  if (!preset || typeof preset !== "object") return null;
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
// Same for the desktop board field.
export function applyHomePresetToDesktopBoard(preset, current) {
  if (!preset || typeof preset !== "object") return null;
  const cur = current && typeof current === "object" ? current : {};
  if (preset.uiV2HomeDesktop && typeof preset.uiV2HomeDesktop === "object") return preset.uiV2HomeDesktop;
  let next = null;
  if (preset.uiV2HomeDesktopLayout && typeof preset.uiV2HomeDesktopLayout === "object") {
    next = { ...cur, ...preset.uiV2HomeDesktopLayout, ...pick(cur, HOME_LOOK_KEYS) };
  }
  if (preset.uiV2HomeDesktopLook && typeof preset.uiV2HomeDesktopLook === "object") {
    next = { ...(next || cur), ...preset.uiV2HomeDesktopLook };
  }
  return next;
}
