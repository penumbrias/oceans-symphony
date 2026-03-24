import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { format, differenceInMinutes, startOfDay } from "date-fns";
import { parseDate } from "@/lib/dateUtils";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AlterSessionInfo, AlterSessionEdit } from "@/components/timeline/AlterSessionPopover";

const HOUR_HEIGHT = 56;
const LABEL_WIDTH = 44;
const DEFAULT_COL_WIDTHS = { activity: 56, checkIn: 120, alter: 40 };
const EXPANDED_EXTRA = 100;

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
      setTimeout(() => {
        if (lastRef.current.time !== 0 && Date.now() - lastRef.current.time >= ms - 30) {
          lastRef.current.time = 0;
          onSingleTap?.(e);
        }
      }, ms);
    }
  }, [onSingleTap, onDoubleTap, ms]);
}

function ResizeHandle({ onDrag }) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const onMouseDown = (e) => { dragging.current = true; startX.current = e.clientX; e.preventDefault(); };
  const onTouchStart = (e) => { dragging.current = true; startX.current = e.touches[0].clientX; e.preventDefault(); };
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
    <div className="absolute top-0 bottom-0 z-20 flex items-center justify-center cursor-col-resize"
      style={{ width: 10, right: -5, userSelect: "none" }}
      onMouseDown={onMouseDown} onTouchStart={onTouchStart}>
      <div className="w-0.5 h-full bg-border/60 hover:bg-primary/60 transition-colors" />
    </div>
  );
}

function StatusNoteBadge({ note, topPx }) {
  return (
    <div
      className="absolute left-0 right-0 z-10 flex items-start"
      style={{ top: topPx, userSelect: "none" }}
    >
      <div className="mx-1 px-1.5 py-0.5 rounded-md bg-muted/80 border border-border/60 text-muted-foreground leading-tight truncate w-full"
        style={{ fontSize: 9 }}
        title={note}
      >
        💬 {note}
      </div>
    </div>
  );
}

function AlterBar({ alter, color, topPx, heightPx, onTap, onDoubleTap }) {
  const sz = 26;
  const tap = useDoubleTap(onTap, onDoubleTap);
  return (
    <div className="absolute flex flex-col items-center cursor-pointer" style={{ top: topPx, left: 0, right: 0, userSelect: "none" }}
      onClick={tap}>
      <div className="rounded-full flex-shrink-0 border-2 border-background overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-primary/60 transition-all"
        style={{ width: sz, height: sz, backgroundColor: color }} title={alter?.name}>
        {alter?.avatar_url
          ? <img src={alter.avatar_url} alt={alter?.name} className="w-full h-full object-cover" />
          : <span className="text-xs font-bold text-white">{alter?.name?.charAt(0)?.toUpperCase() || "?"}</span>}
      </div>
      {heightPx > sz + 4 && (
        <div className="w-0.5 rounded-full mt-0.5" style={{
          height: Math.max(heightPx - sz - 2, 4),
          background: `linear-gradient(to bottom, ${color}, ${color}40)`,
        }} />
      )}
    </div>
  );
}

// Each bubble shows ONLY activity_name. Merged = same activity_name merged together.
function ActivityBar({ activityName, color, mergedCount, topPx, heightPx, expanded, notes, onTap, onDoubleTap }) {
  const sz = 26;
  const tap = useDoubleTap(onTap, onDoubleTap);
  return (
    <div className="absolute flex flex-col items-center cursor-pointer"
      style={{ top: topPx, left: 0, right: 0, userSelect: "none" }}
      onClick={tap}>
      <div className="rounded-full flex-shrink-0 border-2 border-background flex items-center justify-center"
        style={{ width: sz, height: sz, backgroundColor: color }}>
        <span className="text-xs font-bold text-white leading-none">
          {activityName?.charAt(0)?.toUpperCase() || "A"}
        </span>
      </div>
      <div className="text-center leading-tight mt-0.5 px-0.5"
        style={{ fontSize: 8, color, maxWidth: 54, wordBreak: "break-word" }}>
        {activityName}
        {mergedCount > 1 && !expanded && <span className="opacity-60"> ×{mergedCount}</span>}
      </div>
      {expanded && (
        <div className="mt-1 mx-1 p-1.5 rounded-lg border text-left w-full"
          style={{ backgroundColor: `${color}18`, borderColor: `${color}40`, maxWidth: 120 }}>
          {mergedCount > 1 && <p className="text-xs text-muted-foreground leading-tight">{mergedCount} instances</p>}
          {notes && <p className="text-xs leading-tight mt-0.5" style={{ color, wordBreak: "break-word" }}>{notes}</p>}
        </div>
      )}
      {!expanded && heightPx > sz + 30 && (
        <div className="w-0.5 rounded-full mt-0.5" style={{
          height: Math.max(heightPx - sz - 26, 4),
          background: `linear-gradient(to bottom, ${color}, ${color}40)`,
        }} />
      )}
    </div>
  );
}

