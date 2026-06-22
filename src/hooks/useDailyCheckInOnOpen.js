import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getTodayString, getPeriodKey, resolveAutoTriggers } from "@/lib/dailyTaskSystem";

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
        const pointsFor = (id) => checkInTemplates.find((t) => t.id === id)?.points || 0;

        const progress = await base44.entities.DailyProgress.list().catch(() => []);
        if (cancelled) return;
        const rec = (progress || []).find(
          (p) => (p.frequency === "daily" || !p.frequency) && (p.period_key === periodKey || p.date === today),
        );

        if (rec) {
          const stored = new Set(rec.completed_task_ids || []);
          const missing = ids.filter((id) => !stored.has(id));
          if (!missing.length) return; // already credited today
          await base44.entities.DailyProgress.update(rec.id, {
            completed_task_ids: [...stored, ...missing],
            xp_earned: (rec.xp_earned || 0) + missing.reduce((s, id) => s + pointsFor(id), 0),
          });
        } else {
          await base44.entities.DailyProgress.create({
            date: today,
            period_key: periodKey,
            frequency: "daily",
            completed_task_ids: ids,
            xp_earned: ids.reduce((s, id) => s + pointsFor(id), 0),
          });
        }
        if (!cancelled) queryClient.invalidateQueries({ queryKey: ["dailyProgress"] });
      } catch {
        /* non-fatal — Daily Tasks page visit still credits the check-in */
      }
    })();
    return () => { cancelled = true; };
  }, []); // once per app open
}
