// Goals: a workspace that works like a notebook (v0.285.0). Every goal is
// a page; pages hold sections (smaller pages, nested as deep as you like),
// notes, to-dos, checkboxes, links and trackers. See src/lib/goalTree.js.
//
// ?page=<id> opens a page (?highlight=<id> from older links does too);
// ?new=1 starts a new goal; ?fromWish=<id> makes a goal from a wish.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Target, ChevronRight, Repeat, Menu } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import {
  GOALS_QUERY_KEY, GOAL_STEPS_QUERY_KEY, isOpenGoal, uncarriedWeeklyGoals, carryOverWeeklyGoals, goalFromWish, goalStatusLabel,
} from "@/lib/goals";
import { indexPages, rootPages, createPage, orderAfter } from "@/lib/goalTree";
import { WISHES_QUERY_KEY } from "@/lib/wishes";
import { WorkspaceProvider, useWorkspace, inputCls } from "@/components/goals/workspace/WorkspaceContext";
import PageTree from "@/components/goals/workspace/PageTree";
import PageView from "@/components/goals/workspace/PageView";
import { useSubtreeProgress } from "@/components/goals/workspace/Outline";

const list = (entity, ...args) => () => base44.entities[entity].list(...args).catch(() => []);

function GoalSummaryCard({ goal }) {
  const { open, index } = useWorkspace();
  const { done, total, sections } = useSubtreeProgress(goal.id);
  return (
    <button type="button" onClick={() => open(goal.id)} data-highlight-id={goal.id}
      className="w-full text-left rounded-xl border border-border/50 bg-muted/10 hover:bg-muted/30 p-3.5 space-y-2">
      <div className="flex items-center gap-2">
        {goal.icon ? <span className="text-lg" aria-hidden="true">{goal.icon}</span> : <Target className="w-4 h-4 text-primary flex-shrink-0" />}
        <span className="font-medium flex-1 min-w-0 truncate">{goal.title || "Untitled"}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>
      <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
        {goal.status && goal.status !== "active" && <span>{goalStatusLabel(goal.status)}</span>}
        {goal.target_date && <span>by {new Date(`${goal.target_date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>}
        {total > 0 && <span className="tabular-nums">{done} of {total} done</span>}
        {sections > 0 && <span>{sections} {sections === 1 ? "section" : "sections"}</span>}
        {index.children.get(goal.id)?.length === 0 && total === 0 && <span>Empty so far</span>}
      </div>
      {total > 0 && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
          <div className="h-full bg-primary" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}
    </button>
  );
}

function Home({ focusNew, toCarry, onCarry, carrying }) {
  const { index, run, busy, open, isFetched } = useWorkspace();
  const [title, setTitle] = useState("");
  const [hideCarry, setHideCarry] = useState(false);
  const [showFinished, setShowFinished] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (focusNew) ref.current?.focus(); }, [focusNew]);
  const roots = rootPages(index);
  const active = roots.filter((g) => isOpenGoal(g) && g.status !== "paused");
  const paused = roots.filter((g) => g.status === "paused");
  const finished = roots.filter((g) => !isOpenGoal(g));

  const add = async () => {
    const v = title.trim();
    if (!v) return;
    const made = await run(() => createPage({ title: v, order: orderAfter(roots.map((rec) => ({ rec }))) }));
    if (made?.id) { setTitle(""); open(made.id); }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-semibold text-foreground">Goals</h1>
      <div className="flex gap-2">
        <input ref={ref} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New goal"
          placeholder="Start a new goal, a project, a story…" onKeyDown={(e) => { if (e.key === "Enter") add(); }} className={inputCls} />
        <Button size="sm" className="gap-1" disabled={busy || !title.trim()} onClick={add}><Plus className="w-4 h-4" /> Add</Button>
      </div>

      {toCarry.length > 0 && !hideCarry && (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
          <p className="text-sm flex items-center gap-1.5"><Repeat className="w-4 h-4 text-primary" /> Keep the weekly goals here?</p>
          <p className="text-xs text-muted-foreground">
            {toCarry.length === 1 ? "1 weekly goal" : `${toCarry.length} weekly goals`} ({toCarry.map((s) => s.name).join(", ")})
            {" "}can become goals that count up each week. The old weekly goals stay as they are.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={onCarry} disabled={carrying}>Keep them as goals</Button>
            <Button size="sm" variant="ghost" onClick={() => setHideCarry(true)}>Not now</Button>
          </div>
        </div>
      )}

      {isFetched && roots.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm rounded-2xl" data-pf-surface>
          <Target className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          Start a goal above. Inside it you can add sections (and sections inside those), notes, to-dos, checkboxes, links to other pages and the activities that go with it.
        </div>
      )}

      {active.length > 0 && <div className="space-y-2">{active.map((g) => <GoalSummaryCard key={g.id} goal={g} />)}</div>}
      {paused.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paused</h2>
          {paused.map((g) => <GoalSummaryCard key={g.id} goal={g} />)}
        </div>
      )}
      {finished.length > 0 && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowFinished((s) => !s)} aria-expanded={showFinished}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showFinished ? "rotate-90" : ""}`} />
            Reached and let go ({finished.length})
          </button>
          {showFinished && finished.map((g) => <GoalSummaryCard key={g.id} goal={g} />)}
        </div>
      )}
    </div>
  );
}

