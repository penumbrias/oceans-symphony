import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { formatAlterLabel, DEFAULT_ALTER_LABEL_MODE, isAlterLabelMode } from "@/lib/alterLabel";

// Re-uses the existing systemSettings query so it shares cache with
// useTerms / useAccessibility — no extra fetch per consumer.
export function useAlterLabelMode() {
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const raw = list?.[0]?.alter_label_mode;
  return isAlterLabelMode(raw) ? raw : DEFAULT_ALTER_LABEL_MODE;
}

// Memoised formatter — components can drop it into render without
// recomputing the closure on every render.
export function useAlterLabel() {
  const mode = useAlterLabelMode();
  return useCallback((alter) => formatAlterLabel(alter, mode), [mode]);
}
