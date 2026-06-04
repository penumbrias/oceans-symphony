// Curated font options for alter / group profile customization (header + body).
//
// These are deliberately *system-safe font stacks* — no Google Fonts, no
// network fetch — because the app is local-first and must render identically
// offline and inside the native build. Each profile stores only the small
// `id` string in its `custom_fields` (`_header_font` / `_page_font`); the
// renderer resolves it to a CSS font-family stack via `fontStackFor(id)`.
//
// An empty id ("") means "inherit the app's default font" — that's the
// default for every profile, so existing alters are unaffected.

export const PROFILE_FONTS = [
  { id: "", label: "Default", stack: "" },
  { id: "sans", label: "Sans-serif", stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { id: "serif", label: "Serif", stack: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif" },
  { id: "mono", label: "Monospace", stack: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace" },
  { id: "rounded", label: "Rounded", stack: "ui-rounded, 'Nunito', 'Segoe UI', system-ui, sans-serif" },
  { id: "slab", label: "Slab serif", stack: "'Rockwell', 'Roboto Slab', 'Courier New', Georgia, serif" },
  { id: "condensed", label: "Condensed", stack: "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', sans-serif" },
  { id: "handwritten", label: "Handwritten", stack: "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive" },
];

const _byId = Object.fromEntries(PROFILE_FONTS.map((f) => [f.id, f]));

// Resolve a stored font id to a CSS font-family stack. Returns "" for the
// default / unknown ids so callers can do `style={{ fontFamily: stack || undefined }}`.
export function fontStackFor(id) {
  if (!id) return "";
  return _byId[id]?.stack || "";
}

// Human label for a stored id (used in pickers / previews).
export function fontLabelFor(id) {
  return _byId[id]?.label || "Default";
}
