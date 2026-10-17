// One goal on the Goals page: its why, who's in it, and its steps. Steps
// can be ticked here, turned into a to-do or a plan, split smaller, or
// joined by an ongoing rhythm / daily task.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Check, Pencil, Trash2, ListTodo, CalendarPlus, Repeat, CheckSquare, X, Plus, Sparkles, Users, Target,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import RichText from "@/components/shared/RichText";
import { confirm } from "@/components/shared/ConfirmDialog";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import PlanTimeChoice from "@/components/planner/PlanTimeChoice";
import GoalBuilder from "@/components/goals/GoalBuilder";
import { flattenCategoryTree } from "@/lib/categoryTreeUtils";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import {
  stepsForGoal, stepState, goalProgress, shouldNudge, isOpenGoal, goalStatusLabel, setGoalStatus,
  addStep, addSmallerStepBefore, dismissNudge, removeStep, toggleStep, stepToTodo, stepToPlan, SMALLER_EXAMPLES,
} from "@/lib/goals";

const small = "text-xs px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-40";
const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

const indentOption = (o) => (
  <span className="flex items-center gap-2 min-w-0">
    {o._depth > 0 && <span style={{ width: o._depth * 12 }} className="flex-shrink-0 text-muted-foreground text-xs text-right">↳</span>}
    {o.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: o.color }} />}
    <span className="truncate text-sm">{o.label}</span>
  </span>
);

function AlterNames({ ids, alterById, formatAlter }) {
  const names = (ids || []).map((id) => alterById.get(id)).filter(Boolean).map((a) => formatAlter(a));
  return names.length ? names.join(", ") : null;
}

