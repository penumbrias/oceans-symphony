import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { startOfDay, endOfDay, differenceInMinutes, getHours } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────

function expandActivitiesPerCategory(activities, catMap) {
  // Returns flat list of { activity, cat } – one entry per category on the activity
  const rows = [];
  activities.forEach(act => {
    const ids = act.activity_category_ids || [];
    if (ids.length === 0) {
      rows.push({ activity: act, cat: { id: null, name: act.activity_name || "Unknown", color: "#8b5cf6", parent_category_id: null } });
    } else {
      ids.forEach(id => {
        const cat = catMap[id];
        if (cat) rows.push({ activity: act, cat });
      });
    }
  });
  return rows;
}

function buildCategoryTree(categories) {
  const roots = categories.filter(c => !c.parent_category_id);
  const children = {};
  categories.forEach(c => {
    if (c.parent_category_id) {
      if (!children[c.parent_category_id]) children[c.parent_category_id] = [];
      children[c.parent_category_id].push(c);
    }
  });
  return { roots, children };
}

// ─── AlterChip ────────────────────────────────────────────────────────────────

function AlterChip({ alter, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      {alter.avatar_url ? (
        <img src={alter.avatar_url} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
          style={{ backgroundColor: alter.color || "#8b5cf6" }}>
          {alter.name?.charAt(0)}
        </div>
      )}
      <span className="font-medium truncate max-w-[80px]">{alter.alias || alter.name}</span>
      <span className="text-muted-foreground ml-auto">{count}× ({pct}%)</span>
    </div>
  );
}

// ─── CategoryRow ──────────────────────────────────────────────────────────────

