// Everything the Notebook needs before it draws a thing: the pages, their
// lines, the records the lines count, which page is open, the lists sheet,
// the weekly-goals carry-over and the one-shot addresses (?new, ?fromWish,
// ?highlight). One copy, so the old Notebook page (src/pages/Goals.jsx)
// and the new house's Notebook room (src/house/notebook/) open the same
// page, make a goal from a wish once, and carry weekly goals the same way.
//
// Writes only through the goal write paths: goalFromWish and
// carryOverWeeklyGoals (src/lib/goals.js).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import {
  GOALS_QUERY_KEY, GOAL_STEPS_QUERY_KEY, uncarriedWeeklyGoals, carryOverWeeklyGoals, goalFromWish,
} from "@/lib/goals";
import { indexPages } from "@/lib/goalTree";
import { askGoalAddFocus } from "@/lib/goalStarters";
import { useGoalCtx } from "@/lib/useGoalCtx";
import { WISHES_QUERY_KEY } from "@/lib/wishes";

const list = (entity, ...args) => () => base44.entities[entity].list(...args).catch(() => []);

/**
 * @param {{ onNew?: () => void }} opts  onNew: what ?new=1 does (the old
 *   page puts the cursor in its Add a goal widget; the house asks for a name).
 */
export function useNotebookWorkspace({ onNew = askGoalAddFocus } = {}) {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  // "New goal" links put the cursor in the Add a goal widget.
  // Asked during the first render, as before: the widget that takes the
  // request may mount in the same commit.
  useState(() => { if (params.get("new") === "1") onNew?.(); });
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
  const notesOpen = !pageId && params.get("notes") === "1";
  const listId = params.get("list") || null;
  const openList = useCallback((id) => {
    if (id) setTreeOpen(false);
    const next = new URLSearchParams(params);
    if (id) next.set("list", id); else next.delete("list");
    setParams(next, !id ? { replace: true } : undefined);
  }, [params, setParams]);
  const openNotes = useCallback(() => {
    setTreeOpen(false);
    setParams(new URLSearchParams({ notes: "1" }));
    try { window.scrollTo({ top: 0 }); } catch { /* fine */ }
  }, [setParams]);

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

  const value = { goals, steps, index, ctx, alters, settings, refresh, open, isFetched, tag, showTag, openList, openNotes, notesOpen };
  return {
    value, params, setParams, page, pageId, notesOpen, listId, openList, openNotes, open, isFetched,
    toCarry, carry, carrying, treeOpen, setTreeOpen,
  };
}
