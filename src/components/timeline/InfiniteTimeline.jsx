import React, { useState, useMemo } from "react";
import { format, differenceInMinutes, startOfDay } from "date-fns";
import { ChevronDown, ChevronUp, Activity, Heart } from "lucide-react";

const HOUR_HEIGHT = 48;
const LABEL_WIDTH = 48;
const COL_WIDTH = 36;

function minutesInDay(date, dayStart) {
  return differenceInMinutes(date, dayStart);
}

function AlterAvatar({ alter, color, heightPx, topPx }) {
  return (
    <div className="absolute flex flex-col items-center" style={{ top: `${topPx}px`, left: 0, right: 0 }}>
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 border-2 border-background overflow-hidden flex items-center justify-center"
        style={{ backgroundColor: color }}
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
          height: `${Math.max(heightPx - 32, 4)}px`,
          background: `linear-gradient(to bottom, ${color}, ${color}40)`,
        }}
      />
    </div>
  );
}

function EventPill({ event, alters }) {
  const [expanded, setExpanded] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);

  if (event.type === "activity") {
    const a = event.data;
    return (
      <div
        className="absolute left-1 right-1 cursor-pointer z-10"
        style={{ top: `${(event.mins / 60) * HOUR_HEIGHT}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-1.5">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ backgroundColor: a.color || "hsl(var(--primary))" }}
          >
            <Activity className="w-2.5 h-2.5 text-white" />
          </div>
          <div className="text-xs overflow-hidden flex-1">
            <p className="font-semibold leading-tight truncate">{a.activity_name}</p>
            {expanded && (
              <div className="mt-1 space-y-0.5">
                <p className="text-muted-foreground">{format(new Date(a.timestamp), "h:mm a")}{a.duration_minutes ? ` • ${a.duration_minutes}m` : ""}</p>
                {a.fronting_alter_ids?.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {a.fronting_alter_ids.map((id) => {
                      const alter = alters.find((x) => x.id === id);
                      return alter ? (
                        <span
                          key={id}
                          className="px-1.5 py-0.5 rounded-full text-white text-xs"
                          style={{ backgroundColor: alter.color || "#888" }}
                        >
                          {alter.alias || alter.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
                {a.notes && (
                  <div>
                    <button className="text-primary text-xs underline" onClick={(e) => { e.stopPropagation(); setNoteExpanded(!noteExpanded); }}>
                      {noteExpanded ? "Hide note" : "Show note"}
                    </button>
                    {noteExpanded && <p className="text-muted-foreground italic mt-0.5">{a.notes}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
          {expanded ? <ChevronUp className="w-3 h-3 flex-shrink-0 mt-0.5 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 flex-shrink-0 mt-0.5 text-muted-foreground" />}
        </div>
      </div>
    );
  }

  if (event.type === "emotion") {
    const e = event.data;
    return (
      <div
        className="absolute left-1 right-1 cursor-pointer z-10"
        style={{ top: `${(event.mins / 60) * HOUR_HEIGHT}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-1.5">
          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-rose-100">
            <Heart className="w-2.5 h-2.5 text-rose-500" />
          </div>
          <div className="text-xs overflow-hidden flex-1">
            {expanded ? (
              <div className="space-y-0.5">
                <p className="text-muted-foreground">{format(new Date(e.timestamp), "h:mm a")}</p>
                {e.emotions?.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {e.emotions.map((em) => (
                      <span key={em} className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">{em}</span>
                    ))}
                  </div>
                )}
                {e.note && (
                  <div>
                    <button className="text-primary text-xs underline" onClick={(ev) => { ev.stopPropagation(); setNoteExpanded(!noteExpanded); }}>
                      {noteExpanded ? "Hide note" : "Show note"}
                    </button>
                    {noteExpanded && <p className="text-muted-foreground italic mt-0.5">{e.note}</p>}
                  </div>
                )}
              </div>
            ) : (
              <p className="font-semibold leading-tight text-muted-foreground">
                Check-in{e.emotions?.length > 0 ? ` • ${e.emotions.slice(0, 2).join(", ")}` : ""}
              </p>
            )}
          </div>
          {expanded ? <ChevronUp className="w-3 h-3 flex-shrink-0 mt-0.5 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 flex-shrink-0 mt-0.5 text-muted-foreground" />}
        </div>
      </div>
    );
  }

  return null;
}

