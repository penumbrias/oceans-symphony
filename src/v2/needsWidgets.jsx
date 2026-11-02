// Home-screen widgets for System Needs: the balance (who's been waiting
// longest for something they enjoy), everyone's wishes, and open goals.
// Each is one Section (widget contract) and reads the same helpers the
// Needs and Goals pages use, so the numbers always agree.

import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWidgetScope } from "@/lib/boardSubject";
import { formatDistanceToNowStrict } from "date-fns";
import { Target } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useScopeAlterIds } from "@/v2/subjectScope";
import { Section, Row, Muted, TextAction, Dot, useWidgetMode } from "@/v2/primitives";
import { buildBalance, ALTER_ACTIVITY_LINKS_QUERY_KEY, TURNS_QUERY_KEY, turnState } from "@/lib/needs";
import NeedsBalance from "@/components/needs/NeedsBalance";
import NeedsTurns, { TurnCard, sortTurns } from "@/components/needs/NeedsTurns";
import WishQuickAdd from "@/components/needs/WishQuickAdd";
import { whosePicked } from "@/components/needs/WhoseChoice";
import WishCard from "@/components/wishes/WishCard";
import { LINK_TYPES_QUERY_KEY } from "@/lib/activityLinks";
import { WISHES_QUERY_KEY, isOpenWish, sortWishes, wishKindMeta, wishAgeLabel, wishStatusLabel } from "@/lib/wishes";
import { usesNewProfile } from "@/lib/profileBoard";
import {
  GOALS_QUERY_KEY, GOAL_STEPS_QUERY_KEY, isOpenGoal, stepsForGoal, stepState, goalProgress, toggleStep,
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
  const mode = useWidgetMode();
  const all = useMemo(
    () => buildBalance({ alters, links, wishes, activities, categories, linkTypes }),
    [alters, links, wishes, activities, categories, linkTypes],
  );
  const rows = useMemo(() => all.slice(0, limitOf(settings, 5)), [all, settings]);
  // Expanded (v0.331.0) is the whole balance with Plan it on every item —
  // what the Needs page's Balance page shows.
  if (mode === "expanded") {
    return (
      <Section label={tr("widget.needs.label")}>
        <NeedsBalance rows={all} alters={alters} categories={categories} />
      </Section>
    );
  }
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

// On a profile: that alter's (or the group's members') wishes. On the
// alter's OWN profile their private wishes show too — private wishes never
// leave it. `show` picks open, finished or both. Expanded (v0.331.0) shows
// each wish's full card with its actions (`view: "cards"`; widgets placed
// before then keep the rows, `view: "list"`), and on an alter's profile
// starts with the quick add.
export function WishesWidget({ settings }) {
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const mode = useWidgetMode();
  const formatAlter = useAlterLabel();
  const wishes = useList(WISHES_QUERY_KEY, "Wish");
  const alters = useList("alters", "Alter");
  const alterById = useMemo(() => new Map(alters.map((a) => [a.id, a])), [alters]);
  const scope = useWidgetScope(settings);
  const scopeIds = useScopeAlterIds(settings);
  const ownAlterId = scope?.type === "alter" ? scope.id : null;
  const show = settings?.show || "open";
  // On a classic profile a wish opens on its Wishlist tab; the new profile
  // (v0.305.0) has no separate tab, so it opens on the Needs page.
  const ownOnClassic = ownAlterId && !usesNewProfile(alterById.get(ownAlterId));
  const wishPath = (id) => (ownOnClassic ? `/alter/${ownAlterId}?tab=wishlist&highlight=${id}` : `/needs?tab=wishes&highlight=${id}`);
  const categories = useList("activityCategories", "ActivityCategory");
  const cards = mode === "expanded" && (settings?.view || "cards") === "cards";
  const [showFinished, setShowFinished] = useState(false);
  const pool = useMemo(() => {
    return (wishes || []).filter((w) => {
      if (!w) return false;
      const owners = w.owner_alter_ids || [];
      if (w.is_private && !(ownAlterId && owners.includes(ownAlterId))) return false;
      if (scopeIds && !owners.some((id) => scopeIds.includes(id))) return false;
      return true;
    });
  }, [wishes, scopeIds, ownAlterId]);
  const list = useMemo(() => sortWishes(pool.filter((w) => (
    show === "finished" ? !isOpenWish(w) : show === "both" ? true : isOpenWish(w)
  ))).slice(0, limitOf(settings, 6)), [pool, show, settings]);
  const quickAdd = mode === "expanded" && ownAlterId
    ? <div className="mb-[0.6em]"><WishQuickAdd initialWhose={whosePicked([ownAlterId])} /></div>
    : null;
  if (cards) {
    // The full cards: every matching wish (no row limit), and with "Both",
    // the done and let-go ones folded under the open ones.
    const sorted = sortWishes(pool);
    const openOnes = show === "finished" ? [] : sorted.filter(isOpenWish);
    const doneOnes = show === "open" ? [] : sorted.filter((w) => !isOpenWish(w));
    const foldDone = show === "both";
    const card = (w) => (
      <WishCard key={w.id} wish={w} alters={alters} categories={categories} alterById={alterById} flat showOwners
        onChanged={() => qc.invalidateQueries({ queryKey: WISHES_QUERY_KEY })} />
    );
    return (
      <Section label={tr("widget.wishes.label")}>
        {quickAdd}
        {openOnes.length === 0 && (show !== "finished" || doneOnes.length === 0) && <Muted>{tr("widget.wishes.empty")}</Muted>}
        <div>{openOnes.map(card)}</div>
        {doneOnes.length > 0 && (foldDone ? (
          <div className="mt-[0.4em]">
            <button type="button" onClick={() => setShowFinished((v) => !v)} aria-expanded={showFinished}
              className="min-h-[2.75em] text-[0.75em] opacity-70 hover:opacity-100 flex items-center gap-[0.3em]">
              <ChevronDown className={`w-[1.2em] h-[1.2em] transition-transform ${showFinished ? "rotate-180" : ""}`} />
              Done and let go ({doneOnes.length})
            </button>
            {showFinished && <div>{doneOnes.map(card)}</div>}
          </div>
        ) : <div>{doneOnes.map(card)}</div>)}
      </Section>
    );
  }
  return (
    <Section label={tr("widget.wishes.label")}
      action={<TextAction onClick={() => navigate("/needs?tab=wishes")}>{tr("widget.today.open")}</TextAction>}>
      {quickAdd}
      {list.length === 0 && <Muted>{tr("widget.wishes.empty")}</Muted>}
      {list.map((w) => {
        const owner = w.for_everyone ? tr("widget.wishes.everyone")
          : (w.owner_alter_ids || []).map((id) => alterById.get(id)).filter(Boolean).map((a) => formatAlter(a)).join(", ");
        const status = isOpenWish(w) ? wishAgeLabel(w) : wishStatusLabel(w.status);
        return (
          <Row key={w.id} left={<span aria-hidden="true" className="text-xs">{wishKindMeta(w.kind).emoji}</span>}
            primary={`${w.title}${w.is_private ? " 🔒" : ""}`} secondary={owner} right={status}
            onClick={() => navigate(wishPath(w.id))} />
        );
      })}
    </Section>
  );
}

// Goals (v0.322.0): each goal's next step with a checkbox that ticks it
// through the Goals page's own toggleStep (a to-do step ticks its to-do,
// a plan step resolves the plan). Expanded lists every open step.
export function GoalsWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mode = useWidgetMode();
  const goals = useList(GOALS_QUERY_KEY, "Goal");
  const steps = useList(GOAL_STEPS_QUERY_KEY, "GoalStep");
  const tasks = useList("tasks", "Task");
  const activities = useList("activities", "Activity");
  const templates = useList("dailyTaskTemplates", "DailyTaskTemplate");
  const progress = useList("dailyProgress", "DailyProgress");
  const [busyId, setBusyId] = useState(null);
  const ctx = useMemo(() => ({ tasks, activities, templates, progress, now: new Date() }), [tasks, activities, templates, progress]);
  const rows = useMemo(() => goals
    // Top-level goals only: sections live inside their page.
    .filter((g) => !g.parent_id && isOpenGoal(g) && g.status !== "paused")
    .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))
    .slice(0, limitOf(settings, 5))
    .map((g) => {
      const mine = stepsForGoal(steps, g.id).filter((s) => s.kind !== "text" && s.kind !== "link");
      const { done, total } = goalProgress(mine, ctx);
      const open = mine.map((s) => ({ step: s, state: stepState(s, ctx) })).filter((x) => !x.state.done && !x.state.ongoing);
      return { goal: g, done, total, next: open[0] || null, open };
    }), [goals, steps, ctx, settings]);
  const tick = async (step, state) => {
    if (busyId) return;
    setBusyId(step.id);
    try {
      await toggleStep(step, state);
      qc.invalidateQueries({ queryKey: GOAL_STEPS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e?.message || tr("widget.goals.failed")); }
    finally { setBusyId(null); }
  };
  const stepCheck = (step, state) => (
    <button key={step.id} type="button" onClick={() => tick(step, state)} disabled={!!busyId}
      className="flex items-center gap-2 text-left w-full min-h-[28px] pl-5 disabled:opacity-50 hover:bg-muted/30 rounded-md -mx-1 px-1"
      aria-label={tr("widget.goals.tick", { step: step.title })}>
      <span className="w-3.5 h-3.5 rounded-[4px] border flex-shrink-0" style={{ borderColor: "var(--v2-accent)" }} />
      <span className="text-xs truncate min-w-0">{step.title}</span>
    </button>
  );
  return (
    <Section label={tr("widget.goals.label")}
      action={<TextAction onClick={() => navigate("/goals?new=1")}>{tr("widget.goals.new")}</TextAction>}>
      {rows.length === 0 && <Muted>{tr("widget.goals.empty")}</Muted>}
      {rows.map((r) => (
        <div key={r.goal.id}>
          <Row left={<Target className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />}
            primary={r.goal.title}
            secondary={mode === "minimal" ? r.next?.step.title : undefined}
            right={r.total > 0 ? `${r.done}/${r.total}` : tr("widget.goals.ongoing")}
            onClick={() => navigate(`/goals?page=${r.goal.id}`)} />
          {mode === "normal" && r.next && stepCheck(r.next.step, r.next.state)}
          {mode === "expanded" && r.open.map((x) => stepCheck(x.step, x.state))}
        </div>
      ))}
    </Section>
  );
}

