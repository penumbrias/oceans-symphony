import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { format, differenceInMinutes, startOfDay } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

const HOUR_HEIGHT = 56;
const LABEL_WIDTH = 44;
const DEFAULT_COL_WIDTHS = { activity: 52, checkIn: 110, alter: 40 };
const EXPANDED_EXTRA = 100; // px added per expanded item

const EMOTION_COLORS = [
  "#f43f5e","#ec4899","#a855f7","#3b82f6","#14b8a6",
  "#22c55e","#f59e0b","#ef4444","#8b5cf6","#06b6d4",
  "#f97316","#84cc16","#e11d48","#7c3aed","#0891b2",
];
function emotionColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return EMOTION_COLORS[h % EMOTION_COLORS.length];
}
function minutesInDay(date, dayStart) {
  return differenceInMinutes(date, dayStart);
}

// Double-tap hook
function useDoubleTap(onSingleTap, onDoubleTap, ms = 280) {
  const lastRef = useRef({ time: 0 });
  return useCallback((e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastRef.current.time < ms) {
      lastRef.current.time = 0;
      onDoubleTap?.(e);
    } else {
      lastRef.current.time = now;
      // delay single tap slightly to let double-tap cancel it
      setTimeout(() => {
        if (lastRef.current.time !== 0 && Date.now() - lastRef.current.time >= ms - 30) {
          lastRef.current.time = 0;
          onSingleTap?.(e);
        }
      }, ms);
    }
  }, [onSingleTap, onDoubleTap, ms]);
}

