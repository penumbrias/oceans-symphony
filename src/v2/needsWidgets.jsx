// Home-screen widgets for System Needs: the balance (who's been waiting
// longest for something they enjoy), everyone's wishes, and open goals.
// Each is one Section (widget contract) and reads the same helpers the
// Needs and Goals pages use, so the numbers always agree.

import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Target } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useScopeAlterIds } from "@/v2/subjectScope";
import { Section, Row, Muted, TextAction, Dot } from "@/v2/primitives";
import { buildBalance, sharedWishes, ALTER_ACTIVITY_LINKS_QUERY_KEY } from "@/lib/needs";
import { LINK_TYPES_QUERY_KEY } from "@/lib/activityLinks";
import { WISHES_QUERY_KEY, isOpenWish, sortWishes, wishKindMeta, wishAgeLabel } from "@/lib/wishes";
import {
  GOALS_QUERY_KEY, GOAL_STEPS_QUERY_KEY, isOpenGoal, stepsForGoal, stepState, goalProgress,
} from "@/lib/goals";

const useList = (key, entity) =>
  useQuery({ queryKey: Array.isArray(key) ? key : [key], queryFn: () => base44.entities[entity].list().catch(() => []) }).data || [];

const limitOf = (settings, fallback) => {
  const n = parseInt(settings?.limit, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function NeedsBalanceWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  const alters = useList("alters", "Alter");
  const links = useList(ALTER_ACTIVITY_LINKS_QUERY_KEY, "AlterActivityLink");
  const wishes = useList(WISHES_QUERY_KEY, "Wish");
  const activities = useList("activities", "Activity");
  const categories = useList("activityCategories", "ActivityCategory");
  const linkTypes = useList(LINK_TYPES_QUERY_KEY, "ActivityLinkType");
  const rows = useMemo(
    () => buildBalance({ alters, links, wishes, activities, categories, linkTypes }).slice(0, limitOf(settings, 5)),
    [alters, links, wishes, activities, categories, linkTypes, settings],
  );
  return (
    <Section label={tr("widget.needs.label")}
      action={<TextAction onClick={() => navigate("/needs")}>{tr("widget.today.open")}</TextAction>}>
      {rows.length === 0 && <Muted>{tr("widget.needs.empty")}</Muted>}
      {rows.map((r) => {
        const waiting = r.items[0];
        return (
          <Row key={r.alter.id} left={<Dot color={r.alter.color} />}
            primary={formatAlter(r.alter)} secondary={waiting?.title}
            right={waiting?.last ? tr("widget.needs.ago", { time: formatDistanceToNowStrict(new Date(waiting.last)) }) : tr("widget.needs.notYet")}
            onClick={() => navigate(`/needs?tab=balance&highlight=${r.alter.id}`)} />
        );
      })}
    </Section>
  );
}

export function WishesWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  const wishes = useList(WISHES_QUERY_KEY, "Wish");
  const alters = useList("alters", "Alter");
  const alterById = useMemo(() => new Map(alters.map((a) => [a.id, a])), [alters]);
  // On a profile board: wishes owned by that alter (or the group's members).
  const scopeIds = useScopeAlterIds(settings);
  const open = useMemo(
    () => sortWishes(sharedWishes(wishes).filter(isOpenWish)
      .filter((w) => !scopeIds || (w.owner_alter_ids || []).some((id) => scopeIds.includes(id))))
      .slice(0, limitOf(settings, 6)),
    [wishes, settings, scopeIds],
  );
  return (
    <Section label={tr("widget.wishes.label")}
      action={<TextAction onClick={() => navigate("/needs?tab=wishes")}>{tr("widget.today.open")}</TextAction>}>
      {open.length === 0 && <Muted>{tr("widget.wishes.empty")}</Muted>}
      {open.map((w) => {
        const owner = w.for_everyone ? tr("widget.wishes.everyone")
          : (w.owner_alter_ids || []).map((id) => alterById.get(id)).filter(Boolean).map((a) => formatAlter(a)).join(", ");
        return (
          <Row key={w.id} left={<span aria-hidden="true" className="text-xs">{wishKindMeta(w.kind).emoji}</span>}
            primary={w.title} secondary={owner} right={wishAgeLabel(w)}
            onClick={() => navigate(`/needs?tab=wishes&highlight=${w.id}`)} />
        );
      })}
    </Section>
  );
}

export function GoalsWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const goals = useList(GOALS_QUERY_KEY, "Goal");
  const steps = useList(GOAL_STEPS_QUERY_KEY, "GoalStep");
  const tasks = useList("tasks", "Task");
  const activities = useList("activities", "Activity");
  const templates = useList("dailyTaskTemplates", "DailyTaskTemplate");
  const progress = useList("dailyProgress", "DailyProgress");
  const ctx = useMemo(() => ({ tasks, activities, templates, progress, now: new Date() }), [tasks, activities, templates, progress]);
  const rows = useMemo(() => goals
    // Top-level goals only: sections live inside their page.
    .filter((g) => !g.parent_id && isOpenGoal(g) && g.status !== "paused")
    .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))
    .slice(0, limitOf(settings, 5))
    .map((g) => {
      const mine = stepsForGoal(steps, g.id).filter((s) => s.kind !== "text" && s.kind !== "link");
      const { done, total } = goalProgress(mine, ctx);
      const next = mine.find((s) => { const st = stepState(s, ctx); return !st.done && !st.ongoing; });
      return { goal: g, done, total, next };
    }), [goals, steps, ctx, settings]);
  return (
    <Section label={tr("widget.goals.label")}
      action={<TextAction onClick={() => navigate("/goals?new=1")}>{tr("widget.goals.new")}</TextAction>}>
      {rows.length === 0 && <Muted>{tr("widget.goals.empty")}</Muted>}
      {rows.map((r) => (
        <Row key={r.goal.id} left={<Target className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />}
          primary={r.goal.title} secondary={r.next?.title}
          right={r.total > 0 ? `${r.done}/${r.total}` : tr("widget.goals.ongoing")}
          onClick={() => navigate(`/goals?page=${r.goal.id}`)} />
      ))}
    </Section>
  );
}
