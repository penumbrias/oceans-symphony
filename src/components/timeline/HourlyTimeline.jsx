import React, { useMemo, useState } from "react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { format, differenceInMinutes } from "date-fns";
import { Activity, Heart } from "lucide-react";

const HOUR_HEIGHT = 60; // px per hour
const LABEL_WIDTH = 52; // px for time label column
const EVENTS_WIDTH = 130; // px for events column on the left
const COL_WIDTH = 40; // px per alter column

function minutesFromHourStart(date, firstHour, dayStart) {
  return differenceInMinutes(date, dayStart) - firstHour * 60;
}

function AlterAvatar({ alter, color, heightPx, topOffsetPx }) {
  const resolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);
  const [imgError, setImgError] = useState(false);
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{ top: `${topOffsetPx}px`, left: 0, right: 0 }}
    >
      <div
        className="w-9 h-9 rounded-full flex-shrink-0 border-2 border-background overflow-hidden flex items-center justify-center"
        style={{ backgroundColor: color }}
        title={alter?.name}
      >
        {resolvedUrl && !imgError ? (
          <img src={resolvedUrl} alt={alter?.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <span className="text-xs font-bold text-white">
            {alter?.name?.charAt(0)?.toUpperCase() || "?"}
          </span>
        )}
      </div>
      <div
        className="w-0.5 rounded-full mt-0.5"
        style={{
          height: `${Math.max(heightPx - 36, 4)}px`,
          background: `linear-gradient(to bottom, ${color}, ${color}40)`,
        }}
      />
    </div>
  );
}

