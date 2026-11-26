// The house's Planner room (plan step 5.1, "keeping commitments"): board
// 04-Planner drawn by the house itself. House mode only: the frames draw it
// on /planner (housePlannerRoom); the old Planner page is gated off
// (HouseRoomGate) and stays exactly as it was with the new house off.
//
//   Studio  the small month and the categories (left); the calendar with
//           Day · Week · Month · Year · Plans list, the range and its arrows,
//           + Log · + Event · + Plan, and a status line (middle); This week,
//           Goals and Needs a decision (right).
//   Phone   (not drawn on a board; the boards' language) the calendar panel
//           first, then Needs a decision, This week, Goals, and the month
//           and the categories folded.
//
// Nothing here writes a record by itself. Creating and editing open THE
// activity editor (ActivityEditor: log, start, plan, repeats in three
// branches, reminders, critical); reading and resolving open THE details
// view (PlanDetailsSheet); events open EventSheet (plannerEvents.js);
// outcomes go through resolvePlan.js; dragging a block goes through
// moveActivityTime (planner/moveEntry.js: reschedule history, the Sleep
// mirror). Landings: ?date=, ?view=, ?activityId= (or ?highlight=), ?event=.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, SlidersHorizontal, Play } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button, IconButton } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { Segmented } from "@/house/kit/Choices";
import { EmptyBlock } from "@/house/kit/States";
import { showToast } from "@/house/kit/Toast";
import TimeColumns from "@/house/kit/TimeColumns";
import ActivityEditor, { SeriesDeleteSheet } from "@/components/activities/ActivityEditor";
import { ActivityActionMenu } from "@/components/activities/CurrentActivities";
import PlanDetailsSheet from "@/components/planner/PlanDetailsSheet";
import EventSheet from "@/components/planner/EventSheet";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { sharedList } from "@/lib/sharedLists";
import { usePlannerEvents } from "@/lib/plannerEvents";
import { occurrencesBetween } from "@/lib/plannerEventDates";
import { usePlannerPrefs, formatHourLabel } from "@/lib/planner/displayPrefs";
import { rollup, goalProgress } from "@/lib/planner/rollup";
import { summarisePlans } from "@/lib/planAnalytics";
import { tasksAsCalendarItems } from "@/lib/planner/taskItems";
import { collectAlterDates } from "@/lib/importantDates";
import { indexById } from "@/lib/categoryTreeUtils";
import { checkInIsDistress } from "@/lib/emotionDistress";
import { ENTRY_MODES } from "@/lib/activityEntry";
import { moveActivityTime, restoreActivityTime } from "@/lib/planner/moveEntry";
import { getActiveActivities, ACTIVE_ACTIVITY_EVENT } from "@/lib/activitySession";
import {
  PLANNER_PICKS, readPlannerState, writePlannerState, pickOf, stateForPick, rangeOf, rangeWords, stepAnchor,
  holdsToday, dayColumns, nowFraction, weekCounts, countWords, needsDecision, topTotals, hiddenFilter,
  hourWords, clockWords, plannerLanding, PLANNER_LANDING_PARAMS, dayKeyOf, TONE_WORDS,
} from "@/house/planner/plannerModel";
import {
  MonthPanel, CategoriesPanel, ThisWeekPanel, GoalsPanel, DecisionsPanel, MonthView, YearView,
  PlansListView, InsightsView, PlannerOptionsSheet, useRefreshPlans,
} from "@/house/planner/PlannerParts";
import { format } from "date-fns";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/planner/planner.css";

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };
// The old planner's keys: what shows on the calendar and the hidden
// categories carry between the houses.
const OVERLAYS_KEY = "symphony_planner_overlays_v1";
const HIDDEN_CATS_KEY = "symphony_planner_hidden_cats_v1";

const ARROW_WORDS = { day: "day", week: "week", month: "month", year: "year" };

function useRunning() {
  const [list, setList] = useState(() => { try { return getActiveActivities(); } catch { return []; } });
  useEffect(() => {
    const sync = () => { try { setList(getActiveActivities()); } catch { /* ignore */ } };
    window.addEventListener(ACTIVE_ACTIVITY_EVENT, sync);
    return () => window.removeEventListener(ACTIVE_ACTIVITY_EVENT, sync);
  }, []);
  return list;
}

