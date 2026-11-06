// Goals: a workspace that works like a notebook (v0.285.0). Every goal is
// a page; pages hold sections (smaller pages, nested as deep as you like),
// notes, to-dos, checkboxes, links and trackers. See src/lib/goalTree.js.
//
// The front page is a widget board (Add a goal, the goal cards).
//
// ?page=<id> opens a page (?highlight=<id> from older links does too);
// ?new=1 starts a new goal; ?fromWish=<id> makes a goal from a wish.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Target, Repeat, Menu } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import {
  GOALS_QUERY_KEY, GOAL_STEPS_QUERY_KEY, uncarriedWeeklyGoals, carryOverWeeklyGoals, goalFromWish,
} from "@/lib/goals";
import { indexPages } from "@/lib/goalTree";
import { askGoalAddFocus } from "@/lib/goalStarters";
import { useGoalCtx } from "@/lib/useGoalCtx";
import { profilePageId } from "@/lib/profileBoard";
import { WISHES_QUERY_KEY } from "@/lib/wishes";
import { WorkspaceProvider } from "@/components/goals/workspace/WorkspaceContext";
import PageTree from "@/components/goals/workspace/PageTree";
import BoardPageHeader from "@/components/profile/BoardPageHeader";
import PageBoardCanvas, { openPageLayoutEditor } from "@/components/profile/PageBoardCanvas";
import { useProfilePageState } from "@/components/profile/ProfileBoardCanvas";
import { V2_WIDGETS } from "@/v2/widgets";
import { GOAL_PAGE_PAGES, GoalPageContext } from "@/v2/goalPageWidgets";
import { goalWidgetDefs } from "@/v2/goalWidgetDefs";
import { goalBoardPageId } from "@/lib/goalTree";
import PageView from "@/components/goals/workspace/PageView";

const list = (entity, ...args) => () => base44.entities[entity].list(...args).catch(() => []);

// The Notebook's front page (v0.358.0): a widget board like Needs — Add a
// goal, then every goal as a card. Edit page moves, resizes and adds
// widgets (pictures, notes, anything); the layout is saved on the first
// edit, never before. The weekly-goals carry-over offer sits above it.
export const NOTEBOOK_PAGES = [
  { tab: "goals", label: "Goals", widgets: [
    { widgetId: "goal_add" },
    { widgetId: "goals", settings: { view: "cards" } },
  ] },
];
const NOTEBOOK_ICONS = { [profilePageId("goals")]: Target };

function Home({ toCarry, onCarry, carrying }) {
  const [hideCarry, setHideCarry] = useState(false);
  const boardPage = useProfilePageState(NOTEBOOK_PAGES);
  return (
    <div className="space-y-4">
      <BoardPageHeader title="Notebook" layoutEditing={boardPage.layoutEditing}
        onEditLayout={openPageLayoutEditor} tourId="notebook-layout-btn" />

      {toCarry.length > 0 && !hideCarry && !boardPage.layoutEditing && (
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

      <PageBoardCanvas pageId="notebook" pages={NOTEBOOK_PAGES} page={boardPage} pageIcons={NOTEBOOK_ICONS} tourId="notebook-tabs" />
    </div>
  );
}

// A goal page: its header, then its widget board (v0.338.0). The board is
// the standard four widgets until the first Edit page; Media, Text and the
// rest can go beside them.
const GOAL_PAGE_REGISTRY = { ...V2_WIDGETS, ...goalWidgetDefs({ onGoalPage: true }) };
function GoalPage({ page }) {
  const boardPage = useProfilePageState(GOAL_PAGE_PAGES);
  return (
    <PageView page={page} onEditLayout={openPageLayoutEditor} layoutEditing={boardPage.layoutEditing}
      body={(
        <GoalPageContext.Provider value={page}>
          <PageBoardCanvas pageId={goalBoardPageId(page.id)} pages={GOAL_PAGE_PAGES} page={boardPage}
            registry={GOAL_PAGE_REGISTRY} />
        </GoalPageContext.Provider>
      )} />
  );
}

export default function Goals() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  // "New goal" links put the cursor in the Add a goal widget.
  useState(() => { if (params.get("new") === "1") askGoalAddFocus(); });
  const [wishId] = useState(() => params.get("fromWish"));
  const madeFromWish = useRef(false);
  const [carrying, setCarrying] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  // The sidebar's tag filter: tapping a #tag anywhere lists its pages there
  // (on a phone the pages sheet opens to show them).
  const [tag, setTag] = useState(null);
  const showTag = useCallback((t) => {
    setTag(t || null);
    let wide = false;
    try { wide = window.matchMedia("(min-width: 768px)").matches; } catch { /* phone */ }
    if (t && !wide) setTreeOpen(true);
  }, []);
  const pageId = params.get("page") || params.get("highlight") || null;

  const { data: goals = [], isFetched } = useQuery({ queryKey: GOALS_QUERY_KEY, queryFn: list("Goal") });
  const { data: steps = [] } = useQuery({ queryKey: GOAL_STEPS_QUERY_KEY, queryFn: list("GoalStep") });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: list("Alter") });
  const { data: activityGoals = [] } = useQuery({ queryKey: ["activityGoals"], queryFn: list("ActivityGoal") });
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const { data: wishes = [] } = useQuery({ queryKey: WISHES_QUERY_KEY, queryFn: list("Wish"), enabled: !!wishId });
  const settings = pickPrimarySystemSettings(settingsList) || null;
  const { ctx, symptoms, categories } = useGoalCtx();

  const index = useMemo(() => indexPages(goals), [goals]);
  const page = pageId ? index.byId.get(pageId) || null : null;
  const toCarry = useMemo(() => uncarriedWeeklyGoals(activityGoals, goals), [activityGoals, goals]);

  const refresh = useCallback(() => {
    for (const key of [GOALS_QUERY_KEY, GOAL_STEPS_QUERY_KEY, ["tasks"], ["activities"], ["dailyProgress"], ["activityCategories"], ["systemSettings"], WISHES_QUERY_KEY, ["groceryLists"], ["groceryItems"]]) {
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
    const existing = goals.find((g) => g.id === w.goal_id) || goals.find((g) => g.wish_id === w.id);
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

  const value = { goals, steps, index, ctx, alters, settings, refresh, open, isFetched, tag, showTag };

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
            {page ? <GoalPage key={page.id} page={page} /> : (
              <>
                {pageId && isFetched && <p className="text-sm text-muted-foreground">That page isn't here any more. It may be in the trash.</p>}
                <Home toCarry={toCarry} onCarry={carry} carrying={carrying} />
              </>
            )}
          </main>
        </div>
      </div>
      <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-xs overflow-y-auto pt-12">
          <SheetTitle className="sr-only">Notebook pages</SheetTitle>
          <PageTree currentId={page?.id || null} onOpen={open} />
        </SheetContent>
      </Sheet>
    </WorkspaceProvider>
  );
}
