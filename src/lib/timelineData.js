// The timeline's data layer, shared by the Timeline page and the timeline
// widgets on the v2 home board.
//
// A timeline day pulls from ~20 entities. Rather than have the widget
// re-declare all of them (and drift), the page's fetch block and its
// per-day slicing live here: one set of query keys, one definition of
// "what belongs to this day", two renderers.

import { useMemo } from "react";
import { activityDate } from "@/lib/dateUtils";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, endOfDay } from "date-fns";
import { base44, localEntities } from "@/api/base44Client";
import { collectAlterDates, datesForDay } from "@/lib/importantDates";
import { journalEntryDate } from "@/lib/journalDate";
import { eventsOnDay } from "@/lib/plannerEventDates";
import { PLANNER_EVENTS_KEY } from "@/lib/plannerEvents";
import { sharedList } from "@/lib/sharedLists";

// Each visible day scans every record, so the same date strings were parsed
// again for every day on screen. Remember each string's time once.
const _msCache = new Map();
function toMs(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v !== "string") return new Date(v).getTime();
  let ms = _msCache.get(v);
  if (ms === undefined) {
    if (_msCache.size > 200000) _msCache.clear();
    ms = new Date(v).getTime();
    _msCache.set(v, ms);
  }
  return ms;
}
// activityDate per record (its own parsing rules), remembered per record
// object. Records are replaced, never mutated, when they change.
const _activityMs = new WeakMap();
function activityMs(a) {
  if (!a || typeof a !== "object") return activityDate(a).getTime();
  const key = a.timestamp || a.planned_date;
  const hit = _activityMs.get(a);
  if (hit && hit.key === key) return hit.ms;
  const ms = activityDate(a).getTime();
  _activityMs.set(a, { key, ms });
  return ms;
}

export function useTimelineSources() {
  const { data: sessions = [] } = useQuery({ ...sharedList("frontHistory") });
  const { data: activities = [] } = useQuery({ ...sharedList("activities") });
  const { data: emotions = [] } = useQuery({ ...sharedList("emotionCheckIns") });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: customFields = [] } = useQuery({ ...sharedList("customFields") });
  const { data: journals = [] } = useQuery({ ...sharedList("journalEntries") });
  const { data: checkIns = [] } = useQuery({ ...sharedList("systemCheckIns") });
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });
  const { data: bulletins = [] } = useQuery({ ...sharedList("bulletins") });
  const { data: tasks = [] } = useQuery({ ...sharedList("tasks") });
  const { data: dailyProgress = [] } = useQuery({ ...sharedList("dailyProgress") });
  const { data: symptomSessions = [] } = useQuery({ queryKey: ["symptomSessions", "all"], queryFn: () => base44.entities.SymptomSession.list("-start_time", 2000) });
  const { data: symptomCheckIns = [] } = useQuery({ ...sharedList("symptomCheckIns") });
  const { data: locationRecords = [] } = useQuery({ ...sharedList("locations") });
  const { data: statusNotes = [] } = useQuery({ ...sharedList("statusNotes") });
  const { data: symptoms = [] } = useQuery({ queryKey: ["symptoms"], queryFn: () => base44.entities.Symptom.list() });
  const { data: sleeps = [] } = useQuery({ ...sharedList("sleep") });
  const { data: lineageEvents = [] } = useQuery({ queryKey: ["systemChangeEvents"], queryFn: () => localEntities.SystemChangeEvent.list() });
  const { data: diaryCards = [] } = useQuery({ ...sharedList("diaryCards") });
  const { data: polls = [] } = useQuery({ ...sharedList("polls") });
  const { data: reminderInstances = [] } = useQuery({ ...sharedList("reminderInstances") });
  // Instances only carry a reminder_id — the parent holds the title/message,
  // so timeline rows can say what the reminder was about.
  const { data: reminders = [] } = useQuery({ ...sharedList("reminders") });
  const { data: reflections = [] } = useQuery({ ...sharedList("supportJournalAll") });
  const { data: alterNotes = [] } = useQuery({ queryKey: ["alterNotes"], queryFn: () => base44.entities.AlterNote.list("-created_date", 2000) });
  const { data: dailyTaskTemplates = [] } = useQuery({ ...sharedList("dailyTaskTemplates") });

  // Events (payday, birthdays) — dates, drawn as chips on the day header.
  const { data: plannerEvents = [] } = useQuery({ queryKey: PLANNER_EVENTS_KEY, queryFn: () => localEntities.PlannerEvent.list() });
  const importantDates = useMemo(() => collectAlterDates(alters, customFields), [alters, customFields]);
  const reminderById = useMemo(() => Object.fromEntries((reminders || []).map((r) => [r.id, r])), [reminders]);

  // One stable object while nothing changed, so callers can memoise the
  // per-day slices instead of re-scanning every record on each render.
  return useMemo(() => ({
    sessions, activities, emotions, alters, customFields, journals, checkIns, categories,
    bulletins, tasks, dailyProgress, symptomSessions, symptomCheckIns, locationRecords,
    statusNotes, symptoms, sleeps, lineageEvents, diaryCards, polls, reminderInstances,
    reminders, reminderById, reflections, alterNotes, dailyTaskTemplates, importantDates, plannerEvents,
  }), [
    sessions, activities, emotions, alters, customFields, journals, checkIns, categories,
    bulletins, tasks, dailyProgress, symptomSessions, symptomCheckIns, locationRecords,
    statusNotes, symptoms, sleeps, lineageEvents, diaryCards, polls, reminderInstances,
    reminders, reminderById, reflections, alterNotes, dailyTaskTemplates, importantDates, plannerEvents,
  ]);
}

