import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { startOfDay, endOfDay } from "date-fns";

export default function AlterActivityMatrix({ activities = [], categories = [], alters = [], from, to }) {
  const [sortBy, setSortBy] = useState("total"); // "total" | activity id

  const { matrix, activityLabels, alterRows } = useMemo(() => {
    const fromMs = startOfDay(from).getTime();
    const toMs = endOfDay(to).getTime();
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    const filtered = activities.filter(a => {
      const t = new Date(a.timestamp).getTime();
      return t >= fromMs && t <= toMs;
    });

    // Each category on an activity is counted independently
    const activitySet = new Map();
    filtered.forEach(act => {
      const ids = act.activity_category_ids || [];
      if (ids.length === 0) {
        const label = act.activity_name || "Unknown";
        if (!activitySet.has(label)) activitySet.set(label, { label, color: "#8b5cf6", key: label });
      } else {
        ids.forEach(id => {
          const cat = catMap[id];
          if (!cat) return;
          if (!activitySet.has(cat.name)) activitySet.set(cat.name, { label: cat.name, color: cat.color || "#8b5cf6", key: cat.name });
        });
      }
    });

    const activityLabels = Array.from(activitySet.values());

    const alterMap = {};
    alters.forEach(alter => {
      alterMap[alter.id] = { alter, counts: {}, total: 0, totalDuration: 0 };
      activityLabels.forEach(a => { alterMap[alter.id].counts[a.key] = 0; });
    });

    filtered.forEach(act => {
      const ids = act.activity_category_ids || [];
      const labels = ids.length > 0
        ? ids.map(id => catMap[id]?.name).filter(Boolean)
        : [act.activity_name || "Unknown"];
      const fronters = act.fronting_alter_ids || [];
      fronters.forEach(alterId => {
        if (!alterMap[alterId]) return;
        labels.forEach(label => {
          alterMap[alterId].counts[label] = (alterMap[alterId].counts[label] || 0) + 1;
          alterMap[alterId].total += 1;
        });
        alterMap[alterId].totalDuration += act.duration_minutes || 0;
      });
    });

    const alterRows = Object.values(alterMap)
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total);

    return { matrix: alterMap, activityLabels, alterRows };
  }, [activities, categories, alters, from, to]);

  if (alterRows.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-2">Alter ↔ Activity Association</h3>
        <p className="text-muted-foreground text-sm text-center py-8">
          No activity data with fronting alters in this range.
        </p>
      </Card>
    );
  }

  const maxCount = Math.max(...alterRows.flatMap(r => Object.values(r.counts)));

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-1">Alter ↔ Activity Association</h3>
      <p className="text-xs text-muted-foreground mb-4">How many times each alter was fronting during each activity</p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 font-medium text-muted-foreground sticky left-0 bg-card z-10 min-w-[120px]">
                Alter
              </th>
              {activityLabels.map(a => (
                <th key={a.key} className="p-2 text-center font-medium min-w-[80px]">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
                    <span className="text-muted-foreground leading-tight" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", maxHeight: 80, overflow: "hidden" }}>
                      {a.label}
                    </span>
                  </div>
                </th>
              ))}
              <th className="p-2 text-center font-medium text-muted-foreground min-w-[60px]">Total</th>
              <th className="p-2 text-center font-medium text-muted-foreground min-w-[60px]">Hours</th>
            </tr>
          </thead>
          <tbody>
            {alterRows.map(row => (
              <tr key={row.alter.id} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                <td className="p-2 sticky left-0 bg-card z-10">
                  <div className="flex items-center gap-2">
                    {row.alter.avatar_url ? (
                      <img src={row.alter.avatar_url} alt={row.alter.name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: row.alter.color || "#8b5cf6" }}>
                        {row.alter.name?.charAt(0)}
                      </div>
                    )}
                    <span className="font-medium truncate max-w-[80px]">{row.alter.alias || row.alter.name}</span>
                  </div>
                </td>
                {activityLabels.map(a => {
                  const count = row.counts[a.key] || 0;
                  const intensity = maxCount > 0 ? count / maxCount : 0;
                  return (
                    <td key={a.key} className="p-1 text-center">
                      {count > 0 ? (
                        <div
                          className="mx-auto w-8 h-8 rounded-md flex items-center justify-center font-semibold text-white text-xs"
                          style={{ backgroundColor: a.color, opacity: 0.3 + intensity * 0.7 }}
                        >
                          {count}
                        </div>
                      ) : (
                        <div className="mx-auto w-8 h-8 rounded-md bg-muted/30" />
                      )}
                    </td>
                  );
                })}
                <td className="p-2 text-center font-semibold">{row.total}</td>
                <td className="p-2 text-center text-muted-foreground">
                  {row.totalDuration > 0 ? (row.totalDuration / 60).toFixed(1) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}