// Add a wish (v0.331.0): the quick add on its own. Whose defaults to who's
// in front when Add is tapped; "Whole system" or picked alters instead.
// On an alter's profile it starts on that alter.
export function WishAddWidget({ settings }) {
  const tr = useT();
  const scope = useWidgetScope(settings);
  const ownAlterId = scope?.type === "alter" ? scope.id : null;
  const initial = ownAlterId ? whosePicked([ownAlterId]) : null;
  return (
    <Section label={tr("widget.wishAdd.label")}>
      <WishQuickAdd key={ownAlterId || "home"} initialWhose={initial} showKinds={settings?.kinds !== false} />
    </Section>
  );
}

// Turns (v0.331.0): open turn agreements, with Kept / Let go right there.
// Expanded is the whole Turns page: the new-agreement form, planning the
// second turn, notes, and the kept / let-go ones folded away.
export function TurnsWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const mode = useWidgetMode();
  const alters = useList("alters", "Alter");
  const turns = useList(TURNS_QUERY_KEY, "TurnAgreement");
  const activities = useList("activities", "Activity");
  const categories = useList("activityCategories", "ActivityCategory");
  if (mode === "expanded") {
    return (
      <Section label={tr("widget.turns.label")}>
        <NeedsTurns alters={alters} turns={turns} activities={activities} categories={categories} />
      </Section>
    );
  }
  const open = sortTurns(turns).filter((x) => turnState(x, activities) === "open").slice(0, limitOf(settings, 4));
  return (
    <Section label={tr("widget.turns.label")}
      action={<TextAction onClick={() => navigate("/needs?tab=turns")}>{tr("widget.today.open")}</TextAction>}>
      {open.length === 0 && <Muted>{tr("widget.turns.empty")}</Muted>}
      {mode === "minimal"
        ? open.map((x) => (
          <Row key={x.id} primary={x.first_title} secondary={tr("widget.turns.then", { what: x.second_title })}
            onClick={() => navigate(`/needs?tab=turns&highlight=${x.id}`)} />
        ))
        : <div>{open.map((x) => <TurnCard key={x.id} turn={x} alters={alters} activities={activities} categories={categories} compact />)}</div>}
    </Section>
  );
}