export default function Goals() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [focusNew] = useState(() => params.get("new") === "1");
  const [wishId] = useState(() => params.get("fromWish"));
  const madeFromWish = useRef(false);
  const [carrying, setCarrying] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const pageId = params.get("page") || params.get("highlight") || null;

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
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const { data: wishes = [] } = useQuery({ queryKey: WISHES_QUERY_KEY, queryFn: list("Wish"), enabled: !!wishId });
  const settings = pickPrimarySystemSettings(settingsList) || null;

  const index = useMemo(() => indexPages(goals), [goals]);
  const page = pageId ? index.byId.get(pageId) || null : null;
  const ctx = useMemo(() => ({
    tasks, activities, categories, templates, progress, symptomSessions,
    habits: symptoms.filter((s) => s.is_positive), now: new Date(),
  }), [tasks, activities, categories, templates, progress, symptomSessions, symptoms]);
  const toCarry = useMemo(() => uncarriedWeeklyGoals(activityGoals, goals), [activityGoals, goals]);

  const refresh = useCallback(() => {
    for (const key of [GOALS_QUERY_KEY, GOAL_STEPS_QUERY_KEY, ["tasks"], ["activities"], ["dailyProgress"], ["activityCategories"], ["systemSettings"], WISHES_QUERY_KEY]) {
      qc.invalidateQueries({ queryKey: key });
    }
  }, [qc]);

  const open = useCallback((id) => {
    setTreeOpen(false);
    const next = new URLSearchParams();
    if (id) next.set("page", id);
    setParams(next);
    try { window.scrollTo({ top: 0 }); } catch { /* fine */ }
  }, [setParams]);

  // Tidy one-shot params out of the address.
  useEffect(() => {
    if (!params.has("new") && !params.has("fromWish") && !params.has("highlight")) return;
    const next = new URLSearchParams(params);
    const hl = next.get("highlight");
    next.delete("new"); next.delete("fromWish"); next.delete("highlight");
    if (hl && !next.has("page")) next.set("page", hl);
    setParams(next, { replace: true });
  }, [params, setParams]);

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
        open(goal.id);
      } catch (e) {
        toast.error(e?.message || "Couldn't save that.");
      }
    })();
  }, [wishId, wishes, goals, isFetched]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const value = { goals, steps, index, ctx, alters, settings, refresh, open, isFetched };

  return (
    <WorkspaceProvider value={value}>
      <div className="min-h-screen p-4" style={{ paddingBottom: "calc(1rem + var(--bottom-nav-height, 56px) + var(--os-sab))" }}>
        <div className="max-w-6xl mx-auto md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:gap-6" data-tour="goals-page">
          <aside className="hidden md:block sticky top-4 self-start max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain pr-1">
            <PageTree currentId={page?.id || null} onOpen={open} />
          </aside>
          <main className="min-w-0 max-w-3xl space-y-3">
            <div className="md:hidden">
              <button type="button" onClick={() => setTreeOpen(true)} aria-label="All pages"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground py-1">
                <Menu className="w-4 h-4" /> Pages
              </button>
            </div>
            {page ? <PageView key={page.id} page={page} /> : (
              <>
                {pageId && isFetched && <p className="text-sm text-muted-foreground">That page isn't here any more. It may be in the trash.</p>}
                <Home focusNew={focusNew} toCarry={toCarry} onCarry={carry} carrying={carrying} />
              </>
            )}
          </main>
        </div>
      </div>
      <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-xs overflow-y-auto pt-12">
          <SheetTitle className="sr-only">Goals pages</SheetTitle>
          <PageTree currentId={page?.id || null} onOpen={open} />
        </SheetContent>
      </Sheet>
    </WorkspaceProvider>
  );
}
