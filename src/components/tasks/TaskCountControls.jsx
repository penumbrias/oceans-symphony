// The −/+ counter and the steps checklist for a counted recurring task
// (taskCounts.js). Used by the Daily Tasks page card; the compact form
// (just the "+1" / progress chip) is used by the home widgets.

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Minus, Plus, Check, ListChecks } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  TASK_TICKS_QUERY_KEY, taskCountState, addTaskCount, removeTaskCount, toggleTaskStep, countLabel,
} from "@/lib/taskCounts";

export function useTaskTicks() {
  const { data = [] } = useQuery({
    queryKey: TASK_TICKS_QUERY_KEY,
    queryFn: () => base44.entities.TaskTick.list().catch(() => []),
  });
  return data;
}

function useCountActions(task) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      const { becameDone } = await fn();
      qc.invalidateQueries({ queryKey: TASK_TICKS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["dailyProgress"] });
      if (becameDone) {
        toast.success(task.points > 0 ? `+${task.points} XP — ${task.title} done! 🎉` : `${task.title} done! 🎉`);
      }
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    add: () => run(() => addTaskCount(task)),
    remove: () => run(() => removeTaskCount(task)),
    step: (id) => run(() => toggleTaskStep(task, id)),
  };
}

const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

// Right-hand control on the Daily Tasks card: − count +.
export function TaskCounter({ task, ticks }) {
  const state = taskCountState(task, ticks);
  const { busy, add, remove } = useCountActions(task);
  const btn = "w-7 h-7 rounded-full border flex items-center justify-center disabled:opacity-40 transition-colors";
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={stop(remove)} disabled={busy || state.count === 0}
        aria-label={`Take one off ${task.title}`}
        className={`${btn} border-border/60 text-muted-foreground hover:text-foreground`}>
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className={`min-w-[3rem] text-center text-sm font-semibold tabular-nums ${state.complete ? "text-primary" : "text-foreground"}`}
        aria-live="polite">
        {countLabel(state)}
      </span>
      <button type="button" onClick={stop(add)} disabled={busy}
        aria-label={`Add one to ${task.title}`}
        className={`${btn} ${state.complete ? "border-primary/40 text-primary" : "border-primary bg-primary text-primary-foreground"}`}>
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// The checklist under a steps task on the Daily Tasks card.
export function TaskStepList({ task, ticks }) {
  const state = taskCountState(task, ticks);
  const { busy, step } = useCountActions(task);
  return (
    <ul className="mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
      {state.steps.map((s) => {
        const on = state.doneStepIds.has(s.id);
        return (
          <li key={s.id}>
            <button type="button" role="checkbox" aria-checked={on} disabled={busy} onClick={stop(() => step(s.id))}
              className="w-full flex items-center gap-2 text-left text-sm py-1 rounded-lg hover:bg-muted/40 disabled:opacity-60">
              <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                {on && <Check className="w-3 h-3" />}
              </span>
              <span className={on ? "line-through text-muted-foreground" : "text-foreground"}>{s.text}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// Compact control for the home widgets: "+1" with the progress for
// target/tally tasks; a steps task shows its progress and opens the
// Daily Tasks page (a checklist doesn't fit in a widget row).
export function TaskCountChip({ task, ticks, className = "" }) {
  const navigate = useNavigate();
  const state = taskCountState(task, ticks);
  const { busy, add } = useCountActions(task);
  const base = `flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border tabular-nums disabled:opacity-40 ${
    state.complete ? "border-primary/40 text-primary bg-primary/10" : "border-border/60 text-foreground"
  } ${className}`;
  if (state.mode === "steps") {
    return (
      <button type="button" onClick={stop(() => navigate("/tasks"))} className={base}
        aria-label={`${task.title}: ${countLabel(state)} steps — open`}>
        <ListChecks className="w-3 h-3" />{countLabel(state)}
      </button>
    );
  }
  return (
    <button type="button" onClick={stop(add)} disabled={busy} className={base}
      aria-label={`Add one to ${task.title} (${countLabel(state)})`}>
      <Plus className="w-3 h-3" />{countLabel(state)}
    </button>
  );
}
