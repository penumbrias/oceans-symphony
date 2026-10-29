// Today's recurring tasks, as compact rows a plans widget can show under
// its plans (v0.319.0, owner ask: the plans widgets must show AND allow
// entry for recurring tasks of every kind, not only one-off plans).
//
// One tap does the thing: a once task ticks (toggleTemplateDone, the one
// writer), a target / tally task adds one (the same TaskCountChip the
// home widgets use), a steps task opens its checklist on the Tasks page.
// Auto tasks tick themselves, so they are left to the Recurring tasks
// widget — these rows are the ones a person enters.
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Circle, Repeat } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import {
  applyTerms, isTaskDueOn, isTemplateDoneNow, toggleTemplateDone, FREQUENCY_LABELS,
} from "@/lib/dailyTaskSystem";
import { isCountedTask } from "@/lib/taskCounts";
import { TaskCountChip, useTaskTicks } from "@/components/tasks/TaskCountControls";

const ALL_FREQS = ["daily", "weekly", "monthly", "yearly"];

// The rows a surface needs: templates due today (all frequencies), done
// ones last. Shared by the hook below and the classic panel's gate.
export function useRecurringTasksDue({ frequencies = ALL_FREQS } = {}) {
  const { data: templates = [] } = useQuery({ queryKey: ["dailyTaskTemplates"], queryFn: () => base44.entities.DailyTaskTemplate.list() });
  const { data: progress = [] } = useQuery({ queryKey: ["dailyProgress"], queryFn: () => base44.entities.DailyProgress.list() });
  const ticks = useTaskTicks();
  const rows = useMemo(() => {
    const due = templates
      .filter((t) => t.is_active !== false && t.mode !== "AUTO" && frequencies.includes(t.frequency || "daily") && isTaskDueOn(t))
      .map((t) => ({ template: t, done: isTemplateDoneNow(t, progress) }));
    due.sort((a, b) => (a.done === b.done ? ((a.template.sort_order ?? 0) - (b.template.sort_order ?? 0)) : (a.done ? 1 : -1)));
    return due;
  }, [templates, progress, frequencies]);
  return { rows, templates, ticks };
}

export default function RecurringTasksDue({ frequencies = ALL_FREQS, limit = 0, compact = false, heading = "Recurring" }) {
  const terms = useTerms();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { rows, templates, ticks } = useRecurringTasksDue({ frequencies });
  const [busy, setBusy] = useState(null);
  if (!rows.length) return null;
  const shown = limit > 0 ? rows.slice(0, limit) : rows;
  const multi = new Set(shown.map((r) => r.template.frequency || "daily")).size > 1;

  const tick = async (t) => {
    setBusy(t.id);
    try {
      const nowDone = await toggleTemplateDone(t, { templates });
      qc.invalidateQueries({ queryKey: ["dailyProgress"] });
      if (nowDone) toast.success(`${applyTerms(t.title || "", terms)} done! 🎉`);
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally { setBusy(null); }
  };

  return (
    <div className={compact ? "" : "mt-2"}>
      {heading && (
        <p className="text-[0.625em] font-semibold uppercase tracking-wide text-muted-foreground pt-1 pb-0.5 flex items-center gap-1">
          <Repeat className="w-3 h-3" /> {heading}
        </p>
      )}
      {shown.map(({ template: t, done }) => {
        const counted = isCountedTask(t);
        const title = applyTerms(t.title || "", terms);
        return (
          <div key={t.id} className="flex items-center gap-2 py-1 min-h-[32px]">
            <button type="button" onClick={() => tick(t)} disabled={busy === t.id || counted}
              aria-label={done ? `Mark ${title} not done` : `Mark ${title} done`} aria-pressed={done}
              className={`flex-shrink-0 ${counted ? "cursor-default" : ""} disabled:opacity-60`}>
              {done
                ? <CheckCircle2 className="w-4 h-4" style={{ color: "var(--v2-accent, hsl(var(--primary)))" }} />
                : <Circle className="w-4 h-4 text-muted-foreground" />}
            </button>
            <button type="button" onClick={() => navigate("/tasks")} className="flex-1 min-w-0 text-left">
              <span className={`text-sm block truncate ${done ? "line-through opacity-60" : ""}`}>{title}</span>
              {multi && (
                <span className="text-[0.625em] text-muted-foreground block">{FREQUENCY_LABELS?.[t.frequency || "daily"] || t.frequency}</span>
              )}
            </button>
            {counted && <TaskCountChip task={t} ticks={ticks} />}
          </div>
        );
      })}
    </div>
  );
}
