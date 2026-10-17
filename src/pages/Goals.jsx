// Goals: kept simple, like notes. A goal is a title, an optional note and a
// checklist — tick boxes, to-dos, or an activity done a number of times.
// The old weekly goals can be kept here as weekly points; their own records
// are left as they are.
//
// ?new=1 focuses the new-goal box; ?fromWish=<id> makes a goal from a wish.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Target, ChevronDown, Repeat } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import GoalCard from "@/components/goals/GoalCard";
import { useHighlightScroll } from "@/lib/useHighlightScroll";
import {
  GOALS_QUERY_KEY, GOAL_STEPS_QUERY_KEY, isOpenGoal, uncarriedWeeklyGoals, carryOverWeeklyGoals, createGoal, goalFromWish,
} from "@/lib/goals";
import { WISHES_QUERY_KEY } from "@/lib/wishes";

const list = (entity, ...args) => () => base44.entities[entity].list(...args).catch(() => []);

export default function Goals() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [focusNew] = useState(() => params.get("new") === "1");
  const [wishId] = useState(() => params.get("fromWish"));
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const newRef = useRef(null);
  const madeFromWish = useRef(false);
  const [showFinished, setShowFinished] = useState(false);
  const [carrying, setCarrying] = useState(false);
  const [hideCarry, setHideCarry] = useState(false);

  useEffect(() => {
    if (!params.has("new") && !params.has("fromWish")) return;
    const next = new URLSearchParams(params);
    next.delete("new");
    next.delete("fromWish");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const { data: goals = [], isFetched } = useQuery({ queryKey: GOALS_QUERY_KEY, queryFn: list("Goal") });
  const { data: steps = [] } = useQuery({ queryKey: GOAL_STEPS_QUERY_KEY, queryFn: list("GoalStep") });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: list("Alter") });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: list("Task") });
  const { data: activities = [] } = useQuery({ queryKey: ["activities"], queryFn: list("Activity") });
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: list("ActivityCategory") });
  const { data: templates = [] } = useQuery({ queryKey: ["dailyTaskTemplates"], queryFn: list("DailyTaskTemplate") });
  const { data: progress = [] } = useQuery({ queryKey: ["dailyProgress"], queryFn: list("DailyProgress") });
  const { data: symptoms = [] } = useQuery({ queryKey: ["symptoms"], queryFn: list("Symptom") });
  const { data: symptomSessions = [] } = useQuery({ queryKey: ["symptomSessions", "all"], queryFn: list("SymptomSession", "-start_time", 2000) });
  const { data: activityGoals = [] } = useQuery({ queryKey: ["activityGoals"], queryFn: list("ActivityGoal") });
  const { data: wishes = [] } = useQuery({ queryKey: WISHES_QUERY_KEY, queryFn: list("Wish"), enabled: !!wishId });

  const ctx = useMemo(() => ({
    tasks, activities, categories, templates, progress, symptomSessions,
    habits: symptoms.filter((s) => s.is_positive), now: new Date(),
  }), [tasks, activities, categories, templates, progress, symptomSessions, symptoms]);

  const sorted = useMemo(() => [...goals].sort((a, b) =>
    String(b.created_date || "").localeCompare(String(a.created_date || ""))), [goals]);
  const active = sorted.filter((g) => isOpenGoal(g) && g.status !== "paused");
  const paused = sorted.filter((g) => g.status === "paused");
  const finished = sorted.filter((g) => !isOpenGoal(g));
  const toCarry = useMemo(() => uncarriedWeeklyGoals(activityGoals, goals), [activityGoals, goals]);

  useHighlightScroll([goals.length]);

  useEffect(() => { if (focusNew) newRef.current?.focus(); }, [focusNew]);

  // A wish's "Make it a goal": one goal per wish, even if the page is opened twice.
  useEffect(() => {
    if (!wishId || madeFromWish.current || !isFetched) return;
    const w = wishes.find((x) => x.id === wishId);
    if (!w) return;
    madeFromWish.current = true;
    const existing = goals.find((g) => g.wish_id === w.id);
    (async () => {
      try {
        const goal = existing || await goalFromWish(w);
        if (!existing) toast.success("Made it a goal 💜");
        refresh();
        setParams({ highlight: goal.id }, { replace: true });
      } catch (e) {
        toast.error(e?.message || "Couldn't save that.");
      }
    })();
  }, [wishId, wishes, goals, isFetched]); // eslint-disable-line react-hooks/exhaustive-deps

  const addGoal = async () => {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      await createGoal({ title });
      setNewTitle("");
      refresh();
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally {
      setAdding(false);
    }
  };

  const refresh = () => {
    for (const key of [GOALS_QUERY_KEY, GOAL_STEPS_QUERY_KEY, ["tasks"], ["activities"], ["dailyProgress"], WISHES_QUERY_KEY]) {
      qc.invalidateQueries({ queryKey: key });
    }
  };

  const carry = async () => {
    setCarrying(true);
    try {
      const habitNames = Object.fromEntries(symptoms.map((s) => [`habit:${s.id}`, s.label || s.name]));
      const catNames = Object.fromEntries(categories.map((c) => [`category:${c.id}`, c.name]));
      const n = await carryOverWeeklyGoals(activityGoals, goals, { ...habitNames, ...catNames });
      toast.success(n === 1 ? "Kept 1 weekly goal as a goal" : `Kept ${n} weekly goals as goals`);
      refresh();
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally {
      setCarrying(false);
    }
  };

  const section = (label, items) => items.length > 0 && (
    <div className="space-y-3">
      {label && <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>}
      {items.map((g) => (
        <GoalCard key={g.id} goal={g} allSteps={steps} alters={alters} ctx={ctx} onChanged={refresh} />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen p-4"
      style={{ paddingBottom: "calc(1rem + var(--bottom-nav-height, 56px) + var(--os-sab))" }}>
      <div className="max-w-2xl mx-auto space-y-4" data-tour="goals-page">
        <h1 className="font-display text-3xl font-semibold text-foreground">Goals</h1>

        <div className="flex gap-2">
          <input ref={newRef} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} aria-label="New goal"
            placeholder="New goal…" onKeyDown={(e) => { if (e.key === "Enter") addGoal(); }}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <Button size="sm" className="gap-1" disabled={adding || !newTitle.trim()} onClick={addGoal}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>

        {toCarry.length > 0 && !hideCarry && (
          <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
            <p className="text-sm flex items-center gap-1.5"><Repeat className="w-4 h-4 text-primary" /> Keep the weekly goals here?</p>
            <p className="text-xs text-muted-foreground">
              {toCarry.length === 1 ? "1 weekly goal" : `${toCarry.length} weekly goals`} ({toCarry.map((s) => s.name).join(", ")})
              {" "}can become goals that count up each week, so they don't need setting up each week. The old weekly goals stay as they are.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={carry} disabled={carrying}>Keep them as goals</Button>
              <Button size="sm" variant="ghost" onClick={() => setHideCarry(true)}>Not now</Button>
            </div>
          </div>
        )}

        {isFetched && goals.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm rounded-2xl" data-pf-surface>
            <Target className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            No goals yet. Write one above, then add checklist points to it: tick boxes, to-dos, or an activity a number of times.
          </div>
        )}

        {section(null, active)}
        {section("Paused", paused)}

        {finished.length > 0 && (
          <div className="space-y-3">
            <button type="button" onClick={() => setShowFinished((s) => !s)} aria-expanded={showFinished}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFinished ? "rotate-180" : ""}`} />
              Reached and let go ({finished.length})
            </button>
            {showFinished && section(null, finished)}
          </div>
        )}
      </div>
    </div>
  );
}
