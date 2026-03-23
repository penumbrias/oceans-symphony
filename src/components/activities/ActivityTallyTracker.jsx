import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

export default function ActivityTallyTracker({ activities = [] }) {
  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const catById = useMemo(() => {
    const map = {};
    categories.forEach((c) => { map[c.id] = c; });
    return map;
  }, [categories]);

  // Get all ancestor category IDs for a given category
  const getAncestorIds = (catId) => {
    const ancestors = [];
    let current = catById[catId];
    while (current?.parent_category_id) {
      ancestors.push(current.parent_category_id);
      current = catById[current.parent_category_id];
    }
    return ancestors;
  };

  const tallyData = useMemo(() => {
    const tally = {};

    activities.forEach((activity) => {
      const catIds = activity.activity_category_ids || [];
      const mins = activity.duration_minutes || 0;

      if (catIds.length === 0) {
        // No categories — tally by activity_name
        const name = activity.activity_name || "Unknown";
        if (!tally[name]) tally[name] = { name, count: 0, totalMinutes: 0, color: activity.color, isNameFallback: true };
        tally[name].count++;
        tally[name].totalMinutes += mins;
      } else {
        // Expand each category to include its ancestors, then tally uniquely per activity
        const allIds = new Set(catIds);
        catIds.forEach((id) => getAncestorIds(id).forEach((aid) => allIds.add(aid)));

        allIds.forEach((catId) => {
          const cat = catById[catId];
          if (!cat) return;
          const key = catId;
          if (!tally[key]) tally[key] = { name: cat.name, count: 0, totalMinutes: 0, color: cat.color };
          tally[key].count++;
          tally[key].totalMinutes += mins;
        });
      }
    });

    return Object.values(tally).sort((a, b) => b.count - a.count);
  }, [activities, catById]);

  const formatTime = (minutes) => {
    if (!minutes) return null;
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = minutes / 60;
    if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
    return `${Math.round((hours / 24) * 10) / 10}d`;
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
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              )}
              <span className="text-sm font-medium truncate">{item.name}</span>
            </div>
            <div className="flex items-center gap-4 ml-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{item.count}x</span>
              {formatTime(item.totalMinutes) && (
                <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                  {formatTime(item.totalMinutes)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}