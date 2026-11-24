// The new house's scales (step 1.1), as plain values for code that needs a
// number: tests, the sample page, a canvas or SVG that can't read CSS.
// tokens.css carries the same values as custom properties under
// [data-house]; this file and that one must agree (scripts/test-house-tokens.mjs
// checks it). The rules behind every number are in docs/house/building-code.md
// §7 (type, spacing, heights), §8 (icons) and §5 (the 1.3× frame cap).
//
// Text is always rem (or em inside a widget), never px, so the person's
// text size (html.a11y-text-*, 50%–200%) reaches every word.

// Six type steps, two roles (building code §7). `px` is the size at 100%.
export const TYPE_SCALE = Object.freeze([
  { token: "text-xs", rem: 0.75, px: 12, lineHeight: 1.4, role: "body", use: "Captions, status bar, time stamps. The floor" },
  { token: "text-sm", rem: 0.875, px: 14, lineHeight: 1.4, role: "label", use: "Labels, buttons, tabs, panel header strips, row subtitles" },
  { token: "text-md", rem: 1, px: 16, lineHeight: 1.5, role: "body", use: "Body text, row titles, every field" },
  { token: "text-lg", rem: 1.125, px: 18, lineHeight: 1.35, role: "label", use: "Section titles, the phone header title" },
  { token: "text-xl", rem: 1.375, px: 22, lineHeight: 1.3, role: "label", use: "Page titles on the desktop canvas" },
  { token: "text-2xl", rem: 1.75, px: 28, lineHeight: 1.2, role: "body", use: "The Now headline, stat numbers" },
]);

// The smallest size text may have at 100% text size.
export const TEXT_FLOOR_PX = 12;

// Spacing on a 4 px base.
export const SPACE_SCALE = Object.freeze([
  { token: "space-1", rem: 0.25, px: 4, use: "Icon to label" },
  { token: "space-2", rem: 0.5, px: 8, use: "Between chips and buttons in a group" },
  { token: "space-3", rem: 0.75, px: 12, use: "Panel padding; gap between small-look chips" },
  { token: "space-4", rem: 1, px: 16, use: "Phone side gutter, between sections" },
  { token: "space-5", rem: 1.5, px: 24, use: "Between panels' content blocks" },
  { token: "space-6", rem: 2, px: 32, use: "Empty-state padding" },
  { token: "space-7", rem: 3, px: 48, use: "Page-level breathing room on desktop" },
]);

// Heights: max(px, rem), so a smaller text setting never shrinks a target
// below its floor and a larger one grows it.
export const HEIGHT_SCALE = Object.freeze([
  { token: "h-status", rem: 2, px: 32, use: "Desktop status bar at rest (full studio, mouse only)" },
  { token: "h-control", rem: 2.75, px: 44, use: "Buttons, fields, chips, tabs, icon buttons, frame bars, compact rows" },
  { token: "h-row", rem: 3, px: 48, use: "Single-line list rows" },
  { token: "h-row-2", rem: 3.5, px: 56, use: "Two-line rows, phone header, bottom bar" },
  { token: "h-row-3", rem: 4.5, px: 72, use: "Avatar rows, tile minimum" },
]);

// The smallest hit area of anything pressable.
export const TARGET_MIN_PX = 44;

// Things that may LOOK smaller than their 44 px hit area (building code §7).
export const SMALL_LOOKS = Object.freeze({ tick: 1.25, chip: 2, radioDot: 0.625 });

// Icon sizes (building code §8): 1 em inline, 1.25 rem in controls,
// 1.5 rem in bars and the rail.
export const ICON_SIZES = Object.freeze({ inline: "1em", control: "1.25rem", bar: "1.5rem" });

// Frame chrome (header, tab and bar labels) follows text size up to 1.3×
// and then stays put (building code §5).
export const FRAME_TEXT_CAP = 1.3;

// Motion. Every duration goes to 0 under prefers-reduced-motion AND under
// the app's own Reduce motion setting (html.a11y-reduce-motion).
export const MOTION = Object.freeze({
  instant: 0,
  fast: 120,
  base: 200,
  slow: 320,
  easeOut: "cubic-bezier(0.2, 0, 0, 1)",
  easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
});

// Contrast floors (building code: finished check 7 and 9).
export const CONTRAST = Object.freeze({ text: 4.5, largeText: 3, part: 3, focus: 3 });

// The focus ring.
export const FOCUS_RING_PX = 2;

// The two looks.
export const HOUSE_LOOKS = Object.freeze(["smooth", "pixel"]);

// The ms a motion token resolves to right now. `reduced` comes from
// prefersReducedMotion() below or the caller.
export function motionMs(name, reduced) {
  if (reduced) return 0;
  const v = MOTION[name];
  return typeof v === "number" ? v : 0;
}

// True when either the OS or the app's own setting asks for less motion.
// Never throws (no window in tests).
export function prefersReducedMotion() {
  try {
    if (document.documentElement.classList.contains("a11y-reduce-motion")) return true;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// A frame label's size at a given text scale (1 = 100%), in px: it follows
// the scale up to FRAME_TEXT_CAP and stays there.
export function frameTextPx(basePx, textScale) {
  const s = Number.isFinite(textScale) && textScale > 0 ? textScale : 1;
  return basePx * Math.min(s, FRAME_TEXT_CAP);
}
