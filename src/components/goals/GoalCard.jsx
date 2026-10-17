// One goal on the Goals page, kept simple like a note: a title, an
// optional note, and a checklist. A checklist point is a tick box, one or
// more to-dos, or an activity done a number of times. Older goals may also
// carry plans, daily tasks or weekly-minute rhythms; those still show.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Check, Pencil, Trash2, ListTodo, CalendarPlus, Repeat, CheckSquare, X, Plus, Sparkles, Users, Target, Hash,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import RichText from "@/components/shared/RichText";
import { confirm } from "@/components/shared/ConfirmDialog";
import { SearchableSelect, SearchableMultiSelect } from "@/components/shared/SearchableSelect";
import PlanTimeChoice from "@/components/planner/PlanTimeChoice";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { flattenCategoryTree } from "@/lib/categoryTreeUtils";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { createTask } from "@/lib/taskCreate";
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

function AddStep({ goal, steps, ctx, busy, run }) {
  const [mode, setMode] = useState("check");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [count, setCount] = useState("3");
  const [period, setPeriod] = useState("total");
  const [taskIds, setTaskIds] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [madeTasks, setMadeTasks] = useState([]); // to-dos made here, before the list refreshes

  const categoryOptions = useMemo(
    () => flattenCategoryTree(ctx.categories).map((c) => ({ id: c.id, label: c.name, color: c.color, _depth: c._depth })),
    [ctx.categories],
  );
  const allTasks = useMemo(() => {
    const seen = new Set((ctx.tasks || []).map((tk) => tk.id));
    return [...(ctx.tasks || []), ...madeTasks.filter((tk) => !seen.has(tk.id))];
  }, [ctx.tasks, madeTasks]);
  const taskOptions = useMemo(
    () => allTasks.filter((tk) => !tk.completed || taskIds.includes(tk.id)).map((tk) => ({ id: tk.id, label: tk.title || "Untitled" })),
    [allTasks, taskIds],
  );

  const makeTodo = () => {
    const v = newTodo.trim();
    if (!v) return;
    run(async () => {
      const task = await createTask({ title: v });
      setMadeTasks((m) => [...m, task]);
      setTaskIds((ids) => [...ids, task.id]);
      setNewTodo("");
    });
  };

  const save = () => {
    if (mode === "check") {
      if (!title.trim()) return;
      run(async () => { await addStep(goal.id, { title }, steps); setTitle(""); });
    } else if (mode === "todo") {
      if (taskIds.length === 0) return;
      const picked = taskIds.map((id) => allTasks.find((tk) => tk.id === id)).filter(Boolean);
      run(async () => {
        if (picked.length === 1) await addStep(goal.id, { kind: "todo", title: picked[0].title || "To-do", ref_id: picked[0].id }, steps);
        else await addStep(goal.id, { kind: "todos", title: `${picked.length} to-dos`, ref_ids: picked.map((tk) => tk.id) }, steps);
        setTaskIds([]);
        setMode("check");
      }, "Added");
    } else if (mode === "activity") {
      if (!categoryId) return;
      const cat = ctx.categories.find((c) => c.id === categoryId);
      run(async () => {
        await addStep(goal.id, {
          kind: "activity_count", title: cat?.name || "Activity", category_id: categoryId,
          target_count: Math.max(1, Math.round(Number(count) || 0)), count_period: period === "week" ? "week" : "total",
        }, steps);
        setCategoryId(null);
        setMode("check");
      }, "Added");
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
      <div role="tablist" aria-label="Kind of checklist point" className="flex gap-1">
        {tab("check", "Tick box")}
        {tab("todo", "To-dos")}
        {tab("activity", "Activity × times")}
      </div>
      {mode === "check" && (
        <div className="flex gap-2">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New checklist point"
            placeholder="Add a checklist point…" onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
          <Button size="sm" variant="outline" disabled={busy || !title.trim()} onClick={save} aria-label="Add point"><Plus className="w-4 h-4" /></Button>
        </div>
      )}
      {mode === "todo" && (
        <div className="space-y-1.5">
          <SearchableMultiSelect value={taskIds} onChange={setTaskIds} options={taskOptions}
            placeholder="Pick one or more to-dos" searchPlaceholder="Search to-dos…" emptyMessage="No open to-dos" />
          <div className="flex gap-2">
            <input className={inputCls} value={newTodo} onChange={(e) => setNewTodo(e.target.value)} aria-label="New to-do"
              placeholder="Or write a new to-do…" onKeyDown={(e) => { if (e.key === "Enter") makeTodo(); }} />
            <Button size="sm" variant="ghost" disabled={busy || !newTodo.trim()} onClick={makeTodo}>Make it</Button>
          </div>
          <Button size="sm" variant="outline" disabled={busy || taskIds.length === 0} onClick={save} className="gap-1">
            <Plus className="w-4 h-4" /> {taskIds.length > 1 ? `Add these ${taskIds.length} to-dos` : "Add to-do"}
          </Button>
        </div>
      )}
      {mode === "activity" && (
        <div className="space-y-1.5">
          <SearchableSelect value={categoryId} onChange={(id) => setCategoryId(id || null)} options={categoryOptions}
            placeholder="Pick an activity" searchPlaceholder="Search activities…" renderOption={indentOption} />
          <div className="flex flex-wrap gap-2 items-center">
            <input className={`${inputCls} w-20`} type="number" min={1} inputMode="numeric" value={count}
              onChange={(e) => setCount(e.target.value)} aria-label="How many times" />
            <span className="text-xs text-muted-foreground">times</span>
            <div role="radiogroup" aria-label="Counted" className="flex gap-1">
              {[["total", "in total"], ["week", "each week"]].map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={period === id} onClick={() => setPeriod(id)}
                  className={`text-xs px-2 py-0.5 rounded-full border ${period === id ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" disabled={busy || !categoryId} onClick={save} aria-label="Add point"><Plus className="w-4 h-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline edit of the goal itself: just its title and a note.
function GoalEdit({ goal, alters, onCancel, onDone }) {
  const t = useTerms();
  const [title, setTitle] = useState(goal.title || "");
  const [note, setNote] = useState(goal.why || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      let prepared = null;
      const changed = note !== (goal.why || "");
      if (changed && note.trim()) {
        try {
          prepared = await prepareAuthoredText(note.trim(), { alters, terms: t, surfaceLabel: "goal note" });
        } catch (e) {
          if (isLogCommandError(e)) { toast.error(e.message); return; }
          throw e;
        }
        if (prepared === null) return;
      }
      await base44.entities.Goal.update(goal.id, {
        title: title.trim(),
        ...(changed ? { why: prepared ? prepared.content : "" } : {}),
      });
      if (prepared) {
        await recordAuthoredText({ ...prepared, alters, sourceType: "goal", sourceId: goal.id,
          sourceLabel: `Goal: ${title.trim()}`, navigatePath: `/goals?highlight=${goal.id}` });
      }
      onDone();
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Goal" autoFocus
        placeholder="The goal…" />
      <MentionTextarea value={note} onChange={setNote} alters={alters} signposts
        placeholder="A note, if you like…" className="min-h-[60px] text-sm" />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={saving || !title.trim()} onClick={save}>Save</Button>
      </div>
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
        <GoalEdit goal={goal} alters={alters} onCancel={() => setEditing(false)}
          onDone={() => { setEditing(false); onChanged(); }} />
      </div>
    );
  }

  const owners = goal.for_everyone ? null : AlterNames({ ids: goal.owner_alter_ids, alterById, formatAlter });
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
            {total > 0 && <span>{done} of {total} done</span>}
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
        <RichText content={goal.why} alters={alters} terms={t} className="text-sm text-foreground/90" />
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
              body: "\"Reached\" or \"Let go\" keep it in the history instead. Deleting removes the goal and its checklist; linked to-dos and plans stay.",
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
