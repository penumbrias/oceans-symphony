// Today's recurring tasks, as compact rows a plans widget can show under
// its plans (v0.319.0, owner ask: the plans widgets must show AND allow
// entry for recurring tasks of every kind, not only one-off plans).
//
// One tap does the thing: a once task ticks (toggleTemplateDone, the one
// writer), a target / tally task adds one (addTaskCount), a steps task
// opens its checklist on the Tasks page. Auto tasks tick themselves, so
// the list leaves them to the Recurring tasks widget — these rows are the
// ones a person enters. `RecurringTaskRow` is THE recurring-task row: the
// Recurring tasks widget renders the same one.
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Circle, Repeat } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useT } from "@/lib/i18n";
import {
  applyTerms, isTaskDueOn, isTemplateDoneNow, toggleTemplateDone, FREQUENCY_LABELS,
} from "@/lib/dailyTaskSystem";
import { isCountedTask, taskCountConfig, addTaskCount, TASK_TICKS_QUERY_KEY } from "@/lib/taskCounts";
import { TaskCountChip, useTaskTicks } from "@/components/tasks/TaskCountControls";
import { Row } from "@/v2/primitives";

const ALL_FREQS = ["daily", "weekly", "monthly", "yearly"];

// The rows a surface needs: templates due today (all frequencies), done
// ones last. Shared by the list below and the classic panel's gate.
export function useRecurringTasksDue({ frequencies = ALL_FREQS, enabled = true } = {}) {
  const { data: templates = [] } = useQuery({ queryKey: ["dailyTaskTemplates"], queryFn: () => base44.entities.DailyTaskTemplate.list(), enabled });
  const { data: progress = [] } = useQuery({ queryKey: ["dailyProgress"], queryFn: () => base44.entities.DailyProgress.list(), enabled });
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

// One recurring task as a widget row: the tick (or +1 / steps door) on
// the left, the title, an optional qualifier and right-hand value, and
// the row itself opening wherever the host says (`onOpen`).
export function RecurringTaskRow({ task: t, done, ticks, templates, secondary, right, onOpen }) {
  const terms = useTerms();
  const tr = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const counted = isCountedTask(t);
  const title = applyTerms(t.title || "", terms);

  const act = async (e) => {
    e?.stopPropagation?.();
    // Auto tasks tick themselves off when the thing they track happens —
    // ticking one by hand would lie about what was done.
    if (t.mode === "AUTO") { toast.info(tr("widget.recurring.autoInfo")); return; }
    if (counted && taskCountConfig(t).mode === "steps") { navigate("/tasks"); return; }
    setBusy(true);
    try {
      let nowDone;
      if (counted) {
        nowDone = (await addTaskCount(t, { templates })).becameDone;
        qc.invalidateQueries({ queryKey: TASK_TICKS_QUERY_KEY });
      } else {
        nowDone = await toggleTemplateDone(t, { templates });
      }
      qc.invalidateQueries({ queryKey: ["dailyProgress"] });
      if (nowDone) toast.success(tr("widget.recurring.done", { title }));
    } catch (e2) {
      toast.error(e2?.message || tr("widget.recurring.saveFailed"));
    } finally { setBusy(false); }
  };

  const tickLabel = counted ? tr("widget.recurring.addOne") : (done ? tr("widget.recurring.markNotDone", { title }) : tr("widget.recurring.markDone", { title }));
  return (
    <Row
      left={
        <button type="button" onClick={act} disabled={busy} aria-label={tickLabel} aria-pressed={counted ? undefined : done}
          className="flex-shrink-0 disabled:opacity-50">
          {done
            ? <CheckCircle2 className="w-4 h-4" style={{ color: "var(--v2-accent, hsl(var(--primary)))" }} />
            : <Circle className="w-4 h-4 text-muted-foreground" />}
        </button>
      }
      primary={<span className={done ? "line-through opacity-60" : undefined}>{title}</span>}
      secondary={secondary}
      right={right !== undefined ? right : (counted ? <TaskCountChip task={t} ticks={ticks} /> : undefined)}
      onClick={onOpen}
    />
  );
}

export default function RecurringTasksDue({ frequencies = ALL_FREQS, limit = 0, compact = false, heading }) {
  const tr = useT();
  const navigate = useNavigate();
  const { rows, templates, ticks } = useRecurringTasksDue({ frequencies });
  if (!rows.length) return null;
  const shown = limit > 0 ? rows.slice(0, limit) : rows;
  const multi = new Set(shown.map((r) => r.template.frequency || "daily")).size > 1;
  const head = heading === undefined ? tr("widget.recurring.heading") : heading;

  return (
    <div className={compact ? "" : "mt-2"}>
      {head && (
        <p className="text-[0.625em] font-semibold uppercase tracking-wide text-muted-foreground pt-1 pb-0.5 flex items-center gap-1">
          <Repeat className="w-3 h-3" /> {head}
        </p>
      )}
      {shown.map(({ template: t, done }) => (
        <RecurringTaskRow key={t.id} task={t} done={done} ticks={ticks} templates={templates}
          secondary={multi ? (FREQUENCY_LABELS?.[t.frequency || "daily"] || t.frequency) : undefined}
          onOpen={() => navigate("/tasks")} />
      ))}
    </div>
  );
}