function StepRow({ step, state, steps, goal, ctx, busy, run }) {
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
    return step.title;
  })();

  const subtitle = (() => {
    if (kind === "todo") return state.missing ? "Its to-do was removed" : "On the to-do list";
    if (kind === "plan") {
      if (state.missing) return "Its plan was removed";
      const ts = state.linked?.timestamp;
      return state.done ? "Done" : ts ? `Planned ${format(new Date(ts), "EEE d MMM, HH:mm")}` : "Planned";
    }
    if (kind === "daily_task") return state.missing ? "That task was removed" : state.done ? "Done this time round" : "Not done yet this time round";
    if (kind === "rhythm") return `${state.current} of ${state.target} min this week`;
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
        {state.ongoing ? (
          <span className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${state.done ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
            aria-hidden="true">
            {kind === "rhythm" ? <Repeat className="w-3 h-3" /> : <CheckSquare className="w-3 h-3" />}
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
          <button type="button" className={`text-left text-sm ${state.done && !state.ongoing ? "line-through text-muted-foreground" : "text-foreground"}`}
            onClick={() => {
              if (kind === "todo" && state.linked) navigate(`/todo?highlight=${state.linked.id}`);
              else if (kind === "plan" && state.linked) navigate(`/planner?activityId=${state.linked.id}`);
              else if (kind === "daily_task") navigate("/tasks");
            }}>
            {linkedTitle}
          </button>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {kind === "rhythm" && state.target > 0 && (
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
                title: "Take this step off the goal?",
                body: kind === "todo" || kind === "plan" || kind === "daily_task"
                  ? "Only the step goes. Its to-do, plan or daily task stays where it is."
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

function AddStep({ goal, steps, ctx, busy, run }) {
  const [mode, setMode] = useState("check");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [minutes, setMinutes] = useState("60");
  const [templateId, setTemplateId] = useState(null);

  const categoryOptions = useMemo(
    () => flattenCategoryTree(ctx.categories).map((c) => ({ id: c.id, label: c.name, color: c.color, _depth: c._depth })),
    [ctx.categories],
  );
  const templateOptions = useMemo(
    () => (ctx.templates || []).filter((tp) => tp.is_active !== false).map((tp) => ({ id: tp.id, label: tp.title })),
    [ctx.templates],
  );

  const save = () => {
    if (mode === "check") {
      if (!title.trim()) return;
      run(async () => { await addStep(goal.id, { title }, steps); setTitle(""); });
    } else if (mode === "rhythm") {
      if (!categoryId) return;
      const cat = ctx.categories.find((c) => c.id === categoryId);
      run(async () => {
        await addStep(goal.id, { kind: "rhythm", title: cat?.name || "Rhythm", category_id: categoryId, weekly_minutes: Math.max(1, Number(minutes) || 0) }, steps);
        setCategoryId(null);
        setMode("check");
      }, "Rhythm added");
    } else if (mode === "daily_task") {
      if (!templateId) return;
      const tp = ctx.templates.find((x) => x.id === templateId);
      run(async () => {
        await addStep(goal.id, { kind: "daily_task", title: tp?.title || "Daily task", ref_id: templateId }, steps);
        setTemplateId(null);
        setMode("check");
      }, "Linked");
    }
  };

  const tab = (id, label) => (
    <button type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
      className={`text-xs px-2 py-0.5 rounded-full ${mode === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-1.5 pt-1">
      <div role="tablist" aria-label="Kind of step" className="flex gap-1">
        {tab("check", "Step")}
        {tab("rhythm", "Weekly rhythm")}
        {tab("daily_task", "Daily task")}
      </div>
      {mode === "check" && (
        <div className="flex gap-2">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New step"
            placeholder="Add a step…" onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
          <Button size="sm" variant="outline" disabled={busy || !title.trim()} onClick={save}><Plus className="w-4 h-4" /></Button>
        </div>
      )}
      {mode === "rhythm" && (
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex-1 min-w-[10rem]">
            <SearchableSelect value={categoryId} onChange={(id) => setCategoryId(id || null)} options={categoryOptions}
              placeholder="Pick an activity" searchPlaceholder="Search activities…" renderOption={indentOption} />
          </div>
          <input className={`${inputCls} w-20`} type="number" min={1} inputMode="numeric" value={minutes}
            onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes each week" />
          <span className="text-xs text-muted-foreground">min a week</span>
          <Button size="sm" variant="outline" disabled={busy || !categoryId} onClick={save}><Plus className="w-4 h-4" /></Button>
        </div>
      )}
      {mode === "daily_task" && (
        templateOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No daily tasks yet. Make one on the Daily Tasks page.</p>
        ) : (
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <SearchableSelect value={templateId} onChange={(id) => setTemplateId(id || null)} options={templateOptions}
                placeholder="Pick a daily task" searchPlaceholder="Search tasks…" />
            </div>
            <Button size="sm" variant="outline" disabled={busy || !templateId} onClick={save}><Plus className="w-4 h-4" /></Button>
          </div>
        )
      )}
    </div>
  );
}

export default function GoalCard({ goal, allSteps, alters, ctx, onChanged }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const alterById = useMemo(() => new Map((alters || []).map((a) => [a.id, a])), [alters]);
  const steps = useMemo(() => stepsForGoal(allSteps, goal.id), [allSteps, goal.id]);
  const states = useMemo(() => new Map(steps.map((s) => [s.id, stepState(s, ctx)])), [steps, ctx]);
  const { done, total } = useMemo(() => goalProgress(steps, ctx), [steps, ctx]);
  const open = isOpenGoal(goal);

  const run = async (fn, msg) => {
    setBusy(true);
    try { await fn(); if (msg) toast.success(msg); onChanged(); }
    catch (e) { toast.error(e?.message || "Couldn't save that."); }
    finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div data-highlight-id={goal.id} className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <GoalBuilder goal={goal} alters={alters} onCancel={() => setEditing(false)}
          onDone={() => { setEditing(false); onChanged(); }} />
      </div>
    );
  }

  const owners = goal.for_everyone ? `Everyone in the ${t.system}` : AlterNames({ ids: goal.owner_alter_ids, alterById, formatAlter });
  const strugglers = AlterNames({ ids: goal.struggler_alter_ids, alterById, formatAlter });
  const supporters = AlterNames({ ids: goal.supporter_alter_ids, alterById, formatAlter });

  return (
    <div data-highlight-id={goal.id}
      className={`rounded-xl border p-4 space-y-3 ${open ? "border-border/50 bg-muted/10" : "border-border/30 bg-muted/5 opacity-80"}`}>
      <div className="flex items-start gap-2">
        <Target className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${goal.status === "done" ? "text-muted-foreground" : "text-foreground"}`}>{goal.title}</p>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
            {goal.status && goal.status !== "active" && <span>{goalStatusLabel(goal.status)}</span>}
            {goal.target_date && <span>By {format(new Date(`${goal.target_date}T00:00:00`), "d MMM yyyy")}</span>}
            {total > 0 && <span>{done} of {total} steps</span>}
          </div>
        </div>
        <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${goal.title}`} className="p-1 text-muted-foreground hover:text-foreground">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      {total > 0 && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
          <div className="h-full bg-primary transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}

      {goal.why && (
        <div className="text-xs">
          <span className="text-muted-foreground">Why: </span>
          <RichText content={goal.why} alters={alters} terms={t} className="inline" />
        </div>
      )}
      {goal.impact && (
        <div className="text-xs">
          <span className="text-muted-foreground">What it would change: </span>
          <RichText content={goal.impact} alters={alters} terms={t} className="inline" />
        </div>
      )}
      {(owners || strugglers || supporters) && (
        <div className="text-xs space-y-0.5">
          {owners && <p className="flex items-center gap-1"><Users className="w-3 h-3 text-muted-foreground" /><span className="text-muted-foreground">Wants it:</span> {owners}</p>}
          {supporters && <p><span className="text-muted-foreground">Can help:</span> {supporters}</p>}
          {strugglers && <p><span className="text-muted-foreground">Finds it hard:</span> {strugglers}</p>}
        </div>
      )}

      <ul className="space-y-2">
        {steps.map((s) => (
          <StepRow key={s.id} step={s} state={states.get(s.id)} steps={steps} goal={goal} ctx={ctx} busy={busy} run={run} />
        ))}
      </ul>
      {open && <AddStep goal={goal} steps={steps} ctx={ctx} busy={busy} run={run} />}

      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/30">
        {open ? (
          <>
            <button type="button" disabled={busy} className={small} onClick={() => run(() => setGoalStatus(goal, "done"), "Reached 🎉")}>
              <Check className="w-3.5 h-3.5" /> Reached
            </button>
            {goal.status === "paused" ? (
              <button type="button" disabled={busy} className={small} onClick={() => run(() => setGoalStatus(goal, "active"))}>Pick it back up</button>
            ) : (
              <button type="button" disabled={busy} className={small} onClick={() => run(() => setGoalStatus(goal, "paused"))}>Pause</button>
            )}
            <button type="button" disabled={busy} className={small} onClick={() => run(() => setGoalStatus(goal, "let_go"), "Let go — it stays in the history")}>Let go</button>
          </>
        ) : (
          <button type="button" disabled={busy} className={small} onClick={() => run(() => setGoalStatus(goal, "active"))}>Work on it again</button>
        )}
        <span className="flex-1" />
        <button type="button" aria-label={`Delete ${goal.title}`} className="p-1 text-muted-foreground hover:text-destructive"
          onClick={async () => {
            const ok = await confirm({
              title: "Delete this goal?",
              body: "\"Reached\" or \"Let go\" keep it in the history instead. Deleting removes the goal and its steps; linked to-dos and plans stay.",
              confirmLabel: "Delete", destructive: true,
            });
            if (!ok) return;
            run(async () => {
              for (const s of steps) await removeStep(s);
              await base44.entities.Goal.delete(goal.id);
            });
          }}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
