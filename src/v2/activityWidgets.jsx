// Activity-tracker widgets for the v2 home board.
//
// These are NOT re-implementations: the week grid, month calendar and year
// heatmap are the SAME components the Activity Tracker page renders, given
// the same data and the same handlers. What the widget adds is the frame —
// which days are in view, and how much of the tracker's interaction is
// switched on:
//
//   minimal   text only. A read at a glance: what the window holds.
//   normal    the real view, tap an entry for its details.
//   expanded  the tracker's own gestures — drag a time range to log or
//             plan, add-mode toggle, tap a day header to zoom into it.
//
// One data hook + one modal host serves all four so the widgets stay thin.

import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PlannerSurface from "@/components/planner/PlannerSurface";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, addDays, addWeeks, addMonths, addYears, isSameDay, isSameMonth, isSameYear, startOfDay, endOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange, CalendarCheck, Grid2X2 } from "lucide-react";

import { base44 } from "@/api/base44Client";
import { collectAlterDates } from "@/lib/importantDates";
import { statusFor } from "@/lib/activityStatus";
import { Section, Row, Muted, TextAction } from "@/v2/primitives";

import ActivityWeeklyGrid from "@/components/activities/ActivityWeeklyGrid";
import ActivityMonthView from "@/components/activities/ActivityMonthView";
import ActivityYearView from "@/components/activities/ActivityYearView";
import ActivityDayView from "@/components/activities/ActivityDayView";
import ActivityLogModal from "@/components/activities/ActivityLogModal";
import ActivityPlanModal from "@/components/activities/ActivityPlanModal";
import ActivityDetailsModal from "@/components/activities/ActivityDetailsModal";
import ErrorBoundary from "@/components/shared/ErrorBoundary";

// The grid's display filters and sizing live in the WIDGET's options (gear
// menu), not buried in a toolbar inside the tile. Only keys the user
// actually set are passed down; the rest fall back to their saved
// Activity-tracker settings.
function displayFromSettings(settings = {}) {
  const out = {};
  for (const k of ["showEmotions", "showAlters", "showQuickPlans"]) {
    if (typeof settings[k] === "boolean") out[k] = settings[k];
  }
  if (settings.rowH) out.rowH = Math.max(6, Math.min(80, parseInt(settings.rowH, 10) || 40));
  if (settings.interval) out.interval = parseInt(settings.interval, 10) || 60;
  if (settings.timeFmt) out.timeFmt = settings.timeFmt;
  if (settings.weekStartsOn !== undefined && settings.weekStartsOn !== "") {
    out.weekStartsOn = parseInt(settings.weekStartsOn, 10) || 0;
  }
  return Object.keys(out).length ? out : null;
}

// Overlay toggles for the PlannerSurface render paths — same only-if-set
// rule, so an untouched widget keeps following the planner page's pills.
// Pinch writes arrive per-frame; SystemSettings writes shouldn't. One
// trailing write per 400ms, latest values win.
function useWidgetPrefWriter(updateSettings) {
  const buf = useRef({});
  const timer = useRef(null);
  return (key, value) => {
    const field = key === "hourPx" ? "rowH" : key === "dayPx" ? "dayPx" : null;
    if (!field || !updateSettings) return;
    buf.current[field] = value;
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const patch = buf.current; buf.current = {};
      updateSettings(patch);
    }, 400);
  };
}

function overlaysFromSettings(settings = {}) {
  const out = {};
  if (typeof settings.showAlters === "boolean") out.alters = settings.showAlters;
  if (typeof settings.showEmotions === "boolean") out.emotions = settings.showEmotions;
  return Object.keys(out).length ? out : null;
}

const lsGet = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};

