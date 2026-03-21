import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

export default function ActivityTallyTracker({ activities = [] }) {
  const tallyData = useMemo(() => {
    const grouped = {};

    activities.forEach((activity) => {
      const name = activity.activity_name || "Unknown";
      if (!grouped[name]) {
        grouped[name] = {
          name,
          count: 0,
          totalMinutes: 0,
          color: activity.color,
        };
      }
      grouped[name].count += 1;
      grouped[name].totalMinutes += activity.duration_minutes || 0;
    });

    return Object.values(grouped)
      .sort((a, b) => b.count - a.count);
  }, [activities]);

  const formatTime = (minutes) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = minutes / 60;
    if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
    const days = hours / 24;
    return `${Math.round(days * 10) / 10}d`;
  };

  if (tallyData.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Activity Tally</h3>
        <p className="text-muted-foreground text-sm">No activities recorded yet</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Activity Tally</h3>
      <div className="space-y-2">
        {tallyData.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {item.color && (
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
              )}
              <span className="text-sm font-medium truncate">{item.name}</span>
            </div>
            <div className="flex items-center gap-4 ml-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {item.count}x
              </span>
              <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                {formatTime(item.totalMinutes)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}