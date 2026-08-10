// The new planner. Separate from the old Activity tracker, which keeps
// working untouched until this replaces it.
//
// Reads and writes the SAME Activity records — no new entity, no migration.

import React, { useMemo, useState } from "react";
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
import { BarChart3, CopyPlus, ChevronDown } from "lucide-react";

const lsGet = (k, d) => {
  try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; }
};
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

const fmt = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

export default function Planner() {
  const t = useTerms();
  const tr = useT();
  const formatAlter = useAlterLabel();
  const [showTotals, setShowTotals] = useState(false);
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(() => new Date());
  const [overlays, setOverlays] = useState(() => lsGet("symphony_planner_overlays_v1", { alters: false, emotions: false }));
  const [creating, setCreating] = useState(null);   // { day, fromMin, toMin, plan }
  const [opened, setOpened] = useState(null);
  const [planDay, setPlanDay] = useState(null);       // day whose list is open
  const [timing, setTiming] = useState(null);          // { item, day } being scheduled
  const [timeValue, setTimeValue] = useState("09:00");
  const [durValue, setDurValue] = useState(60);

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
      await base44.entities.Activity.update(timing.item.id, {
        timestamp: when.toISOString(),
        duration_minutes: Math.max(5, Number(durValue) || 60),
      });
      qc.invalidateQueries({ queryKey: ["activities"] });
      setTiming(null);
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
    <div className="min-h-screen p-2 sm:p-4" style={pageLook} data-widget-content>
      <div className="os-page-shell space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
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
        </div>

        {showTotals && (
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
          activities={activities}
          frontingHistory={frontingHistory}
          emotionCheckIns={emotionCheckIns}
          alters={alters}
          categoryColor={catColor}
          overlays={overlays}
          onCreate={handleCreate}
          onOpenBlock={setOpened}
          onResize={handleResize}
          onAddToDay={(day) => setPlanDay(day)}
          onOpenUntimed={(item, day) => { setTiming({ item, day }); setTimeValue("09:00"); setDurValue(60); }}
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

      {timing && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center"
          style={{ paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px))" }}
          onClick={(e) => { if (e.target === e.currentTarget) setTiming(null); }}>
          <div className="bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border p-3 space-y-3"
            style={{ borderRadius: "var(--v2-radius, 16px)" }}>
            <p className="text-sm font-semibold truncate">{timing.item.activity_name}</p>
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
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={applyTime}>{tr("planner.giveTime")}</Button>
              <Button size="sm" variant="outline" className="flex-1"
                onClick={() => markUntimedDone(timing.item)}>{tr("planner.markDone")}</Button>
            </div>
            <Button size="sm" variant="ghost" className="w-full"
              onClick={() => { setOpened(timing.item); setTiming(null); }}>{tr("planner.openItem")}</Button>
          </div>
        </div>
      )}

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