// Everything the tracker views need, from the same query keys the page
// uses — so a widget and the page share one cache and stay in step.
function useActivityData() {
  const { data: activities = [] } = useQuery({ queryKey: ["activities"], queryFn: () => base44.entities.Activity.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: customFields = [] } = useQuery({ queryKey: ["customFields"], queryFn: () => base44.entities.CustomField.list() });
  const { data: frontingHistory = [] } = useQuery({ queryKey: ["frontingHistory"], queryFn: () => base44.entities.FrontingSession.list() });
  const importantDates = useMemo(() => collectAlterDates(alters, customFields), [alters, customFields]);
  return { activities, alters, frontingHistory, importantDates };
}

// The tracker's editing surfaces, hosted by the widget. Returns the
// handlers to hand the view, plus the elements to render.
// Sessions that actually touch the window on screen.
//
// The day grid asks "who was fronting" once per hour SLOT, and each of those
// asks scans the whole fronting history — so a system with a few thousand
// sessions did a few thousand comparisons twenty-four times over, on every
// render. And because switching pages remounts the board, that whole cost
// landed on every swipe. Narrowing once per render turns 24 full scans into
// one, and the grid then walks a handful of rows instead of the archive.
function useFrontingWindow(frontingHistory, from, to) {
  return useMemo(() => {
    if (!from || !to) return frontingHistory;
    const start = from.getTime();
    const end = to.getTime();
    return (frontingHistory || []).filter((s) => {
      const b = s.start_time ? new Date(s.start_time).getTime() : 0;
      if (!b || b > end) return false;
      // An open session (still fronting) has no end — it reaches the present.
      const e = s.end_time ? new Date(s.end_time).getTime() : Infinity;
      return e >= start;
    });
  }, [frontingHistory, from, to]);
}

function useTrackerModals({ activities, alters, frontingHistory, importantDates, enabled }) {
  const [logOpen, setLogOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);
  const [zoomedDate, setZoomedDate] = useState(null);
  const [range, setRange] = useState(null); // { date, endDate, startHour, endHour, startMinute, endMinute }

  const closeRange = () => { setLogOpen(false); setPlanOpen(false); setRange(null); setEditingPlan(null); };

  const onTimeRangeSelect = (date, startHour, endHour, startMinute = 0, endMinute = 0, endDate = null) => {
    if (!enabled) return;
    setRange({ date, endDate: endDate || date, startHour, endHour, startMinute, endMinute });
    // A range starting in the future is a plan, not a log — same split the
    // tracker makes, so the right fields appear.
    const start = new Date(date);
    start.setHours(startHour ?? 0, startMinute ?? 0, 0, 0);
    if (start.getTime() > Date.now()) setPlanOpen(true); else setLogOpen(true);
  };

  const onActivityClick = (activityOrList) => {
    const a = Array.isArray(activityOrList) ? activityOrList[0] : activityOrList;
    if (!a) return;
    setSelected(a);
    setDetailsOpen(true);
  };

  const onEditPlan = (plan) => {
    if (!enabled) return;
    setEditingPlan(plan);
    setRange(null);
    setPlanOpen(true);
  };

  const elements = (
    <>
      <ActivityLogModal
        isOpen={logOpen}
        onClose={closeRange}
        startDate={range?.date}
        endDate={range?.endDate}
        startHour={range?.startHour}
        endHour={range?.endHour}
        startMinute={range?.startMinute}
        endMinute={range?.endMinute}
        alters={alters}
        frontingHistory={frontingHistory}
        onSave={closeRange}
      />
      <ActivityPlanModal
        isOpen={planOpen}
        onClose={closeRange}
        editingPlan={editingPlan}
        allActivities={activities}
        startDate={range?.date}
        endDate={range?.endDate}
        startHour={range?.startHour}
        endHour={range?.endHour}
        startMinute={range?.startMinute}
        endMinute={range?.endMinute}
        alters={alters}
        frontingHistory={frontingHistory}
        onSave={closeRange}
      />
      <ActivityDetailsModal
        isOpen={detailsOpen}
        onClose={() => { setDetailsOpen(false); setSelected(null); }}
        activity={selected}
        alters={alters}
        onSave={() => { setDetailsOpen(false); setSelected(null); }}
        onEditPlan={onEditPlan}
      />
      {zoomedDate && (
        <ActivityDayView
          date={zoomedDate}
          activities={activities}
          alters={alters}
          frontingHistory={frontingHistory}
          importantDates={importantDates}
          onClose={() => setZoomedDate(null)}
          onActivityClick={onActivityClick}
          onTimeRangeSelect={(d, sh, eh, sm, em) => { setZoomedDate(null); onTimeRangeSelect(d, sh, eh, sm, em); }}
        />
      )}
    </>
  );

  // Explicit openers for the widget header, so scheduling doesn't depend on
  // discovering the grid's double-tap.
  // A dragged span of days becomes one plan from the first to the last —
  // the calendar equivalent of dragging a block of hours.
  const openPlanRange = (from, to) => {
    if (!enabled) return;
    setRange({ date: from, endDate: to || from, startHour: undefined, endHour: undefined, startMinute: 0, endMinute: 0 });
    setEditingPlan(null);
    setPlanOpen(true);
  };
  const openPlan = (day) => {
    if (!enabled) return;
    const d = day || new Date();
    setRange({ date: d, endDate: d, startHour: undefined, endHour: undefined, startMinute: 0, endMinute: 0 });
    setEditingPlan(null);
    setPlanOpen(true);
  };
  const openLog = (day) => {
    if (!enabled) return;
    const d = day || new Date();
    const now = new Date();
    setRange({ date: d, endDate: d, startHour: now.getHours(), endHour: undefined, startMinute: now.getMinutes(), endMinute: 0 });
    setEditingPlan(null);
    setLogOpen(true);
  };

  return { onTimeRangeSelect, onActivityClick, onEditPlan, setZoomedDate, openPlan, openPlanRange, openLog, elements };
}

// ── Text summaries (minimal mode) ──────────────────────────────────
const countableMinutes = (a) => {
  const s = statusFor(a);
  if (s === "scheduled" || s === "skipped" || s === "cancelled") return 0;
  return Math.max(0, a.actual_duration_minutes ?? a.duration_minutes ?? 0);
};
const fmtHours = (mins) => (mins >= 60 ? `${(mins / 60).toFixed(mins % 60 ? 1 : 0)}h` : `${Math.round(mins)}m`);

function inRange(activities, from, to) {
  return activities.filter((a) => {
    if (!a?.timestamp) return false;
    const t = new Date(a.timestamp).getTime();
    return t >= from.getTime() && t <= to.getTime();
  });
}

// A compact per-day readout: what got logged, what's still planned.
function TextDays({ days, activities, onDay }) {
  return (
    <>
      {days.map((d) => {
        const dayItems = activities.filter((a) => a.timestamp && isSameDay(new Date(a.timestamp), d));
        const logged = dayItems.filter((a) => countableMinutes(a) > 0 || statusFor(a) === "logged" || statusFor(a) === "done");
        const planned = dayItems.filter((a) => statusFor(a) === "scheduled");
        const mins = dayItems.reduce((s, a) => s + countableMinutes(a), 0);
        return (
          <Row
            key={d.toISOString()}
            primary={format(d, "EEE d")}
            secondary={
              logged.length || planned.length
                ? [logged.length ? `${logged.length} logged` : null, planned.length ? `${planned.length} planned` : null].filter(Boolean).join(" · ")
                : "nothing yet"
            }
            right={mins ? fmtHours(mins) : undefined}
            onClick={onDay ? () => onDay(d) : undefined}
          />
        );
      })}
    </>
  );
}

// "+ Plan" / "Log" — the widget's own way into the same modals the tracker
// uses, so a board is a real entry point for scheduling and not just a
// picture of one.
function AddActions({ modals, day, compact = false }) {
  return (
    <span className="flex items-center gap-1">
      <button type="button" onClick={() => modals.openPlan(day)}
        title="Schedule something on this day" aria-label="Schedule something on this day"
        className="px-1.5 py-0.5 rounded text-[0.6875em] font-medium hover:underline"
        style={{ color: "var(--v2-accent, hsl(var(--primary)))" }}>
        + Plan
      </button>
      {!compact && (
        <button type="button" onClick={() => modals.openLog(day)}
          title="Log something on this day" aria-label="Log something on this day"
          className="px-1.5 py-0.5 rounded text-[0.6875em] text-muted-foreground hover:text-foreground">
          Log
        </button>
      )}
    </span>
  );
}

// Header nav shared by every window (‹ today ›).
function WindowNav({ label, onPrev, onNext, onToday, atNow }) {
  return (
    <span className="flex items-center gap-1">
      <button type="button" onClick={onPrev} aria-label="Previous" className="p-0.5 text-muted-foreground hover:text-foreground">
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onToday} disabled={atNow}
        className={`text-[0.6875em] tabular-nums ${atNow ? "text-muted-foreground" : "text-primary hover:underline"}`}>
        {label}
      </button>
      <button type="button" onClick={onNext} aria-label="Next" className="p-0.5 text-muted-foreground hover:text-foreground">
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

// ── Week grid ──────────────────────────────────────────────────────
export function ActivityWeekWidget({ mode = "normal", settings, updateSettings }) {
  const writePref = useWidgetPrefWriter(updateSettings);
  const navigate = useNavigate();
  const { activities, alters, frontingHistory, importantDates } = useActivityData();
  const [anchor, setAnchor] = useState(() => new Date());
  const [addMode, setAddMode] = useState(false);
  const [weekStartsOn, setWeekStartsOn] = useState(() => lsGet("symphony_act_week_start", 0));
  // Anything but the text-only mode is a working tracker surface: tap an
  // entry for details, double-tap empty time to select a range, and use the
  // header's + Plan / Log. Expanded additionally shows the grid's own
  // display-filter row.
  const interactive = mode !== "minimal";
  const modals = useTrackerModals({ activities, alters, frontingHistory, importantDates, enabled: interactive });
  // Windowed once per render, above any early return so the hook order
  // never changes with the display mode.
  const weekWindowDays = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: 0 });
    return [startOfDay(start), endOfDay(addDays(start, 6))];
  }, [anchor]);
  const frontingWindow = useFrontingWindow(frontingHistory, weekWindowDays[0], weekWindowDays[1]);

  const cfgWeekStart = settings?.weekStartsOn !== undefined && settings?.weekStartsOn !== ""
    ? parseInt(settings.weekStartsOn, 10) || 0 : null;
  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: cfgWeekStart ?? weekStartsOn });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor, weekStartsOn, cfgWeekStart]);
  const atNow = weekDays.some((d) => isSameDay(d, new Date()));

  const nav = (
    <WindowNav
      label={format(weekDays[0], "MMM d")}
      onPrev={() => setAnchor((d) => addWeeks(d, -1))}
      onNext={() => setAnchor((d) => addWeeks(d, 1))}
      onToday={() => setAnchor(new Date())}
      atNow={atNow}
    />
  );

  if (mode === "minimal") {
    const total = inRange(activities, weekDays[0], addDays(weekDays[6], 1)).reduce((s, a) => s + countableMinutes(a), 0);
    return (
      <Section label={`Week of ${format(weekDays[0], "MMM d")}`} action={<TextAction onClick={() => navigate("/activities")}>{fmtHours(total)}</TextAction>}>
        <TextDays days={weekDays} activities={activities} />
      </Section>
    );
  }

  // The planner canvas draws blocks at their real times and handles its own
  // gestures, so the widget and the Planner page can't diverge.
  if (mode !== "minimal") {
    return (
      <Section label="Week" action={<span className="flex items-center gap-2">{nav}<TextAction onClick={() => navigate("/planner")}>Open</TextAction></span>}>
        <PlannerSurface dayCount={7} chrome={false} anchor={anchor} onAnchorChange={setAnchor}
          applyPageLook={false} onOpenPage={() => navigate("/planner")}
          overlaysOverride={overlaysFromSettings(settings)}
          onSetPref={writePref}
          prefsOverride={{ weekStartsOn: settings?.weekStartsOn, timeFmt: settings?.timeFmt, rowH: settings?.rowH, dayPx: settings?.dayPx, laneOpacity: settings?.laneOpacity }} />
      </Section>
    );
  }

  return (
    <Section label="Week" action={<span className="flex items-center gap-2">{nav}<AddActions modals={modals} day={atNow ? new Date() : weekDays[0]} compact={mode !== "expanded"} /></span>}>
      <ErrorBoundary fallback={<Muted>This week couldn't be drawn. Open the Activity tracker to sort it out.</Muted>} resetKeys={[activities.length]}>
        <div className="min-h-0 flex-1 overflow-auto -mx-1 px-1">
          <ActivityWeeklyGrid
            weekDays={weekDays}
            activities={activities}
            alters={alters}
            frontingHistory={frontingWindow}
            importantDates={importantDates}
            onActivityClick={modals.onActivityClick}
            onTimeRangeSelect={interactive ? modals.onTimeRangeSelect : undefined}
            addMode={interactive ? addMode : false}
            onToggleAddMode={interactive ? () => setAddMode((v) => !v) : undefined}
            onWeekStartChange={setWeekStartsOn}
            hideControls
            fitWidth
            display={displayFromSettings(settings)}
            onDayClick={interactive ? modals.setZoomedDate : undefined}
            onEditPlan={interactive ? modals.onEditPlan : undefined}
          />
        </div>
      </ErrorBoundary>
      {modals.elements}
    </Section>
  );
}