// Everything belonging to one day, in the shape InfiniteTimeline and
// DailyTallyPanel expect. `filters` mirrors the page's column toggles.
export function sliceTimelineDay(src, day, filters = {}) {
  const { showActivities = true, showFronting = true, showLocations = true } = filters;
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const startMs = dayStart.getTime();
  const endMs = dayEnd.getTime();
  const nowMs = Date.now();
  const inDay = (val) => {
    if (!val) return false;
    const t = toMs(val);
    return t >= startMs && t <= endMs;
  };

  const daySessions = showFronting
    ? src.sessions.filter((s) => {
        const start = toMs(s.start_time);
        const end = s.end_time ? toMs(s.end_time) : nowMs;
        return start <= endMs && end >= startMs;
      })
    : [];

  const dayActivities = showActivities
    ? src.activities.filter((a) => {
        const tMs = activityMs(a);
        const duration = Math.max(a.duration_minutes || 0, 0);
        const aEnd = duration > 0 ? tMs + duration * 60 * 1000 : tMs + 1;
        return aEnd > startMs && tMs < endMs + 1;
      })
    : [];

  const dayEmotions = src.emotions.filter((e) => inDay(e.timestamp));
  const dayJournals = src.journals.filter((j) => inDay(journalEntryDate(j)));
  const dayCheckIns = src.checkIns.filter((c) => inDay(c.created_date));
  const dayBulletins = src.bulletins.filter((b) => inDay(b.created_date));
  const dayTasks = src.tasks.filter((t) => {
    const created = toMs(t.created_date);
    const completed = t.completed && t.completed_date ? toMs(t.completed_date) : null;
    return (created >= startMs && created <= endMs) || (completed !== null && completed >= startMs && completed <= endMs);
  });
  const daySymptomSessions = src.symptomSessions.filter((s) => {
    const start = toMs(s.start_time);
    const end = s.end_time ? toMs(s.end_time) : nowMs;
    return start <= endMs && end >= startMs;
  });
  const daySymptomCheckIns = src.symptomCheckIns.filter((s) => inDay(s.timestamp));
  const dayLocations = showLocations ? src.locationRecords.filter((loc) => inDay(loc.timestamp)) : [];
  const dayStatusNotes = src.statusNotes.filter((n) => inDay(n.timestamp));
  const daySleeps = src.sleeps.filter((s) => inDay(s.bedtime || (s.date ? `${s.date}T12:00:00` : null)));
  const dayLineage = src.lineageEvents.filter((ev) => inDay(ev.date));
  const dayDiaryCards = src.diaryCards.filter((d) => inDay(d.created_date || (d.date ? `${d.date}T12:00:00` : null)));
  const dayPolls = src.polls.filter((p) => inDay(p.created_date));
  const dayReminderInstances = src.reminderInstances
    .filter((ri) => inDay(ri.fired_at || ri.scheduled_for))
    .map((ri) => {
      const r = src.reminderById[ri.reminder_id];
      return r ? { ...ri, title: ri.title || r.title, body: ri.body || r.body } : ri;
    });
  const dayReflections = src.reflections.filter((r) => inDay(r.created_date));
  const dayAlterNotes = src.alterNotes.filter((n) => inDay(n.created_date));
  const dateStr = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, "0")}-${String(dayStart.getDate()).padStart(2, "0")}`;
  const dayProgress = src.dailyProgress.find((p) => p.date === dateStr) || null;
  const dayHasDailyTasks = !!(dayProgress && Array.isArray(dayProgress.completed_task_ids) && dayProgress.completed_task_ids.length && dayProgress.created_date);
  const dayImportantDates = datesForDay(src.importantDates, day);
  const dayPlannerEvents = eventsOnDay(src.plannerEvents || [], day);

  const hasData =
    daySessions.length > 0 || dayActivities.length > 0 || dayEmotions.length > 0 || dayJournals.length > 0 ||
    dayCheckIns.length > 0 || dayBulletins.length > 0 || dayTasks.length > 0 || daySymptomSessions.length > 0 ||
    daySymptomCheckIns.length > 0 || dayLocations.length > 0 || dayStatusNotes.length > 0 ||
    dayImportantDates.length > 0 || dayPlannerEvents.length > 0 || daySleeps.length > 0 || dayLineage.length > 0 || dayDiaryCards.length > 0 ||
    dayPolls.length > 0 || dayReminderInstances.length > 0 || dayReflections.length > 0 ||
    dayAlterNotes.length > 0 || dayHasDailyTasks;

  return {
    dateStr, hasData,
    sessions: daySessions, activities: dayActivities, emotions: dayEmotions, journals: dayJournals,
    checkIns: dayCheckIns, bulletins: dayBulletins, tasks: dayTasks,
    symptomSessions: daySymptomSessions, symptomCheckIns: daySymptomCheckIns,
    locations: dayLocations, statusNotes: dayStatusNotes, sleeps: daySleeps,
    lineageEvents: dayLineage, diaryCards: dayDiaryCards, polls: dayPolls,
    reminderInstances: dayReminderInstances, reflections: dayReflections, alterNotes: dayAlterNotes,
    dailyProgress: dayProgress, importantDates: dayImportantDates, plannerEvents: dayPlannerEvents,
  };
}
