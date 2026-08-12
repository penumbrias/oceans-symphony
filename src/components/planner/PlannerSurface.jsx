// The planner surface: canvas + every sheet and modal that acts on it.
//
// The /planner page and the home-screen activity widgets both render this,
// so the gestures, the day list, the member assignment and the writes exist
// once. `dayCount` picks a week or a single day; `chrome` turns the toolbar
// and totals off for a widget that has its own header.
//
// Reads and writes the SAME Activity records — no new entity, no migration.

import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addWeeks, startOfWeek, format } from "date-fns";
import { ChevronLeft, ChevronRight, Users, Heart } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import WeekCanvas from "@/components/planner/WeekCanvas";
import DayPlanSheet from "@/components/planner/DayPlanSheet";
import ActivityLogModal from "@/components/activities/ActivityLogModal";
import ActivityPlanModal from "@/components/activities/ActivityPlanModal";
import ActivityDetailsModal from "@/components/activities/ActivityDetailsModal";
import { useTerms } from "@/lib/useTerms";
import { useT } from "@/lib/i18n";
import { lookToStyle, resolveUserStyles } from "@/lib/widgetLook";
import { widgetLookFor } from "@/pages/ExperimentalDashboard";
import { MINUTES_PER_DAY } from "@/lib/planner/layout";
import { rollup, goalProgress } from "@/lib/planner/rollup";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { SearchableMultiList } from "@/v2/widgets";
import AlterSortToggle from "@/components/shared/AlterSortToggle";
import { useAlterSorter } from "@/lib/alterSort";
import { BarChart3, CopyPlus, ChevronDown } from "lucide-react";

const lsGet = (k, d) => {
  try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; }
};
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

const fmt = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

