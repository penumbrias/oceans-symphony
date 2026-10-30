// Home-screen widgets for System Needs: the balance (who's been waiting
// longest for something they enjoy), everyone's wishes, and open goals.
// Each is one Section (widget contract) and reads the same helpers the
// Needs and Goals pages use, so the numbers always agree.

import React, { useMemo, useState } from "react";
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
import { buildBalance, ALTER_ACTIVITY_LINKS_QUERY_KEY } from "@/lib/needs";
import { LINK_TYPES_QUERY_KEY } from "@/lib/activityLinks";
import { WISHES_QUERY_KEY, WISH_KINDS, isOpenWish, sortWishes, wishKindMeta, wishAgeLabel, wishStatusLabel, createWish } from "@/lib/wishes";
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

// On a profile: that alter's (or the group's members') wishes. On the
// alter's OWN profile their private wishes show too — private wishes never
// leave it. `show` picks open, finished or both; Expanded on an alter's
// profile adds a quick add.
function WishQuickAdd({ alterId }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("item");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createWish({ title, kind, ownerIds: [alterId] });
      setTitle("");
      qc.invalidateQueries({ queryKey: WISHES_QUERY_KEY });
    } catch (e) { toast.error(e?.message || "Couldn't save that."); } finally { setBusy(false); }
  };
  return (
    <div data-own-hold="" className="space-y-[0.4em] mb-[0.5em]">
      <div className="flex gap-[0.4em]">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Something wished for…" aria-label="New wish"
          className="flex-1 min-w-0 h-11 px-3 rounded-lg border text-[0.875em]"
          style={{ borderColor: "color-mix(in srgb, currentColor 20%, transparent)", background: "transparent" }} />
        <button type="button" onClick={add} disabled={busy || !title.trim()} className="h-11 px-4 rounded-lg text-[0.8125em] font-medium disabled:opacity-40"
          style={{ background: "var(--v2-accent)", color: "var(--v2-on-accent, #fff)" }}>Add</button>
      </div>
      <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-[0.3em]">
        {WISH_KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}
            className="min-h-[2.25em] px-[0.7em] rounded-full border text-[0.8125em]"
            style={kind === k.id
              ? { borderColor: "var(--v2-accent)", background: "color-mix(in srgb, var(--v2-accent) 14%, transparent)" }
              : { borderColor: "color-mix(in srgb, currentColor 20%, transparent)" }}>
            <span aria-hidden="true">{k.emoji}</span> {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WishesWidget({ settings }) {
  const tr = useT();
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
  const list = useMemo(() => {
    const pool = (wishes || []).filter((w) => {
      if (!w) return false;
      const owners = w.owner_alter_ids || [];
      if (w.is_private && !(ownAlterId && owners.includes(ownAlterId))) return false;
      if (scopeIds && !owners.some((id) => scopeIds.includes(id))) return false;
      if (show === "finished") return !isOpenWish(w);
      if (show === "both") return true;
      return isOpenWish(w);
    });
    return sortWishes(pool).slice(0, limitOf(settings, 6));
  }, [wishes, settings, scopeIds, ownAlterId, show]);
  return (
    <Section label={tr("widget.wishes.label")}
      action={<TextAction onClick={() => navigate("/needs?tab=wishes")}>{tr("widget.today.open")}</TextAction>}>
      {mode === "expanded" && ownAlterId && <WishQuickAdd alterId={ownAlterId} />}
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
  const StepCheck = ({ step, state }) => (
    <button type="button" onClick={() => tick(step, state)} disabled={!!busyId}
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
          {mode === "normal" && r.next && <StepCheck step={r.next.step} state={r.next.state} />}
          {mode === "expanded" && r.open.map((x) => <StepCheck key={x.step.id} step={x.step} state={x.state} />)}
        </div>
      ))}
    </Section>
  );
}