// Draggable resize handle
function ResizeHandle({ onDrag }) {
  const dragging = useRef(false);
  const startX = useRef(0);

  const onMouseDown = (e) => {
    dragging.current = true;
    startX.current = e.clientX;
    e.preventDefault();
  };
  const onTouchStart = (e) => {
    dragging.current = true;
    startX.current = e.touches[0].clientX;
    e.preventDefault();
  };

  useEffect(() => {
    const move = (e) => {
      if (!dragging.current) return;
      const x = e.clientX ?? e.touches?.[0]?.clientX;
      if (x == null) return;
      onDrag(x - startX.current);
      startX.current = x;
    };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [onDrag]);

  return (
    <div
      className="absolute top-0 bottom-0 z-20 flex items-center justify-center cursor-col-resize"
      style={{ width: 10, right: -5, userSelect: "none" }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      <div className="w-0.5 h-full bg-border/60 hover:bg-primary/60 transition-colors" />
    </div>
  );
}

// Alter avatar + duration bar
function AlterBar({ alter, color, topPx, heightPx }) {
  const avatarSize = 26;
  return (
    <div className="absolute flex flex-col items-center" style={{ top: topPx, left: 0, right: 0, userSelect: "none" }}>
      <div
        className="rounded-full flex-shrink-0 border-2 border-background overflow-hidden flex items-center justify-center"
        style={{ width: avatarSize, height: avatarSize, backgroundColor: color }}
        title={alter?.name}
      >
        {alter?.avatar_url
          ? <img src={alter.avatar_url} alt={alter?.name} className="w-full h-full object-cover" />
          : <span className="text-xs font-bold text-white">{alter?.name?.charAt(0)?.toUpperCase() || "?"}</span>
        }
      </div>
      {heightPx > avatarSize + 4 && (
        <div className="w-0.5 rounded-full mt-0.5" style={{
          height: Math.max(heightPx - avatarSize - 2, 4),
          background: `linear-gradient(to bottom, ${color}, ${color}40)`,
        }} />
      )}
    </div>
  );
}

// Activity bar — tap to expand/collapse; double-tap to navigate
function ActivityBar({ activity, allNames, topPx, heightPx, expanded, onTap, onDoubleTap }) {
  const color = activity.color || "hsl(var(--primary))";
  const avatarSize = 26;
  const hasNote = !!activity.notes;
  const tap = useDoubleTap(onTap, onDoubleTap);

  const displayName = allNames && allNames.length > 1
    ? allNames.join(" • ")
    : activity.activity_name;

  return (
    <div
      className="absolute flex flex-col items-center cursor-pointer"
      style={{ top: topPx, left: 0, right: 0, userSelect: "none" }}
      onClick={tap}
    >
      <div
        className="rounded-full flex-shrink-0 border-2 border-background flex items-center justify-center"
        style={{ width: avatarSize, height: avatarSize, backgroundColor: color }}
      >
        <span className="text-xs font-bold text-white leading-none">
          {activity.activity_name?.charAt(0)?.toUpperCase() || "A"}
        </span>
      </div>
      <div className="text-center leading-tight mt-0.5 px-0.5" style={{ fontSize: 8, color, maxWidth: 52, wordBreak: "break-word" }}>
        {displayName}
        {hasNote && !expanded && <span className="ml-0.5 opacity-70">···</span>}
      </div>
      {expanded && (
        <div className="mt-1 mx-1 p-1.5 rounded-lg border text-left w-full"
          style={{ backgroundColor: `${color}18`, borderColor: `${color}40`, maxWidth: 120 }}>
          {activity.duration_minutes && (
            <p className="text-xs text-muted-foreground leading-tight">{activity.duration_minutes}m</p>
          )}
          {hasNote && (
            <p className="text-xs leading-tight mt-0.5" style={{ color, wordBreak: "break-word" }}>{activity.notes}</p>
          )}
          {allNames && allNames.length > 1 && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{allNames.join(", ")}</p>
          )}
        </div>
      )}
      {!expanded && heightPx > avatarSize + 30 && (
        <div className="w-0.5 rounded-full mt-0.5" style={{
          height: Math.max(heightPx - avatarSize - 26, 4),
          background: `linear-gradient(to bottom, ${color}, ${color}40)`,
        }} />
      )}
    </div>
  );
}

// Check-in column entry — tap to expand, double-tap to navigate
function CheckInEntry({ entry, topPx, onTap, onDoubleTap }) {
  const tap = useDoubleTap(onTap, onDoubleTap);

  if (entry.type === "emotion") {
    return (
      <div
        className="absolute left-1 right-1 cursor-pointer z-10"
        style={{ top: topPx, userSelect: "none" }}
        onClick={tap}
      >
        <div className="rounded-lg border border-border/60 bg-card/80 px-1.5 py-1 shadow-sm">
          <p className="text-xs text-muted-foreground leading-tight mb-1">
            💭 {format(new Date(entry.data.timestamp), "h:mm a")}
          </p>
          <div className="flex flex-wrap gap-0.5">
            {(entry.data.emotions || []).map((em) => (
              <span key={em} className="px-1.5 py-0.5 rounded-full text-white font-medium"
                style={{ fontSize: 9, backgroundColor: emotionColor(em) }}>
                {em}
              </span>
            ))}
          </div>
          {entry.expanded && entry.data.note && (
            <p className="text-xs text-muted-foreground italic mt-1">{entry.data.note}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute left-1 right-1 cursor-pointer z-10"
      style={{ top: topPx, userSelect: "none" }}
      onClick={tap}
    >
      <div className="px-1.5 py-0.5 rounded bg-muted/60 border border-border/50 hover:bg-muted transition-colors">
        <p className="text-xs text-muted-foreground leading-tight truncate">
          {entry.type === "journal" ? "📓" : "✅"} {entry.label}
        </p>
        {entry.expanded && entry.type === "journal" && entry.data?.content && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3 leading-tight">{entry.data.content?.replace(/[#*_]/g, "")}</p>
        )}
      </div>
    </div>
  );
}

export default function InfiniteTimeline({
  day, sessions, activities, emotions, alters, hasData, isToday,
  journals = [], checkIns = [],
  showActivities = true, showCheckIns = true,
}) {
  const [collapsed, setCollapsed] = useState(!hasData);
  const [expandedKeys, setExpandedKeys] = useState(new Set());
  const [colWidths, setColWidths] = useState({ ...DEFAULT_COL_WIDTHS });
  const navigate = useNavigate();
  const dayStart = useMemo(() => startOfDay(day), [day]);
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  const toggleExpand = useCallback((key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const dragCol = useCallback((col, delta) => {
    setColWidths((prev) => ({
      ...prev,
      [col]: Math.max(30, prev[col] + delta),
    }));
  }, []);

  // --- Build all entries ---

  // Alter segments
  const alterEntries = useMemo(() => {
    const byAlter = {};
    sessions.forEach((session) => {
      const ids = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
      ids.forEach((alterId) => {
        const startMins = Math.max(0, minutesInDay(new Date(session.start_time), dayStart));
        const endTime = session.end_time
          ? new Date(session.end_time)
          : session.is_active && isToday ? new Date() : new Date(dayStart.getTime() + 23 * 60 * 60000);
        const endMins = Math.min(24 * 60, minutesInDay(endTime, dayStart));
        if (!byAlter[alterId]) byAlter[alterId] = [];
        byAlter[alterId].push({ startMins, endMins: Math.max(endMins, startMins + 8) });
      });
    });
    const merged = [];
    Object.entries(byAlter).forEach(([alterId, segs]) => {
      const sorted = [...segs].sort((a, b) => a.startMins - b.startMins);
      const mergedSegs = [];
      sorted.forEach((seg) => {
        if (!mergedSegs.length) { mergedSegs.push({ ...seg }); return; }
        const last = mergedSegs[mergedSegs.length - 1];
        seg.startMins <= last.endMins + 2 ? (last.endMins = Math.max(last.endMins, seg.endMins)) : mergedSegs.push({ ...seg });
      });
      mergedSegs.forEach((seg, i) => merged.push({ alterId, ...seg, key: `alter-${alterId}-${i}` }));
    });
    return merged;
  }, [sessions, dayStart, isToday]);

  const alterColumns = useMemo(() => {
    const cols = [];
    [...alterEntries].sort((a, b) => a.startMins - b.startMins).forEach((entry) => {
      let placed = false;
      for (const col of cols) {
        if (col[col.length - 1].endMins <= entry.startMins + 2) { col.push(entry); placed = true; break; }
      }
      if (!placed) cols.push([entry]);
    });
    return cols;
  }, [alterEntries]);

  // Activity entries — each activity is its own bar (no grouping by name)
  const activityEntries = useMemo(() => {
    return activities.map((act, i) => {
      const startMins = Math.max(0, minutesInDay(new Date(act.timestamp), dayStart));
      const endMins = Math.min(24 * 60, startMins + Math.max(act.duration_minutes || 30, 5));
      return {
        startMins,
        endMins: Math.max(endMins, startMins + 5),
        activity: act,
        mergedNames: [act.activity_name],
        key: `act-${act.id || i}`,
      };
    });
  }, [activities, dayStart]);

  const activityColumns = useMemo(() => {
    const cols = [];
    [...activityEntries].sort((a, b) => a.startMins - b.startMins).forEach((entry) => {
      let placed = false;
      for (const col of cols) {
        if (col[col.length - 1].endMins <= entry.startMins + 2) { col.push(entry); placed = true; break; }
      }
      if (!placed) cols.push([entry]);
    });
    return cols;
  }, [activityEntries]);

  // Check-in entries (emotions + journals + system check-ins)
  const checkInEntries = useMemo(() => {
    const entries = [];
    emotions.forEach((e) => entries.push({
      mins: Math.max(0, minutesInDay(new Date(e.timestamp), dayStart)),
      type: "emotion", id: e.id, data: e,
    }));
    journals.forEach((j) => entries.push({
      mins: Math.max(0, minutesInDay(new Date(j.created_date), dayStart)),
      type: "journal", id: j.id, label: j.title || "Journal Entry", data: j,
    }));
    checkIns.forEach((c) => entries.push({
      mins: Math.max(0, minutesInDay(new Date(c.created_date), dayStart)),
      type: "checkin", id: c.id, label: "System Check-In", data: c,
    }));
    return entries.sort((a, b) => a.mins - b.mins).map((e, i) => ({ ...e, key: `ci-${i}-${e.id}` }));
  }, [emotions, journals, checkIns, dayStart]);

  // --- Height adjustment for expanded items ---
  // Collect all expanded entry positions
  const expandedPositions = useMemo(() => {
    const positions = [];
    [...activityEntries, ...checkInEntries].forEach((entry) => {
      if (expandedKeys.has(entry.key)) {
        positions.push({ mins: entry.startMins ?? entry.mins, extraHeight: EXPANDED_EXTRA });
      }
    });
    return positions.sort((a, b) => a.mins - b.mins);
  }, [expandedKeys, activityEntries, checkInEntries]);

  const getTopPx = useCallback((mins) => {
    const extra = expandedPositions
      .filter((p) => p.mins < mins)
      .reduce((s, p) => s + p.extraHeight, 0);
    return (mins / 60) * HOUR_HEIGHT + extra;
  }, [expandedPositions]);

  const getRangePx = useCallback((startMins, endMins) => {
    return getTopPx(endMins) - getTopPx(startMins);
  }, [getTopPx]);

  const totalHeight = 24 * HOUR_HEIGHT + expandedPositions.reduce((s, p) => s + p.extraHeight, 0);

  // --- Layout ---
  const numActivityCols = showActivities ? Math.max(1, activityColumns.length) : 0;
  const activityAreaWidth = numActivityCols * colWidths.activity;
  const checkInAreaWidth = showCheckIns ? colWidths.checkIn : 0;
  const numAlterCols = Math.max(1, alterColumns.length);
  const alterAreaWidth = numAlterCols * colWidths.alter;
  const totalWidth = activityAreaWidth + checkInAreaWidth + LABEL_WIDTH + alterAreaWidth;

  const checkInLeft = activityAreaWidth;
  const timeLeft = checkInLeft + checkInAreaWidth;
  const alterLeft = timeLeft + LABEL_WIDTH;

  const dateLabel = isToday ? "Today" : format(day, "EEEE, MMM d");

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        style={{ userSelect: "none" }}
      >
        <div className="flex items-center gap-3">
          <span className={`font-semibold text-sm ${isToday ? "text-primary" : "text-foreground"}`}>{dateLabel}</span>
          {!hasData && <span className="text-xs text-muted-foreground">No data</span>}
          {hasData && (
            <div className="flex gap-2 text-xs text-muted-foreground">
              {sessions.length > 0 && <span>{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>}
              {activities.length > 0 && <span>{activities.length} activit{activities.length !== 1 ? "ies" : "y"}</span>}
              {emotions.length > 0 && <span>{emotions.length} check-in{emotions.length !== 1 ? "s" : ""}</span>}
              {journals.length > 0 && <span>{journals.length} journal{journals.length !== 1 ? "s" : ""}</span>}
            </div>
          )}
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <div className="overflow-x-auto border-t border-border">
          {/* Column headers */}
          <div className="flex border-b border-border/40 bg-muted/20 relative" style={{ minWidth: totalWidth }}>
            {showActivities && (
              <div className="text-center py-1 relative flex-shrink-0" style={{ width: activityAreaWidth }}>
                <span className="text-xs text-muted-foreground font-medium">Activities</span>
                <ResizeHandle onDrag={(d) => dragCol("activity", d / numActivityCols)} />
              </div>
            )}
            {showCheckIns && (
              <div className="text-center py-1 relative flex-shrink-0" style={{ width: checkInAreaWidth }}>
                <span className="text-xs text-muted-foreground font-medium">Check Ins</span>
                <ResizeHandle onDrag={(d) => dragCol("checkIn", d)} />
              </div>
            )}
            <div style={{ width: LABEL_WIDTH }} className="flex-shrink-0" />
            <div className="text-center py-1 relative flex-shrink-0" style={{ width: alterAreaWidth }}>
              <span className="text-xs text-muted-foreground font-medium">Alters</span>
              <ResizeHandle onDrag={(d) => dragCol("alter", d / numAlterCols)} />
            </div>
          </div>

          <div className="overflow-y-auto max-h-[500px]">
            <div className="relative" style={{ height: totalHeight, minWidth: totalWidth }}>

              {/* Hour grid lines + time labels */}
              {HOURS.map((h) => {
                const top = getTopPx(h * 60);
                return (
                  <div key={h} className="absolute flex items-start"
                    style={{ top, height: HOUR_HEIGHT, left: timeLeft, right: 0 }}>
                    <div className="flex-shrink-0 text-xs text-muted-foreground pt-1 pr-1 text-right" style={{ width: LABEL_WIDTH }}>
                      {format(new Date(dayStart.getTime() + h * 3600000), "h a")}
                    </div>
                    <div className="flex-1 border-t border-border/30 mt-2" />
                  </div>
                );
              })}

              {/* Activity columns */}
              {showActivities && activityColumns.map((col, colIdx) => (
                <div key={`acol-${colIdx}`} className="absolute"
                  style={{ left: colIdx * colWidths.activity, top: 0, width: colWidths.activity, height: totalHeight }}>
                  {col.map((entry) => {
                    const topPx = getTopPx(entry.startMins);
                    const heightPx = getRangePx(entry.startMins, entry.endMins);
                    const isExpanded = expandedKeys.has(entry.key);
                    const dateStr = format(day, "yyyy-MM-dd");
                    return (
                      <ActivityBar
                        key={entry.key}
                        activity={entry.activity}
                        allNames={entry.mergedNames}
                        topPx={topPx}
                        heightPx={heightPx}
                        expanded={isExpanded}
                        onTap={() => toggleExpand(entry.key)}
                        onDoubleTap={() => navigate(`/activities?date=${dateStr}`)}
                      />
                    );
                  })}
                </div>
              ))}

              {/* Check-ins column */}
              {showCheckIns && (
                <div className="absolute" style={{ left: checkInLeft, top: 0, width: checkInAreaWidth, height: totalHeight }}>
                  {checkInEntries.map((entry) => {
                    const topPx = getTopPx(entry.mins);
                    const isExpanded = expandedKeys.has(entry.key);
                    return (
                      <CheckInEntry
                        key={entry.key}
                        entry={{ ...entry, expanded: isExpanded }}
                        topPx={topPx}
                        onTap={() => toggleExpand(entry.key)}
                        onDoubleTap={() => {
                          if (entry.type === "journal") navigate(`/journals?id=${entry.id}`);
                          else if (entry.type === "checkin") navigate(`/system-checkin?id=${entry.id}`);
                        }}
                      />
                    );
                  })}
                </div>
              )}

              {/* Alter columns */}
              {alterColumns.map((col, colIdx) => (
                <div key={`col-${colIdx}`} className="absolute"
                  style={{ left: alterLeft + colIdx * colWidths.alter, top: 0, width: colWidths.alter, height: totalHeight }}>
                  {col.map((entry) => {
                    const alter = alters.find((a) => a.id === entry.alterId);
                    const color = alter?.color || "#9333ea";
                    const topPx = getTopPx(entry.startMins);
                    const heightPx = getRangePx(entry.startMins, entry.endMins);
                    return <AlterBar key={entry.key} alter={alter} color={color} topPx={topPx} heightPx={heightPx} />;
                  })}
                </div>
              ))}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}