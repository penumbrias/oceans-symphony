import React, { useState } from "react";
import { format } from "date-fns";
import { Plus } from "lucide-react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function ActivityWeeklyGrid({
  weekDays,
  activities,
  frontingHistory = [],
  onDayClick,
  onTimeRangeSelect,
}) {
  const [startSelection, setStartSelection] = useState(null);
  const getActivitiesForDay = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return activities.filter(
      (a) => format(new Date(a.timestamp), "yyyy-MM-dd") === dateStr
    );
  };

  const getDayStats = (date) => {
    const dayActivities = getActivitiesForDay(date);
    const totalDuration = dayActivities.reduce(
      (sum, a) => sum + (a.duration_minutes || 0),
      0
    );
    return {
      count: dayActivities.length,
      duration: totalDuration,
    };
  };

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-0 border border-border rounded-lg overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[80px_repeat(7,120px)] gap-0 bg-card border-b border-border">
          <div className="bg-muted/50 p-2"></div>
          {weekDays.map((date) => {
            const stats = getDayStats(date);
            return (
              <button
                key={format(date, "yyyy-MM-dd")}
                onClick={() => onDayClick(date)}
                className="p-3 text-center border-r border-border hover:bg-muted/50 transition-colors cursor-pointer group"
              >
                <div className="text-xs font-semibold text-muted-foreground">
                  {format(date, "EEE")}
                </div>
                <div className="text-lg font-bold text-foreground">
                  {format(date, "d")}
                </div>
                {stats.count > 0 && (
                  <div className="text-xs text-primary mt-1">
                    {stats.count} {stats.duration > 0 && `• ${Math.round(stats.duration / 60)}h`}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  + Quick add
                </div>
              </button>
            );
          })}
        </div>

        {/* Time blocks grid */}
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="grid grid-cols-[80px_repeat(7,120px)] gap-0 border-b border-border/50"
          >
            {/* Hour label */}
            <div className="bg-muted/30 px-2 py-3 text-xs font-medium text-muted-foreground text-right">
              {String(hour).padStart(2, "0")}:00
            </div>

            {/* Day cells */}
            {weekDays.map((date) => (
              <button
                key={`${format(date, "yyyy-MM-dd")}-${hour}`}
                onClick={() => onTimeBlockClick(date, hour)}
                className="min-h-16 border-r border-border/50 p-1 hover:bg-primary/10 transition-colors flex items-center justify-center text-muted-foreground hover:text-primary"
              >
                <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}