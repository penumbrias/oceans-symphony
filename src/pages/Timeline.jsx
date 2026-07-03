import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { parseDate } from "@/lib/dateUtils";
import { collectAlterDates, datesForDay } from "@/lib/importantDates";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfDay, endOfDay, isToday } from "date-fns";
import { Activity, Heart, Users, Calendar, BookOpen, Zap, MapPin, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "react-router-dom";
import InfiniteTimeline from "@/components/timeline/InfiniteTimeline";
import { localEntities } from "@/api/base44Client";

const CHUNK_DAYS = 14; // how many days to load per chunk

export default function Timeline() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [daysBack, setDaysBack] = useState(CHUNK_DAYS);
  // Sessions a chip on the dashboard double-tapped through to. The
  // URL carries `?focusSessionId=<id>` (and optionally `&edit=1`); we
  // strip the params after handling so a refresh doesn't re-jump.
  const focusSessionId = searchParams.get("focusSessionId") || null;
  const focusEdit = searchParams.get("edit") === "1";
  const [showFronting, setShowFronting] = useState(true);
  const [showActivities, setShowActivities] = useState(true);
  const [showCheckIns, setShowCheckIns] = useState(true);
  const [showEmotions, setShowEmotions] = useState(true);
  const [showSymptoms, setShowSymptoms] = useState(true);
  const [showLocations, setShowLocations] = useState(true);
  const [jumpDate, setJumpDate] = useState(() => searchParams.get("date") || "");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const isAtToday = isToday(anchorDate);
  const sentinelRef = useRef(null);
  const containerRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 2000),
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list("-timestamp", 2000),
  });

  const { data: emotions = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list("-timestamp", 2000),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: customFields = [] } = useQuery({
    queryKey: ["customFields"],
    queryFn: () => base44.entities.CustomField.list(),
  });

  // Annual important dates (birthdays etc.) from date-typed custom fields.
  const importantDates = collectAlterDates(alters, customFields);

  const { data: journals = [] } = useQuery({
    queryKey: ["journalEntries"],
    queryFn: () => base44.entities.JournalEntry.list("-created_date", 2000),
  });

  const { data: checkIns = [] } = useQuery({
    queryKey: ["systemCheckIns"],
    queryFn: () => base44.entities.SystemCheckIn.list("-created_date", 2000),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const { data: bulletins = [] } = useQuery({
    queryKey: ["bulletins"],
    queryFn: () => base44.entities.Bulletin.list("-created_date", 2000),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list("-created_date", 2000),
  });

  const { data: dailyProgress = [] } = useQuery({
    queryKey: ["dailyProgress"],
    queryFn: () => base44.entities.DailyProgress.list("-date", 365),
  });

  const { data: symptomSessions = [] } = useQuery({
    queryKey: ["symptomSessions"],
    queryFn: () => base44.entities.SymptomSession.list("-start_time", 2000),
  });

  const { data: symptomCheckIns = [] } = useQuery({
    queryKey: ["symptomCheckIns"],
    queryFn: () => base44.entities.SymptomCheckIn.list("-timestamp", 2000),
  });

  const { data: locationRecords = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => localEntities.Location.list(),
  });

  const { data: statusNotes = [] } = useQuery({
    queryKey: ["statusNotes"],
    queryFn: () => localEntities.StatusNote.list(),
  });

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  // Additional timestamped sources surfaced in the timeline's events column.
  const { data: sleeps = [] } = useQuery({
    queryKey: ["sleep"],
    queryFn: () => base44.entities.Sleep.list("-bedtime", 2000),
  });

  const { data: lineageEvents = [] } = useQuery({
    queryKey: ["systemChangeEvents"],
    queryFn: () => localEntities.SystemChangeEvent.list(),
  });

  const { data: diaryCards = [] } = useQuery({
    queryKey: ["diaryCards"],
    queryFn: () => base44.entities.DiaryCard.list("-created_date", 2000),
  });

  const { data: polls = [] } = useQuery({
    queryKey: ["polls"],
    queryFn: () => base44.entities.Poll.list("-created_date", 2000),
  });

  const { data: reminderInstances = [] } = useQuery({
    queryKey: ["reminderInstances"],
    queryFn: () => base44.entities.ReminderInstance.list("-scheduled_for", 2000),
  });

  // Parent reminders hold the actual title/message — the instance only has a
  // reminder_id — so fetch them to label timeline entries with what the
  // reminder was actually about (instead of a generic "Reminder").
  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders"],
    queryFn: () => base44.entities.Reminder.list("-created_date", 1000),
  });
  const reminderById = React.useMemo(
    () => Object.fromEntries((reminders || []).map((r) => [r.id, r])),
    [reminders]
  );

  const { data: reflections = [] } = useQuery({
    queryKey: ["supportJournalAll"],
    queryFn: () => base44.entities.SupportJournalEntry.list("-created_date", 2000),
  });

  const { data: alterNotes = [] } = useQuery({
    queryKey: ["alterNotes"],
    queryFn: () => base44.entities.AlterNote.list("-created_date", 2000),
  });

  const { data: dailyTaskTemplates = [] } = useQuery({
    queryKey: ["dailyTaskTemplates"],
    queryFn: () => base44.entities.DailyTaskTemplate.list(),
  });

  // Jump to date from URL param on mount
  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (dateParam && !jumpDate) {
      const target = document.getElementById(`day-${dateParam}`);
      if (target) {
        setTimeout(() => {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    }
  }, [searchParams, jumpDate]);

  // Highlight a specific status note badge from search
  useEffect(() => {
    const statusId = searchParams.get("highlightStatus");
    if (!statusId) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-status-id="${statusId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-yellow-400", "ring-inset", "animate-pulse", "rounded-md");
        const clearTimer = setTimeout(() => {
          el.classList.remove("ring-2", "ring-yellow-400", "ring-inset", "animate-pulse", "rounded-md");
        }, 5000);
        return () => clearTimeout(clearTimer);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchParams]);

  // Focus a specific FrontingSession sent through from a dashboard
  // chip's double-tap menu (?focusSessionId=<id>&edit=1?). Sets the
  // anchor date to that session's day so InfiniteTimeline renders it,
  // then scrolls to it. The session bar adds its own 3-second halo via
  // the focusSessionId prop on InfiniteTimeline. Run only when sessions
  // load AND the param is present.
  useEffect(() => {
    if (!focusSessionId) return;
    if (!sessions || sessions.length === 0) return;
    const session = sessions.find((s) => s.id === focusSessionId);
    if (!session) return;
    const sessionDay = startOfDay(parseDate(session.start_time));
    // Only move the anchor if the user isn't already on that day's
    // chunk (avoid unnecessary re-render storms).
    if (startOfDay(anchorDate).getTime() !== sessionDay.getTime()) {
      setAnchorDate(sessionDay);
      setDaysBack(CHUNK_DAYS);
    }
    const dateStr = format(sessionDay, "yyyy-MM-dd");
    const t = setTimeout(() => {
      const dayEl = document.getElementById(`day-${dateStr}`);
      if (dayEl) dayEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    // Strip the params so a refresh / back-nav doesn't re-trigger the
    // jump. focusSessionId / edit are consumed exactly once.
    const next = new URLSearchParams(searchParams);
    next.delete("focusSessionId");
    next.delete("edit");
    setSearchParams(next, { replace: true });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSessionId, sessions]);

  // Lazy load more days as user scrolls to bottom
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDaysBack((prev) => prev + CHUNK_DAYS);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Show scroll-to-top button after scrolling down. Scroll on the
  // document/window (not on an inner overflow-y-auto element) — each
  // InfiniteTimeline day's grid used to have its own inner scroller
  // but now flows in the page scroll so the user can move between
  // days continuously.
  useEffect(() => {
    const onScroll = () => {
      const el = document.scrollingElement || document.documentElement;
      setShowScrollTop((el?.scrollTop || 0) > 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleScrollTop = () => {
    const el = document.scrollingElement || document.documentElement;
    if (el) el.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleJumpToDate = () => {
    if (!jumpDate) return;
    const target = new Date(jumpDate + "T00:00:00");
    if (isNaN(target.getTime())) return;
    setAnchorDate(target);
    setDaysBack(CHUNK_DAYS);
    const el = document.scrollingElement || document.documentElement;
    if (el) el.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBackToToday = () => {
    setAnchorDate(new Date());
    setDaysBack(CHUNK_DAYS);
    const el = document.scrollingElement || document.documentElement;
    if (el) el.scrollTo({ top: 0, behavior: "smooth" });
  };

  const days = Array.from({ length: daysBack }, (_, i) => subDays(anchorDate, i));

  const toggleStyles = (active) =>
    `px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card text-muted-foreground border-border hover:border-primary/50"
    }`;

  return (
    <div data-tour="timeline-container" className="space-y-4 max-w-3xl mx-auto" ref={containerRef}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-3xl font-semibold text-foreground">Timeline</h1>
        <div data-tour="timeline-jump" className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={jumpDate}
            onChange={(e) => setJumpDate(e.target.value)}
            className="px-2 py-1.5 rounded-md border border-border bg-background text-xs"
          />
          <Button size="sm" variant="outline" onClick={handleJumpToDate} className="gap-1 text-xs">
            <Calendar className="w-3 h-3" /> Jump
          </Button>
        </div>
      </div>

      {/* Back to today banner */}
      {!isAtToday && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm">
          <span className="text-primary font-medium">Viewing {format(anchorDate, "MMM d, yyyy")}</span>
          <button onClick={handleBackToToday} className="text-xs text-primary font-semibold hover:underline">
            Back to today →
          </button>
        </div>
      )}

      {/* Toggles */}
      <div data-tour="timeline-filters" className="flex gap-2 flex-wrap">
        <button className={toggleStyles(showActivities)} onClick={() => setShowActivities(!showActivities)} title="Activities">
          <Activity className="w-3.5 h-3.5" />
        </button>
        <button className={toggleStyles(showCheckIns)} onClick={() => setShowCheckIns(!showCheckIns)} title="Events">
          <BookOpen className="w-3.5 h-3.5" />
        </button>
        <button className={toggleStyles(showEmotions)} onClick={() => setShowEmotions(!showEmotions)} title="Emotions">
          <Heart className="w-3.5 h-3.5" />
        </button>
        <button className={toggleStyles(showFronting)} onClick={() => setShowFronting(!showFronting)} title="Fronting">
          <Users className="w-3.5 h-3.5" />
        </button>
        <button className={toggleStyles(showSymptoms)} onClick={() => setShowSymptoms(!showSymptoms)} title="Symptoms">
          <Zap className="w-3.5 h-3.5" />
        </button>
        <button className={toggleStyles(showLocations)} onClick={() => setShowLocations(!showLocations)} title="Locations">
          <MapPin className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Timeline days */}
      <div className="space-y-2">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayStart = startOfDay(day);
          const dayEnd = endOfDay(day);

          const daySessions = showFronting
            ? sessions.filter((s) => {
                const start = parseDate(s.start_time);
                const end = s.end_time ? parseDate(s.end_time) : new Date();
                return start <= dayEnd && end >= dayStart;
              })
            : [];

          const dayActivities = showActivities
            ? activities.filter((a) => {
                const t = parseDate(a.timestamp);
                const tMs = t.getTime();
                const duration = Math.max(a.duration_minutes || 0, 0);
                const endMs = duration > 0 ? tMs + duration * 60 * 1000 : tMs + 1;
                return endMs > dayStart.getTime() && tMs < dayEnd.getTime() + 1;
              })
            : [];

          const dayEmotions = emotions.filter((e) => {
            const t = parseDate(e.timestamp);
            return t >= dayStart && t <= dayEnd;
          });

          const dayJournals = journals.filter((j) => {
            const t = parseDate(j.created_date);
            return t >= dayStart && t <= dayEnd;
          });

          const dayCheckIns = checkIns.filter((c) => {
            const t = parseDate(c.created_date);
            return t >= dayStart && t <= dayEnd;
          });

          const dayBulletins = bulletins.filter((b) => {
            const t = parseDate(b.created_date);
            return t >= dayStart && t <= dayEnd;
          });

          const dayTasks = tasks.filter((t) => {
            const created = parseDate(t.created_date);
            const completed = t.completed && t.completed_date ? parseDate(t.completed_date) : null;
            return (created >= dayStart && created <= dayEnd) || (completed && completed >= dayStart && completed <= dayEnd);
          });

          const daySymptomSessions = symptomSessions.filter(s => {
            const start = parseDate(s.start_time);
            const end = s.end_time ? parseDate(s.end_time) : new Date();
            return start <= dayEnd && end >= dayStart;
          });

          const daySymptomCheckIns = symptomCheckIns.filter(s => {
            const t = parseDate(s.timestamp);
            return t >= dayStart && t <= dayEnd;
          });

          const dayLocations = showLocations
            ? locationRecords.filter(loc => {
                const t = parseDate(loc.timestamp);
                return t >= dayStart && t <= dayEnd;
              })
            : [];

          const dayStatusNotes = statusNotes.filter(n => {
            const t = parseDate(n.timestamp);
            return t >= dayStart && t <= dayEnd;
          });

          const inDay = (val) => {
            if (!val) return false;
            const t = parseDate(val);
            return t >= dayStart && t <= dayEnd;
          };
          const daySleeps = sleeps.filter((s) => inDay(s.bedtime || (s.date ? `${s.date}T12:00:00` : null)));
          const dayLineage = lineageEvents.filter((ev) => inDay(ev.date));
          const dayDiaryCards = diaryCards.filter((d) => inDay(d.created_date || (d.date ? `${d.date}T12:00:00` : null)));
          const dayPolls = polls.filter((p) => inDay(p.created_date));
          const dayReminderInstances = reminderInstances
            .filter((ri) => inDay(ri.fired_at || ri.scheduled_for))
            .map((ri) => {
              // Pull the title/message from the parent reminder so the timeline
              // shows what it was about, not just "Reminder".
              const r = reminderById[ri.reminder_id];
              return r ? { ...ri, title: ri.title || r.title, body: ri.body || r.body } : ri;
            });
          const dayReflections = reflections.filter((r) => inDay(r.created_date));
          const dayAlterNotes = alterNotes.filter((n) => inDay(n.created_date));
          const dayProgress = dailyProgress.find((p) => p.date === dateStr) || null;
          const dayHasDailyTasks = !!(dayProgress && Array.isArray(dayProgress.completed_task_ids) && dayProgress.completed_task_ids.length && dayProgress.created_date);

          const dayImportantDates = datesForDay(importantDates, day);

          const hasData = daySessions.length > 0 || dayActivities.length > 0 || dayEmotions.length > 0 || dayJournals.length > 0 || dayCheckIns.length > 0 || dayBulletins.length > 0 || dayTasks.length > 0 || daySymptomSessions.length > 0 || daySymptomCheckIns.length > 0 || dayLocations.length > 0 || dayStatusNotes.length > 0 || dayImportantDates.length > 0 || daySleeps.length > 0 || dayLineage.length > 0 || dayDiaryCards.length > 0 || dayPolls.length > 0 || dayReminderInstances.length > 0 || dayReflections.length > 0 || dayAlterNotes.length > 0 || dayHasDailyTasks;

          return (
            <div key={dateStr} id={`day-${dateStr}`}>
              <InfiniteTimeline
                day={day}
                sessions={daySessions}
                activities={dayActivities}
                emotions={dayEmotions}
                alters={alters}
                hasData={hasData}
                isToday={isToday(day)}
                journals={dayJournals}
                checkIns={dayCheckIns}
                bulletins={dayBulletins}
                tasks={dayTasks}
                showActivities={showActivities}
                showCheckIns={showCheckIns}
                showEmotions={showEmotions}
                showSymptoms={showSymptoms}
                symptomSessions={daySymptomSessions}
                symptomCheckIns={daySymptomCheckIns}
                symptoms={symptoms}
                categories={categories}
                locations={dayLocations}
                showLocations={showLocations}
                statusNotes={dayStatusNotes}
                importantDates={dayImportantDates}
                sleeps={daySleeps}
                lineageEvents={dayLineage}
                diaryCards={dayDiaryCards}
                polls={dayPolls}
                reminderInstances={dayReminderInstances}
                reflections={dayReflections}
                alterNotes={dayAlterNotes}
                dailyProgress={dayProgress}
                dailyTaskTemplates={dailyTaskTemplates}
                focusSessionId={daySessions.some((s) => s.id === focusSessionId) ? focusSessionId : null}
                focusOpenEditor={focusEdit}
              />
            </div>
          );
        })}
      </div>

      {/* Sentinel for lazy loading */}
      <div ref={sentinelRef} className="h-12 flex items-center justify-center">
        <p className="text-xs text-muted-foreground animate-pulse">Loading more...</p>
      </div>

      {/* Jump to top */}
      {showScrollTop && (
        <button
          onClick={handleScrollTop}
          className="fixed bottom-20 right-4 z-50 w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all"
          title="Back to top"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}