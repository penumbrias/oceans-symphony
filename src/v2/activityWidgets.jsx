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

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, addDays, addWeeks, addMonths, addYears, isSameDay, isSameMonth, isSameYear } from "date-fns";
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

  return { onTimeRangeSelect, onActivityClick, onEditPlan, setZoomedDate, elements };
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
export function ActivityWeekWidget({ mode = "normal", settings }) {
  const navigate = useNavigate();
  const { activities, alters, frontingHistory, importantDates } = useActivityData();
  const [anchor, setAnchor] = useState(() => new Date());
  const [addMode, setAddMode] = useState(false);
  const [weekStartsOn, setWeekStartsOn] = useState(() => lsGet("symphony_act_week_start", 0));
  const interactive = mode === "expanded";
  const modals = useTrackerModals({ activities, alters, frontingHistory, importantDates, enabled: interactive });

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor, weekStartsOn]);
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

  return (
    <Section label="Week" action={nav}>
      <ErrorBoundary fallback={<Muted>This week couldn't be drawn. Open the Activity tracker to sort it out.</Muted>} resetKeys={[activities.length]}>
        <div className="min-h-0 flex-1 overflow-auto -mx-1 px-1">
          <ActivityWeeklyGrid
            weekDays={weekDays}
            activities={activities}
            alters={alters}
            frontingHistory={frontingHistory}
            importantDates={importantDates}
            onActivityClick={modals.onActivityClick}
            onTimeRangeSelect={interactive ? modals.onTimeRangeSelect : undefined}
            addMode={interactive ? addMode : false}
            onToggleAddMode={interactive ? () => setAddMode((v) => !v) : undefined}
            onWeekStartChange={setWeekStartsOn}
            hideControls={mode !== "expanded"}
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
  const interactive = mode === "expanded";
  const modals = useTrackerModals({ activities, alters, frontingHistory, importantDates, enabled: interactive });
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
    <Section label="Day" action={nav}>
      <ErrorBoundary fallback={<Muted>This day couldn't be drawn. Open the Activity tracker to sort it out.</Muted>} resetKeys={[activities.length]}>
        <div className="min-h-0 flex-1 overflow-auto -mx-1 px-1">
          <ActivityWeeklyGrid
            weekDays={days}
            activities={activities}
            alters={alters}
            frontingHistory={frontingHistory}
            importantDates={importantDates}
            onActivityClick={modals.onActivityClick}
            onTimeRangeSelect={interactive ? modals.onTimeRangeSelect : undefined}
            addMode={interactive ? addMode : false}
            onToggleAddMode={interactive ? () => setAddMode((v) => !v) : undefined}
            hideControls={mode !== "expanded"}
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
export function ActivityDayViewWidget({ mode = "normal", settings }) {
  const navigate = useNavigate();
  const { activities, alters, frontingHistory, importantDates } = useActivityData();
  const [anchor, setAnchor] = useState(() => new Date());
  const interactive = mode === "expanded";
  const modals = useTrackerModals({ activities, alters, frontingHistory, importantDates, enabled: interactive });
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

  return (
    <Section label="Day view" action={nav}>
      <ErrorBoundary fallback={<Muted>This day couldn't be drawn. Open the Activity tracker to sort it out.</Muted>} resetKeys={[activities.length]}>
        <div className="min-h-0 flex-1">
          <ActivityDayView
            embedded
            date={anchor}
            activities={activities}
            alters={alters}
            frontingHistory={frontingHistory}
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
  const interactive = mode === "expanded";
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
    <Section label="Month" action={nav}>
      <div className="min-h-0 flex-1 overflow-auto -mx-1 px-1">
        <ActivityMonthView
          monthDate={anchor}
          activities={activities}
          alters={alters}
          weekStartsOn={weekStartsOn}
          importantDates={importantDates}
          onActivityClick={modals.onActivityClick}
          onDayClick={interactive ? modals.setZoomedDate : undefined}
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
  const interactive = mode === "expanded";
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
    <Section label="Year" action={nav}>
      <div className="min-h-0 flex-1 overflow-auto -mx-1 px-1">
        <ActivityYearView
          yearDate={anchor}
          activities={activities}
          weekStartsOn={weekStartsOn}
          onMonthClick={interactive ? (d) => setAnchor(d) : undefined}
          onDayClick={interactive ? modals.setZoomedDate : undefined}
        />
      </div>
      {modals.elements}
    </Section>
  );
}

export const ACTIVITY_WIDGET_ICONS = { week: CalendarRange, day: CalendarCheck, month: CalendarDays, year: Grid2X2 };