function useNow(ms = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

export default function HousePlanner({ size = "full", tokens }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const navigate = useNavigate();
  const location = useLocation();
  const refresh = useRefreshPlans();
  const phone = size === "phone";
  const now = useNow();
  const [prefs, setPref] = usePlannerPrefs();
  const fmt = prefs.timeFmt;
  const weekStart = prefs.weekStartsOn;

  // ── Page, zoom, the day shown ──
  const [state, setStateRaw] = useState(() => readPlannerState(typeof localStorage === "undefined" ? null : localStorage));
  const setState = (next) => { setStateRaw(next); writePlannerState(localStorage, next); };
  const [anchor, setAnchor] = useState(() => new Date());
  const { section, view } = state;
  const calView = section === "calendar" ? view : "week";

  // ── Device preferences shared with the old planner ──
  const [overlays, setOverlays] = useState(() => lsGet(OVERLAYS_KEY, { alters: false, emotions: false }));
  const setOverlay = (key, on) => { const next = { ...overlays, [key]: on }; setOverlays(next); lsSet(OVERLAYS_KEY, next); };
  const [hiddenCats, setHiddenCats] = useState(() => { const v = lsGet(HIDDEN_CATS_KEY, []); return Array.isArray(v) ? v : []; });
  const toggleHidden = (id) => {
    const next = hiddenCats.includes(id) ? hiddenCats.filter((x) => x !== id) : [...hiddenCats, id];
    setHiddenCats(next); lsSet(HIDDEN_CATS_KEY, next);
  };

  // ── Records ──
  const { data: activities = [] } = useQuery({ ...sharedList("activities") });
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: tasks = [] } = useQuery({ ...sharedList("tasks") });
  const { data: goals = [] } = useQuery({ queryKey: ["activityGoals"], queryFn: () => base44.entities.ActivityGoal.list() });
  const { data: customFields = [] } = useQuery({ ...sharedList("customFields") });
  const { data: fronting = [] } = useQuery({ queryKey: ["frontingHistory"], queryFn: () => base44.entities.FrontingSession.list(), enabled: !!overlays.alters });
  const { data: checkIns = [] } = useQuery({ ...sharedList("emotionCheckIns"), enabled: !!overlays.emotions });
  const { data: places = [] } = useQuery({ ...sharedList("locations"), enabled: overlays.locations !== false });
  const events = usePlannerEvents();
  const running = useRunning();

  const byId = useMemo(() => indexById(categories), [categories]);
  const alterById = useMemo(() => new Map(alters.map((a) => [a.id, a])), [alters]);
  const dates = useMemo(() => collectAlterDates(alters, customFields), [alters, customFields]);
  const nameOfDate = (d) => `${formatAlter(alterById.get(d.alterId) || { name: d.alterName })}: ${d.fieldName}`;
  const taskItems = useMemo(() => tasksAsCalendarItems(tasks), [tasks]);
  const isHidden = useMemo(() => hiddenFilter(categories, hiddenCats), [categories, hiddenCats]);
  const shown = useMemo(() => (hiddenCats.length ? activities.filter((a) => !isHidden(a)) : activities), [activities, hiddenCats, isHidden]);
  const liveIds = useMemo(() => new Set(running.map((s) => s.planActivityId).filter(Boolean)), [running]);

  // ── Sheets ──
  const [details, setDetails] = useState(null);
  const [editorReq, setEditorReq] = useState(null);
  const [eventReq, setEventReq] = useState(null);
  const [seriesAsk, setSeriesAsk] = useState(null);
  const [liveMenu, setLiveMenu] = useState(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const openCreate = (day, fromMin, toMin, mode) => {
    const start = new Date(day); start.setHours(0, 0, 0, 0); start.setMinutes(fromMin);
    setEditorReq({ create: true, start, minutes: Math.max(15, toMin - fromMin), ...(mode ? { mode } : {}) });
  };
  const addLog = () => { const d = new Date(); const m = Math.max(0, (d.getHours() - 1) * 60); openCreate(d, m, m + 60, ENTRY_MODES.DONE); };
  const addPlan = () => {
    const day = holdsToday(calView, anchor, weekStart, now) ? now : anchor;
    const m = holdsToday(calView, anchor, weekStart, now) ? Math.min(23 * 60, (now.getHours() + 1) * 60) : 9 * 60;
    openCreate(day, m, m + 60, ENTRY_MODES.PLAN);
  };
  const addEvent = () => setEventReq({ create: true, date: dayKeyOf(holdsToday(calView, anchor, weekStart, now) ? now : anchor) });
  const openEntry = (a) => {
    if (!a) return;
    if (a._isTask) { navigate(`/todo?id=${encodeURIComponent(a._task.id)}`); return; }
    if (liveIds.has(a.id)) { const s = running.find((x) => x.planActivityId === a.id); if (s) { setLiveMenu(s); return; } }
    setDetails(a);
  };
  const openAllDay = (it) => {
    if (it.kind === "event") setEventReq({ event: it.event, occurrenceKey: it.occurrenceKey });
    else if (it.kind === "date") navigate(`/alter/${it.date.alterId}`);
    else openEntry(it.item);
  };

  // ── Landings (?date, ?view, ?activityId / ?highlight, ?event), once ──
  const landed = useRef("");
  useEffect(() => {
    const l = plannerLanding(location.search);
    if (!l.any || landed.current === location.search) return;
    if (l.activityId && !activities.some((a) => a.id === l.activityId) && activities.length === 0) return; // still loading
    if (l.eventId && !events.some((e) => e.id === l.eventId) && events.length === 0) return;
    landed.current = location.search;
    if (l.view === "plans") setState({ section: "plans", view });
    else if (l.view) setState({ section: "calendar", view: l.view });
    if (l.date) setAnchor(l.date);
    if (l.activityId) {
      const a = activities.find((x) => x.id === l.activityId);
      if (a) {
        const when = a.timestamp || a.planned_date;
        if (when && !l.date) setAnchor(new Date(when));
        setDetails(a);
      }
    }
    if (l.eventId) {
      const ev = events.find((e) => e.id === l.eventId);
      if (ev) setEventReq({ event: ev, occurrenceKey: l.date ? dayKeyOf(l.date) : null });
    }
    const q = new URLSearchParams(location.search);
    for (const k of PLANNER_LANDING_PARAMS) q.delete(k);
    const s = q.toString();
    navigate(`${location.pathname}${s ? `?${s}` : ""}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, activities, events]);

  // ── The calendar ──
  const range = useMemo(() => rangeOf(calView, anchor, weekStart), [calView, anchor, weekStart]);
  const week = useMemo(() => rangeOf("week", anchor, weekStart), [anchor, weekStart]);
  const columns = useMemo(() => {
    if (calView !== "day" && calView !== "week") return [];
    const cols = dayColumns({ days: range.days, activities: shown, tasks: taskItems, events, dates, byId, now, fmt, nameOfDate });
    return cols.map((c) => {
      const dayStart = c.day.getTime(), dayEnd = dayStart + 86400000;
      const inDay = (t) => { const x = t ? new Date(t).getTime() : NaN; return x >= dayStart && x < dayEnd; };
      const minOf = (t) => (new Date(t).getTime() - dayStart) / 60000;
      const lanes = new Map();
      const bands = overlays.alters ? fronting.filter((s) => {
        if (!s?.start_time) return false;
        const st = new Date(s.start_time).getTime(), en = s.end_time ? new Date(s.end_time).getTime() : now.getTime();
        return st < dayEnd && en > dayStart;
      }).map((s) => {
        const aid = s.alter_id || s.primary_alter_id;
        if (!lanes.has(aid)) lanes.set(aid, lanes.size);
        const st = Math.max(new Date(s.start_time).getTime(), dayStart), en = Math.min(s.end_time ? new Date(s.end_time).getTime() : now.getTime(), dayEnd);
        const alter = alterById.get(aid);
        return { key: s.id, lane: Math.min(5, lanes.get(aid)), startMin: (st - dayStart) / 60000, endMin: (en - dayStart) / 60000, colour: alter?.color || "var(--house-muted)", label: `${alter ? formatAlter(alter) : "?"}, ${terms.fronting}` };
      }) : [];
      const marks = [
        ...(overlays.emotions ? checkIns.filter((x) => inDay(x.timestamp)).map((x) => ({
          key: `c:${x.id}`, kind: "checkin", id: x.id, min: minOf(x.timestamp),
          colour: checkInIsDistress(x) ? "var(--house-danger)" : "#86b88f",
          label: `Check-in ${clockWords(minOf(x.timestamp), fmt)}: ${(x.emotions || []).join(", ") || "feelings"}`,
        })) : []),
        ...(overlays.locations !== false ? places.filter((x) => inDay(x.timestamp)).map((x) => ({
          key: `p:${x.id}`, kind: "place", id: x.id, min: minOf(x.timestamp), colour: "#5aa0c8",
          label: `Place ${clockWords(minOf(x.timestamp), fmt)}: ${x.name || "a place"}`,
        })) : []),
      ];
      return {
        key: c.key, today: c.today,
        name: phone && calView === "week" ? format(c.day, "EEEEE d") : format(c.day, "EEE d"),
        now: nowFraction(c.day, now),
        allDay: c.allDay.map((it) => ({ ...it, kindWords: it.kind === "event" ? "event" : it.kind === "date" ? "a date" : it.kind === "todo" ? "to-do" : TONE_WORDS[it.tone] })),
        blocks: c.blocks.map((b) => {
          const live = !b.item?._isTask && liveIds.has(b.item?.id);
          const tone = live ? "running" : b.tone;
          return {
            ...b, tone, toneWords: TONE_WORDS[tone],
            mark: tone === "done" ? "✓" : tone === "partial" ? "◐" : tone === "skipped" ? "⤼" : "",
            movable: !b.item?._isTask && !live && !b.continuesBefore && !b.continuesAfter,
          };
        }),
        bands, marks, day: c.day,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calView, range, shown, taskItems, events, dates, byId, now, fmt, overlays, fronting, checkIns, places, alterById, liveIds, phone, terms]);

  const onMove = async (block, dayIndex, startMin, endMin) => {
    const item = block.item;
    const col = columns[dayIndex];
    if (!item || !col) return;
    const start = new Date(col.day); start.setMinutes(startMin);
    const name = item.activity_name || "It";
    try {
      const patch = await moveActivityTime(item, { start, minutes: endMin - startMin });
      refresh();
      if (patch) {
        showToast({
          message: `${name}: ${format(start, "EEE")} ${clockWords(startMin, fmt)} to ${clockWords(endMin, fmt)}.`,
          action: { label: "Undo", onClick: async () => { try { await restoreActivityTime(item); refresh(); } catch (e) { showToast({ tone: "failed", message: "Couldn't move it back.", detail: e?.message || "" }); } } },
        });
      }
    } catch (e) {
      showToast({ tone: "failed", message: `Couldn't move ${name}.`, detail: `${e?.message ? `${e.message}. ` : ""}It's where it was.` });
    }
  };
  const openMark = (m) => {
    if (m.kind === "checkin") navigate(`/checkin-log?id=${encodeURIComponent(m.id)}`);
    else navigate(`/location-history?highlight=${encodeURIComponent(m.id)}`);
  };

  // ── This week, goals, decisions ──
  const weekTotals = useMemo(() => rollup({ activities, from: week.from, to: week.to, categories, alterIds: Object.fromEntries(alters.map((a) => [a.id, formatAlter(a)])) }), [activities, week, categories, alters, formatAlter]);
  const summary = useMemo(() => summarisePlans(activities, { from: week.from, to: week.to }), [activities, week]);
  const totalsRows = useMemo(() => topTotals(weekTotals, categories, activities), [weekTotals, categories, activities]);
  const goalRows = useMemo(() => goalProgress({ goals, rollupResult: weekTotals, categories }), [goals, weekTotals, categories]);
  const decisions = useMemo(() => needsDecision(activities, now), [activities, now]);
  const counts = useMemo(() => weekCounts({ activities, events, from: range.from, to: range.to }), [activities, events, range]);
  const monthEvents = useMemo(() => {
    if (calView !== "month") return [];
    const first = new Date(range.from); first.setDate(first.getDate() - 7);
    const last = new Date(range.to); last.setDate(last.getDate() + 7);
    return events.flatMap((ev) => occurrencesBetween(ev, first, last));
  }, [calView, range, events]);

  const pick = pickOf(state);
  const onPick = (id) => setState(stateForPick(id, state));
  const goDay = (d, v = "day") => { setAnchor(d); setState({ section: "calendar", view: v }); };
  const arrows = section !== "plans";
  const rangeLabel = section === "calendar" ? rangeWords(calView, anchor, weekStart) : rangeWords("week", anchor, weekStart);
  const unit = ARROW_WORDS[calView] || "week";
  const weekKeys = useMemo(() => new Set(calView === "week" || section !== "calendar" ? week.days.map(dayKeyOf) : []), [calView, section, week]);

  const toolbar = (
    <div className="hpl-toolbar" role="toolbar" aria-label="Planner">
      <div className="hpl-views" data-tour="planner-sections">
        <Segmented label="Calendar view" value={pick} onChange={onPick} options={PLANNER_PICKS.map((p) => ({ value: p.id, label: phone && p.id === "plans" ? "List" : p.label }))} />
      </div>
      {arrows && !phone ? (
        <span className="hpl-range">
          <IconButton icon={ChevronLeft} label={`Back a ${unit}`} onClick={() => setAnchor((a) => stepAnchor(calView, a, -1))} />
          <span className="hpl-range-words" aria-live="polite">{rangeLabel}</span>
          <IconButton icon={ChevronRight} label={`Forward a ${unit}`} onClick={() => setAnchor((a) => stepAnchor(calView, a, 1))} />
          {holdsToday(calView, anchor, weekStart, now) ? null : <Button rank="quiet" onClick={() => setAnchor(new Date())}>Today</Button>}
        </span>
      ) : null}
      <span className="hpl-flex" />
      <span className="hpl-adds">
        <Button rank="secondary" onClick={addLog}>+ Log</Button>
        <Button rank="secondary" onClick={addEvent}>+ Event</Button>
        <Button rank="primary" onClick={addPlan}>+ Plan</Button>
        <span data-tour="planner-options"><IconButton icon={SlidersHorizontal} label="Planner options" onClick={() => setOptionsOpen(true)} /></span>
      </span>
    </div>
  );

  const runningStrip = running.length ? (
    <div className="hpl-running" aria-label="Running now">
      {running.map((s) => (
        <Button key={s.id} rank="quiet" icon={Play} onClick={() => setLiveMenu(s)}>
          {`${s.name || "Activity"} · since ${s.startTime ? clockWords(new Date(s.startTime).getHours() * 60 + new Date(s.startTime).getMinutes(), fmt) : "now"}`}
        </Button>
      ))}
    </div>
  ) : null;

  const noPlansYet = activities.length === 0 && taskItems.length === 0 && events.length === 0;
  let body;
  if (section === "plans") {
    body = (
      <PlansListView activities={activities} categories={categories} alters={alters} events={events} weekStart={weekStart} fmt={fmt}
        onOpen={openEntry} onOpenEvent={setEventReq} onAddEvent={addEvent}
        onEditSeries={(item) => setEditorReq({ item, series: true })} onDeleteSeries={(item) => setSeriesAsk(item)} />
    );
  } else if (section === "insights") {
    body = <InsightsView terms={terms} rangeLabel={rangeWords("week", anchor, weekStart)} totals={weekTotals} weekFrom={week.from} activities={activities} />;
  } else if (calView === "month") {
    body = (
      <MonthView anchor={anchor} weekStart={weekStart} activities={[...shown, ...taskItems]} events={monthEvents} dates={dates} byId={byId} fmt={fmt} compact={phone}
        nameOfDate={nameOfDate} onPickDay={(d) => goDay(d)} onOpenEntry={openEntry} onOpenAllDay={openAllDay} />
    );
  } else if (calView === "year") {
    body = (
      <YearView anchor={anchor} weekStart={weekStart} activities={shown} events={events}
        onPickMonth={(m) => goDay(m, "month")} onPickDay={(d) => goDay(d)} />
    );
  } else {
    body = (
      <TimeColumns label={`${rangeLabel}: plans and logs`} days={columns} hourPx={prefs.hourPx}
        hourLabel={(h) => (phone ? formatHourLabel(h, fmt) : hourWords(h, fmt))} compact={phone}
        scrollToHour={now.getHours() >= 9 && now.getHours() <= 21 ? now.getHours() - 2 : 7}
        onSelect={(b) => openEntry(b.item)} onSelectAllDay={openAllDay}
        onCreate={(i, a, b) => openCreate(columns[i].day, a, b)}
        onTapEmpty={(i, m) => { const s = Math.floor(m / 60) * 60; openCreate(columns[i].day, s, s + 60); }}
        onMove={onMove} onSelectMark={openMark}
        empty={noPlansYet ? (
          <EmptyBlock compact title="Nothing planned yet"
            body={phone ? "Hold and drag on a day to plan, or tap + Plan." : "Drag on empty time to plan or log something, or use + Plan."}
            action={{ label: "+ Plan", onClick: addPlan }} />
        ) : null} />
    );
  }

  const statusLine = (
    <div className="hpl-status" role="status">
      <span>{calView === "week" || section !== "calendar" ? `Week of ${format(week.from, "MMM d")}` : rangeLabel}</span>
      {section === "calendar" ? <span>{countWords(counts)}</span> : null}
      {section === "calendar" && (calView === "week" || calView === "day") && !phone ? <span>Drag to move, drag the edge to resize</span> : null}
      <span className="hpl-flex" />
      {hiddenCats.length ? <span>{`${hiddenCats.length} ${hiddenCats.length === 1 ? "category" : "categories"} hidden`}</span> : null}
      <Button rank="quiet" className="hpl-status-btn" onClick={() => setOptionsOpen(true)}>{weekStart === 1 ? "Starts Monday" : "Starts Sunday"}</Button>
    </div>
  );

  const calendar = phone ? (
    <div className="hpl-cal-phone" data-view={section === "calendar" ? calView : section}>
      <Panel className="hpl-panel hpl-cal" headingLevel={2}
        title={section === "plans" ? "Plans list" : section === "insights" ? `Insights: ${rangeLabel}` : rangeLabel}
        tools={arrows ? (
          <>
            <IconButton icon={ChevronLeft} label={`Back a ${unit}`} onClick={() => setAnchor((a) => stepAnchor(calView, a, -1))} />
            <Button rank="quiet" onClick={() => setAnchor(new Date())}>Today</Button>
            <IconButton icon={ChevronRight} label={`Forward a ${unit}`} onClick={() => setAnchor((a) => stepAnchor(calView, a, 1))} />
          </>
        ) : null}>
        {toolbar}
        {runningStrip}
        <div className="hpl-body">{body}</div>
        {statusLine}
      </Panel>
    </div>
  ) : (
    <section className="hpl-cal" aria-label="Calendar" data-view={section === "calendar" ? calView : section}>
      {toolbar}
      {runningStrip}
      <div className="hpl-body">{body}</div>
      {statusLine}
    </section>
  );

  const sheets = (
    <>
      <PlanDetailsSheet item={details} onClose={() => setDetails(null)} onEdit={(it) => { setDetails(null); setEditorReq({ item: it, day: it._day || null }); }} />
      <ActivityEditor request={editorReq} onClose={() => setEditorReq(null)} weekStartsOn={weekStart} />
      {eventReq ? <EventSheet request={eventReq} onClose={() => setEventReq(null)} /> : null}
      {seriesAsk ? <SeriesDeleteSheet item={seriesAsk} activities={activities} onClose={() => setSeriesAsk(null)} /> : null}
      {liveMenu ? <ActivityActionMenu activity={liveMenu} onClose={() => setLiveMenu(null)} /> : null}
      <PlannerOptionsSheet open={optionsOpen} onClose={() => setOptionsOpen(false)} terms={terms} prefs={prefs} setPref={setPref}
        overlays={overlays} setOverlay={setOverlay} />
    </>
  );

  const toInsights = () => setState({ section: "insights", view });
  const left = (compact) => (
    <>
      <MonthPanel anchor={anchor} weekStart={weekStart} weekKeys={weekKeys} collapsible={compact} defaultOpen={!compact}
        onPick={(d) => { setAnchor(d); if (section === "plans") setState({ section: "calendar", view }); }} />
      <CategoriesPanel categories={categories} hidden={hiddenCats} onToggle={toggleHidden} collapsible={compact} defaultOpen={!compact} />
    </>
  );
  const right = (compact) => (
    <>
      <ThisWeekPanel summary={summary} totals={totalsRows} onInsights={toInsights} collapsible={compact} />
      <GoalsPanel rows={goalRows} onOpen={toInsights} collapsible={compact} />
      <DecisionsPanel items={decisions} fmt={fmt} onOpen={openEntry} collapsible={false} />
    </>
  );

  if (phone) {
    return (
      <HouseScope tokens={tokens} className="hpl hpl--phone" data-house-size="phone" data-planner-room="" data-tour="planner">
        <div className="hpl-stack">
          {calendar}
          {decisions.length ? <DecisionsPanel items={decisions} fmt={fmt} onOpen={openEntry} /> : null}
          <ThisWeekPanel summary={summary} totals={totalsRows} onInsights={toInsights} collapsible />
          <GoalsPanel rows={goalRows} onOpen={toInsights} collapsible />
          {left(true)}
        </div>
        {sheets}
      </HouseScope>
    );
  }

  return (
    <HouseScope tokens={tokens} className="hpl hpl--studio" data-house-size={size} data-planner-room="" data-tour="planner">
      <aside className="hpl-left" aria-label="The month and the categories">{left(size === "compact")}</aside>
      <div className="hpl-main">{calendar}</div>
      <aside className="hpl-right" aria-label="This week, goals and plans that need a decision">{right(size === "compact")}</aside>
      {sheets}
    </HouseScope>
  );
}
