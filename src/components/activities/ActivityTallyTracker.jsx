import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  indexById,
  getAncestorIds,
  getChildren,
  MAX_RENDER_DEPTH,
} from "@/lib/categoryTreeUtils";
import { countableMinutes, statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";

function formatTime(minutes) {
  if (!minutes) return null;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round((hours / 24) * 10) / 10}d`;
}

function TallyNode({ catId, catById, tally, level = 0, allCategories, seen }) {
  const [expanded, setExpanded] = useState(level === 0);
  const cat = catById[catId];
  if (!cat) return null;
  // Cycle guard: if this id already appears higher in the render stack
  // we've hit a cycle in parent_category_id — refuse to recurse so we
  // don't blow the render stack.
  if (seen && seen.has(catId)) return null;
  const data = tally[catId] || { count: 0, totalMinutes: 0 };
  const children = getChildren(catId, allCategories);
  // Depth clamp — anything beyond MAX_RENDER_DEPTH gets rendered flat
  // under the deepest allowed row so we never crash on accidental
  // 30-level nesting, but no data is hidden from the user.
  const atDepthLimit = level >= MAX_RENDER_DEPTH;
  const hasChildren = children.length > 0;
  const nextSeen = seen ? new Set(seen) : new Set();
  nextSeen.add(catId);

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
      {hasChildren && expanded && !atDepthLimit && (
        <div>
          {children.map(child => (
            <TallyNode
              key={child.id}
              catId={child.id}
              catById={catById}
              tally={tally}
              level={level + 1}
              allCategories={allCategories}
              seen={nextSeen}
            />
          ))}
        </div>
      )}
      {hasChildren && expanded && atDepthLimit && (
        <div
          className="text-[11px] italic text-muted-foreground"
          style={{ paddingLeft: `${12 + (level + 1) * 20}px` }}
        >
          (deeper sub-activities hidden — open Customize Activities to flatten the nesting)
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

  const catById = useMemo(() => indexById(categories), [categories]);

  const tally = useMemo(() => {
    const t = {};
    activities.forEach((activity) => {
      const catIds = activity.activity_category_ids || [];
      // Status-aware: scheduled/skipped/cancelled contribute zero
      // minutes; partial uses the user's actual_duration_minutes when
      // recorded, otherwise a half-of-planned fallback. The COUNT still
      // increments for everything except skipped/cancelled so the tally
      // surface stays informative ("you did this twice this week, half-
      // completed once") rather than dropping resolved-partial plans
      // entirely.
      const status = statusFor(activity);
      if (status === ACTIVITY_STATUSES.SKIPPED || status === ACTIVITY_STATUSES.CANCELLED) return;
      const mins = countableMinutes(activity);

      if (catIds.length === 0) return;

      const allIds = new Set(catIds);
      // Cycle-safe ancestor walk — bad parent_category_id data (cycle,
      // self-parent, orphan) used to lock the tab in an infinite while
      // loop here. getAncestorIds tracks visited ids and bails on revisit.
      catIds.forEach((id) => getAncestorIds(id, catById).forEach((aid) => allIds.add(aid)));

      allIds.forEach((catId) => {
        if (!catById[catId]) return;
        if (!t[catId]) t[catId] = { count: 0, totalMinutes: 0 };
        // Scheduled plans don't count toward "actual" minutes but still
        // increment the count so the user sees them in the panel as
        // upcoming work.
        if (status !== ACTIVITY_STATUSES.SCHEDULED) t[catId].count++;
        t[catId].totalMinutes += mins;
      });
    });
    return t;
  }, [activities, catById]);

  const rootCategories = useMemo(
    () => categories
      // Treat orphans (parent_category_id points at a deleted record) as
      // roots so they still render — otherwise their counts would silently
      // vanish from the tally if a parent was deleted.
      .filter(c => (!c.parent_category_id || !catById[c.parent_category_id]) && tally[c.id]?.count > 0)
      // Counts live in the tally map, not on the category record — sort by those
      // so the list is actually ordered by frequency (was a no-op: c.count is undefined).
      .sort((a, b) => (tally[b.id]?.count || 0) - (tally[a.id]?.count || 0)),
    [categories, catById, tally]
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