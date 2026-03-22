import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, subDays, addDays, eachHourOfInterval } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import HourlyTimeline from "@/components/timeline/HourlyTimeline.jsx";

export default function Timeline() {
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });

  const { data: switches = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list(),
  });

  const { data: emotions = [] } = useQuery({
    queryKey: ["emotions"],
    queryFn: () => base44.entities.EmotionCheckIn.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const dayStart = useMemo(() => startOfDay(selectedDate), [selectedDate]);
  const dayEnd = useMemo(() => endOfDay(selectedDate), [selectedDate]);

  // Filter data to selected day
  const daySessions = useMemo(() =>
    switches.filter((s) => {
      const d = new Date(s.start_time);
      return d >= dayStart && d <= dayEnd;
    }),
    [switches, dayStart, dayEnd]
  );

  const dayActivities = useMemo(() =>
    activities.filter((a) => {
      const d = new Date(a.timestamp);
      return d >= dayStart && d <= dayEnd;
    }),
    [activities, dayStart, dayEnd]
  );

  const dayEmotions = useMemo(() =>
    emotions.filter((e) => {
      const d = new Date(e.timestamp);
      return d >= dayStart && d <= dayEnd;
    }),
    [emotions, dayStart, dayEnd]
  );

  // Find earliest and latest hour with data (or default 0-23)
  const hoursWithData = useMemo(() => {
    const allTimes = [
      ...daySessions.map((s) => new Date(s.start_time)),
      ...dayActivities.map((a) => new Date(a.timestamp)),
      ...dayEmotions.map((e) => new Date(e.timestamp)),
    ];
    if (allTimes.length === 0) return eachHourOfInterval({ start: dayStart, end: dayEnd });
    const minHour = Math.min(...allTimes.map((t) => t.getHours()));
    const maxHour = Math.max(...allTimes.map((t) => t.getHours()));
    // Pad by 1 hour on each side
    const from = new Date(dayStart);
    from.setHours(Math.max(0, minHour - 1));
    const to = new Date(dayStart);
    to.setHours(Math.min(23, maxHour + 1));
    return eachHourOfInterval({ start: from, end: to });
  }, [daySessions, dayActivities, dayEmotions, dayStart]);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Timeline</h1>
        <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>
          Today
        </Button>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center justify-between bg-card rounded-lg border border-border p-4">
        <Button variant="outline" size="sm" onClick={() => setSelectedDate(subDays(selectedDate, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-lg font-semibold">{format(selectedDate, "EEEE, MMMM d, yyyy")}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          disabled={selectedDate.toDateString() === new Date().toDateString()}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {daySessions.length === 0 && dayActivities.length === 0 && dayEmotions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No activity recorded for this date.</p>
        </div>
      ) : (
        <HourlyTimeline
          hours={hoursWithData}
          sessions={daySessions}
          activities={dayActivities}
          emotions={dayEmotions}
          alters={alters}
          dayStart={dayStart}
        />
      )}
    </div>
  );
}