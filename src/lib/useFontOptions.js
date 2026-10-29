// Every font the user can choose, in one place: the built-in catalogue
// PLUS their own uploaded fonts (CustomFont). Owner rule — anywhere a
// font can be set, the user's own fonts must be offered too, not just in
// the Appearance page where they upload them.
//
// Rides the ["customFonts"] query cache, so extra consumers cost nothing.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { APP_FONT_OPTIONS, EXTRA_FONT_OPTIONS } from "@/lib/useAccessibility";
import { customFontFamilyCss } from "@/lib/customFontFaces";
import { isExtraFontsInstalled, FONT_PACK_CHANGED_EVENT } from "@/lib/fontPacks";

// Whether the optional extra-font pack (fontPacks.js) is installed; follows
// the install / remove row in Display options → Text.
export function useExtraFontsInstalled() {
  const [on, setOn] = useState(() => isExtraFontsInstalled());
  useEffect(() => {
    const refresh = () => setOn(isExtraFontsInstalled());
    window.addEventListener(FONT_PACK_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(FONT_PACK_CHANGED_EVENT, refresh);
  }, []);
  return on;
}

export function useFontOptions({ includeInherit = true, inheritLabel = "Use the app font" } = {}) {
  const { data: customFonts = [] } = useQuery({
    queryKey: ["customFonts"],
    queryFn: () => base44.entities.CustomFont.list(),
  });
  const extra = useExtraFontsInstalled();
  return useMemo(() => [
    ...(includeInherit ? [{ id: "", label: inheritLabel }] : []),
    ...APP_FONT_OPTIONS.map((f) => ({ id: f.value, label: f.label })),
    // The downloaded pack (14 decorative fonts) joins the list once installed.
    ...(extra ? EXTRA_FONT_OPTIONS.map((f) => ({ id: f.value, label: f.label })) : []),
    ...customFonts.map((f) => ({
      id: customFontFamilyCss(f.id),
      label: `${f.display_name} · yours`,
    })),
  ], [customFonts, includeInherit, inheritLabel, extra]);
}
