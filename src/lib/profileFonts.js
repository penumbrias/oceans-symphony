// Font options for alter / group profile customization (header + body).
//
// These are the SAME font families offered in Settings → Appearance, so a
// profile's font choice matches what the rest of the app uses. The source of
// truth is APP_FONT_OPTIONS (+ EXTRA_FONT_OPTIONS) in useAccessibility — all
// bundled locally (no Google Fonts / network fetch), keeping the app
// local-first and identical offline + in the native build.
//
// Each profile stores the chosen CSS font-family stack directly in its
// `custom_fields` (`_header_font` / `_page_font`); the renderer applies it via
// `fontStackFor(value)`. An empty value ("") means "inherit the app default"
// — the default for every profile, so existing profiles are unaffected.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { APP_FONT_OPTIONS, EXTRA_FONT_OPTIONS } from "@/lib/useAccessibility";
import { customFontFamilyCss } from "@/lib/customFontFaces";

export const PROFILE_FONTS = [
  { id: "", label: "Default", stack: "" },
  ...[...APP_FONT_OPTIONS, ...EXTRA_FONT_OPTIONS].map((f) => ({
    id: f.value,        // the CSS font-family stack IS the stored value
    label: f.label,
    stack: f.value,
  })),
];

// PROFILE_FONTS + the user's uploaded fonts (Settings → Appearance → font
// upload). Uploaded fonts store the same thing built-ins do — a CSS
// font-family stack (`customFontFamilyCss(id)`) — and their @font-face rules
// are injected app-wide by customFontFaces.js, so profile pages render them
// with no extra plumbing. `isUpload` lets pickers group them separately.
// Reuses the shared ["customFonts"] query cache (same key as Appearance).
export function useProfileFonts() {
  const { data: customFonts = [] } = useQuery({
    queryKey: ["customFonts"],
    queryFn: () => base44.entities.CustomFont.list(),
  });
  return useMemo(() => [
    ...PROFILE_FONTS,
    ...customFonts.map((f) => ({
      id: customFontFamilyCss(f.id),
      label: f.name || "Uploaded font",
      stack: customFontFamilyCss(f.id),
      isUpload: true,
    })),
  ], [customFonts]);
}

const _byId = Object.fromEntries(PROFILE_FONTS.map((f) => [f.id, f]));

// Legacy ids from the first cut of this feature (before it matched the
// Settings font list) — map them so anything saved during that window still
// resolves to a real stack instead of breaking.
const LEGACY = {
  sans: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
  mono: "ui-monospace, Menlo, Consolas, monospace",
  rounded: "'Nunito', ui-rounded, system-ui, sans-serif",
  slab: "'Roboto Slab', 'Rockwell', Georgia, serif",
  condensed: "'Roboto Condensed', 'Arial Narrow', sans-serif",
  handwritten: "'Patrick Hand', 'Segoe Script', cursive",
};

// Resolve a stored font value to a CSS font-family stack. The stored value is
// already a stack for new picks; legacy short ids are mapped; "" / unknown →
// "" so callers can do `style={{ fontFamily: stack || undefined }}`.
export function fontStackFor(value) {
  if (!value) return "";
  return LEGACY[value] || value;
}

// Human label for a stored value (used in pickers / previews).
export function fontLabelFor(value) {
  return _byId[value]?.label || "Default";
}
