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

  // Build timeline items with duration info for each switch
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

    // Add switches with duration info
    const processedTimes = new Set();
    const sortedSwitches = [...switches].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    
    sortedSwitches.forEach((switchRecord) => {
      const switchDate = new Date(switchRecord.start_time);
      if (switchDate >= dayStart && switchDate <= dayEnd) {
        const timeKey = switchRecord.start_time;
        
        // Calculate when this specific alter stops fronting
        let endTime = null;
        for (let i = 0; i < sortedSwitches.length; i++) {
          if (sortedSwitches[i].primary_alter_id === switchRecord.primary_alter_id && sortedSwitches[i].start_time === switchRecord.start_time) {
            // Find when this alter next switches out
            for (let j = i + 1; j < sortedSwitches.length; j++) {
              if (sortedSwitches[j].primary_alter_id !== switchRecord.primary_alter_id) {
                endTime = new Date(sortedSwitches[j].start_time);
                break;
              }
            }
            break;
          }
        }
        
        if (!processedTimes.has(timeKey)) {
          // Get all alters starting at this exact time
          const groupedAlters = sortedSwitches
            .filter((s) => s.start_time === timeKey && new Date(s.start_time) >= dayStart && new Date(s.start_time) <= dayEnd)
            .map((s) => {
              // Find end time for this specific alter
              let alterEndTime = null;
              for (let i = 0; i < sortedSwitches.length; i++) {
                if (sortedSwitches[i].primary_alter_id === s.primary_alter_id && sortedSwitches[i].start_time === s.start_time) {
                  for (let j = i + 1; j < sortedSwitches.length; j++) {
                    if (sortedSwitches[j].primary_alter_id !== s.primary_alter_id) {
                      alterEndTime = sortedSwitches[j].start_time;
                      break;
                    }
                  }
                  break;
                }
              }
              return {
                ...s,
                endTime: alterEndTime,
              };
            });

          items.push({
            type: "switch",
            timestamp: switchRecord.start_time,
            data: groupedAlters,
          });
          processedTimes.add(timeKey);
        }
      }
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
              {timelineItems.filter((i) => i.type === "switch").length}
            </p>
            <p className="text-xs text-muted-foreground">Switches</p>
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