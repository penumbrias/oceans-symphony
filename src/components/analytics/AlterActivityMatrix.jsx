import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { startOfDay, endOfDay } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { countableMinutes, statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { getRootCategories } from "@/lib/categoryTreeUtils";
import { useAuthoredPresence } from "@/hooks/useAuthoredPresence";

export default function AlterActivityMatrix({ activities = [], categories = [], alters = [], from, to }) {
  const terms = useTerms();
  const [expandedParents, setExpandedParents] = useState(new Set());
  const { inferAlters } = useAuthoredPresence();

  const catMap = useMemo(() => {
    const m = {};
    categories.forEach(c => { m[c.id] = c; });
    return m;
  }, [categories]);

  // Build parent→children hierarchy. Use the shared helper so orphans
  // and self-parents surface at the root instead of vanishing.
  const rootCategories = useMemo(
    () => getRootCategories(categories),
    [categories]
  );
  const childrenOf = useMemo(() => {
    const map = {};
    categories.forEach(c => {
      if (c.parent_category_id) {
        if (!map[c.parent_category_id]) map[c.parent_category_id] = [];
        map[c.parent_category_id].push(c);
      }
    });
    return map;
  }, [categories]);

  const toggleParent = (id) => setExpandedParents(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const { alterRows, countsByCatKey } = useMemo(() => {
    const fromMs = startOfDay(from).getTime();
    const toMs = endOfDay(to).getTime();

    const filtered = activities.filter(a => {
      const t = new Date(a.timestamp).getTime();
      if (t < fromMs || t > toMs) return false;
      // Skipped/cancelled never count toward the matrix — they didn't
      // happen. Scheduled drops out too: the matrix is about what
      // actually happened, not what's upcoming.
      const status = statusFor(a);
      return status !== ACTIVITY_STATUSES.SKIPPED
        && status !== ACTIVITY_STATUSES.CANCELLED
        && status !== ACTIVITY_STATUSES.SCHEDULED;
    });

    // alterMap: alterId → { alter, countsByKey: {catName→count}, total, totalDuration }
    const alterMap = {};
    alters.forEach(alter => {
      alterMap[alter.id] = { alter, countsByKey: {}, total: 0, totalDuration: 0 };
    });

    filtered.forEach(act => {
  const ids = act.activity_category_ids || [];
  // Collect all category names including ancestors for rollup
  const allNames = new Set();
  if (ids.length > 0) {
    ids.forEach(id => {
      const cat = catMap[id];
      if (!cat) return;
      allNames.add(cat.name);
      // Walk up the hierarchy to add parent names. Cycle-safe — track
      // visited ids so a malformed parent_category_id chain can't lock
      // the analytics page in an infinite while loop.
      let current = cat;
      const seenIds = new Set([cat.id]);
      while (current.parent_category_id && current.parent_category_id !== current.id) {
        if (seenIds.has(current.parent_category_id)) break;
        const parent = catMap[current.parent_category_id];
        if (!parent) break;
        seenIds.add(parent.id);
        allNames.add(parent.name);
        current = parent;
      }
    });
  } else {
    allNames.add(act.activity_name || "Unknown");
  }
  // Use the activity's recorded fronters; if none, fall back to whoever was
  // present (via what they authored) around the activity's time.
  const explicitFronters = (act.fronting_alter_ids || []).filter(Boolean);
  const fronters = explicitFronters.length
    ? explicitFronters
    : inferAlters(new Date(act.timestamp).getTime());
  fronters.forEach(alterId => {
    if (!alterMap[alterId]) return;
    allNames.forEach(name => {
      alterMap[alterId].countsByKey[name] = (alterMap[alterId].countsByKey[name] || 0) + 1;
    });
    // Only increment total once per activity not once per category
    alterMap[alterId].total += 1;
    alterMap[alterId].totalDuration += countableMinutes(act);
  });
});

    // Aggregate counts by category key across all alters (for column visibility)
    const countsByCatKey = {};
    Object.values(alterMap).forEach(({ countsByKey }) => {
      Object.entries(countsByKey).forEach(([k, v]) => {
        countsByCatKey[k] = (countsByCatKey[k] || 0) + v;
      });
    });

    const alterRows = Object.values(alterMap)
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total);

    return { alterRows, countsByCatKey };
  }, [activities, categories, alters, from, to, catMap, inferAlters]);

  // Build visible columns: root cats + optionally their children if expanded
  const visibleColumns = useMemo(() => {
    const cols = [];
    const addCat = (cat, level) => {
      const hasChildren = (childrenOf[cat.id] || []).length > 0;
      const hasData = countsByCatKey[cat.name] > 0 ||
        (childrenOf[cat.id] || []).some(c => countsByCatKey[c.name] > 0);
      if (!hasData) return;
      cols.push({ cat, level, hasChildren, isParent: level === 0 && hasChildren });
      if (hasChildren && expandedParents.has(cat.id)) {
        (childrenOf[cat.id] || []).sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(child => addCat(child, level + 1));
      }
    };
    rootCategories.forEach(cat => addCat(cat, 0));
    return cols;
  }, [rootCategories, childrenOf, expandedParents, countsByCatKey]);

  if (alterRows.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-2">{terms.Alter} ↔ Activity Association</h3>
        <p className="text-muted-foreground text-sm text-center py-8">
          No activity data with {terms.fronting} {terms.alters} in this range.
        </p>
      </Card>
    );
  }

  const maxCount = Math.max(...alterRows.flatMap(r => Object.values(r.countsByKey).filter(Number)));

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-1">{terms.Alter} ↔ Activity Association</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Click parent column headers to expand sub-activities. Each cell = times {terms.fronting} during that activity.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 font-medium text-muted-foreground sticky left-0 bg-card z-10 min-w-[120px]">
                {terms.Alter}
              </th>
              {visibleColumns.map(({ cat, level, hasChildren, isParent }) => (
                <th key={cat.id} className="p-2 text-center font-medium min-w-[80px]">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      className="flex flex-col items-center gap-1 w-full"
                      onClick={() => hasChildren && toggleParent(cat.id)}
                      title={hasChildren ? (expandedParents.has(cat.id) ? "Collapse" : "Expand sub-activities") : undefined}
                    >
                      <div className="flex items-center gap-0.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || "#8b5cf6" }} />
                        {hasChildren && (
                          expandedParents.has(cat.id)
                            ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                            : <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                      <span
                        className={`text-muted-foreground leading-tight ${level > 0 ? "opacity-70" : ""}`}
                        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", maxHeight: 80, overflow: "hidden", paddingLeft: level * 4 }}
                      >
                        {cat.name}
                      </span>
                    </button>
                  </div>
                </th>
              ))}
              <th className="p-2 text-center font-medium text-muted-foreground min-w-[60px]">Total</th>
              <th className="p-2 text-center font-medium text-muted-foreground min-w-[60px]">Hours</th>
            </tr>
            {/* Hierarchy connector line row */}
            <tr>
              <th className="p-0" />
              {(() => {
                const cells = [];
                let i = 0;
                while (i < visibleColumns.length) {
                  const { cat, hasChildren } = visibleColumns[i];
                  if (hasChildren && expandedParents.has(cat.id)) {
                    const childCount = (childrenOf[cat.id] || []).filter(c => countsByCatKey[c.name] > 0).length;
                    const span = 1 + childCount;
                    cells.push(
                      <th key={`hline-${cat.id}`} colSpan={span} className="p-0" style={{ height: 8 }}>
                        <div style={{ height: 2, backgroundColor: cat.color || '#8b5cf6', margin: '0 6px', borderRadius: 1, opacity: 0.7 }} />
                      </th>
                    );
                    i += span;
                  } else {
                    cells.push(<th key={`hempty-${i}`} className="p-0" style={{ height: 8 }} />);
                    i++;
                  }
                }
                return cells;
              })()}
              <th className="p-0" /><th className="p-0" />
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
                {visibleColumns.map(({ cat }) => {
                  const count = row.countsByKey[cat.name] || 0;
                  const intensity = maxCount > 0 ? count / maxCount : 0;
                  return (
                    <td key={cat.id} className="p-1 text-center">
                      {count > 0 ? (
                        <div
                          className="mx-auto w-8 h-8 rounded-md flex items-center justify-center font-semibold text-white text-xs"
                          style={{ backgroundColor: cat.color || "#8b5cf6", opacity: 0.3 + intensity * 0.7 }}
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