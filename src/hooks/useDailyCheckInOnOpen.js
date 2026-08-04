import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getTodayString, getPeriodKey, resolveAutoTriggers, toggleDailyProgressTasks } from "@/lib/dailyTaskSystem";

// Credit the "App opened" daily check-in (preset AUTO task with the `check_in`
// trigger) the moment the app opens — not only when the Daily Tasks PAGE is
// first viewed. Previously the check-in task only "cleared" once you navigated
// to Daily Tasks, because that page was the only place that persisted the
// always-true `check_in` trigger into today's DailyProgress.
//
// Idempotent and best-effort: it only writes when today's check-in isn't
// already recorded, and silently no-ops on any error (the page-visit path still
// credits it as a fallback). Mounted once from AppLayout, so it runs per app
// open. Other auto-triggers (journal, etc.) intentionally stay page-derived —
// only the app-open check-in moves earlier.
export function useDailyCheckInOnOpen() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const today = getTodayString();
        const periodKey = getPeriodKey("daily");
        const templates = await base44.entities.DailyTaskTemplate.list().catch(() => []);
        const checkInTemplates = (templates || []).filter(
          (t) =>
            t.is_active &&
            (t.frequency || "daily") === "daily" &&
            t.mode === "AUTO" &&
            resolveAutoTriggers(t).ids.includes("check_in"),
        );
        if (cancelled || !checkInTemplates.length) return;
        const ids = checkInTemplates.map((t) => t.id);
        if (cancelled) return;
        // Shared writer: idempotent set-union + XP recompute over the full
        // daily template list, so re-running on every open can't
        // double-credit or drift.
        await toggleDailyProgressTasks({
          periodKey,
          dateKey: today,
          frequency: "daily",
          setIds: ids,
          templates: (templates || []).filter((t) => t.is_active && (t.frequency || "daily") === "daily"),
        });
        if (!cancelled) queryClient.invalidateQueries({ queryKey: ["dailyProgress"] });
      } catch {
        /* non-fatal — Daily Tasks page visit still credits the check-in */
      }
    })();
    return () => { cancelled = true; };
  }, []); // once per app open
}
