// The planner surface: canvas + every sheet and modal that acts on it.
//
// The /planner page and the home-screen activity widgets both render this,
// so the gestures, the day list, the member assignment and the writes exist
// once. `dayCount` picks a week or a single day; `chrome` turns the toolbar
// and totals off for a widget that has its own header.
//
// Reads and writes the SAME Activity records — no new entity, no migration.

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addWeeks, addMonths, addYears, startOfWeek, format } from "date-fns";
import { ChevronLeft, ChevronRight, Users, Heart, Plus, MapPin, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import WeekCanvas from "@/components/planner/WeekCanvas";
import DayPlanSheet from "@/components/planner/DayPlanSheet";


import { startPlanActive } from "@/lib/planner/resolvePlan";
import { categoryIdOf } from "@/lib/planner/rollup";
import { useTerms } from "@/lib/useTerms";
import { useT } from "@/lib/i18n";
import { lookToStyle, resolveUserStyles } from "@/lib/widgetLook";
import { widgetLookFor } from "@/pages/ExperimentalDashboard";
import { MINUTES_PER_DAY } from "@/lib/planner/layout";
import { rollup, goalProgress } from "@/lib/planner/rollup";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePlannerPrefs, formatClock, HOUR_PX_MIN, HOUR_PX_MAX, DAY_PX_MIN, DAY_PX_MAX } from "@/lib/planner/displayPrefs";
import PlansList from "@/components/planner/PlansList";
import PlanDetailsSheet from "@/components/planner/PlanDetailsSheet";
import ActivityEditor, { SeriesDeleteSheet } from "@/components/activities/ActivityEditor";
import CurrentActivities, { ActivityActionMenu } from "@/components/activities/CurrentActivities";
// The tracker's overview calendars and panels, merged into the planner.
import ActivityMonthView from "@/components/activities/ActivityMonthView";
import ActivityYearView from "@/components/activities/ActivityYearView";
import ActivityGoalsPanel from "@/components/activities/ActivityGoalsPanel";
import PlanCompletionTracker from "@/components/activities/PlanCompletionTracker";
import ActivityTallyTracker from "@/components/activities/ActivityTallyTracker";
import ActivityNestingRecovery from "@/components/activities/ActivityNestingRecovery";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { collectAlterDates } from "@/lib/importantDates";
import { tasksAsCalendarItems } from "@/lib/planner/taskItems";
import { syncLinkedSleep, deleteLinkedSleep } from "@/lib/planner/linkedSleep";
import { withTrashBatch } from "@/lib/localDb";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

const lsGet = (k, d) => {
  try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; }
};
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

const VIEWS = ["day", "week", "month", "year"];