export default function HourlyTimeline({ hours, sessions, activities, emotions, alters, dayStart }) {
  const [expandedItem, setExpandedItem] = useState(null);

  const totalMinutes = hours.length * 60;
  const containerHeight = hours.length * HOUR_HEIGHT;
  const firstHour = hours[0]?.getHours() ?? 0;

  // Build alter entries, merging sessions for the same alter that overlap or are within 2 mins
  const alterEntries = useMemo(() => {
    // Collect raw segments per alter
    const byAlter = {};
    sessions.forEach((session) => {
      const ids = [
  ...(session.primary_alter_id ? [session.primary_alter_id] : []),
  ...(session.co_fronter_ids || [])
].filter(Boolean);
      ids.forEach((alterId) => {
        const startMins = minutesFromHourStart(new Date(session.start_time), firstHour, dayStart);
        const endTime = session.end_time ? new Date(session.end_time) : null;
        const endMins = endTime
          ? minutesFromHourStart(endTime, firstHour, dayStart)
          : startMins + 30;
        if (!byAlter[alterId]) byAlter[alterId] = [];
        byAlter[alterId].push({
          startMins: Math.max(0, startMins),
          endMins: Math.min(totalMinutes, Math.max(endMins, startMins + 8)),
          isActive: session.is_active && !session.end_time,
        });
      });
    });

    // Merge overlapping/adjacent segments per alter
    const merged = [];
    Object.entries(byAlter).forEach(([alterId, segments]) => {
      const sorted = [...segments].sort((a, b) => a.startMins - b.startMins);
      const mergedSegs = [];
      sorted.forEach((seg) => {
        if (mergedSegs.length === 0) {
          mergedSegs.push({ ...seg });
        } else {
          const last = mergedSegs[mergedSegs.length - 1];
          // Merge if overlapping or within 2 minutes
          if (seg.startMins <= last.endMins + 2) {
            last.endMins = Math.max(last.endMins, seg.endMins);
            last.isActive = last.isActive || seg.isActive;
          } else {
            mergedSegs.push({ ...seg });
          }
        }
      });
      mergedSegs.forEach((seg, i) => {
        merged.push({ alterId, ...seg, key: `${alterId}-${i}` });
      });
    });

    return merged;
  }, [sessions, dayStart, firstHour, totalMinutes]);

  // Assign each alter entry to a column (greedy packing)
  const columnsWithEntries = useMemo(() => {
    const columns = [];
    // Sort by startMins for consistent column assignment
    const sorted = [...alterEntries].sort((a, b) => a.startMins - b.startMins);
    sorted.forEach((entry) => {
      let placed = false;
      for (const col of columns) {
        const lastInCol = col[col.length - 1];
        if (lastInCol.endMins <= entry.startMins + 2) {
          col.push(entry);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([entry]);
    });
    return columns;
  }, [alterEntries]);

  // Events (activities + emotions) with time positioning
  const events = useMemo(() => {
    const evts = [];
    activities.forEach((a) => {
      const mins = minutesFromHourStart(new Date(a.timestamp), firstHour, dayStart);
      evts.push({ type: "activity", mins: Math.max(0, mins), data: a });
    });
    emotions.forEach((e) => {
      const mins = minutesFromHourStart(new Date(e.timestamp), firstHour, dayStart);
      evts.push({ type: "emotion", mins: Math.max(0, mins), data: e });
    });
    return evts.sort((a, b) => a.mins - b.mins);
  }, [activities, emotions, dayStart, firstHour]);

  // Layout: [events | time label | alter columns]
  const alterColumnsLeft = EVENTS_WIDTH + LABEL_WIDTH;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="overflow-y-auto max-h-[70vh]">
        <div
          className="relative"
          style={{ height: `${containerHeight}px`, minWidth: "320px" }}
        >
          {/* Hour grid lines + labels */}
          {hours.map((hour, i) => (
            <div
              key={i}
              className="absolute flex items-start"
              style={{
                top: `${i * HOUR_HEIGHT}px`,
                height: `${HOUR_HEIGHT}px`,
                left: `${EVENTS_WIDTH}px`,
                right: 0,
              }}
            >
              <div
                className="flex-shrink-0 text-xs text-muted-foreground pt-1 pr-2 text-right"
                style={{ width: `${LABEL_WIDTH}px` }}
              >
                {format(hour, "h a")}
              </div>
              <div className="flex-1 border-t border-border/40 mt-2" />
            </div>
          ))}

          {/* Events column — far left, time-positioned */}
          <div
            className="absolute"
            style={{ left: 0, top: 0, width: `${EVENTS_WIDTH}px`, height: `${containerHeight}px` }}
          >
            {events.map((evt, idx) => {
              const topPx = (evt.mins / 60) * HOUR_HEIGHT;
              const key = `${evt.type}-${idx}`;
              const isExpanded = expandedItem === key;

              if (evt.type === "activity") {
                const a = evt.data;
                return (
                  <div
                    key={key}
                    className="absolute left-1 right-1 cursor-pointer"
                    style={{ top: `${topPx}px` }}
                    onClick={() => setExpandedItem(isExpanded ? null : key)}
                  >
                    <div className="flex items-start gap-1.5">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: a.color || "hsl(var(--primary))" }}
                      >
                        <Activity className="w-3 h-3 text-white" />
                      </div>
                      <div className="text-xs pt-0.5 overflow-hidden">
                        <p className="font-semibold leading-tight truncate">{a.activity_name}</p>
                        {isExpanded && (
                          <>
                            <p className="text-muted-foreground">{format(new Date(a.timestamp), "h:mm a")}</p>
                            {a.duration_minutes && (
                              <p className="text-muted-foreground">{a.duration_minutes}m</p>
                            )}
                            {a.notes && <p className="italic text-muted-foreground">{a.notes}</p>}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              if (evt.type === "emotion") {
                const e = evt.data;
                return (
                  <div
                    key={key}
                    className="absolute left-1 right-1 cursor-pointer"
                    style={{ top: `${topPx}px` }}
                    onClick={() => setExpandedItem(isExpanded ? null : key)}
                  >
                    <div className="flex items-start gap-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-destructive/20">
                        <Heart className="w-3 h-3 text-destructive" />
                      </div>
                      <div className="text-xs pt-0.5 overflow-hidden">
                        {isExpanded ? (
                          <>
                            <p className="text-muted-foreground">{format(new Date(e.timestamp), "h:mm a")}</p>
                            {e.emotions?.length > 0 && (
                              <div className="flex gap-1 flex-wrap mt-0.5">
                                {e.emotions.map((em) => (
                                  <span key={em} className="px-1 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                                    {em}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="font-semibold leading-tight text-muted-foreground truncate">Check-in</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>

          {/* Alter columns — after label */}
          {columnsWithEntries.map((col, colIdx) => (
            <div
              key={colIdx}
              className="absolute"
              style={{
                left: `${alterColumnsLeft + colIdx * COL_WIDTH}px`,
                top: 0,
                width: `${COL_WIDTH}px`,
                height: `${containerHeight}px`,
              }}
            >
              {col.map((entry) => {
                const alter = alters.find((a) => a.id === entry.alterId);
                const color = alter?.color || "#9333ea";
                const topPx = (entry.startMins / 60) * HOUR_HEIGHT;
                const heightPx = ((entry.endMins - entry.startMins) / 60) * HOUR_HEIGHT;
                return (
                  <AlterAvatar
                    key={entry.key}
                    alter={alter}
                    color={color}
                    topOffsetPx={topPx}
                    heightPx={heightPx}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}