export default function PlannerSurface({
  dayCount = 7,
  chrome = true,
  anchor: anchorProp,
  onAnchorChange,
  maxHeight,
  applyPageLook = true,
}) {
  const t = useTerms();
  const tr = useT();
  const formatAlter = useAlterLabel();
  const [showTotals, setShowTotals] = useState(false);
  const qc = useQueryClient();
  const [ownAnchor, setOwnAnchor] = useState(() => new Date());
  const anchor = anchorProp || ownAnchor;
  const setAnchor = (v) => {
    const next = typeof v === "function" ? v(anchor) : v;
    if (onAnchorChange) onAnchorChange(next); else setOwnAnchor(next);
  };
  const [overlays, setOverlays] = useState(() => lsGet("symphony_planner_overlays_v1", { alters: false, emotions: false }));
  const [creating, setCreating] = useState(null);   // { day, fromMin, toMin, plan }
  const [opened, setOpened] = useState(null);
  const [planDay, setPlanDay] = useState(null);       // day whose list is open
  const [timing, setTiming] = useState(null);          // { item, day } being scheduled
  const [timeValue, setTimeValue] = useState("09:00");
  const [durValue, setDurValue] = useState(60);
  const [noteValue, setNoteValue] = useState("");

  const { data: activities = [] } = useQuery({ queryKey: ["activities"], queryFn: () => base44.entities.Activity.list() });
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: frontingHistory = [] } = useQuery({
    queryKey: ["frontingHistory"], queryFn: () => base44.entities.FrontingSession.list(),
    enabled: overlays.alters,
  });
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"], queryFn: () => base44.entities.EmotionCheckIn.list(),
    enabled: overlays.emotions,
  });

  // The planner wears the same look the v2 widgets do, so a style preset
  // set on the home screen carries here: accent, radius, borders, fonts and
  // colours all arrive as CSS variables and the markup below reads them.
  const { data: settingsRows = [] } = useQuery({
    queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settingsRow = settingsRows[0];
  const pageLook = useMemo(() => {
    const userStyles = resolveUserStyles(settingsRow?.ui_v2_styles);
    const styleMode = settingsRow?.ui_v2_home?.styleMode || "current";
    return lookToStyle(widgetLookFor({}, userStyles, styleMode));
  }, [settingsRow]);

  const { data: goals = [] } = useQuery({ queryKey: ["activityGoals"], queryFn: () => base44.entities.ActivityGoal.list() });

  // Fronters first, then whatever order the user picked — the standard
  // arrangement for every member list in the app.
  const sorter = useAlterSorter("symphony_planner_alter_sort");
  const memberOptions = useMemo(
    () => sorter.sort(alters.filter((a) => !a.is_archived))
      .map((a) => ({ id: a.id, label: formatAlter(a), color: a.color, avatarUrl: a.avatar_url })),
    [alters, sorter, formatAlter]
  );

  const weekRange = useMemo(() => {
    const from = startOfWeek(anchor, { weekStartsOn: 1 });
    return { from, to: new Date(from.getTime() + 7 * 86400000) };
  }, [anchor]);

  const totals = useMemo(() => rollup({
    activities, from: weekRange.from, to: weekRange.to, categories,
    alterIds: Object.fromEntries(alters.map((a) => [a.id, formatAlter(a)])),
  }), [activities, weekRange, categories, alters, formatAlter]);

  const goalRows = useMemo(
    () => goalProgress({ goals, rollupResult: totals, categories }),
    [goals, totals, categories]
  );

  // The work rota changes weekly, so the fastest way to set it is to take
  // last week and shift it seven days. Copies PLANS only — logs are history.
  const copyLastWeek = async () => {
    const prevFrom = new Date(weekRange.from.getTime() - 7 * 86400000);
    const source = activities.filter(
      (a) => a.timestamp && new Date(a.timestamp) >= prevFrom && new Date(a.timestamp) < weekRange.from
    );
    if (!source.length) { toast.info(tr("planner.copyNothing")); return; }
    try {
      for (const a of source) {
        const when = new Date(new Date(a.timestamp).getTime() + 7 * 86400000);
        await base44.entities.Activity.create({
          activity_name: a.activity_name,
          parent_category_id: a.parent_category_id || null,
          duration_minutes: a.duration_minutes ?? a.actual_duration_minutes ?? null,
          fronting_alter_ids: a.fronting_alter_ids || [],
          timestamp: when.toISOString(),
          // Always a PLAN — copying last week is scheduling, not claiming
          // you already did it.
          status: "scheduled",
        });
      }
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success(tr("planner.copied", { count: source.length }));
    } catch (e) { toast.error(e.message || "Copy failed"); }
  };

  const catColor = useMemo(() => {
    const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
    return (id) => byId[id]?.color || null;
  }, [categories]);

  const setOverlay = (key, on) => {
    const next = { ...overlays, [key]: on };
    setOverlays(next);
    lsSet("symphony_planner_overlays_v1", next);
  };

  const handleCreate = (day, fromMin, toMin) => {
    const start = new Date(day);
    start.setHours(Math.floor(fromMin / 60), fromMin % 60, 0, 0);
    // Future ranges are plans, past ranges are logs — the same split the
    // tracker already makes, so the right fields appear.
    setCreating({ day, fromMin, toMin, plan: start.getTime() > Date.now() });
  };

  // Dragging an edge only ever changes when it started and how long it ran.
  const handleResize = async (id, day, startMin, endMin) => {
    const activity = activities.find((a) => a.id === id);
    if (!activity) return;
    const start = new Date(day);
    start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    const minutes = Math.max(1, Math.min(MINUTES_PER_DAY, endMin - startMin));
    try {
      await base44.entities.Activity.update(id, {
        timestamp: start.toISOString(),
        // Keep whichever duration field this record already used.
        ...(activity.actual_duration_minutes != null
          ? { actual_duration_minutes: minutes }
          : { duration_minutes: minutes }),
      });
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || tr("planner.moveFailed")); }
  };

  // Give an untimed intention a slot: the SAME record gains a timestamp, so
  // it moves from the strip into the grid without losing its identity (or
  // its link back to the to-do it came from).
  const applyTime = async () => {
    if (!timing) return;
    const [h, m] = String(timeValue).split(":").map(Number);
    const when = new Date(timing.day);
    when.setHours(h || 0, m || 0, 0, 0);
    try {
      const wasScheduled = timing.item.status === "scheduled";
      const from = timing.item.timestamp;
      const prevMins = Number(timing.item.actual_duration_minutes) || Number(timing.item.duration_minutes) || 0;
      const unchanged = from === when.toISOString()
        && prevMins === Math.max(5, Number(durValue) || 60);
      await base44.entities.Activity.update(timing.item.id, {
        timestamp: when.toISOString(),
        duration_minutes: Math.max(5, Number(durValue) || 60),
        // Moving a plan is a reschedule, not a new plan: status stays
        // `scheduled` and the move is recorded, matching the tracker's model.
        ...(wasScheduled && from && from !== when.toISOString()
          ? { reschedule_history: [...(timing.item.reschedule_history || []), { from, to: when.toISOString(), ts: new Date().toISOString() }] }
          : {}),
      });
      qc.invalidateQueries({ queryKey: ["activities"] });
      setTiming(null);
      // Say what happened. A move of one column at the same time is easy to
      // miss — especially if it lands outside the scrolled view — and the
      // sheet closing with no word for it reads as the button doing nothing.
      if (unchanged) toast.info(tr("planner.noChange"));
      else toast.success(tr("planner.rescheduled", { when: format(when, "EEE d MMM, HH:mm") }));
    } catch (e) { toast.error(e.message || tr("planner.moveFailed")); }
  };

  // Done from the strip. If it came from a to-do, tick that off too so the
  // two can't disagree.
  const markUntimedDone = async (item) => {
    try {
      await base44.entities.Activity.update(item.id, {
        status: "done",
        timestamp: item.timestamp || new Date().toISOString(),
      });
      if (item.task_id) {
        await base44.entities.Task.update(item.task_id, {
          completed: true, is_complete: true, completed_date: new Date().toISOString(),
        }).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setTiming(null);
      toast.success(tr("planner.doneToast"));
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  // Toggle a member on the open entry. Writes straight through so the totals
  // update without needing a save step.
  const toggleAlter = async (alterId) => {
    if (!timing) return;
    const current = timing.item.fronting_alter_ids || [];
    const next = current.includes(alterId) ? current.filter((x) => x !== alterId) : [...current, alterId];
    setTiming((prev) => ({ ...prev, item: { ...prev.item, fronting_alter_ids: next } }));
    try {
      await base44.entities.Activity.update(timing.item.id, { fronting_alter_ids: next });
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  // Resolve a plan: what actually became of it. The lifecycle enum exists so
  // a plan that didn't happen stays honest instead of counting as time spent.
  const setOutcome = async (status) => {
    if (!timing) return;
    try {
      await base44.entities.Activity.update(timing.item.id, {
        status,
        // A resolved entry needs a time to sit at; keep its own if it has one.
        timestamp: timing.item.timestamp || new Date().toISOString(),
      });
      if (timing.item.task_id && status === "done") {
        await base44.entities.Task.update(timing.item.task_id, {
          completed: true, is_complete: true, completed_date: new Date().toISOString(),
        }).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setTiming(null);
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  const saveNote = async (text) => {
    if (!timing) return;
    try {
      await base44.entities.Activity.update(timing.item.id, { notes: text });
      setTiming((prev) => (prev ? { ...prev, item: { ...prev.item, notes: text } } : prev));
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  const done = () => {
    setCreating(null);
    setOpened(null);
    qc.invalidateQueries({ queryKey: ["activities"] });
  };

  // Plain range rather than "w/c" — that's British shorthand for "week
  // commencing" and means nothing to most people.
  const weekLabel = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const end = new Date(start.getTime() + 6 * 86400000);
    const sameMonth = start.getMonth() === end.getMonth();
    return sameMonth
      ? `${format(start, "d")}–${format(end, "d MMM")}`
      : `${format(start, "d MMM")} – ${format(end, "d MMM")}`;
  }, [anchor]);
  // The canvas used to print its own range line under this one, saying the
  // same thing twice. One heading row.
  const weekTotalLabel = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const end = new Date(start.getTime() + 7 * 86400000);
    const mins = activities.reduce((n, a) => {
      const t = a.timestamp ? new Date(a.timestamp) : null;
      if (!t || t < start || t >= end) return n;
      return n + (Number(a.actual_duration_minutes) || Number(a.duration_minutes) || 0);
    }, 0);
    const h = Math.floor(mins / 60), m = mins % 60;
    return mins ? `· ${h ? `${h}h ` : ""}${m ? `${m}m` : ""}`.trim() : "";
  }, [anchor, activities]);

  return (
    <div className={chrome ? "min-h-screen p-2 sm:p-4" : "flex flex-col min-h-0 h-full"}
      style={applyPageLook ? pageLook : undefined}
      {...(applyPageLook ? { "data-widget-content": true } : {})}>
      <div className={chrome ? "os-page-shell space-y-2" : "flex flex-col min-h-0 h-full"}>
        {chrome && <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" aria-label={tr("planner.prevWeek")} onClick={() => setAnchor((d) => addWeeks(d, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium tabular-nums">{weekLabel}</span>
            <Button variant="ghost" size="sm" aria-label={tr("planner.nextWeek")} onClick={() => setAnchor((d) => addWeeks(d, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>{tr("planner.today")}</Button>
            <span className="text-xs text-muted-foreground tabular-nums ml-1">{weekTotalLabel}</span>
            <Button variant="ghost" size="sm" className="gap-1" onClick={copyLastWeek}
              title={tr("planner.copyWeek")}>
              <CopyPlus className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setShowTotals((v) => !v)}
              aria-expanded={showTotals} title={tr("planner.totals")}>
              <BarChart3 className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" style={{ transform: showTotals ? "rotate(180deg)" : "none" }} />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setOverlay("alters", !overlays.alters)}
              aria-pressed={overlays.alters}
              className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${
                overlays.alters ? "border-[var(--v2-accent)] bg-[color-mix(in_srgb,var(--v2-accent)_12%,transparent)] text-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
              }`}>
              <Users className="w-3 h-3" /> {tr("planner.overlay.fronting", { term: t.Fronting })}
            </button>
            <button type="button" onClick={() => setOverlay("emotions", !overlays.emotions)}
              aria-pressed={overlays.emotions}
              className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${
                overlays.emotions ? "border-[var(--v2-accent)] bg-[color-mix(in_srgb,var(--v2-accent)_12%,transparent)] text-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
              }`}>
              <Heart className="w-3 h-3" /> {tr("planner.overlay.checkins")}
            </button>
          </div>
        </div>}

        {chrome && showTotals && (
          <div className="rounded-lg border border-border/50 p-2 space-y-2 text-xs"
            style={{ borderRadius: "var(--v2-radius, 8px)" }}>
            {totals.total === 0 && <p className="text-muted-foreground">{tr("planner.nothingTracked")}</p>}
            {totals.activities.length > 0 && (
              <div>
                <p className="font-semibold uppercase tracking-wide text-[0.625em] text-muted-foreground mb-1">
                  {tr("planner.byActivity")}
                </p>
                {totals.activities.slice(0, 8).map((a) => (
                  <div key={a.key} className="flex items-center justify-between gap-2">
                    <span className="truncate">{a.label}</span>
                    <span className="tabular-nums text-muted-foreground">{fmt(a.minutes)}</span>
                  </div>
                ))}
              </div>
            )}
            {totals.alters.length > 0 && (
              <div>
                <p className="font-semibold uppercase tracking-wide text-[0.625em] text-muted-foreground mb-1">
                  {tr("planner.byMember", { members: t.alters })}
                </p>
                {totals.alters.map((a) => (
                  <div key={a.key} className="flex items-center justify-between gap-2">
                    <span className="truncate">{a.label}</span>
                    <span className="tabular-nums text-muted-foreground">{fmt(a.minutes)}</span>
                  </div>
                ))}
              </div>
            )}
            <div>
              <p className="font-semibold uppercase tracking-wide text-[0.625em] text-muted-foreground mb-1">
                {tr("planner.goals")}
              </p>
              {goalRows.length === 0 && <p className="text-muted-foreground">{tr("planner.noGoals")}</p>}
              {goalRows.map((g) => (
                <div key={g.id} className="space-y-0.5 mb-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{g.label}</span>
                    <span className="tabular-nums text-muted-foreground">{fmt(g.done)} / {fmt(g.target)}</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${g.pct}%`, background: g.color || "var(--v2-accent)" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <WeekCanvas
          anchor={anchor}
          dayCount={dayCount}
          maxHeight={maxHeight}
          fill={!chrome}
          activities={activities}
          frontingHistory={frontingHistory}
          emotionCheckIns={emotionCheckIns}
          alters={alters}
          categoryColor={catColor}
          overlays={overlays}
          onCreate={handleCreate}
          onOpenBlock={(item) => {
            const start = item.timestamp ? new Date(item.timestamp) : null;
            setTiming({ item, day: start || anchor });
            setTimeValue(start ? `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}` : "09:00");
            setDurValue(Number(item.actual_duration_minutes) || Number(item.duration_minutes) || 60);
            setNoteValue(item.notes || "");
          }}
          onResize={handleResize}
          onAddToDay={(day) => setPlanDay(day)}
          onOpenUntimed={(item, day) => {
            setTiming({ item, day }); setTimeValue("09:00"); setDurValue(60); setNoteValue(item.notes || "");
          }}
        />
      </div>

      {creating && !creating.plan && (
        <ActivityLogModal
          isOpen
          onClose={() => setCreating(null)}
          startDate={creating.day}
          endDate={creating.day}
          startHour={Math.floor(creating.fromMin / 60)}
          startMinute={creating.fromMin % 60}
          endHour={Math.floor(creating.toMin / 60)}
          endMinute={creating.toMin % 60}
          alters={alters}
          onSave={done}
        />
      )}
      {creating && creating.plan && (
        <ActivityPlanModal
          isOpen
          onClose={() => setCreating(null)}
          startDate={creating.day}
          endDate={creating.day}
          startHour={Math.floor(creating.fromMin / 60)}
          startMinute={creating.fromMin % 60}
          endHour={Math.floor(creating.toMin / 60)}
          endMinute={creating.toMin % 60}
          alters={alters}
          onSave={done}
        />
      )}
      <DayPlanSheet day={planDay} open={!!planDay} onClose={() => setPlanDay(null)} />

      {/* Portaled to the body: a v2 board is framer-transformed, which
          re-anchors `position: fixed` to the board instead of the viewport —
          so an un-portaled sheet renders inside the widget and gets clipped
          by it, which is why its buttons did nothing. */}
      {timing && createPortal((
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center"
          style={{ paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px))" }}
          onClick={(e) => { if (e.target === e.currentTarget) setTiming(null); }}>
          {/* A sheet taller than the screen must scroll, not overflow off the
              top — with member list, notes and outcomes it can exceed a short
              viewport. */}
          <div className="bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border p-3 space-y-3 max-h-full overflow-y-auto overscroll-contain"
            style={{ borderRadius: "var(--v2-radius, 16px)" }}>
            <p className="text-sm font-semibold truncate">{timing.item.activity_name}</p>
            {/* Move to another day — a row of taps rather than a sideways
                drag, so it works the same on a phone. Keeps the time. */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">{tr("planner.moveToDay")}</p>
              <div className="flex gap-1">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(startOfWeek(anchor, { weekStartsOn: 1 }).getTime() + i * 86400000);
                  const on = new Date(timing.day).toDateString() === d.toDateString();
                  return (
                    <button key={i} type="button" aria-pressed={on}
                      onClick={() => setTiming((prev) => ({ ...prev, day: d }))}
                      className={`flex-1 text-[0.6875em] py-1 rounded border ${
                        on ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
                      }`}>
                      {format(d, "EEEEE")}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-end gap-2">
              <label className="flex-1 text-xs text-muted-foreground">
                {tr("planner.giveTime")}
                <input type="time" value={timeValue} onChange={(e) => setTimeValue(e.target.value)}
                  className="mt-1 w-full h-9 px-2 rounded-lg border border-input bg-background text-sm" />
              </label>
              <label className="w-24 text-xs text-muted-foreground">
                min
                <input type="number" min={5} step={5} value={durValue}
                  onChange={(e) => setDurValue(e.target.value)}
                  className="mt-1 w-full h-9 px-2 rounded-lg border border-input bg-background text-sm" />
              </label>
            </div>
            {/* Who was doing it — this is what makes the per-member totals
                answer "is everyone getting fair time".
                House rule: never a bare list of members. Searchable and
                scrollable, whoever is fronting first, one-tap sort toggle —
                the same picker every other member list uses. A flat chip row
                is unusable once a system has more than a handful. */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-xs text-muted-foreground">{tr("planner.who")}</p>
                <AlterSortToggle sorter={sorter} />
              </div>
              <SearchableMultiList
                options={memberOptions}
                selectedIds={timing.item.fronting_alter_ids || []}
                onToggle={toggleAlter}
                searchPlaceholder={tr("planner.searchMembers", { members: t.alters })}
              />
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">{tr("planner.notes")}</p>
              <textarea
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                onBlur={() => { if (noteValue !== (timing.item.notes || "")) saveNote(noteValue); }}
                rows={2}
                placeholder={tr("planner.notesPlaceholder")}
                className="w-full rounded-lg border border-input bg-background text-sm p-2"
              />
            </div>

            {/* What became of it. A plan that didn't happen must be sayable —
                otherwise it either nags forever or quietly counts as done. */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">{tr("planner.outcome")}</p>
              <div className="flex flex-wrap gap-1">
                {[["done", tr("planner.done")], ["partial", tr("planner.partial")],
                  ["skipped", tr("planner.skipped")], ["cancelled", tr("planner.cancelled")]].map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={timing.item.status === id}
                    onClick={() => setOutcome(id)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      timing.item.status === id
                        ? "text-[var(--v2-accent)] border-[var(--v2-accent)]"
                        : "border-border/50 text-muted-foreground"
                    }`}>{label}</button>
                ))}
              </div>
            </div>

            <Button size="sm" className="w-full" onClick={applyTime}>
              {timing.item.timestamp ? tr("planner.reschedule") : tr("planner.giveTime")}
            </Button>
            <Button size="sm" variant="ghost" className="w-full"
              onClick={() => { setOpened(timing.item); setTiming(null); }}>{tr("planner.openItem")}</Button>
          </div>
        </div>
      ), document.body)}

      {opened && (
        <ActivityDetailsModal
          isOpen
          activity={opened}
          alters={alters}
          onClose={() => setOpened(null)}
          onSave={done}
        />
      )}
    </div>
  );
}
