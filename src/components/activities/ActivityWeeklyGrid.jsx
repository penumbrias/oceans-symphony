import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { format, startOfDay } from "date-fns";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function ActivityWeeklyGrid({
  weekDays,
  activities,
  alters,
  onDayClick,
}) {
  const getActivitiesForDay = (date) => {
    return activities.filter(
      (a) =>
        format(new Date(a.timestamp), "yyyy-MM-dd") ===
        format(date, "yyyy-MM-dd")
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
      <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-1 min-w-max">
        {/* Header row - time labels and day headers */}
        <div className="sticky left-0 bg-background z-10"></div>
        {weekDays.map((date) => {
          const stats = getDayStats(date);
          return (
            <div
              key={format(date, "yyyy-MM-dd")}
              className="sticky top-0 bg-background z-10 border-b border-border p-2 text-center"
            >
              <div className="text-xs font-semibold text-muted-foreground">
                {format(date, "EEE")}
              </div>
              <div className="text-sm font-bold text-foreground">
                {format(date, "d")}
              </div>
              {stats.count > 0 && (
                <div className="text-xs text-primary mt-1">
                  {stats.count} {stats.duration > 0 && `• ${Math.round(stats.duration / 60)}h`}
                </div>
              )}
            </div>
          );
        })}

        {/* Time blocks */}
        {HOURS.map((hour) => (
          <React.Fragment key={hour}>
            {/* Hour label */}
            <div className="sticky left-0 bg-background/50 z-10 text-xs font-medium text-muted-foreground text-right pr-2 py-2 border-b border-border/50">
              {String(hour).padStart(2, "0")}:00
            </div>

            {/* Day columns */}
            {weekDays.map((date) => (
              <div
                key={`${format(date, "yyyy-MM-dd")}-${hour}`}
                className="border border-border/30 min-h-12 p-1 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => onDayClick(date)}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}