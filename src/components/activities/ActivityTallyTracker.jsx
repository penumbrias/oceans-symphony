import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";

function formatTime(minutes) {
  if (!minutes) return null;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round((hours / 24) * 10) / 10}d`;
}

function TallyNode({ catId, catById, tally, level = 0, allCategories }) {
  const [expanded, setExpanded] = useState(level === 0);
  const cat = catById[catId];
  if (!cat) return null;
  const data = tally[catId] || { count: 0, totalMinutes: 0 };
  const children = allCategories.filter(c => c.parent_category_id === catId).sort((a, b) => (a.order || 0) - (b.order || 0));
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
        style={{ paddingLeft: `${12 + level * 20}px` }}
        onClick={() => hasChildren && setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hasChildren ? (
            expanded
              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <div className="w-3.5 h-3.5 flex-shrink-0" />
          )}
          {cat.color && (
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
          )}
          <span className={`text-sm truncate ${level === 0 ? "font-semibold" : "font-medium text-muted-foreground"}`}>
            {cat.name}
          </span>
        </div>
        <div className="flex items-center gap-3 ml-2 flex-shrink-0">
          {data.count > 0 && <span className="text-xs text-muted-foreground">{data.count}×</span>}
          {formatTime(data.totalMinutes) && (
            <span className="text-xs font-semibold text-foreground">{formatTime(data.totalMinutes)}</span>
          )}
        </div>
      </div>
      {hasChildren && expanded && (
        <div>
          {children.map(child => (
            <TallyNode
              key={child.id}
              catId={child.id}
              catById={catById}
              tally={tally}
              level={level + 1}
              allCategories={allCategories}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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

  const getAncestorIds = (catId) => {
    const ancestors = [];
    let current = catById[catId];
    while (current?.parent_category_id) {
      ancestors.push(current.parent_category_id);
      current = catById[current.parent_category_id];
    }
    return ancestors;
  };

  const tally = useMemo(() => {
    const t = {};
    activities.forEach((activity) => {
      const catIds = activity.activity_category_ids || [];
      const mins = activity.duration_minutes || 0;

      if (catIds.length === 0) return;

      const allIds = new Set(catIds);
      catIds.forEach((id) => getAncestorIds(id).forEach((aid) => allIds.add(aid)));

      allIds.forEach((catId) => {
        if (!catById[catId]) return;
        if (!t[catId]) t[catId] = { count: 0, totalMinutes: 0 };
        t[catId].count++;
        t[catId].totalMinutes += mins;
      });
    });
    return t;
  }, [activities, catById]);

  const rootCategories = useMemo(
    () => categories.filter(c => !c.parent_category_id && tally[c.id]?.count > 0).sort((a, b) => (b.count || 0) - (a.count || 0)),
    [categories, tally]
  );

  if (rootCategories.length === 0) {
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
      <div className="space-y-0.5">
        {rootCategories.map((cat) => (
          <TallyNode
            key={cat.id}
            catId={cat.id}
            catById={catById}
            tally={tally}
            level={0}
            allCategories={categories}
          />
        ))}
      </div>
    </Card>
  );
}