// ── One day ────────────────────────────────────────────────────────
// Same grid, one column — so a day gets the tracker's real hour rows and
// gestures rather than a second implementation of them.
export function ActivityDayWidget({ mode = "normal", settings }) {
  const navigate = useNavigate();
  const { activities, alters, frontingHistory, importantDates } = useActivityData();
  const [anchor, setAnchor] = useState(() => new Date());
  const [addMode, setAddMode] = useState(false);
  // Anything but the text-only mode is a working tracker surface: tap an
  // entry for details, double-tap empty time to select a range, and use the
  // header's + Plan / Log. Expanded additionally shows the grid's own
  // display-filter row.
  const interactive = mode !== "minimal";
  const modals = useTrackerModals({ activities, alters, frontingHistory, importantDates, enabled: interactive });
  const dayWindow = useMemo(() => [startOfDay(anchor), endOfDay(anchor)], [anchor]);
  const frontingWindow = useFrontingWindow(frontingHistory, dayWindow[0], dayWindow[1]);
  const days = useMemo(() => [anchor], [anchor]);
  const atNow = isSameDay(anchor, new Date());

  const nav = (
    <WindowNav
      label={format(anchor, "EEE d MMM")}
      onPrev={() => setAnchor((d) => addDays(d, -1))}
      onNext={() => setAnchor((d) => addDays(d, 1))}
      onToday={() => setAnchor(new Date())}
      atNow={atNow}
    />
  );

  if (mode === "minimal") {
    const items = activities
      .filter((a) => a.timestamp && isSameDay(new Date(a.timestamp), anchor))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return (
      <Section label={format(anchor, "EEE d MMM")} action={<TextAction onClick={() => navigate("/activities")}>Open</TextAction>}>
        {items.length === 0 && <Muted>Nothing logged.</Muted>}
        {items.map((a) => (
          <Row key={a.id} primary={a.activity_name || "Activity"}
            secondary={statusFor(a) === "scheduled" ? "planned" : undefined}
            right={format(new Date(a.timestamp), "HH:mm")} />
        ))}
      </Section>
    );
  }

  return (
    <Section label="Day" action={<span className="flex items-center gap-2">{nav}<AddActions modals={modals} day={anchor} compact={mode !== "expanded"} /></span>}>
      <ErrorBoundary fallback={<Muted>This day couldn't be drawn. Open the Activity tracker to sort it out.</Muted>} resetKeys={[activities.length]}>
        <div className="min-h-0 flex-1 overflow-auto -mx-1 px-1">
          <ActivityWeeklyGrid
            weekDays={days}
            activities={activities}
            alters={alters}
            frontingHistory={frontingWindow}
            importantDates={importantDates}
            onActivityClick={modals.onActivityClick}
            onTimeRangeSelect={interactive ? modals.onTimeRangeSelect : undefined}
            addMode={interactive ? addMode : false}
            onToggleAddMode={interactive ? () => setAddMode((v) => !v) : undefined}
            hideControls
            fitWidth
            display={displayFromSettings(settings)}
            onDayClick={interactive ? modals.setZoomedDate : undefined}
            onEditPlan={interactive ? modals.onEditPlan : undefined}
          />
        </div>
      </ErrorBoundary>
      {modals.elements}
    </Section>
  );
}

// ── The tracker's day view ─────────────────────────────────────────
// Not the grid with one column — this is the Activity Tracker's actual day
// view (quick plans at the top, empty stretches collapsed into bands, each
// hour's entries as pills), rendered inline instead of full-screen.
export function ActivityDayViewWidget({ mode = "normal", settings, updateSettings }) {
  const writePref = useWidgetPrefWriter(updateSettings);
  const navigate = useNavigate();
  const { activities, alters, frontingHistory, importantDates } = useActivityData();
  const [anchor, setAnchor] = useState(() => new Date());
  // Anything but the text-only mode is a working tracker surface: tap an
  // entry for details, double-tap empty time to select a range, and use the
  // header's + Plan / Log. Expanded additionally shows the grid's own
  // display-filter row.
  const interactive = mode !== "minimal";
  const modals = useTrackerModals({ activities, alters, frontingHistory, importantDates, enabled: interactive });
  const dayWindow = useMemo(() => [startOfDay(anchor), endOfDay(anchor)], [anchor]);
  const frontingWindow = useFrontingWindow(frontingHistory, dayWindow[0], dayWindow[1]);
  const atNow = isSameDay(anchor, new Date());

  const nav = (
    <WindowNav
      label={format(anchor, "EEE d MMM")}
      onPrev={() => setAnchor((d) => addDays(d, -1))}
      onNext={() => setAnchor((d) => addDays(d, 1))}
      onToday={() => setAnchor(new Date())}
      atNow={atNow}
    />
  );

  if (mode === "minimal") {
    const items = activities
      .filter((a) => a.timestamp && isSameDay(new Date(a.timestamp), anchor))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const mins = items.reduce((s, a) => s + countableMinutes(a), 0);
    const planned = items.filter((a) => statusFor(a) === "scheduled");
    return (
      <Section label={format(anchor, "EEE d MMM")} action={<TextAction onClick={() => navigate("/activities")}>Open</TextAction>}>
        {items.length === 0 && <Muted>Nothing logged.</Muted>}
        {items.length > 0 && <Row primary="Logged" right={fmtHours(mins)} />}
        {items.length > 0 && <Row primary="Entries" right={String(items.length - planned.length)} />}
        {planned.length > 0 && <Row primary="Still planned" right={String(planned.length)} />}
      </Section>
    );
  }

  if (mode !== "minimal") {
    return (
      <Section label="Day" action={<span className="flex items-center gap-2">{nav}<TextAction onClick={() => navigate("/planner")}>Open</TextAction></span>}>
        <PlannerSurface dayCount={1} chrome={false} anchor={anchor} onAnchorChange={setAnchor}
          applyPageLook={false} onOpenPage={() => navigate("/planner")}
          overlaysOverride={overlaysFromSettings(settings)}
          onSetPref={writePref}
          prefsOverride={{ timeFmt: settings?.timeFmt, rowH: settings?.rowH, laneOpacity: settings?.laneOpacity }} />
      </Section>
    );
  }

  return (
    <Section label="Day view" action={<span className="flex items-center gap-2">{nav}<AddActions modals={modals} day={anchor} compact /></span>}>
      <ErrorBoundary fallback={<Muted>This day couldn't be drawn. Open the Activity tracker to sort it out.</Muted>} resetKeys={[activities.length]}>
        <div className="min-h-0 flex-1">
          <ActivityDayView
            embedded
            date={anchor}
            activities={activities}
            alters={alters}
            frontingHistory={frontingWindow}
            importantDates={importantDates}
            onActivityClick={modals.onActivityClick}
            onTimeRangeSelect={interactive ? modals.onTimeRangeSelect : undefined}
          />
        </div>
      </ErrorBoundary>
      {modals.elements}
    </Section>
  );
}

// ── Month ──────────────────────────────────────────────────────────
export function ActivityMonthWidget({ mode = "normal", settings }) {
  const navigate = useNavigate();
  const { activities, alters, frontingHistory, importantDates } = useActivityData();
  const [anchor, setAnchor] = useState(() => new Date());
  const weekStartsOn = lsGet("symphony_act_week_start", 0);
  // Anything but the text-only mode is a working tracker surface: tap an
  // entry for details, double-tap empty time to select a range, and use the
  // header's + Plan / Log. Expanded additionally shows the grid's own
  // display-filter row.
  const interactive = mode !== "minimal";
  const modals = useTrackerModals({ activities, alters, frontingHistory, importantDates, enabled: interactive });
  const atNow = isSameMonth(anchor, new Date());

  const nav = (
    <WindowNav
      label={format(anchor, "MMM yyyy")}
      onPrev={() => setAnchor((d) => addMonths(d, -1))}
      onNext={() => setAnchor((d) => addMonths(d, 1))}
      onToday={() => setAnchor(new Date())}
      atNow={atNow}
    />
  );

  if (mode === "minimal") {
    const monthItems = activities.filter((a) => a.timestamp && isSameMonth(new Date(a.timestamp), anchor));
    const mins = monthItems.reduce((s, a) => s + countableMinutes(a), 0);
    const planned = monthItems.filter((a) => statusFor(a) === "scheduled").length;
    return (
      <Section label={format(anchor, "MMMM yyyy")} action={<TextAction onClick={() => navigate("/activities")}>Open</TextAction>}>
        <Row primary="Logged" right={fmtHours(mins)} />
        <Row primary="Entries" right={String(monthItems.length - planned)} />
        <Row primary="Still planned" right={String(planned)} />
      </Section>
    );
  }

  return (
    <Section label="Month" action={<span className="flex items-center gap-2">{nav}<AddActions modals={modals} day={atNow ? new Date() : anchor} compact={mode !== "expanded"} /></span>}>
      <div className="min-h-0 flex-1 overflow-auto -mx-1 px-1">
        <ActivityMonthView
          monthDate={anchor}
          activities={activities}
          alters={alters}
          weekStartsOn={weekStartsOn}
          importantDates={importantDates}
          onActivityClick={modals.onActivityClick}
          onDayClick={interactive ? modals.setZoomedDate : undefined}
          onRangeSelect={interactive ? modals.openPlanRange : undefined}
        />
      </div>
      {modals.elements}
    </Section>
  );
}

// ── Year ───────────────────────────────────────────────────────────
export function ActivityYearWidget({ mode = "normal", settings }) {
  const navigate = useNavigate();
  const { activities, alters, frontingHistory, importantDates } = useActivityData();
  const [anchor, setAnchor] = useState(() => new Date());
  const weekStartsOn = lsGet("symphony_act_week_start", 0);
  // Anything but the text-only mode is a working tracker surface: tap an
  // entry for details, double-tap empty time to select a range, and use the
  // header's + Plan / Log. Expanded additionally shows the grid's own
  // display-filter row.
  const interactive = mode !== "minimal";
  const modals = useTrackerModals({ activities, alters, frontingHistory, importantDates, enabled: interactive });
  const atNow = isSameYear(anchor, new Date());

  const nav = (
    <WindowNav
      label={format(anchor, "yyyy")}
      onPrev={() => setAnchor((d) => addYears(d, -1))}
      onNext={() => setAnchor((d) => addYears(d, 1))}
      onToday={() => setAnchor(new Date())}
      atNow={atNow}
    />
  );

  if (mode === "minimal") {
    const yearItems = activities.filter((a) => a.timestamp && isSameYear(new Date(a.timestamp), anchor));
    const mins = yearItems.reduce((s, a) => s + countableMinutes(a), 0);
    const days = new Set(yearItems.filter((a) => countableMinutes(a) > 0).map((a) => format(new Date(a.timestamp), "yyyy-MM-dd"))).size;
    return (
      <Section label={format(anchor, "yyyy")} action={<TextAction onClick={() => navigate("/activities")}>Open</TextAction>}>
        <Row primary="Logged" right={fmtHours(mins)} />
        <Row primary="Entries" right={String(yearItems.length)} />
        <Row primary="Days with something on" right={String(days)} />
      </Section>
    );
  }

  return (
    <Section label="Year" action={<span className="flex items-center gap-2">{nav}<AddActions modals={modals} day={atNow ? new Date() : anchor} compact={mode !== "expanded"} /></span>}>
      <div className="min-h-0 flex-1 overflow-auto -mx-1 px-1">
        <ActivityYearView
          yearDate={anchor}
          activities={activities}
          weekStartsOn={weekStartsOn}
          onMonthClick={interactive ? (d) => setAnchor(d) : undefined}
          onDayClick={interactive ? modals.setZoomedDate : undefined}
          onRangeSelect={interactive ? modals.openPlanRange : undefined}
        />
      </div>
      {modals.elements}
    </Section>
  );
}

export const ACTIVITY_WIDGET_ICONS = { week: CalendarRange, day: CalendarCheck, month: CalendarDays, year: Grid2X2 };
