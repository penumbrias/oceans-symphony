import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { mergeTriggerCategories } from "@/lib/triggerCategories";

// Built-in trigger categories + the person's own TriggerType rows.
export function useTriggerCategories({ enabled = true } = {}) {
  const { data: customTypes = [] } = useQuery({
    queryKey: ["customTriggerTypes"],
    queryFn: () => base44.entities.TriggerType.list(),
    enabled,
  });
  return useMemo(() => mergeTriggerCategories(customTypes), [customTypes]);
}
