import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfDay, endOfDay, isToday } from "date-fns";
import { Activity, Heart, Users, Calendar, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import InfiniteTimeline from "@/components/timeline/InfiniteTimeline";

const CHUNK_DAYS = 14; // how many days to load per chunk

export default function Timeline() {
  const [daysBack, setDaysBack] = useState(CHUNK_DAYS);
  const [showFronting, setShowFronting] = useState(true);
  const [showActivities, setShowActivities] = useState(true);
  const [showEmotions, setShowEmotions] = useState(true);
  const [jumpDate, setJumpDate] = useState("");
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

  const [showJournals, setShowJournals] = useState(true);

  const toggleStyles = (active) =>
    `px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card text-muted-foreground border-border hover:border-primary/50"
    }`;

  return (
    <div className="space-y-4 max-w-3xl mx-auto" ref={containerRef}>
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
        <button className={toggleStyles(showFronting)} onClick={() => setShowFronting(!showFronting)}>
          <span className="flex items-center gap-1.5"><Users className="w-3 h-3" /> Fronting</span>
        </button>
        <button className={toggleStyles(showActivities)} onClick={() => setShowActivities(!showActivities)}>
          <span className="flex items-center gap-1.5"><Activity className="w-3 h-3" /> Activities</span>
        </button>
        <button className={toggleStyles(showEmotions)} onClick={() => setShowEmotions(!showEmotions)}>
          <span className="flex items-center gap-1.5"><Heart className="w-3 h-3" /> Emotions</span>
        </button>
        <button className={toggleStyles(showJournals)} onClick={() => setShowJournals(!showJournals)}>
          <span className="flex items-center gap-1.5"><BookOpen className="w-3 h-3" /> Journals</span>
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
                const start = new Date(s.start_time);
                const end = s.end_time ? new Date(s.end_time) : new Date();
                return start <= dayEnd && end >= dayStart;
              })
            : [];

          const dayActivities = showActivities
            ? activities.filter((a) => {
                const t = new Date(a.timestamp);
                return t >= dayStart && t <= dayEnd;
              })
            : [];

          const dayEmotions = showEmotions
            ? emotions.filter((e) => {
                const t = new Date(e.timestamp);
                return t >= dayStart && t <= dayEnd;
              })
            : [];

          const dayJournals = showJournals
            ? journals.filter((j) => {
                const t = new Date(j.created_date);
                return t >= dayStart && t <= dayEnd;
              })
            : [];

          const dayCheckIns = showJournals
            ? checkIns.filter((c) => {
                const t = new Date(c.created_date);
                return t >= dayStart && t <= dayEnd;
              })
            : [];

          const hasData = daySessions.length > 0 || dayActivities.length > 0 || dayEmotions.length > 0 || dayJournals.length > 0 || dayCheckIns.length > 0;

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
                showActivities={showActivities}
                showEmotions={showEmotions}
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