export default function InfiniteTimeline({ day, sessions, activities, emotions, alters, hasData, isToday }) {
  const [collapsed, setCollapsed] = useState(!hasData);
  const dayStart = useMemo(() => startOfDay(day), [day]);

  // Only show hours 0-23
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const containerHeight = 24 * HOUR_HEIGHT;

  // Build alter segments
  const alterEntries = useMemo(() => {
    const byAlter = {};
    sessions.forEach((session) => {
      const ids = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
      ids.forEach((alterId) => {
        const startMins = Math.max(0, minutesInDay(new Date(session.start_time), dayStart));
        const endTime = session.end_time ? new Date(session.end_time) : (session.is_active && isToday ? new Date() : new Date(dayStart.getTime() + 23 * 60 * 60000));
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
          last.isActive = last.isActive || seg.isActive;
        } else {
          mergedSegs.push({ ...seg });
        }
      });
      mergedSegs.forEach((seg, i) => merged.push({ alterId, ...seg, key: `${alterId}-${i}` }));
    });
    return merged;
  }, [sessions, dayStart, isToday]);

  // Pack into columns
  const columns = useMemo(() => {
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

  // Events positioned
  const events = useMemo(() => {
    const evts = [];
    activities.forEach((a) => {
      const mins = Math.max(0, minutesInDay(new Date(a.timestamp), dayStart));
      evts.push({ type: "activity", mins, data: a });
    });
    emotions.forEach((e) => {
      const mins = Math.max(0, minutesInDay(new Date(e.timestamp), dayStart));
      evts.push({ type: "emotion", mins, data: e });
    });
    return evts.sort((a, b) => a.mins - b.mins);
  }, [activities, emotions, dayStart]);

  const EVENTS_COL_WIDTH = 140;
  const alterColumnsLeft = EVENTS_COL_WIDTH + LABEL_WIDTH;
  const totalWidth = alterColumnsLeft + Math.max(1, columns.length) * COL_WIDTH;

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
            </div>
          )}
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <div className="overflow-x-auto border-t border-border">
          <div className="overflow-y-auto max-h-96">
            <div className="relative" style={{ height: `${containerHeight}px`, minWidth: `${totalWidth}px` }}>
              {/* Hour grid lines */}
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute flex items-start"
                  style={{ top: `${h * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px`, left: `${EVENTS_COL_WIDTH}px`, right: 0 }}
                >
                  <div className="flex-shrink-0 text-xs text-muted-foreground pt-1 pr-2 text-right" style={{ width: `${LABEL_WIDTH}px` }}>
                    {format(new Date(dayStart.getTime() + h * 60 * 60000), "h a")}
                  </div>
                  <div className="flex-1 border-t border-border/30 mt-2" />
                </div>
              ))}

              {/* Events column */}
              <div className="absolute" style={{ left: 0, top: 0, width: `${EVENTS_COL_WIDTH}px`, height: `${containerHeight}px` }}>
                {events.map((evt, idx) => (
                  <EventPill key={`${evt.type}-${idx}`} event={evt} alters={alters} />
                ))}
              </div>

              {/* Alter columns */}
              {columns.map((col, colIdx) => (
                <div
                  key={colIdx}
                  className="absolute"
                  style={{ left: `${alterColumnsLeft + colIdx * COL_WIDTH}px`, top: 0, width: `${COL_WIDTH}px`, height: `${containerHeight}px` }}
                >
                  {col.map((entry) => {
                    const alter = alters.find((a) => a.id === entry.alterId);
                    const color = alter?.color || "#9333ea";
                    const topPx = (entry.startMins / 60) * HOUR_HEIGHT;
                    const heightPx = ((entry.endMins - entry.startMins) / 60) * HOUR_HEIGHT;
                    return <AlterAvatar key={entry.key} alter={alter} color={color} topPx={topPx} heightPx={heightPx} />;
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