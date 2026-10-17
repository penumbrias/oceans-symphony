// Goals (System Needs, phase 5): long-term goals with a why, who's in it,
// and real steps — to-dos, plans, daily tasks and weekly rhythms. New goals
// go through the guided builder. The old weekly goals can be kept here as
// rhythm steps; their own records are left as they are.
//
// ?new=1 opens the builder; ?fromWish=<id> opens it filled from a wish.

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Target, ChevronDown, Repeat } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import GoalBuilder from "@/components/goals/GoalBuilder";
import GoalCard from "@/components/goals/GoalCard";
import { useHighlightScroll } from "@/lib/useHighlightScroll";
import {
  GOALS_QUERY_KEY, GOAL_STEPS_QUERY_KEY, isOpenGoal, uncarriedWeeklyGoals, carryOverWeeklyGoals,
} from "@/lib/goals";
import { WISHES_QUERY_KEY } from "@/lib/wishes";

const list = (entity, ...args) => () => base44.entities[entity].list(...args).catch(() => []);

export default function Goals() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [building, setBuilding] = useState(() => params.get("new") === "1" || params.has("fromWish"));
  const [wishId] = useState(() => params.get("fromWish"));
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

  useHighlightScroll([isFetched && goals.length > 0]);

  const seed = useMemo(() => {
    if (!wishId) return null;
    const w = wishes.find((x) => x.id === wishId);
    if (!w) return null;
    return {
      title: w.title, why: w.driving || "", impact: w.impact || "", for_everyone: !!w.for_everyone,
      owner_alter_ids: w.owner_alter_ids || [], wish_id: w.id,
    };
  }, [wishId, wishes]);

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
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-3xl font-semibold text-foreground">Goals</h1>
          {!building && (
            <Button size="sm" className="gap-1" onClick={() => setBuilding(true)}>
              <Plus className="w-4 h-4" /> New goal
            </Button>
          )}
        </div>

        {building && (!wishId || seed || wishes.length > 0) && (
          <div className="rounded-2xl border border-primary/30 bg-card p-4">
            <GoalBuilder seed={seed} alters={alters} onCancel={() => setBuilding(false)}
              onDone={() => { setBuilding(false); refresh(); toast.success("Goal made 💜"); }} />
          </div>
        )}

        {!building && toCarry.length > 0 && !hideCarry && (
          <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
            <p className="text-sm flex items-center gap-1.5"><Repeat className="w-4 h-4 text-primary" /> Keep the weekly goals here?</p>
            <p className="text-xs text-muted-foreground">
              {toCarry.length === 1 ? "1 weekly goal" : `${toCarry.length} weekly goals`} ({toCarry.map((s) => s.name).join(", ")})
              {" "}can become goals with a weekly rhythm, so they don't need setting up each week. The old weekly goals stay as they are.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={carry} disabled={carrying}>Keep them as goals</Button>
              <Button size="sm" variant="ghost" onClick={() => setHideCarry(true)}>Not now</Button>
            </div>
          </div>
        )}

        {!building && isFetched && goals.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm rounded-2xl" data-pf-surface>
            <Target className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            No goals yet. "New goal" walks through it one question at a time.
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
