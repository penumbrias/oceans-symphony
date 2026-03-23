import React, { useState, useMemo, useRef, useCallback } from "react";
import { format, differenceInMinutes, startOfDay } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

const HOUR_HEIGHT = 56;
const LABEL_WIDTH = 44;
const ALTER_COL_WIDTH = 38;
const ACTIVITY_COL_WIDTH = 44;
const CHECKIN_COL_WIDTH = 100; // merged emotions + journals/checkins

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

// Long press — prevents text selection, onClick only fires if long press did NOT trigger
function useLongPress(onLongPress, onClick, ms = 1500) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);

  const start = useCallback((e) => {
    e.preventDefault(); // prevent text selection on press
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress?.(e);
    }, ms);
  }, [onLongPress, ms]);

  const end = useCallback((e) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!firedRef.current) onClick?.(e);
  }, [onClick]);

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return {
    onMouseDown: start, onMouseUp: end, onMouseLeave: cancel,
    onTouchStart: start, onTouchEnd: end,
    style: { userSelect: "none", WebkitUserSelect: "none" },
  };
}

// Alter avatar + duration bar
function AlterBar({ alter, color, topPx, heightPx }) {
  const avatarSize = 28;
  return (
    <div className="absolute flex flex-col items-center" style={{ top: `${topPx}px`, left: 0, right: 0 }}>
      <div
        className="rounded-full flex-shrink-0 border-2 border-background overflow-hidden flex items-center justify-center"
        style={{ width: avatarSize, height: avatarSize, backgroundColor: color }}
        title={alter?.name}
      >
        {alter?.avatar_url ? (
          <img src={alter.avatar_url} alt={alter?.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-bold text-white">{alter?.name?.charAt(0)?.toUpperCase() || "?"}</span>
        )}
      </div>
      <div
        className="w-0.5 rounded-full mt-0.5"
        style={{
          height: `${Math.max(heightPx - avatarSize - 2, 4)}px`,
          background: `linear-gradient(to bottom, ${color}, ${color}40)`,
        }}
      />
    </div>
  );
}

// Activity bar with name label — tap expands, long press navigates
function ActivityBar({ activity, allNames, topPx, heightPx, onLongPress }) {
  const [showAll, setShowAll] = useState(false);
  const color = activity.color || "hsl(var(--primary))";
  const avatarSize = 28;
  const handlers = useLongPress(onLongPress, () => setShowAll((v) => !v));
  const displayName = allNames && allNames.length > 1
    ? (showAll ? allNames.join(" • ") : allNames[0] + " +" + (allNames.length - 1))
    : activity.activity_name;

  return (
    <div
      className="absolute flex flex-col items-center cursor-pointer"
      style={{ top: `${topPx}px`, left: 0, right: 0, ...handlers.style }}
      onMouseDown={handlers.onMouseDown}
      onMouseUp={handlers.onMouseUp}
      onMouseLeave={handlers.onMouseLeave}
      onTouchStart={handlers.onTouchStart}
      onTouchEnd={handlers.onTouchEnd}
    >
      <div
        className="rounded-full flex-shrink-0 border-2 border-background flex items-center justify-center"
        style={{ width: avatarSize, height: avatarSize, backgroundColor: color }}
        title={displayName}
      >
        <span className="text-xs font-bold text-white leading-none">
          {activity.activity_name?.charAt(0)?.toUpperCase() || "A"}
        </span>
      </div>
      <div
        className="text-center leading-tight mt-0.5 px-0.5"
        style={{ fontSize: 9, color, maxWidth: 52, wordBreak: "break-word", userSelect: "none" }}
      >
        {displayName}
      </div>
      {heightPx > avatarSize + 24 && (
        <div
          className="w-0.5 rounded-full mt-0.5"
          style={{
            height: `${Math.max(heightPx - avatarSize - 20, 4)}px`,
            background: `linear-gradient(to bottom, ${color}, ${color}40)`,
          }}
        />
      )}
    </div>
  );
}

// Check-in column entry — emotion pill or journal/checkin entry
function CheckInEntry({ entry, topPx, onLongPress }) {
  const [expanded, setExpanded] = useState(false);
  const handlers = useLongPress(onLongPress || null, entry.type === "emotion" ? () => setExpanded(v => !v) : null);

  if (entry.type === "emotion") {
    return (
      <div
        className="absolute left-1 right-1 cursor-pointer z-10"
        style={{ top: `${topPx}px`, ...handlers.style }}
        onMouseDown={handlers.onMouseDown}
        onMouseUp={handlers.onMouseUp}
        onMouseLeave={handlers.onMouseLeave}
        onTouchStart={handlers.onTouchStart}
        onTouchEnd={handlers.onTouchEnd}
      >
        <div className="rounded-lg border border-border/60 bg-card/80 px-1.5 py-1 shadow-sm">
          <p className="text-xs text-muted-foreground mb-1 leading-tight">
            💭 {format(new Date(entry.data.timestamp), "h:mm a")}
          </p>
          <div className="flex flex-wrap gap-0.5">
            {(entry.data.emotions || []).slice(0, expanded ? 99 : 4).map((em) => {
              const c = emotionColor(em);
              return (
                <span
                  key={em}
                  className="px-1.5 py-0.5 rounded-full text-white font-medium leading-none"
                  style={{ fontSize: 9, backgroundColor: c }}
                >
                  {em}
                </span>
              );
            })}
            {!expanded && (entry.data.emotions || []).length > 4 && (
              <span className="text-xs text-muted-foreground self-center">
                +{entry.data.emotions.length - 4}
              </span>
            )}
          </div>
          {expanded && entry.data.note && (
            <p className="text-xs text-muted-foreground italic mt-1 leading-tight">{entry.data.note}</p>
          )}
        </div>
      </div>
    );
  }

  // journal or checkin
  return (
    <div
      className="absolute left-1 right-1 cursor-pointer z-10"
      style={{ top: `${topPx}px`, ...handlers.style }}
      onMouseDown={handlers.onMouseDown}
      onMouseUp={handlers.onMouseUp}
      onMouseLeave={handlers.onMouseLeave}
      onTouchStart={handlers.onTouchStart}
      onTouchEnd={handlers.onTouchEnd}
    >
      <div className="mx-0 px-1.5 py-0.5 rounded bg-muted/60 border border-border/50 hover:bg-muted transition-colors">
        <p className="text-xs text-muted-foreground leading-tight truncate">
          {entry.type === "journal" ? "📓" : "✅"} {entry.label}
        </p>
      </div>
    </div>
  );
}

export default function InfiniteTimeline({
  day, sessions, activities, emotions, alters, hasData, isToday,
  journals = [], checkIns = [],
  showActivities = true, showEmotions = true,
}) {
  const [collapsed, setCollapsed] = useState(!hasData);
  const navigate = useNavigate();
  const dayStart = useMemo(() => startOfDay(day), [day]);

  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const containerHeight = 24 * HOUR_HEIGHT;

  // Build alter segments
  const alterEntries = useMemo(() => {
    const byAlter = {};
    sessions.forEach((session) => {
      const ids = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
      ids.forEach((alterId) => {
        const startMins = Math.max(0, minutesInDay(new Date(session.start_time), dayStart));
        const endTime = session.end_time
          ? new Date(session.end_time)
          : session.is_active && isToday
            ? new Date()
            : new Date(dayStart.getTime() + 23 * 60 * 60000);
        const endMins = Math.min(24 * 60, minutesInDay(endTime, dayStart));
        if (!byAlter[alterId]) byAlter[alterId] = [];
        byAlter[alterId].push({ startMins, endMins: Math.max(endMins, startMins + 8), isActive: session.is_active });
      });
    });

    const merged = [];
    Object.entries(byAlter).forEach(([alterId, segs]) => {
      const sorted = [...segs].sort((a, b) => a.startMins - b.startMins);
      const mergedSegs = [];
      sorted.forEach((seg) => {
        if (!mergedSegs.length) { mergedSegs.push({ ...seg }); return; }
        const last = mergedSegs[mergedSegs.length - 1];
        if (seg.startMins <= last.endMins + 2) {
          last.endMins = Math.max(last.endMins, seg.endMins);
        } else {
          mergedSegs.push({ ...seg });
        }
      });
      mergedSegs.forEach((seg, i) => merged.push({ alterId, ...seg, key: `${alterId}-${i}` }));
    });
    return merged;
  }, [sessions, dayStart, isToday]);

  // Pack alter entries into columns
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

  // Build activity segments grouped by name, merged consecutively
  const activityEntries = useMemo(() => {
    const byName = {};
    activities.forEach((act) => {
      const startMins = Math.max(0, minutesInDay(new Date(act.timestamp), dayStart));
      const durationMins = act.duration_minutes || 0;
      const endMins = Math.min(24 * 60, startMins + Math.max(durationMins, 1));
      const name = act.activity_name;
      if (!byName[name]) byName[name] = [];
      byName[name].push({ startMins, endMins: Math.max(endMins, startMins + 5), activity: act });
    });

    const merged = [];
    Object.entries(byName).forEach(([name, segs]) => {
      const sorted = [...segs].sort((a, b) => a.startMins - b.startMins);
      const mergedSegs = [];
      sorted.forEach((seg) => {
        if (!mergedSegs.length) { mergedSegs.push({ ...seg, mergedNames: [name] }); return; }
        const last = mergedSegs[mergedSegs.length - 1];
        if (seg.startMins <= last.endMins + 10) {
          last.endMins = Math.max(last.endMins, seg.endMins);
        } else {
          mergedSegs.push({ ...seg, mergedNames: [name] });
        }
      });
      mergedSegs.forEach((seg, i) => merged.push({ ...seg, key: `${name}-${i}` }));
    });
    return merged;
  }, [activities, dayStart]);

  // Pack activity entries into columns
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

  // Combined check-in column: emotions + journals + system check-ins, sorted by time
  const checkInEntries = useMemo(() => {
    const entries = [];
    if (showEmotions) {
      emotions.forEach((e) => {
        entries.push({
          mins: Math.max(0, minutesInDay(new Date(e.timestamp), dayStart)),
          type: "emotion",
          id: e.id,
          data: e,
        });
      });
    }
    journals.forEach((j) => {
      const t = new Date(j.created_date);
      entries.push({
        mins: Math.max(0, minutesInDay(t, dayStart)),
        type: "journal",
        id: j.id,
        label: j.title || "Journal Entry",
      });
    });
    checkIns.forEach((c) => {
      const t = new Date(c.created_date);
      entries.push({
        mins: Math.max(0, minutesInDay(t, dayStart)),
        type: "checkin",
        id: c.id,
        label: "System Check-In",
      });
    });
    return entries.sort((a, b) => a.mins - b.mins);
  }, [emotions, journals, checkIns, dayStart, showEmotions]);

  // Layout widths
  const numActivityCols = showActivities ? Math.max(1, activityColumns.length) : 0;
  const activityAreaWidth = showActivities ? numActivityCols * ACTIVITY_COL_WIDTH : 0;
  const checkInAreaWidth = CHECKIN_COL_WIDTH;
  const numAlterCols = Math.max(1, alterColumns.length);
  const alterAreaWidth = numAlterCols * ALTER_COL_WIDTH;
  const totalWidth = activityAreaWidth + checkInAreaWidth + LABEL_WIDTH + alterAreaWidth;

  // Column starts: activities | check-ins | time label | alters
  const checkInLeft = activityAreaWidth;
  const timeLeft = checkInLeft + checkInAreaWidth;
  const alterLeft = timeLeft + LABEL_WIDTH;

  const dateLabel = isToday ? "Today" : format(day, "EEEE, MMM d");

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Day header */}
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
          <div className="flex border-b border-border/40 bg-muted/20" style={{ minWidth: `${totalWidth}px` }}>
            {showActivities && (
              <div className="text-center py-1" style={{ width: activityAreaWidth }}>
                <span className="text-xs text-muted-foreground font-medium">Activities</span>
              </div>
            )}
            <div className="text-center py-1" style={{ width: checkInAreaWidth }}>
              <span className="text-xs text-muted-foreground font-medium">Check Ins</span>
            </div>
            <div style={{ width: LABEL_WIDTH }} />
            <div className="text-center py-1" style={{ width: alterAreaWidth }}>
              <span className="text-xs text-muted-foreground font-medium">Alters</span>
            </div>
          </div>

          <div className="overflow-y-auto max-h-96">
            <div className="relative" style={{ height: `${containerHeight}px`, minWidth: `${totalWidth}px` }}>

              {/* Hour grid lines + time labels */}
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute flex items-start"
                  style={{ top: `${h * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px`, left: `${timeLeft}px`, right: 0 }}
                >
                  <div className="flex-shrink-0 text-xs text-muted-foreground pt-1 pr-1 text-right" style={{ width: LABEL_WIDTH }}>
                    {format(new Date(dayStart.getTime() + h * 60 * 60000), "h a")}
                  </div>
                  <div className="flex-1 border-t border-border/30 mt-2" />
                </div>
              ))}

              {/* Activity bars — far left */}
              {showActivities && activityColumns.map((col, colIdx) => (
                <div
                  key={`acol-${colIdx}`}
                  className="absolute"
                  style={{ left: colIdx * ACTIVITY_COL_WIDTH, top: 0, width: ACTIVITY_COL_WIDTH, height: containerHeight }}
                >
                  {col.map((entry) => {
                    const topPx = (entry.startMins / 60) * HOUR_HEIGHT;
                    const heightPx = ((entry.endMins - entry.startMins) / 60) * HOUR_HEIGHT;
                    const dateStr = format(day, "yyyy-MM-dd");
                    return (
                      <ActivityBar
                        key={entry.key}
                        activity={entry.activity}
                        allNames={entry.mergedNames}
                        topPx={topPx}
                        heightPx={heightPx}
                        onLongPress={() => navigate(`/activities?date=${dateStr}`)}
                      />
                    );
                  })}
                </div>
              ))}

              {/* Combined Check Ins column: emotions + journals + system check-ins */}
              <div className="absolute" style={{ left: checkInLeft, top: 0, width: checkInAreaWidth, height: containerHeight }}>
                {checkInEntries.map((entry, idx) => (
                  <CheckInEntry
                    key={idx}
                    entry={entry}
                    topPx={(entry.mins / 60) * HOUR_HEIGHT}
                    onLongPress={
                      entry.type === "journal"
                        ? () => navigate(`/journals?id=${entry.id}`)
                        : entry.type === "checkin"
                          ? () => navigate(`/system-checkin?id=${entry.id}`)
                          : null
                    }
                  />
                ))}
              </div>

              {/* Alter columns */}
              {alterColumns.map((col, colIdx) => (
                <div
                  key={`col-${colIdx}`}
                  className="absolute"
                  style={{ left: alterLeft + colIdx * ALTER_COL_WIDTH, top: 0, width: ALTER_COL_WIDTH, height: containerHeight }}
                >
                  {col.map((entry) => {
                    const alter = alters.find((a) => a.id === entry.alterId);
                    const color = alter?.color || "#9333ea";
                    const topPx = (entry.startMins / 60) * HOUR_HEIGHT;
                    const heightPx = ((entry.endMins - entry.startMins) / 60) * HOUR_HEIGHT;
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