function CategoryRow({ cat, children: childCats = [], rows, altersById, totalActivities, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth === 0);

  const myRows = rows.filter(r => r.cat.id === cat.id);
  const count = myRows.length;
  const duration = myRows.reduce((s, r) => s + (r.activity.duration_minutes || 0), 0);

  const alterCounts = {};
  myRows.forEach(r => {
    (r.activity.fronting_alter_ids || []).forEach(id => {
      alterCounts[id] = (alterCounts[id] || 0) + 1;
    });
  });
  const topAlters = Object.entries(alterCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, cnt]) => ({ alter: altersById[id], count: cnt }))
    .filter(x => x.alter);

  if (count === 0 && childCats.length === 0) return null;

  return (
    <div className={`${depth > 0 ? "ml-4 border-l border-border/50 pl-3" : ""}`}>
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer hover:bg-muted/40 transition-colors ${depth === 0 ? "bg-muted/20" : ""}`}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || "#8b5cf6" }} />
        <span className={`font-medium flex-1 text-sm ${depth === 0 ? "" : "text-muted-foreground"}`}>{cat.name}</span>
        {count > 0 && <span className="text-xs text-muted-foreground">{count}×{duration > 0 ? ` · ${(duration / 60).toFixed(1)}h` : ""}</span>}
        {childCats.length > 0 && (
          expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
      </div>

      {expanded && (
        <div className="mt-1 mb-2">
          {count > 0 && topAlters.length > 0 && (
            <div className="px-3 py-2 space-y-1">
              {topAlters.map(({ alter, count: c }) => (
                <AlterChip key={alter.id} alter={alter} count={c} total={count} />
              ))}
            </div>
          )}
          {childCats.map(child => (
            <CategoryRow
              key={child.id}
              cat={child}
              children={[]}
              rows={rows}
              altersById={altersById}
              totalActivities={totalActivities}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EmotionCorrelation ───────────────────────────────────────────────────────

function EmotionCorrelation({ activities, categories, emotionCheckIns, from, to }) {
  const { data } = useMemo(() => {
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });
    const fromMs = startOfDay(from).getTime();
    const toMs = endOfDay(to).getTime();

    const filteredActs = activities.filter(a => {
      const t = new Date(a.timestamp).getTime();
      return t >= fromMs && t <= toMs;
    });
    const filteredEmotions = emotionCheckIns.filter(e => {
      const t = new Date(e.timestamp).getTime();
      return t >= fromMs && t <= toMs;
    });

    // For each category, find emotions that occurred within 2 hours of an activity
    const catEmotions = {}; // catId -> { emotionLabel -> count }
    filteredActs.forEach(act => {
      const actTime = new Date(act.timestamp).getTime();
      const window = 2 * 60 * 60 * 1000; // 2 hours

      const nearbyEmotions = filteredEmotions.filter(e => {
        const et = new Date(e.timestamp).getTime();
        return Math.abs(et - actTime) <= window;
      });

      const catIds = act.activity_category_ids || [];
      catIds.forEach(catId => {
        if (!catEmotions[catId]) catEmotions[catId] = {};
        nearbyEmotions.forEach(e => {
          (e.emotions || []).forEach(em => {
            catEmotions[catId][em] = (catEmotions[catId][em] || 0) + 1;
          });
        });
      });
    });

    // Build display data: top 8 categories by activity count, each with top 5 emotions
    const catCounts = {};
    filteredActs.forEach(act => {
      (act.activity_category_ids || []).forEach(id => {
        catCounts[id] = (catCounts[id] || 0) + 1;
      });
    });

    const data = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([catId, count]) => {
        const cat = catMap[catId];
        if (!cat) return null;
        const emotions = Object.entries(catEmotions[catId] || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        return { cat, count, emotions };
      })
      .filter(Boolean);

    return { data };
  }, [activities, categories, emotionCheckIns, from, to]);

  if (data.length === 0) return null;

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-1">Emotion Correlation by Activity</h3>
      <p className="text-xs text-muted-foreground mb-4">Emotions logged within 2 hours of each activity type</p>
      <div className="space-y-4">
        {data.map(({ cat, count, emotions }) => (
          <div key={cat.id}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color || "#8b5cf6" }} />
              <span className="text-sm font-medium">{cat.name}</span>
              <span className="text-xs text-muted-foreground">({count} activities)</span>
            </div>
            {emotions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pl-4">
                {emotions.map(([emotion, cnt]) => (
                  <span key={emotion} className="px-2 py-0.5 bg-muted/60 rounded-full text-xs">
                    {emotion} <span className="text-muted-foreground">×{cnt}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground pl-4">No nearby emotions logged</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── AlterPresenceOverview ────────────────────────────────────────────────────

function AlterPresenceOverview({ activities, categories, checkIns, alters, from, to }) {
  const { rows } = useMemo(() => {
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });
    const fromMs = startOfDay(from).getTime();
    const toMs = endOfDay(to).getTime();

    const filteredActs = activities.filter(a => {
      const t = new Date(a.timestamp).getTime();
      return t >= fromMs && t <= toMs;
    });
    const filteredCheckIns = checkIns.filter(c => {
      const t = new Date(c.created_date).getTime();
      return t >= fromMs && t <= toMs;
    });

    const rows = alters.map(alter => {
      const myActs = filteredActs.filter(a => (a.fronting_alter_ids || []).includes(alter.id));
      const totalDuration = myActs.reduce((s, a) => s + (a.duration_minutes || 0), 0);

      // Top 3 categories
      const catCounts = {};
      myActs.forEach(act => {
        (act.activity_category_ids || []).forEach(id => {
          const cat = catMap[id];
          if (cat) catCounts[cat.name] = (catCounts[cat.name] || 0) + 1;
        });
      });
      const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

      // Check-in presence
      const checkInCount = filteredCheckIns.filter(c =>
        (c.step2_notice?.alters_present || []).includes(alter.id)
      ).length;

      return { alter, actCount: myActs.length, totalDuration, topCats, checkInCount };
    }).filter(r => r.actCount > 0 || r.checkInCount > 0)
      .sort((a, b) => b.actCount - a.actCount);

    return { rows };
  }, [activities, categories, checkIns, alters, from, to]);

  if (rows.length === 0) return null;

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-1">Alter Presence Summary</h3>
      <p className="text-xs text-muted-foreground mb-4">Activities and system check-in presence per alter</p>
      <div className="space-y-3">
        {rows.map(({ alter, actCount, totalDuration, topCats, checkInCount }) => (
          <div key={alter.id} className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg">
            {alter.avatar_url ? (
              <img src={alter.avatar_url} className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5" />
            ) : (
              <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold mt-0.5"
                style={{ backgroundColor: alter.color || "#8b5cf6" }}>
                {alter.name?.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-semibold text-sm">{alter.alias || alter.name}</span>
                <span className="text-xs text-muted-foreground">
                  {actCount} {actCount === 1 ? "activity" : "activities"}
                  {totalDuration > 0 && ` · ${(totalDuration / 60).toFixed(1)}h`}
                  {checkInCount > 0 && ` · ${checkInCount} check-in${checkInCount !== 1 ? "s" : ""}`}
                </span>
              </div>
              {topCats.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {topCats.map(([name, cnt]) => (
                    <span key={name} className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs">
                      {name} ×{cnt}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function AlterActivityDeepDive({ activities = [], categories = [], alters = [], emotionCheckIns = [], checkIns = [], from, to }) {
  const catMap = useMemo(() => {
    const m = {};
    categories.forEach(c => { m[c.id] = c; });
    return m;
  }, [categories]);

  const altersById = useMemo(() => {
    const m = {};
    alters.forEach(a => { m[a.id] = a; });
    return m;
  }, [alters]);

  const { roots, children } = useMemo(() => buildCategoryTree(categories), [categories]);

  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();

  const filteredActivities = useMemo(() => activities.filter(a => {
    const t = new Date(a.timestamp).getTime();
    return t >= fromMs && t <= toMs;
  }), [activities, from, to]);

  const expandedRows = useMemo(() =>
    expandActivitiesPerCategory(filteredActivities, catMap),
    [filteredActivities, catMap]
  );

  const totalActivities = filteredActivities.length;

  if (totalActivities === 0) {
    return <p className="text-muted-foreground text-sm text-center py-12">No activity data in this range.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Alter presence summary */}
      <AlterPresenceOverview
        activities={filteredActivities}
        categories={categories}
        checkIns={checkIns}
        alters={alters}
        from={from}
        to={to}
      />

      {/* Hierarchical activity tree with alter breakdowns */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-1">Activities by Category (with Alters)</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Expand each category to see who was fronting. Sub-categories shown indented.
        </p>
        <div className="space-y-1">
          {roots.map(root => (
            <CategoryRow
              key={root.id}
              cat={root}
              children={children[root.id] || []}
              rows={expandedRows}
              altersById={altersById}
              totalActivities={totalActivities}
              depth={0}
            />
          ))}
        </div>
      </Card>

      {/* Emotion correlation */}
      <EmotionCorrelation
        activities={filteredActivities}
        categories={categories}
        emotionCheckIns={emotionCheckIns}
        from={from}
        to={to}
      />
    </div>
  );
}