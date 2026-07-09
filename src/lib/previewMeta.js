// Preview Mode METADATA — deliberately tiny and dependency-free.
//
// The actual example content (previewWiki.js's ~40 walkthrough bios +
// previewSystems.js's dataset generators) is hundreds of KB of strings and
// code that most sessions never use. Everything that must render on normal
// boots (the Settings card, the top banner) reads only this file; the heavy
// builders are pulled in via dynamic import() in previewMode.js the moment
// Preview Mode is actually entered or restored — so they live in their own
// lazy chunk and never bloat the main bundle.
//
// If you add a field the Settings card / banner needs, add it HERE (not on
// the previewSystems entry) — anything imported statically from
// previewSystems.js drags the whole example content back into the bundle.

// Version the walkthrough bios were last actually refreshed for. The banner
// compares this to APP_VERSION and honestly flags staleness. CRITICAL: bump
// ONLY when the wiki bios in previewWiki.js are genuinely updated — never
// auto-bump alongside APP_VERSION (that re-creates the "banner claims fresh
// while bios drift months behind" bug).
export const WIKI_CONTENT_VERSION = "0.82.1";

// Registry metadata — one guided example. `wiki: true` keeps the banner's
// "walkthrough up to date with vX.Y.Z" tag, since the alter profiles ARE the
// walkthrough. The matching heavy entry (with `build`) is in previewSystems.js
// under the same key.
export const PREVIEW_SYSTEMS_META = [
  {
    key: "guide",
    wiki: true,
    name: "Preview Mode",
    blurb: "An example system where every profile is a walkthrough of a feature — and the whole app is filled with realistic example data so you can actually try things. Many profiles double as design showcases that flex what the alter bio editor can produce (animation, gradients, custom fields, per-alter themes); a few stay deliberately minimal to show the range. Your real data is hidden but never touched while Preview Mode is on.",
    termsLabel: "system / alter / fronting / switching",
    theme: "cool",
    font:  "'Atkinson Hyperlegible', sans-serif",
    themeMode: null,
  },
];

export function getPreviewSystemMeta(key) {
  return PREVIEW_SYSTEMS_META.find((s) => s.key === key) || null;
}
