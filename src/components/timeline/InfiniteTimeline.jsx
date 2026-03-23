import React, { useState, useMemo, useRef, useCallback } from "react";
import { format, differenceInMinutes, startOfDay } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

const HOUR_HEIGHT = 56;
const LABEL_WIDTH = 44;
const ALTER_COL_WIDTH = 38;
const ACTIVITY_COL_WIDTH = 44;
const EMOTION_COL_WIDTH = 130;
const JOURNAL_COL_WIDTH = 160;

function minutesInDay(date, dayStart) {
  return differenceInMinutes(date, dayStart);
}

// Long press hook
function useLongPress(onLongPress, onClick, ms = 600) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);

  const start = useCallback((e) => {
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

  return { onMouseDown: start, onMouseUp: end, onMouseLeave: cancel, onTouchStart: start, onTouchEnd: end };
}

// Alter avatar + duration bar
function AlterBar({ alter, color, topPx, heightPx, colWidth }) {
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

// Activity avatar + duration bar (like alters but with activity color)
function ActivityBar({ activity, topPx, heightPx, onLongPress, onClick }) {
  const color = activity.color || "hsl(var(--primary))";
  const avatarSize = 26;
  const handlers = useLongPress(onLongPress, onClick);
  return (
    <div
      className="absolute flex flex-col items-center cursor-pointer"
      style={{ top: `${topPx}px`, left: 0, right: 0 }}
      {...handlers}
    >
      <div
        className="rounded-full flex-shrink-0 border-2 border-background flex items-center justify-center"
        style={{ width: avatarSize, height: avatarSize, backgroundColor: color }}
        title={activity.activity_name}
      >
        <span className="text-xs font-bold text-white leading-none">
          {activity.activity_name?.charAt(0)?.toUpperCase() || "A"}
        </span>
      </div>
      {heightPx > avatarSize + 4 && (
        <div
          className="w-0.5 rounded-full mt-0.5"
          style={{
            height: `${Math.max(heightPx - avatarSize - 2, 4)}px`,
            background: `linear-gradient(to bottom, ${color}, ${color}40)`,
          }}
        />
      )}
    </div>
  );
}

// Emotion pill
function EmotionPill({ emotion, topPx, navigate }) {
  const [expanded, setExpanded] = useState(false);
  const handlers = useLongPress(
    () => { /* no dedicated page, just expand */ setExpanded(true); },
    () => setExpanded(!expanded)
  );

  return (
    <div
      className="absolute left-1 right-1 cursor-pointer z-10"
      style={{ top: `${topPx}px` }}
      {...handlers}
    >
      <div className={`rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800 px-1.5 py-1 transition-all ${expanded ? "" : ""}`}>
        <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 leading-tight">
          💭 {emotion.emotions?.slice(0, 2).join(", ") || "Check-in"}
        </p>
        {expanded && (
          <div className="mt-1 space-y-0.5">
            <p className="text-xs text-muted-foreground">{format(new Date(emotion.timestamp), "h:mm a")}</p>
            {emotion.emotions?.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-0.5">
                {emotion.emotions.map((em) => (
                  <span key={em} className="px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300 text-xs">{em}</span>
                ))}
              </div>
            )}
            {emotion.note && <p className="text-xs text-muted-foreground italic">{emotion.note}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// Center column entry (journal / check-in title)
function CenterEntry({ topPx, label, icon, onLongPress, onClick }) {
  const handlers = useLongPress(onLongPress, onClick);
  return (
    <div
      className="absolute left-0 right-0 cursor-pointer group"
      style={{ top: `${topPx}px`, zIndex: 5 }}
      {...handlers}
    >
      <div className="mx-1 px-1.5 py-0.5 rounded bg-muted/60 border border-border/50 hover:bg-muted transition-colors group-active:opacity-70">
        <p className="text-xs text-muted-foreground truncate leading-tight">
          {icon} {label}
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

  // Build activity segments (like alters: each unique named activity gets tracks)
  const activityEntries = useMemo(() => {
    const byName = {};
    activities.forEach((act) => {
      const startMins = Math.max(0, minutesInDay(new Date(act.timestamp), dayStart));
      const durationMins = act.duration_minutes || 0;
      // If no duration, check if same activity occurs consecutively — handled via merge
      const endMins = Math.min(24 * 60, startMins + Math.max(durationMins, 1));
      const key = act.activity_name;
      if (!byName[key]) byName[key] = [];
      byName[key].push({ startMins, endMins: Math.max(endMins, startMins + 5), activity: act });
    });

    // Merge consecutive occurrences of the same activity (within 10 mins)
    const merged = [];
    Object.entries(byName).forEach(([name, segs]) => {
      const sorted = [...segs].sort((a, b) => a.startMins - b.startMins);
      const mergedSegs = [];
      sorted.forEach((seg) => {
        if (!mergedSegs.length) { mergedSegs.push({ ...seg }); return; }
        const last = mergedSegs[mergedSegs.length - 1];
        if (seg.startMins <= last.endMins + 10) {
          last.endMins = Math.max(last.endMins, seg.endMins);
        } else {
          mergedSegs.push({ ...seg });
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

  // Emotion events positioned
  const emotionEvents = useMemo(() => {
    return emotions.map((e) => ({
      mins: Math.max(0, minutesInDay(new Date(e.timestamp), dayStart)),
      data: e,
    }));
  }, [emotions, dayStart]);

  // Center column entries: journals + check-ins at their time
  const centerEntries = useMemo(() => {
    const entries = [];
    journals.forEach((j) => {
      const t = new Date(j.created_date);
      const mins = Math.max(0, minutesInDay(t, dayStart));
      entries.push({ mins, type: "journal", id: j.id, label: j.title || "Journal Entry" });
    });
    checkIns.forEach((c) => {
      const t = new Date(c.created_date);
      const mins = Math.max(0, minutesInDay(t, dayStart));
      entries.push({ mins, type: "checkin", id: c.id, label: "System Check-In" });
    });
    return entries;
  }, [journals, checkIns, dayStart]);

  // Layout widths
  const numActivityCols = showActivities ? Math.max(1, activityColumns.length) : 0;
  const activityAreaWidth = showActivities ? numActivityCols * ACTIVITY_COL_WIDTH : 0;
  const emotionAreaWidth = showEmotions ? EMOTION_COL_WIDTH : 0;
  const centerAreaWidth = LABEL_WIDTH + JOURNAL_COL_WIDTH;
  const numAlterCols = Math.max(1, alterColumns.length);
  const alterAreaWidth = numAlterCols * ALTER_COL_WIDTH;
  const totalWidth = activityAreaWidth + emotionAreaWidth + centerAreaWidth + alterAreaWidth;

  // Column starts
  const emotionLeft = activityAreaWidth;
  const timeLeft = emotionLeft + emotionAreaWidth;
  const journalLeft = timeLeft + LABEL_WIDTH;
  const alterLeft = timeLeft + LABEL_WIDTH + JOURNAL_COL_WIDTH;

  const dateLabel = isToday ? "Today" : format(day, "EEEE, MMM d");

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Day header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
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
                        topPx={topPx}
                        heightPx={heightPx}
                        onClick={() => navigate(`/activities?date=${dateStr}`)}
                        onLongPress={() => navigate(`/activities?date=${dateStr}`)}
                      />
                    );
                  })}
                </div>
              ))}

              {/* Emotion/check-in column */}
              {showEmotions && (
                <div className="absolute" style={{ left: emotionLeft, top: 0, width: EMOTION_COL_WIDTH, height: containerHeight }}>
                  {emotionEvents.map((evt, idx) => (
                    <EmotionPill
                      key={idx}
                      emotion={evt.data}
                      topPx={(evt.mins / 60) * HOUR_HEIGHT}
                      navigate={navigate}
                    />
                  ))}
                </div>
              )}

              {/* Center column: journal + check-in titles */}
              <div className="absolute" style={{ left: journalLeft, top: 0, width: JOURNAL_COL_WIDTH, height: containerHeight }}>
                {centerEntries.map((entry, idx) => (
                  <CenterEntry
                    key={idx}
                    topPx={(entry.mins / 60) * HOUR_HEIGHT}
                    label={entry.label}
                    icon={entry.type === "journal" ? "📓" : "✅"}
                    onClick={() => {
                      if (entry.type === "journal") navigate(`/journals?id=${entry.id}`);
                      else navigate(`/system-checkin?id=${entry.id}`);
                    }}
                    onLongPress={() => {
                      if (entry.type === "journal") navigate(`/journals?id=${entry.id}`);
                      else navigate(`/system-checkin?id=${entry.id}`);
                    }}
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