// Renamable emotion root categories (Phase B2). The wheel's four roots
// (good / bad / neutral / body) keep their STRUCTURE — the owner decided
// against user-defined roots — but their display names are user-renamable
// ("Good" → "Positive", etc.) via SystemSettings.emotion_category_names.
//
// The override applies wherever a root label renders (wheel valence
// buttons, drill-down headers, the settings distress groups) AND to the
// label string logged when a valence itself is tapped as a mood — so what
// the user sees is what gets saved. Historical entries keep whatever label
// was current when they were logged (colorFor falls back gracefully).

import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export const EMOTION_CATEGORY_KEYS = ["good", "bad", "neutral", "body"];

export const DEFAULT_CATEGORY_LABELS = {
  good: "Good",
  bad: "Bad",
  neutral: "Neutral",
  body: "Body & Nervous System",
};

// Pure resolver — settings row in, labels out (always complete).
export function resolveCategoryLabels(settingsRow) {
  const overrides = settingsRow?.emotion_category_names || {};
  const out = {};
  for (const key of EMOTION_CATEGORY_KEYS) {
    const v = typeof overrides[key] === "string" ? overrides[key].trim() : "";
    out[key] = v || DEFAULT_CATEGORY_LABELS[key];
  }
  return out;
}

// Hook — shares the ["systemSettings"] cache with useTerms/useAccessibility,
// so no extra fetch per consumer.
export function useEmotionCategoryLabels() {
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
    staleTime: 0,
  });
  return resolveCategoryLabels(settingsList[0]);
}