function PanelError({ label, onRetry }) {
  return (
    <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5 text-xs text-destructive">
      {label}: something went wrong showing this.
      <button type="button" onClick={onRetry} className="ml-2 underline hover:no-underline">Retry</button>
    </div>
  );
}

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
  // Per-instance display overrides (a widget's own weekStartsOn / timeFmt /
  // rowH config). Beat the shared preference when set.
  prefsOverride = null,
  // Per-instance overlay overrides (a widget's "Show who was fronting" /
  // "Show feelings" toggles). Only explicitly-set keys win; unset keys
  // keep following the page's shared pills.
  overlaysOverride = null,
  onSetPref = null,
  // Widget host: a plain tap on empty time opens the full page (the widget
  // is a window onto the planner, so tapping its body should go there).
  // Hold-to-create and tap-a-block still work exactly as on the page.
  onOpenPage = null,
  // Deep link: open this plan's details on mount (Planner page passes the
  // ?activityId= param through).
  openActivityId = null,
  onOpenedActivity = null,
  // Deep link: start on this date (the Planner page passes ?date=).
  initialAnchor = null,
}) {
  const t = useTerms();
  const tr = useT();
  const formatAlter = useAlterLabel();
  const [showDisplay, setShowDisplay] = useState(false);
  // The page's three parts (chrome only) — the tracker's Logged / Planned /
  // Plan tracker tabs, merged: the calendar, the scheduled-plans list
  // (series collapsed to one row each) and the insights (totals, goals,
  // follow-through, tally). Remembered, like the view.
  const [section, setSectionState] = useState(() => {
    const v = lsGet("symphony_planner_section_v1", "calendar");
    return ["calendar", "plans", "insights"].includes(v) ? v : "calendar";
  });
  const setSection = (v) => { setSectionState(v); lsSet("symphony_planner_section_v1", v); };
  // Calendar zoom (chrome only): day / week on the time canvas, month /
  // year as the overview calendars the tracker had. Starts from the
  // tracker's own remembered choice so nobody's view resets.
  const [view, setViewState] = useState(() => {
    const v = lsGet("symphony_planner_view_v1", null) ?? lsGet("symphony_act_view_mode", "week");
    return VIEWS.includes(v) ? v : "week";
  });
  const setView = (v) => { setViewState(v); lsSet("symphony_planner_view_v1", v); };
  const effDayCount = chrome ? (view === "day" ? 1 : 7) : dayCount;
  // Display prefs (row height / clock / week start) — the same keys the
  // classic tracker used, so nothing resets moving between the two.
  const [prefs, setPref] = usePlannerPrefs(prefsOverride);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ownAnchor, setOwnAnchor] = useState(() => initialAnchor || new Date());
  const anchor = anchorProp || ownAnchor;
  const setAnchor = (v) => {
    const next = typeof v === "function" ? v(anchor) : v;
    if (onAnchorChange) onAnchorChange(next); else setOwnAnchor(next);
  };
  const [ownOverlays, setOwnOverlays] = useState(() => lsGet("symphony_planner_overlays_v1", { alters: false, emotions: false }));
  const overlays = { ...ownOverlays, ...(overlaysOverride || {}) };
  const [planDay, setPlanDay] = useState(null);       // day whose list is open
  // Tapped empty time on the page → that hour's summary card.
  const [cellInfo, setCellInfo] = useState(null); // { day, min, rect }
  // Tapped fronting-lane bar → who/when card (bars alone are anonymous).
  const [bandInfo, setBandInfo] = useState(null);          // { item, day } being scheduled
  // Tapping an entry OPENS ITS DETAILS — a readable summary — rather than
  // dropping straight into the editor (owner spec). Edit is one tap away.
  const [details, setDetails] = useState(null);
  // Deleting a series member must ask how far the delete reaches.
  const [branchAsk, setBranchAsk] = useState(null); // { item }

  const { data: activities = [] } = useQuery({ queryKey: ["activities"], queryFn: () => base44.entities.Activity.list() });
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => base44.entities.Task.list() });
  const { data: frontingHistory = [] } = useQuery({
    queryKey: ["frontingHistory"], queryFn: () => base44.entities.FrontingSession.list(),
    enabled: overlays.alters || !!cellInfo,
  });
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"], queryFn: () => base44.entities.EmotionCheckIn.list(),
    enabled: overlays.emotions || !!cellInfo,
  });
  // Location records pin onto the canvas at their time (on unless turned off).
  const { data: locationRecords = [] } = useQuery({
    queryKey: ["locations"], queryFn: () => base44.entities.Location.list(),
    enabled: overlays.locations !== false,
  });

  // The planner wears the same look the v2 widgets do, so a style preset
  // set on the home screen carries here: accent, radius, borders, fonts and
  // colours all arrive as CSS variables and the markup below reads them.
  const { data: settingsRows = [] } = useQuery({
    queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settingsRow = pickPrimarySystemSettings(settingsRows);
  const pageLook = useMemo(() => {
    const userStyles = resolveUserStyles(settingsRow?.ui_v2_styles);
    const styleMode = settingsRow?.ui_v2_home?.styleMode || "current";
    return lookToStyle(widgetLookFor({}, userStyles, styleMode));
  }, [settingsRow]);

  const { data: goals = [] } = useQuery({ queryKey: ["activityGoals"], queryFn: () => base44.entities.ActivityGoal.list() });

  const weekRange = useMemo(() => {
    const from = startOfWeek(anchor, { weekStartsOn: prefs.weekStartsOn });
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

  // ("Copy last week" lived here until v0.229.0 — removed at the owner's
  // request: it wrote a week of plans with no confirmation and no easy
  // undo.)

  const catColor = useMemo(() => {
    const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
    return (id) => byId[id]?.color || null;
  }, [categories]);

  const setOverlay = (key, on) => {
    const next = { ...ownOverlays, [key]: on };
    setOwnOverlays(next);
    lsSet("symphony_planner_overlays_v1", next);
  };

  // A running quick-start activity tapped in the grid — the same
  // ActivityActionMenu the dashboard pill opens (edit start, pause,
  // end & log, discard). Reuse, don't fork.
  const [liveMenu, setLiveMenu] = useState(null);
  // Every create and edit opens THE shared activity editor (owner,
  // 2026-10-23) — the same sheet the quick actions bar, the board's tracker
  // widgets and a to-do's "More options" open.
  const [editorReq, setEditorReq] = useState(null);
  const openCreate = (day, fromMin, toMin) => {
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(fromMin);
    setEditorReq({ create: true, start, minutes: Math.max(15, toMin - fromMin) });
  };
  const openEditor = (item, { day = null, series = false, focusDay = false } = {}) => {
    setDetails(null);
    setEditorReq({ item, day, series, focusDay });
  };
  // Reschedule from a plan's details: the editor, with the day picker open.
  const rescheduleFromDetails = (item) => openEditor(item, { focusDay: true });
  // Deep link from anywhere that lists a plan (Today widget, notices,
  // unresolved card): land on its day with its details open.
  useEffect(() => {
    if (!openActivityId) return;
    const found = (activities || []).find((a) => a.id === openActivityId);
    if (!found) return;
    const when = found.timestamp || found.planned_date;
    if (when) setAnchor(new Date(when));
    setDetails(found);
    onOpenedActivity?.();
  }, [openActivityId, activities]);  

  const handleCreate = (day, fromMin, toMin) => openCreate(day, fromMin, toMin);
  // Tap-first route (rule 28): the toolbar + opens a create for the next
  // whole hour today, and every field is adjustable in the sheet.
  const openCreateNow = () => {
    const d = new Date();
    const startMin = Math.min(23 * 60, (d.getHours() + 1) * 60);
    openCreate(d, startMin, startMin + 60);
  };
  // Dragging an edge only ever changes when it started and how long it ran.
  const handleResize = async (id, day, startMin, endMin) => {
    const activity = activities.find((a) => a.id === id);
    if (!activity) return;
    // Minutes from this column's midnight; may be NEGATIVE (a multi-day
    // block resized from its last day starts on an earlier one).
    // setMinutes normalises either direction; the old setHours(floor/60,
    // %60) split mis-handled negatives.
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(startMin);
    // No one-day ceiling: dragging the bottom edge sideways into later
    // days hands in endMin > 1440, and multi-day blocks already render
    // with continuation edges. 14 days is a sanity cap, not a feature.
    const minutes = Math.max(1, Math.min(MINUTES_PER_DAY * 14, endMin - startMin));
    try {
      const patch = {
        timestamp: start.toISOString(),
        // Keep whichever duration field this record already used.
        ...(activity.actual_duration_minutes != null
          ? { actual_duration_minutes: minutes }
          : { duration_minutes: minutes }),
      };
      await base44.entities.Activity.update(id, patch);
      await syncLinkedSleep(activity, patch);
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || tr("planner.moveFailed")); }
  };


  // Arrows step by whatever the calendar shows (a day, a week, a month, a
  // year); the plans list has no date, insights follow the week.
  const stepAnchor = (dir) => {
    const v = section === "calendar" ? view : "week";
    setAnchor((d) => (v === "day" ? addDays(d, dir) : v === "month" ? addMonths(d, dir)
      : v === "year" ? addYears(d, dir) : addWeeks(d, dir)));
  };
  // The month/year calendars also show open to-dos (with a date) and
  // important dates from custom fields, as the tracker did.
  const { data: customFields = [] } = useQuery({
    queryKey: ["customFields"], queryFn: () => base44.entities.CustomField.list(),
  });
  // Birthdays and other date fields, labelled the way the user picked. The
  // day/week canvas shows them under each day's header too, so tapping a
  // day still says whose birthday it is.
  const importantDates = useMemo(() => {
    const byId = new Map(alters.map((a) => [a.id, a]));
    return collectAlterDates(alters, customFields).map((x) => {
      const a = byId.get(x.alterId);
      return { ...x, alterName: (a && formatAlter(a)) || x.alterName };
    });
  }, [alters, customFields, formatAlter]);
  const taskItems = useMemo(() => tasksAsCalendarItems(tasks), [tasks]);
  const activitiesWithTasks = useMemo(() => [...activities, ...taskItems], [activities, taskItems]);
  const openFromCalendar = (picked) => {
    const list = (Array.isArray(picked) ? picked : [picked]).filter(Boolean);
    const real = list.filter((x) => !x._isTask);
    if (real.length === 0 && list[0]?._task) { navigate(`/todo?id=${list[0]._task.id}`); return; }
    if (real.length === 1) { setDetails(real[0]); return; }
    // Several on one day: go to that day on the canvas, where each is a block.
    const when = real[0]?.timestamp ? new Date(real[0].timestamp) : null;
    if (when) { setAnchor(when); setView("day"); }
  };

  // Plain range rather than "w/c" — that's British shorthand for "week
  // commencing" and means nothing to most people.
  const weekLabel = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: prefs.weekStartsOn });
    const end = new Date(start.getTime() + 6 * 86400000);
    const sameMonth = start.getMonth() === end.getMonth();
    return sameMonth
      ? `${format(start, "d")}–${format(end, "d MMM")}`
      : `${format(start, "d MMM")} – ${format(end, "d MMM")}`;
  }, [anchor, prefs.weekStartsOn]);
  const rangeLabel = (section === "calendar" && view === "day") ? format(anchor, "EEE d MMM")
    : (section === "calendar" && view === "month") ? format(anchor, "MMMM yyyy")
    : (section === "calendar" && view === "year") ? format(anchor, "yyyy")
    : weekLabel;
  // The canvas used to print its own range line under this one, saying the
  // same thing twice. One heading row.
  const weekTotalLabel = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: prefs.weekStartsOn });
    const end = new Date(start.getTime() + 7 * 86400000);
    const mins = activities.reduce((n, a) => {
      const t = a.timestamp ? new Date(a.timestamp) : null;
      if (!t || t < start || t >= end) return n;
      return n + (Number(a.actual_duration_minutes) || Number(a.duration_minutes) || 0);
    }, 0);
    const h = Math.floor(mins / 60), m = mins % 60;
    return mins ? `· ${h ? `${h}h ` : ""}${m ? `${m}m` : ""}`.trim() : "";
  }, [anchor, activities]);

  // What the tapped hour holds — the classic grid's cell popover: entries
  // that overlap it, who was fronting, feelings logged, places saved.
  const cellSummary = useMemo(() => {
    if (!cellInfo) return null;
    const hourStartMin = Math.floor(cellInfo.min / 60) * 60;
    const from = new Date(cellInfo.day); from.setHours(0, 0, 0, 0); from.setMinutes(hourStartMin);
    const to = new Date(from.getTime() + 60 * 60000);
    const overlaps = (s, e) => s < to && e > from;
    const entries = activities.filter((a) => {
      if (!a?.timestamp) return false;
      const s = new Date(a.timestamp);
      const mins = Number(a.actual_duration_minutes) || Number(a.duration_minutes) || 0;
      const e = new Date(s.getTime() + Math.max(1, mins) * 60000);
      return overlaps(s, e);
    }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const alterById = new Map(alters.map((a) => [a.id, a]));
    const whoIds = new Set();
    for (const f of frontingHistory || []) {
      const s = new Date(f.start_time), e = f.end_time ? new Date(f.end_time) : new Date();
      if (!overlaps(s, e)) continue;
      [f.alter_id, f.primary_alter_id, ...(f.co_fronter_ids || [])].filter(Boolean).forEach((id) => whoIds.add(id));
    }
    const who = [...whoIds].map((id) => alterById.get(id)).filter(Boolean);
    const inHour = (ts) => { const d = ts ? new Date(ts) : null; return d && d >= from && d < to; };
    const feelings = [...new Set((emotionCheckIns || []).filter((c) => inHour(c.timestamp)).flatMap((c) => c.emotions || []))];
    const places = (locationRecords || []).filter((l) => inHour(l.timestamp));
    return { from, to, hourStartMin, entries, who, feelings, places };
  }, [cellInfo, activities, alters, frontingHistory, emotionCheckIns, locationRecords]);

  return (
    <div className={chrome ? "min-h-screen p-2 sm:p-4" : "flex flex-col min-h-0 h-full"}
      {...(chrome ? { "data-tour": "planner" } : {})}
      style={applyPageLook ? pageLook : undefined}
      {...(applyPageLook ? { "data-widget-content": true } : {})}>
      <div className={chrome ? "os-page-shell space-y-2" : "flex flex-col min-h-0 h-full"}>
        {chrome && (
          <div className="space-y-2">
            {/* Row 1: what you're looking at (calendar / plans / insights)
                plus page config — the tracker's three tabs, merged in. */}
            <div className="flex items-center justify-between gap-2">
              <div role="tablist" className="flex gap-0.5 p-0.5 rounded-lg bg-muted/40" data-tour="planner-sections">
                {[["calendar", tr("planner.section.calendar")], ["plans", tr("planner.plans")], ["insights", tr("planner.section.insights")]].map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={section === id}
                    onClick={() => setSection(id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      section === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}>{label}</button>
                ))}
              </div>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="sm" onClick={() => setShowDisplay((v) => !v)}
                  aria-expanded={showDisplay} aria-label={tr("planner.display")} title={tr("planner.display")}>
                  <SlidersHorizontal className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/activities")}
                  aria-label={tr("planner.manage")} title={tr("planner.manage")}>
                  <SettingsIcon className="w-4 h-4" />
                </Button>
                <Button size="sm" className="gap-1 h-8 ml-1" onClick={openCreateNow}
                  style={{ background: "var(--v2-accent)", color: "var(--v2-on-accent, #fff)" }}>
                  <Plus className="w-4 h-4" /> {tr("planner.new")}
                </Button>
              </div>
            </div>

            {/* Row 2: date navigation — steps by whatever the view shows. */}
            {section !== "plans" && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-0.5 min-w-0">
                  <Button variant="ghost" size="sm" aria-label={tr("planner.prev")} onClick={() => stepAnchor(-1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium tabular-nums whitespace-nowrap">{rangeLabel}</span>
                  <Button variant="ghost" size="sm" aria-label={tr("planner.next")} onClick={() => stepAnchor(1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <button type="button" onClick={() => setAnchor(new Date())}
                    className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:text-foreground ml-1">
                    {tr("planner.today")}
                  </button>
                  {section === "calendar" && view === "week" && (
                    <span className="text-xs text-muted-foreground tabular-nums ml-1.5 whitespace-nowrap">{weekTotalLabel}</span>
                  )}
                </div>
                {section === "calendar" && (
                  <div className="flex gap-0.5 p-0.5 rounded-lg bg-muted/40">
                    {VIEWS.map((v) => (
                      <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}>{tr(`planner.view.${v}`)}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Row 3: overlays — only where the time canvas draws them. */}
            {section === "calendar" && (view === "week" || view === "day") && (
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
                <button type="button" onClick={() => setOverlay("locations", overlays.locations === false)}
                  aria-pressed={overlays.locations !== false}
                  className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${
                    overlays.locations !== false ? "border-[var(--v2-accent)] bg-[color-mix(in_srgb,var(--v2-accent)_12%,transparent)] text-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
                  }`}>
                  <MapPin className="w-3 h-3" /> {tr("planner.overlay.locations")}
                </button>
              </div>
            )}
          </div>
        )}
        {/* Running activities (timers) — the same strip the dashboard and
            the old tracker showed, so a running one is never out of sight
            here. Renders nothing when nothing is running. */}
        {chrome && section === "calendar" && <CurrentActivities />}
        {chrome && showDisplay && (
          <div className="rounded-lg border border-border/50 p-2 space-y-2 text-xs"
            style={{ borderRadius: "var(--v2-radius, 8px)" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{tr("planner.clock")}</span>
              <span className="flex gap-1">
                {[["24", tr("planner.clock24")], ["ampm", tr("planner.clock12")]].map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={prefs.timeFmt === id}
                    onClick={() => setPref("timeFmt", id)}
                    className={`px-2.5 py-1 rounded-full border ${
                      prefs.timeFmt === id ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
                    }`}>{label}</button>
                ))}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{tr("planner.weekStart")}</span>
              <span className="flex gap-1">
                {[[1, tr("planner.monday")], [0, tr("planner.sunday")]].map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={prefs.weekStartsOn === id}
                    onClick={() => setPref("weekStartsOn", id)}
                    className={`px-2.5 py-1 rounded-full border ${
                      prefs.weekStartsOn === id ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
                    }`}>{label}</button>
                ))}
              </span>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground whitespace-nowrap">{tr("planner.rowHeight")}</span>
              <input type="range" min={HOUR_PX_MIN} max={HOUR_PX_MAX} step={2} value={prefs.hourPx}
                onChange={(e) => setPref("hourPx", Number(e.target.value))}
                className="flex-1 accent-[var(--v2-accent)]" aria-label={tr("planner.rowHeight")} />
              <span className="tabular-nums text-muted-foreground w-10 text-right">{prefs.hourPx}px</span>
            </label>
            {dayCount > 1 && (
              <label className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground whitespace-nowrap">{tr("planner.dayWidth")}</span>
                <input type="range" min={DAY_PX_MIN} max={DAY_PX_MAX} step={2} value={prefs.dayPx}
                  onChange={(e) => setPref("dayPx", Number(e.target.value))}
                  className="flex-1 accent-[var(--v2-accent)]" aria-label={tr("planner.dayWidth")} />
                <span className="tabular-nums text-muted-foreground w-10 text-right">{prefs.dayPx}px</span>
              </label>
            )}
            <label className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground whitespace-nowrap">{tr("planner.laneOpacity", { term: t.Fronting })}</span>
              <input type="range" min={10} max={100} step={5} value={prefs.laneOpacity}
                onChange={(e) => setPref("laneOpacity", Number(e.target.value))}
                className="flex-1 accent-[var(--v2-accent)]" aria-label={tr("planner.laneOpacity", { term: t.Fronting })} />
              <span className="tabular-nums text-muted-foreground w-10 text-right">{prefs.laneOpacity}%</span>
            </label>
            <p className="text-[0.6875em] text-muted-foreground">{tr("planner.pinchHint")}</p>
          </div>
        )}

        {chrome && section === "insights" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/50 p-2 space-y-2 text-xs"
              style={{ borderRadius: "var(--v2-radius, 8px)" }}>
              <p className="font-semibold text-sm">{tr("planner.insights.week", { range: rangeLabel })}</p>
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
            </div>
            {/* The tracker's panels, moved here whole (goals with their
                editor, plan follow-through, the all-time tally) — each
                behind its own boundary so one bad record can't blank the
                rest, and the tally keeps its un-nesting recovery. */}
            <ErrorBoundary
              fallback={(err, reset) => <PanelError label={tr("planner.goals")} onRetry={reset} />}
              resetKeys={[activities.length]}>
              <ActivityGoalsPanel weekStart={weekRange.from} />
            </ErrorBoundary>
            <ErrorBoundary
              fallback={(err, reset) => <PanelError label={tr("planner.insights.followThrough")} onRetry={reset} />}
              resetKeys={[activities.length]}>
              <div className="space-y-2">
                <p className="font-semibold text-sm">{tr("planner.insights.followThrough")}</p>
                <PlanCompletionTracker />
              </div>
            </ErrorBoundary>
            <ErrorBoundary
              fallback={(err, reset) => <ActivityNestingRecovery error={err} onReset={reset} />}
              resetKeys={[activities.length]}>
              <ActivityTallyTracker activities={activities} />
            </ErrorBoundary>
          </div>
        )}
        {chrome && section === "plans" ? (
          <PlansList
            activities={activities}
            categories={categories}
            alters={alters}
            weekStartsOn={prefs.weekStartsOn}
            onOpen={(item, { series } = {}) => (series ? openEditor(item, { series: true }) : setDetails(item))}
            onDeleteSeries={(item) => setBranchAsk({ item })}
            onMassChange={async (kind, items) => withTrashBatch(async () => {
              for (const it of items) {
                try {
                  if (kind === "delete") {
                    await base44.entities.Activity.delete(it.id);
                    await deleteLinkedSleep(it);
                  }
                  else await base44.entities.Activity.update(it.id, { status: "cancelled" });
                } catch { /* keep going — partial progress beats none */ }
              }
              qc.invalidateQueries({ queryKey: ["activities"] });
              toast.success(kind === "delete"
                ? tr("planner.massDeleted", { count: items.length })
                : tr("planner.massCancelled", { count: items.length }));
            })}
          />
        ) : chrome && section === "insights" ? null : chrome && view === "month" ? (
          <ActivityMonthView
            monthDate={anchor}
            activities={activitiesWithTasks}
            alters={alters}
            weekStartsOn={prefs.weekStartsOn}
            importantDates={importantDates}
            onDayClick={(d) => { setAnchor(d); setView("day"); }}
            onActivityClick={openFromCalendar}
            // Dragging across days plans ONE entry over the whole span (as
            // the tracker did): 9:00 on the first day to 10:00 on the last,
            // shown as start → end so both dates can be adjusted.
            onRangeSelect={(from, to) => {
              const a = new Date(from); a.setHours(0, 0, 0, 0);
              const b = new Date(to || from); b.setHours(0, 0, 0, 0);
              const days = Math.max(0, Math.round((b - a) / 86400000));
              openCreate(a, 9 * 60, days * MINUTES_PER_DAY + 10 * 60);
              if (days > 0) lsSet("symphony_planner_time_mode", "range");
            }}
          />
        ) : chrome && view === "year" ? (
          <ActivityYearView
            yearDate={anchor}
            activities={activitiesWithTasks}
            weekStartsOn={prefs.weekStartsOn}
            onMonthClick={(d) => { setAnchor(d); setView("month"); }}
            onDayClick={(d) => { setAnchor(d); setView("day"); }}
          />
        ) : (
        <WeekCanvas
          onOpenLive={setLiveMenu}
          anchor={anchor}
          onOpenPage={onOpenPage}
          onSetPref={onSetPref}
          importantDates={importantDates}
          onOpenDate={(x) => navigate(`/alter/${x.alterId}`)}
          prefsOverride={prefsOverride}
          dayCount={effDayCount}
          maxHeight={maxHeight}
          fill={!chrome}
          activities={activities}
          tasks={taskItems}
          frontingHistory={frontingHistory}
          emotionCheckIns={emotionCheckIns}
          locations={locationRecords}
          onOpenPlace={(p) => navigate(`/location-history?highlight=${encodeURIComponent(p.id)}`)}
          alters={alters}
          categoryColor={catColor}
          overlays={overlays}
          onCreate={handleCreate}
          onOpenBlock={(item) => (item?._isTask ? navigate(`/todo?id=${item._task.id}`) : setDetails(item))}
          onResize={handleResize}
          // A tapped check-in dot lands on that entry in the log, highlighted.
          onOpenMark={(m) => { if (m?.id) navigate(`/checkin-log?id=${encodeURIComponent(m.id)}`); }}
          onOpenBand={(b, rect) => setBandInfo({ band: b, rect })}
          onAddToDay={(day) => setPlanDay(day)}
          onTapEmpty={chrome ? (day, min, rect) => setCellInfo({ day, min, rect }) : null}
          onOpenUntimed={(item, day) => (item?._isTask ? navigate(`/todo?id=${item._task.id}`) : setDetails({ ...item, _day: day }))}
        />
        )}
      </div>

      <DayPlanSheet day={planDay} open={!!planDay} onClose={() => setPlanDay(null)} />

      {/* Portaled to the body: a v2 board is framer-transformed, which
          re-anchors `position: fixed` to the board instead of the viewport —
          so an un-portaled sheet renders inside the widget and gets clipped
          by it, which is why its buttons did nothing. */}
      {bandInfo && createPortal((
        <div className="fixed inset-0 z-[85]" onClick={() => setBandInfo(null)}>
          <div className="fixed bg-card border border-border rounded-xl shadow-xl p-3 w-56"
            style={{
              left: Math.max(8, Math.min(bandInfo.rect.left + 10, window.innerWidth - 232)),
              top: Math.max(8, Math.min(bandInfo.rect.top + 8, window.innerHeight - 140)),
            }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: bandInfo.band.color }} />
              <span className="text-sm font-medium truncate">{bandInfo.band.name}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(bandInfo.band.session.start_time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              {" — "}
              {bandInfo.band.session.end_time
                ? new Date(bandInfo.band.session.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : tr("planner.stillFronting")}
            </p>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => { setBandInfo(null); navigate(`/alter/${bandInfo.band.alterId}`); }}
                className="text-xs px-2.5 py-1 rounded-full border border-border/50 hover:text-foreground text-muted-foreground">
                {tr("planner.openProfile")}
              </button>
              <button type="button" onClick={() => { setBandInfo(null); navigate("/analytics"); }}
                className="text-xs px-2.5 py-1 rounded-full border border-border/50 hover:text-foreground text-muted-foreground">
                {tr("planner.frontHistory", { Front: t.Front })}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
      {cellSummary && createPortal((
        <div className="fixed inset-0 z-[85]" onClick={() => setCellInfo(null)}>
          <div className="fixed bg-card border border-border rounded-xl shadow-xl p-3 w-64 space-y-2 text-xs max-h-[60vh] overflow-y-auto overscroll-contain"
            style={{
              left: Math.max(8, Math.min(cellInfo.rect.left - 20, window.innerWidth - 264)),
              top: Math.max(8, Math.min(cellInfo.rect.top + 8, window.innerHeight - 260)),
              borderRadius: "var(--v2-radius, 12px)",
            }}
            onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold">
              {format(cellSummary.from, "EEE d MMM")} · {formatClock(cellSummary.hourStartMin, prefs.timeFmt)}–{formatClock(cellSummary.hourStartMin + 60, prefs.timeFmt)}
            </p>
            {cellSummary.entries.length > 0 && (
              <div className="space-y-0.5">
                {cellSummary.entries.map((a) => (
                  <button key={a.id} type="button" onClick={() => { setCellInfo(null); setDetails(a); }}
                    className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-lg border border-border/40 text-left hover:bg-muted/30">
                    <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: a.color || catColor(categoryIdOf(a)) || "var(--v2-accent)" }} />
                    <span className="flex-1 truncate">{a.activity_name || tr("planner.untitled")}</span>
                    <span className="text-muted-foreground tabular-nums">{formatClock(new Date(a.timestamp).getHours() * 60 + new Date(a.timestamp).getMinutes(), prefs.timeFmt)}</span>
                  </button>
                ))}
              </div>
            )}
            {cellSummary.who.length > 0 && (
              <p><span className="text-muted-foreground">{t.Fronting}: </span>{cellSummary.who.map((a) => formatAlter(a)).join(", ")}</p>
            )}
            {cellSummary.feelings.length > 0 && (
              <p><span className="text-muted-foreground">{tr("planner.feelings")}: </span>{cellSummary.feelings.join(", ")}</p>
            )}
            {cellSummary.places.length > 0 && (
              <p><span className="text-muted-foreground">{tr("planner.location")}: </span>{cellSummary.places.map((l) => l.name || "📍").join(", ")}</p>
            )}
            {!cellSummary.entries.length && !cellSummary.who.length && !cellSummary.feelings.length && !cellSummary.places.length && (
              <p className="text-muted-foreground">{tr("planner.cellEmpty")}</p>
            )}
            <button type="button"
              onClick={() => { const c = cellInfo; setCellInfo(null); openCreate(c.day, cellSummary.hourStartMin, cellSummary.hourStartMin + 60); }}
              className="w-full text-xs px-2.5 py-1.5 rounded-full border border-[var(--v2-accent)] text-[var(--v2-accent)] flex items-center justify-center gap-1">
              <Plus className="w-3 h-3" />{tr("planner.addHere")}
            </button>
          </div>
        </div>
      ), document.body)}
      {/* DETAILS — what this entry IS, in plain reading form. Tapping a
          block lands here; Edit opens the editor (owner spec: "a little
          details view ... in a non-edit, easy to read form"). */}
      {/* Details — the SHARED sheet (also used by the Today widget), so a
          plan reads and resolves the same wherever you tap it. */}
      {liveMenu && (
        <ActivityActionMenu activity={liveMenu} onClose={() => setLiveMenu(null)} />
      )}
      <PlanDetailsSheet
        item={details}
        onClose={() => setDetails(null)}
        onEdit={(it) => openEditor(it, { day: it._day || null })}
        onStartNow={async (it, startedAt) => {
          // The shared start (the home notice's too). This used to set the
          // sheet's state and call its start a tick later — with the stale
          // closure, where nothing was open, so nothing started.
          setDetails(null);
          try {
            await startPlanActive(it, { startedAt: startedAt || new Date(), categories });
            toast.success(tr("planner.startedToast"));
          } catch (e) { toast.error(e?.message || "Failed"); }
        }}
        onReschedule={(it) => rescheduleFromDetails(it)}
      />
      <ActivityEditor request={editorReq} onClose={() => setEditorReq(null)} weekStartsOn={prefs.weekStartsOn} />
      {branchAsk && (
        <SeriesDeleteSheet item={branchAsk.item} activities={activities} onClose={() => setBranchAsk(null)} />
      )}
    </div>
  );
}
