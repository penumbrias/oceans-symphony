import React, { useState, useEffect, useRef } from "react";
import { parseDate } from "@/lib/dateUtils";
import { format, subDays, startOfDay, isToday } from "date-fns";
import { Activity, Heart, Users, Calendar, BookOpen, Zap, MapPin, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "react-router-dom";
import InfiniteTimeline from "@/components/timeline/InfiniteTimeline";
import { useTimelineSources, sliceTimelineDay } from "@/lib/timelineData";

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

  // One shared data layer with the timeline widgets (src/lib/timelineData.js)
  // so the page and the board can't drift apart.
  const src = useTimelineSources();
  const {
    sessions, alters, symptoms, categories, dailyTaskTemplates,
  } = src;

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
          const d = sliceTimelineDay(src, day, { showActivities, showFronting, showLocations });
          return (
            <div key={d.dateStr} id={`day-${d.dateStr}`}>
              <InfiniteTimeline
                day={day}
                sessions={d.sessions}
                activities={d.activities}
                emotions={d.emotions}
                alters={alters}
                hasData={d.hasData}
                isToday={isToday(day)}
                journals={d.journals}
                checkIns={d.checkIns}
                bulletins={d.bulletins}
                tasks={d.tasks}
                showActivities={showActivities}
                showCheckIns={showCheckIns}
                showEmotions={showEmotions}
                showSymptoms={showSymptoms}
                symptomSessions={d.symptomSessions}
                symptomCheckIns={d.symptomCheckIns}
                symptoms={symptoms}
                categories={categories}
                locations={d.locations}
                showLocations={showLocations}
                statusNotes={d.statusNotes}
                importantDates={d.importantDates}
                sleeps={d.sleeps}
                lineageEvents={d.lineageEvents}
                diaryCards={d.diaryCards}
                polls={d.polls}
                reminderInstances={d.reminderInstances}
                reflections={d.reflections}
                alterNotes={d.alterNotes}
                dailyProgress={d.dailyProgress}
                dailyTaskTemplates={dailyTaskTemplates}
                focusSessionId={d.sessions.some((x) => x.id === focusSessionId) ? focusSessionId : null}
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