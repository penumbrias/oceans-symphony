// The timeline's data layer, shared by the Timeline page and the timeline
// widgets on the v2 home board.
//
// A timeline day pulls from ~20 entities. Rather than have the widget
// re-declare all of them (and drift), the page's fetch block and its
// per-day slicing live here: one set of query keys, one definition of
// "what belongs to this day", two renderers.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, endOfDay } from "date-fns";
import { base44, localEntities } from "@/api/base44Client";
import { collectAlterDates, datesForDay } from "@/lib/importantDates";

const parseDate = (v) => (v instanceof Date ? v : new Date(v));

export function useTimelineSources() {
  const { data: sessions = [] } = useQuery({ queryKey: ["frontHistory"], queryFn: () => base44.entities.FrontingSession.list("-start_time", 2000) });
  const { data: activities = [] } = useQuery({ queryKey: ["activities"], queryFn: () => base44.entities.Activity.list("-timestamp", 2000) });
  const { data: emotions = [] } = useQuery({ queryKey: ["emotionCheckIns"], queryFn: () => base44.entities.EmotionCheckIn.list("-timestamp", 2000) });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: customFields = [] } = useQuery({ queryKey: ["customFields"], queryFn: () => base44.entities.CustomField.list() });
  const { data: journals = [] } = useQuery({ queryKey: ["journalEntries"], queryFn: () => base44.entities.JournalEntry.list("-created_date", 2000) });
  const { data: checkIns = [] } = useQuery({ queryKey: ["systemCheckIns"], queryFn: () => base44.entities.SystemCheckIn.list("-created_date", 2000) });
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });
  const { data: bulletins = [] } = useQuery({ queryKey: ["bulletins"], queryFn: () => base44.entities.Bulletin.list("-created_date", 2000) });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => base44.entities.Task.list("-created_date", 2000) });
  const { data: dailyProgress = [] } = useQuery({ queryKey: ["dailyProgress"], queryFn: () => base44.entities.DailyProgress.list("-date", 365) });
  const { data: symptomSessions = [] } = useQuery({ queryKey: ["symptomSessions"], queryFn: () => base44.entities.SymptomSession.list("-start_time", 2000) });
  const { data: symptomCheckIns = [] } = useQuery({ queryKey: ["symptomCheckIns"], queryFn: () => base44.entities.SymptomCheckIn.list("-timestamp", 2000) });
  const { data: locationRecords = [] } = useQuery({ queryKey: ["locations"], queryFn: () => localEntities.Location.list() });
  const { data: statusNotes = [] } = useQuery({ queryKey: ["statusNotes"], queryFn: () => localEntities.StatusNote.list() });
  const { data: symptoms = [] } = useQuery({ queryKey: ["symptoms"], queryFn: () => base44.entities.Symptom.list() });
  const { data: sleeps = [] } = useQuery({ queryKey: ["sleep"], queryFn: () => base44.entities.Sleep.list("-bedtime", 2000) });
  const { data: lineageEvents = [] } = useQuery({ queryKey: ["systemChangeEvents"], queryFn: () => localEntities.SystemChangeEvent.list() });
  const { data: diaryCards = [] } = useQuery({ queryKey: ["diaryCards"], queryFn: () => base44.entities.DiaryCard.list("-created_date", 2000) });
  const { data: polls = [] } = useQuery({ queryKey: ["polls"], queryFn: () => base44.entities.Poll.list("-created_date", 2000) });
  const { data: reminderInstances = [] } = useQuery({ queryKey: ["reminderInstances"], queryFn: () => base44.entities.ReminderInstance.list("-scheduled_for", 2000) });
  // Instances only carry a reminder_id — the parent holds the title/message,
  // so timeline rows can say what the reminder was about.
  const { data: reminders = [] } = useQuery({ queryKey: ["reminders"], queryFn: () => base44.entities.Reminder.list("-created_date", 1000) });
  const { data: reflections = [] } = useQuery({ queryKey: ["supportJournalAll"], queryFn: () => base44.entities.SupportJournalEntry.list("-created_date", 2000) });
  const { data: alterNotes = [] } = useQuery({ queryKey: ["alterNotes"], queryFn: () => base44.entities.AlterNote.list("-created_date", 2000) });
  const { data: dailyTaskTemplates = [] } = useQuery({ queryKey: ["dailyTaskTemplates"], queryFn: () => base44.entities.DailyTaskTemplate.list() });

  const importantDates = useMemo(() => collectAlterDates(alters, customFields), [alters, customFields]);
  const reminderById = useMemo(() => Object.fromEntries((reminders || []).map((r) => [r.id, r])), [reminders]);

  return {
    sessions, activities, emotions, alters, customFields, journals, checkIns, categories,
    bulletins, tasks, dailyProgress, symptomSessions, symptomCheckIns, locationRecords,
    statusNotes, symptoms, sleeps, lineageEvents, diaryCards, polls, reminderInstances,
    reminders, reminderById, reflections, alterNotes, dailyTaskTemplates, importantDates,
  };
}

// Everything belonging to one day, in the shape InfiniteTimeline and
// DailyTallyPanel expect. `filters` mirrors the page's column toggles.
export function sliceTimelineDay(src, day, filters = {}) {
  const { showActivities = true, showFronting = true, showLocations = true } = filters;
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const inDay = (val) => {
    if (!val) return false;
    const t = parseDate(val);
    return t >= dayStart && t <= dayEnd;
  };

  const daySessions = showFronting
    ? src.sessions.filter((s) => {
        const start = parseDate(s.start_time);
        const end = s.end_time ? parseDate(s.end_time) : new Date();
        return start <= dayEnd && end >= dayStart;
      })
    : [];

  const dayActivities = showActivities
    ? src.activities.filter((a) => {
        const t = parseDate(a.timestamp);
        const tMs = t.getTime();
        const duration = Math.max(a.duration_minutes || 0, 0);
        const endMs = duration > 0 ? tMs + duration * 60 * 1000 : tMs + 1;
        return endMs > dayStart.getTime() && tMs < dayEnd.getTime() + 1;
      })
    : [];

  const dayEmotions = src.emotions.filter((e) => inDay(e.timestamp));
  const dayJournals = src.journals.filter((j) => inDay(j.created_date));
  const dayCheckIns = src.checkIns.filter((c) => inDay(c.created_date));
  const dayBulletins = src.bulletins.filter((b) => inDay(b.created_date));
  const dayTasks = src.tasks.filter((t) => {
    const created = parseDate(t.created_date);
    const completed = t.completed && t.completed_date ? parseDate(t.completed_date) : null;
    return (created >= dayStart && created <= dayEnd) || (completed && completed >= dayStart && completed <= dayEnd);
  });
  const daySymptomSessions = src.symptomSessions.filter((s) => {
    const start = parseDate(s.start_time);
    const end = s.end_time ? parseDate(s.end_time) : new Date();
    return start <= dayEnd && end >= dayStart;
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

  const hasData =
    daySessions.length > 0 || dayActivities.length > 0 || dayEmotions.length > 0 || dayJournals.length > 0 ||
    dayCheckIns.length > 0 || dayBulletins.length > 0 || dayTasks.length > 0 || daySymptomSessions.length > 0 ||
    daySymptomCheckIns.length > 0 || dayLocations.length > 0 || dayStatusNotes.length > 0 ||
    dayImportantDates.length > 0 || daySleeps.length > 0 || dayLineage.length > 0 || dayDiaryCards.length > 0 ||
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
    dailyProgress: dayProgress, importantDates: dayImportantDates,
  };
}
