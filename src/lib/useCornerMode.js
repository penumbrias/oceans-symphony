import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// User-configurable corner style. Persisted on
// SystemSettings.corner_mode ("rounded" | "sharp"). The applier
// sets a data-corner-mode attribute on <html>; index.css carries
// the override that zeroes every Tailwind rounded-* utility when
// the attribute is "sharp" (.rounded-full intentionally exempted
// so avatars stay round).
//
// Shares the existing ["systemSettings"] react-query cache with
// useTerms / useAccessibility / useAlterLabel — no extra fetch.

export const CORNER_MODES = Object.freeze({ ROUNDED: "rounded", SHARP: "sharp" });
export const DEFAULT_CORNER_MODE = CORNER_MODES.ROUNDED;

export function useCornerMode() {
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const raw = list?.[0]?.corner_mode;
  return raw === CORNER_MODES.SHARP ? CORNER_MODES.SHARP : DEFAULT_CORNER_MODE;
}

// Mount once near the top of the app tree. It applies / removes
// the data-corner-mode attribute on <html> as the user flips the
// toggle. No-op render — just a side effect.
export function CornerModeApplier() {
  const mode = useCornerMode();
  useEffect(() => {
    const el = document.documentElement;
    if (mode === CORNER_MODES.SHARP) el.setAttribute("data-corner-mode", "sharp");
    else el.removeAttribute("data-corner-mode");
    return () => {
      // Don't aggressively clear on unmount — leave the attribute
      // intact for the rest of the document. The next render will
      // re-apply if needed.
    };
  }, [mode]);
  return null;
}
