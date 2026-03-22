import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, subDays, addDays } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import TimelineItem from "@/components/timeline/TimelineItem";

export default function Timeline() {
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Fetch all data
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

  // Build timeline items, grouping concurrent fronting sessions into one row
  const timelineItems = useMemo(() => {
    const dayStart = startOfDay(selectedDate);
    const dayEnd = endOfDay(selectedDate);

    const items = [];

    // Add activities
    activities.forEach((activity) => {
      const actDate = new Date(activity.timestamp);
      if (actDate >= dayStart && actDate <= dayEnd) {
        items.push({
          type: "activity",
          timestamp: activity.timestamp,
          data: activity,
        });
      }
    });

    // Group fronting sessions that overlap in time into a single row.
    // Each session contributes its alter(s) with their own start/end times.
    const daySessions = switches.filter((s) => {
      const d = new Date(s.start_time);
      return d >= dayStart && d <= dayEnd;
    });

    // Sort sessions by start time
    const sorted = [...daySessions].sort(
      (a, b) => new Date(a.start_time) - new Date(b.start_time)
    );

    // Group sessions whose start times are within 60 seconds of each other
    // (treat them as the same "switch event")
    const groups = [];
    sorted.forEach((session) => {
      const sessionStart = new Date(session.start_time).getTime();
      const lastGroup = groups[groups.length - 1];
      const lastStart = lastGroup
        ? new Date(lastGroup[0].start_time).getTime()
        : null;

      if (lastGroup && Math.abs(sessionStart - lastStart) <= 60000) {
        lastGroup.push(session);
      } else {
        groups.push([session]);
      }
    });

    // Each group becomes one timeline item with all alters side-by-side
    groups.forEach((group) => {
      const representativeStart = group[0].start_time;
      // Collect per-alter entries so we can render individual lines per alter
      const fronters = group.flatMap((session) => {
        const ids = [
          session.primary_alter_id,
          ...(session.co_fronter_ids || []),
        ].filter(Boolean);
        return ids.map((alterId) => ({
          alterId,
          startTime: session.start_time,
          endTime: session.end_time || null,
          isActive: session.is_active,
        }));
      });

      // Deduplicate by alterId (keep first occurrence)
      const seen = new Set();
      const uniqueFronters = fronters.filter(({ alterId }) => {
        if (seen.has(alterId)) return false;
        seen.add(alterId);
        return true;
      });

      const notes = group.map((s) => s.note).filter(Boolean).join(" | ");

      items.push({
        type: "switch",
        timestamp: representativeStart,
        data: {
          fronters: uniqueFronters,
          note: notes || null,
        },
      });
    });

    // Add emotion check-ins
    emotions.forEach((emotion) => {
      const emotionDate = new Date(emotion.timestamp);
      if (emotionDate >= dayStart && emotionDate <= dayEnd) {
        items.push({
          type: "emotion",
          timestamp: emotion.timestamp,
          data: emotion,
        });
      }
    });

    // Sort by timestamp ascending
    return items.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [activities, switches, emotions, selectedDate]);

  const handlePrevDay = () => {
    setSelectedDate(subDays(selectedDate, 1));
  };

  const handleNextDay = () => {
    setSelectedDate(addDays(selectedDate, 1));
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Timeline</h1>
        <Button variant="outline" size="sm" onClick={handleToday}>
          Today
        </Button>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center justify-between bg-card rounded-lg border border-border p-4">
        <Button variant="outline" size="sm" onClick={handlePrevDay}>
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-lg font-semibold">{format(selectedDate, "EEEE, MMMM d, yyyy")}</span>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleNextDay}
          disabled={selectedDate.toDateString() === new Date().toDateString()}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        {timelineItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No activity, switches, or check-ins recorded for this date.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* Timeline items */}
            {timelineItems.map((item, idx) => (
              <div key={`${item.type}-${item.timestamp}-${idx}`}>
                <TimelineItem item={item} alters={alters} allItems={timelineItems} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {timelineItems.length > 0 && (
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border">
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">
              {timelineItems.filter((i) => i.type === "activity").length}
            </p>
            <p className="text-xs text-muted-foreground">Activities</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">
              {timelineItems.filter((i) => i.type === "switch").reduce((sum, i) => sum + i.data.fronters.length, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Fronters</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">
              {timelineItems.filter((i) => i.type === "emotion").length}
            </p>
            <p className="text-xs text-muted-foreground">Check-Ins</p>
          </div>
        </div>
      )}
    </div>
  );
}