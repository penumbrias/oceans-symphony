// The row for a goal's counted and older kinds of line: groups of to-dos,
// an activity done a number of times, weekly minutes, plans and daily
// tasks. The Goals workspace (components/goals/workspace) shows notes,
// to-dos, checkboxes and links itself and hands these to StepRow.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Check, ListTodo, CalendarPlus, Repeat, CheckSquare, X, Sparkles, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/shared/ConfirmDialog";
import PlanTimeChoice from "@/components/planner/PlanTimeChoice";
import { shouldNudge, addSmallerStepBefore, dismissNudge, removeStep, toggleStep, stepToTodo, stepToPlan, SMALLER_EXAMPLES,
} from "@/lib/goals";

const small = "text-xs px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-40";
const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export function StepRow({ step, state, steps, goal, ctx, busy, run }) {
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null); // null | "plan" | "smaller"
  const [smaller, setSmaller] = useState("");
  const kind = step.kind || "check";
  const nudge = shouldNudge(step, state);
  const plain = kind === "check";
  const linkedTitle = (() => {
    if (kind === "rhythm") {
      const cat = ctx.categories.find((c) => c.id === step.category_id);
      const habit = ctx.habits.find((h) => h.id === step.habit_id);
      return cat?.name || habit?.label || habit?.name || step.title;
    }
    if (kind === "daily_task") return state.linked?.title || step.title;
    if (kind === "activity_count") {
      const cat = ctx.categories.find((c) => c.id === step.category_id);
      return `${cat?.name || step.title} × ${state.target}${step.count_period === "week" ? " a week" : ""}`;
    }
    return step.title;
  })();
  // Points worked out from other records — nothing to tick here.
  const derived = state.ongoing || kind === "todos" || kind === "activity_count";

  const subtitle = (() => {
    if (kind === "todo") return state.missing ? "Its to-do was removed" : "On the to-do list";
    if (kind === "plan") {
      if (state.missing) return "Its plan was removed";
      const ts = state.linked?.timestamp;
      return state.done ? "Done" : ts ? `Planned ${format(new Date(ts), "EEE d MMM, HH:mm")}` : "Planned";
    }
    if (kind === "daily_task") return state.missing ? "That task was removed" : state.done ? "Done this time round" : "Not done yet this time round";
    if (kind === "rhythm") return `${state.current} of ${state.target} min this week`;
    if (kind === "todos") return `${state.current} of ${state.target} to-dos done`;
    if (kind === "activity_count") return `${state.current} of ${state.target} times${step.count_period === "week" ? " this week" : " so far"}`;
    return null;
  })();

  const saveSmaller = (text) => {
    const v = String(text || "").trim();
    if (!v) return;
    run(async () => { await addSmallerStepBefore(step, v, steps); setMenu(null); setSmaller(""); }, "Added a smaller step");
  };

  return (
    <li className="space-y-1.5">
      <div className="flex items-start gap-2">
        {derived ? (
          <span className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${state.done ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
            aria-hidden="true">
            {kind === "rhythm" ? <Repeat className="w-3 h-3" /> : kind === "activity_count" ? <Hash className="w-3 h-3" /> : <CheckSquare className="w-3 h-3" />}
          </span>
        ) : (
          <button type="button" role="checkbox" aria-checked={state.done} aria-label={step.title}
            disabled={busy || (kind === "plan" && state.done && !state.missing)}
            onClick={() => run(() => toggleStep(step, state))}
            className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 disabled:opacity-60 ${
              state.done ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-primary"
            }`}>
            {state.done && <Check className="w-3 h-3" />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <button type="button" className={`text-left text-sm ${state.done && !derived ? "line-through text-muted-foreground" : "text-foreground"}`}
            onClick={() => {
              if (kind === "todo" && state.linked) navigate(`/todo?highlight=${state.linked.id}`);
              else if (kind === "plan" && state.linked) navigate(`/planner?activityId=${state.linked.id}`);
              else if (kind === "daily_task") navigate("/tasks");
              else if (kind === "todos") navigate("/todo");
              else if (kind === "activity_count" && step.category_id) navigate(`/activities?category=${step.category_id}`);
            }}>
            {linkedTitle}
          </button>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {kind === "todos" && (state.linkedList || []).length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {state.linkedList.map((tk) => (
                <li key={tk.id} className={`text-xs ${tk.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>• {tk.title}</li>
              ))}
            </ul>
          )}
          {(kind === "rhythm" || kind === "activity_count") && state.target > 0 && (
            <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, (state.current / state.target) * 100)}%` }} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {plain && !state.done && (
            <>
              <button type="button" disabled={busy} aria-label={`Add "${step.title}" to the to-do list`} title="Add to the to-do list"
                className="p-1 text-muted-foreground hover:text-foreground" onClick={() => run(() => stepToTodo(step), "Added to the to-do list")}>
                <ListTodo className="w-3.5 h-3.5" />
              </button>
              <button type="button" disabled={busy} aria-label={`Plan "${step.title}"`} title="Plan it"
                className="p-1 text-muted-foreground hover:text-foreground" onClick={() => setMenu((m) => (m === "plan" ? null : "plan"))}>
                <CalendarPlus className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button type="button" disabled={busy} aria-label={`Remove "${linkedTitle}" from this goal`}
            className="p-1 text-muted-foreground hover:text-destructive"
            onClick={async () => {
              const ok = await confirm({
                title: "Take this point off the goal?",
                body: kind === "todo" || kind === "todos" || kind === "plan" || kind === "daily_task"
                  ? "Only the point goes. Its to-dos, plan or daily task stay where they are."
                  : "It can't be undone from here.",
                confirmLabel: "Take it off",
              });
              if (ok) run(() => removeStep(step));
            }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {menu === "plan" && (
        <div className="pl-7">
          <PlanTimeChoice kind="later" item={{}} busy={busy} prompt="When could it happen?"
            onPick={(when) => run(async () => { await stepToPlan(step, when, goal); setMenu(null); }, "Planned")} />
        </div>
      )}

      {nudge && menu !== "smaller" && (
        <div className="ml-7 rounded-lg bg-primary/5 border border-primary/20 px-2.5 py-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-foreground">This one's been waiting a while. Make it smaller?</span>
          <button type="button" className={small} onClick={() => setMenu("smaller")}>Yes</button>
          <button type="button" className={small} disabled={busy} onClick={() => run(() => dismissNudge(step))}>It's fine</button>
        </div>
      )}
      {menu === "smaller" && (
        <div className="ml-7 space-y-1.5">
          <div className="flex gap-2">
            <input className={inputCls} value={smaller} onChange={(e) => setSmaller(e.target.value)} autoFocus
              aria-label="A smaller step" placeholder="A tinier piece of it…"
              onKeyDown={(e) => { if (e.key === "Enter") saveSmaller(smaller); }} />
            <Button size="sm" disabled={busy || !smaller.trim()} onClick={() => saveSmaller(smaller)}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setMenu(null)}>Cancel</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SMALLER_EXAMPLES.map((ex) => (
              <button key={ex} type="button" className={small} onClick={() => saveSmaller(`${ex}: ${step.title}`)}>{ex}</button>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
