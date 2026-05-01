import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { parseDate } from "@/lib/dateUtils";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfDay, endOfDay, isToday } from "date-fns";
import { Activity, Heart, Users, Calendar, BarChart3, BookOpen, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "react-router-dom";
import InfiniteTimeline from "@/components/timeline/InfiniteTimeline";

const CHUNK_DAYS = 14; // how many days to load per chunk

export default function Timeline() {
  const [searchParams] = useSearchParams();
  const [daysBack, setDaysBack] = useState(CHUNK_DAYS);
  const [showFronting, setShowFronting] = useState(true);
  const [showActivities, setShowActivities] = useState(true);
  const [showCheckIns, setShowCheckIns] = useState(true);
  const [showEmotions, setShowEmotions] = useState(true);
  const [showSymptoms, setShowSymptoms] = useState(true);
  const [jumpDate, setJumpDate] = useState(() => searchParams.get("date") || "");
  const sentinelRef = useRef(null);
  const containerRef = useRef(null);

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

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
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

  const handleJumpToDate = () => {
    if (!jumpDate) return;
    const target = document.getElementById(`day-${jumpDate}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Build array of days from today back daysBack days
  const days = Array.from({ length: daysBack }, (_, i) => subDays(new Date(), i));

  const toggleStyles = (active) =>
    `px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card text-muted-foreground border-border hover:border-primary/50"
    }`;

  return (
    <div data-tour="timeline-container" className="space-y-4 max-w-3xl mx-auto" ref={containerRef}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold">Timeline</h1>
        <div className="flex items-center gap-2 flex-wrap">
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

      {/* Toggles */}
      <div className="flex gap-2 flex-wrap">
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

          const hasData = daySessions.length > 0 || dayActivities.length > 0 || dayEmotions.length > 0 || dayJournals.length > 0 || dayCheckIns.length > 0 || dayBulletins.length > 0 || dayTasks.length > 0 || daySymptomSessions.length > 0 || daySymptomCheckIns.length > 0;

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
                dailyProgress={dailyProgress.find((p) => p.date === format(day, "yyyy-MM-dd"))}
              />
            </div>
          );
        })}
      </div>

      {/* Sentinel for lazy loading */}
      <div ref={sentinelRef} className="h-12 flex items-center justify-center">
        <p className="text-xs text-muted-foreground animate-pulse">Loading more...</p>
      </div>
    </div>
  );
}