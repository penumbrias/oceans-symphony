// Every font the user can choose, in one place: the built-in catalogue
// PLUS their own uploaded fonts (CustomFont). Owner rule — anywhere a
// font can be set, the user's own fonts must be offered too, not just in
// the Appearance page where they upload them.
//
// Rides the ["customFonts"] query cache, so extra consumers cost nothing.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { APP_FONT_OPTIONS } from "@/lib/useAccessibility";
import { customFontFamilyCss } from "@/lib/customFontFaces";

export function useFontOptions({ includeInherit = true, inheritLabel = "Use the app font" } = {}) {
  const { data: customFonts = [] } = useQuery({
    queryKey: ["customFonts"],
    queryFn: () => base44.entities.CustomFont.list(),
  });
  return useMemo(() => [
    ...(includeInherit ? [{ id: "", label: inheritLabel }] : []),
    ...APP_FONT_OPTIONS.map((f) => ({ id: f.value, label: f.label })),
    ...customFonts.map((f) => ({
      id: customFontFamilyCss(f.id),
      label: `${f.display_name} · yours`,
    })),
  ], [customFonts, includeInherit, inheritLabel]);
}