const TYPE_META = {
  journal:      { icon: "📓", emoji: true },
  checkin:      { icon: "✅", emoji: true },
  bulletin:     { icon: "📌", emoji: true },
  task:         { icon: "☑️", emoji: true },
  task_done:    { icon: "✅", emoji: true },
  mention:      { icon: "@",  emoji: false },
};

// Emotion bubble — always visible as colored circle with first letter
function EmotionBubble({ entry, topPx, expanded, onTap }) {
  const emotions = entry.data.emotions || [];
  const note = entry.data.note;
  const timeStr = `${String(Math.floor(entry.mins / 60)).padStart(2, '0')}:${String(entry.mins % 60).padStart(2, '0')}`;

  return (
    <div className="absolute right-1 cursor-pointer z-10" style={{ top: topPx, userSelect: "none" }} onClick={onTap}>
      {expanded ? (
        <div className="rounded-lg border border-border/60 bg-card/90 px-2 py-1.5 shadow-sm text-right">
          <p className="text-xs text-muted-foreground mb-1 font-medium">{timeStr}</p>
          <div className="flex flex-wrap gap-0.5 justify-end">
            {emotions.map((em) => (
              <span key={em} className="px-1.5 py-0.5 rounded-full text-white font-medium"
                style={{ fontSize: 9, backgroundColor: emotionColor(em) }}>{em}</span>
            ))}
          </div>
          {note && <p className="text-xs text-muted-foreground italic mt-1 text-right">{note}</p>}
        </div>
      ) : (
        <div className="flex gap-0.5 flex-wrap justify-end">
          {emotions.slice(0, 4).map((em) => (
            <div key={em}
              className="rounded-full border-2 border-background flex items-center justify-center flex-shrink-0"
              style={{ width: 18, height: 18, backgroundColor: emotionColor(em) }}
              title={em}>
              <span className="text-white font-bold" style={{ fontSize: 8 }}>{em.charAt(0).toUpperCase()}</span>
            </div>
          ))}
          {emotions.length > 4 && (
            <div className="rounded-full border-2 border-background flex items-center justify-center flex-shrink-0 bg-muted"
              style={{ width: 18, height: 18 }}>
              <span className="text-muted-foreground font-bold" style={{ fontSize: 7 }}>+{emotions.length - 4}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Non-emotion entry — icon button that hugs the left
function EventEntry({ entry, topPx, expanded, onTap, onDoubleTap }) {
  const tap = useDoubleTap(onTap, onDoubleTap);
  const meta = TYPE_META[entry.type] || { icon: "•", emoji: false };
  const isTaskDone = entry.type === "task_done";
  const timeStr = `${String(Math.floor(entry.mins / 60)).padStart(2, '0')}:${String(entry.mins % 60).padStart(2, '0')}`;

  return (
    <div className="absolute left-1 cursor-pointer z-10" style={{ top: topPx, userSelect: "none" }} onClick={tap}>
      {expanded ? (
        <div className="rounded-lg border border-border/60 bg-card/90 px-2 py-1.5 shadow-sm">
          <p className="text-xs text-muted-foreground leading-tight mb-1 font-medium">{meta.icon} {timeStr}</p>
          {entry.type === "journal" && <p className="text-xs text-muted-foreground leading-tight line-clamp-3">{entry.label}</p>}
          {entry.type === "checkin" && <p className="text-xs text-muted-foreground leading-tight">{entry.label}</p>}
          {entry.type === "bulletin" && <p className="text-xs text-muted-foreground leading-tight line-clamp-3">{entry.data.content}</p>}
          {(entry.type === "task" || entry.type === "task_done") && <p className="text-xs text-muted-foreground leading-tight">{entry.label}</p>}
        </div>
      ) : (
        <div className={`flex items-center justify-center rounded-full border shadow-sm hover:scale-110 transition-transform ${
          isTaskDone ? "bg-green-500/10 border-green-500/40" : "bg-card border-border/60"
        }`}
          style={{ width: 22, height: 22 }}
          title={entry.label}>
          <span style={{ fontSize: 12 }}>{meta.icon}</span>
        </div>
      )}
    </div>
  );
}

export default function InfiniteTimeline({
  day, sessions, activities, emotions, alters, hasData, isToday,
  journals = [], checkIns = [], bulletins = [], tasks = [],
  showActivities = true, showCheckIns = true,
  categories = [],
}) {
  // Build category -> parent map for merge-by-category
  const catMap = useMemo(() => {
    const m = {};
    categories.forEach(c => { m[c.id] = c; });
    return m;
  }, [categories]);

  const [collapsed, setCollapsed] = useState(!hasData);
  const [expandedKeys, setExpandedKeys] = useState(new Set());
  const [colWidths, setColWidths] = useState({ ...DEFAULT_COL_WIDTHS });
  const [mergeByCategory, setMergeByCategory] = useState(false);
  const [sessionPopover, setSessionPopover] = useState(null); // { session, alter }
  const [editingSession, setEditingSession] = useState(null); // { session, alter }
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
    setColWidths((prev) => ({ ...prev, [col]: Math.max(30, prev[col] + delta) }));
  }, []);

  // Alter segments
  const alterEntries = useMemo(() => {
    const byAlter = {};
    sessions.forEach((session) => {
      const ids = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
      ids.forEach((alterId) => {
        const startMins = Math.max(0, minutesInDay(parseDate(session.start_time), dayStart));
        const endTime = session.end_time
          ? parseDate(session.end_time)
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

  // Activity entries:
  // - Each activity gets a bubble with its own activity_name
  // - Merge same activity_name if overlapping/consecutive (always)
  // - Optionally merge by parent category if mergeByCategory is on
  const activityEntries = useMemo(() => {
    const raw = [];
    activities.forEach((act) => {
      const startMins = Math.max(0, minutesInDay(parseDate(act.timestamp), dayStart));
      const endMins = Math.min(24 * 60, startMins + Math.max(act.duration_minutes || 30, 5));
      // Create a separate entry for EACH category in this activity (deduplicated)
      const categoryIds = act.activity_category_ids && act.activity_category_ids.length > 0
        ? [...new Set(act.activity_category_ids)]
        : [null];
      categoryIds.forEach((catId) => {
        const cat = catId ? catMap[catId] : null;
        const categoryName = cat?.name || act.activity_name;
        raw.push({
          startMins,
          endMins: Math.max(endMins, startMins + 5),
          activity: act,
          categoryId: catId,
          displayName: categoryName,
          categoryColor: cat?.color || act.color,
        });
      });
    });
    raw.sort((a, b) => a.startMins - b.startMins);

    // Group: merge overlapping/consecutive entries with the same category ID
    const merged = [];
    raw.forEach((entry) => {
      const last = merged[merged.length - 1];
      if (last && last.categoryId === entry.categoryId && entry.startMins <= last.endMins) {
        last.endMins = Math.max(last.endMins, entry.endMins);
        last.mergedCount += 1;
      } else {
        merged.push({ ...entry, mergedCount: 1 });
      }
    });

    return merged.map((m, i) => ({
      ...m,
      key: `act-${m.activity.id}-cat-${m.categoryId || i}`,
    }));
  }, [activities, dayStart, catMap]);

  // Place each entry into side-by-side columns (overlapping entries = different columns)
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

  // Split check-in entries into emotions (right side) and events (left side)
  const emotionEntries = useMemo(() => {
    return emotions.map((e, i) => ({
      mins: Math.max(0, minutesInDay(parseDate(e.timestamp), dayStart)),
      type: "emotion", id: e.id, data: e,
      key: `em-${i}-${e.id}`
    })).sort((a, b) => a.mins - b.mins);
  }, [emotions, dayStart]);

  const eventEntries = useMemo(() => {
    const entries = [];
    journals.forEach((j) => entries.push({ mins: Math.max(0, minutesInDay(parseDate(j.created_date), dayStart)), type: "journal", id: j.id, label: j.title || "Journal Entry", data: j }));
    checkIns.forEach((c) => entries.push({ mins: Math.max(0, minutesInDay(parseDate(c.created_date), dayStart)), type: "checkin", id: c.id, label: "System Check-In", data: c }));
    bulletins.forEach((b) => entries.push({ mins: Math.max(0, minutesInDay(parseDate(b.created_date), dayStart)), type: "bulletin", id: b.id, label: b.content?.slice(0, 40) || "Bulletin", data: b }));
    tasks.forEach((t) => {
      entries.push({ mins: Math.max(0, minutesInDay(parseDate(t.created_date), dayStart)), type: "task", id: t.id, label: t.title || "Task", data: t });
      if (t.completed && t.completed_date) {
        entries.push({ mins: Math.max(0, minutesInDay(parseDate(t.completed_date), dayStart)), type: "task_done", id: `done-${t.id}`, label: `✓ ${t.title || "Task"}`, data: t });
      }
    });
    return entries.sort((a, b) => a.mins - b.mins).map((e, i) => ({ ...e, key: `ev-${i}-${e.id}` }));
  }, [journals, checkIns, bulletins, tasks, dayStart]);

  // Combined for expansion tracking
  const checkInEntries = useMemo(() => [...emotionEntries, ...eventEntries], [emotionEntries, eventEntries]);

  // Height adjustment for expanded items
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
    const extra = expandedPositions.filter((p) => p.mins < mins).reduce((s, p) => s + p.extraHeight, 0);
    return (mins / 60) * HOUR_HEIGHT + extra;
  }, [expandedPositions]);

  const getRangePx = useCallback((startMins, endMins) => {
    return getTopPx(endMins) - getTopPx(startMins);
  }, [getTopPx]);

  const totalHeight = 24 * HOUR_HEIGHT + expandedPositions.reduce((s, p) => s + p.extraHeight, 0);

  // Position entries with gap-based anti-overlap (respect expansion extra heights)
  const MIN_EMOTION_GAP = 22;
  const MIN_EVENT_GAP = 26;

  const emotionPositioned = useMemo(() => {
    let minNext = -Infinity;
    return emotionEntries.map((entry) => {
      const expanded = expandedKeys.has(entry.key);
      const raw = getTopPx(entry.mins);
      const top = Math.max(raw, minNext);
      const height = expanded ? EXPANDED_EXTRA : MIN_EMOTION_GAP;
      minNext = top + height;
      return { ...entry, adjustedTop: top };
    });
  }, [emotionEntries, getTopPx, expandedKeys]);

  const eventPositioned = useMemo(() => {
    let minNext = -Infinity;
    return eventEntries.map((entry) => {
      const expanded = expandedKeys.has(entry.key);
      const raw = getTopPx(entry.mins);
      const top = Math.max(raw, minNext);
      const height = expanded ? EXPANDED_EXTRA : MIN_EVENT_GAP;
      minNext = top + height;
      return { ...entry, adjustedTop: top };
    });
  }, [eventEntries, getTopPx, expandedKeys]);

  // Layout
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
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {!collapsed && showActivities && (
            <button
              onClick={() => setMergeByCategory(v => !v)}
              title={mergeByCategory ? "Merged by category — click to show individual" : "Showing individual activities — click to merge by category"}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${mergeByCategory ? "bg-primary/20 text-primary border-primary/40" : "bg-muted/50 text-muted-foreground border-border/50 hover:border-primary/30"}`}
            >
              <Layers className="w-3 h-3" />
              {mergeByCategory ? "By category" : "Individual"}
            </button>
          )}
          {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto border-t border-border">
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

              {/* Activity columns — each overlapping group of activities gets its own side-by-side column */}
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
                        activityName={entry.displayName}
                        color={entry.categoryColor || "hsl(var(--primary))"}
                        mergedCount={entry.mergedCount}
                        topPx={topPx}
                        heightPx={heightPx}
                        expanded={isExpanded}
                        notes={entry.activity.notes}
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
                  {checkInPositioned.map((entry) => {
                    const isExpanded = expandedKeys.has(entry.key);
                    return (
                      <CheckInEntry
                        key={entry.key}
                        entry={{ ...entry, expanded: isExpanded }}
                        topPx={entry.adjustedTop}
                        onTap={() => toggleExpand(entry.key)}
                        onDoubleTap={() => {
                          if (entry.type === "journal") navigate(`/journals?id=${entry.id}`);
                          else if (entry.type === "checkin") navigate(`/system-checkin?id=${entry.id}`);
                          else if (entry.type === "bulletin") navigate(`/`);
                          else if (entry.type === "task") navigate(`/todo`);
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
                    // Find the actual session for this entry
                    const entrySession = sessions.find(s => {
                      const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
                      return ids.includes(entry.alterId);
                    });
                    return <AlterBar key={entry.key} alter={alter} color={color} topPx={topPx} heightPx={heightPx}
                      onTap={() => entrySession && setSessionPopover({ session: entrySession, alter })}
                      onDoubleTap={() => entrySession && setEditingSession({ session: entrySession, alter })} />;
                  })}
                </div>
              ))}

              {/* Session status notes — shown in the alters area */}
              {sessions.filter(s => s.note).map((session) => {
                const startMins = Math.max(0, minutesInDay(parseDate(session.start_time), dayStart));
                const topPx = getTopPx(startMins);
                return (
                  <div key={`note-${session.id}`} className="absolute"
                    style={{ left: alterLeft, right: 0, top: 0, height: totalHeight, pointerEvents: "none" }}>
                    <StatusNoteBadge note={session.note} topPx={topPx} />
                  </div>
                );
              })}

            </div>
          </div>
        </div>
      )}

      {/* Alter session info popover (single tap) */}
      {sessionPopover && !editingSession && (
        <AlterSessionInfo
          session={sessionPopover.session}
          alter={sessionPopover.alter}
          onClose={() => setSessionPopover(null)}
          onEdit={() => { setEditingSession(sessionPopover); setSessionPopover(null); }}
        />
      )}

      {/* Alter session edit modal (double tap or via info) */}
      {editingSession && (
        <AlterSessionEdit
          session={editingSession.session}
          alter={editingSession.alter}
          onClose={() => setEditingSession(null)}
        />
      )}
    </div>
  );
}