import React, { useMemo, useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { Activity, Heart } from "lucide-react";

const HOUR_HEIGHT = 60; // px per hour
const LABEL_WIDTH = 52; // px for time label column

function minutesFromDayStart(date, dayStart) {
  return Math.max(0, differenceInMinutes(date, dayStart));
}

function AlterAvatar({ alter, color, heightPx, topOffsetPx }) {
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{ top: `${topOffsetPx}px`, left: 0, right: 0 }}
    >
      {/* Circle */}
      <div
        className="w-9 h-9 rounded-full flex-shrink-0 border-2 border-background overflow-hidden flex items-center justify-center"
        style={{ backgroundColor: color }}
        title={alter?.name}
      >
        {alter?.avatar_url ? (
          <img src={alter.avatar_url} alt={alter?.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-bold text-white">
            {alter?.name?.charAt(0)?.toUpperCase() || "?"}
          </span>
        )}
      </div>
      {/* Duration line */}
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

  // Build alter lanes: each session → each alter gets a lane slot
  // We pack alters into columns so concurrent ones are side-by-side
  const alterEntries = useMemo(() => {
    const entries = [];
    sessions.forEach((session) => {
      const ids = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
      ids.forEach((alterId) => {
        const startMins = minutesFromDayStart(new Date(session.start_time), dayStart) - (hours[0].getHours() * 60);
        const endTime = session.end_time ? new Date(session.end_time) : null;
        const endMins = endTime
          ? minutesFromDayStart(endTime, dayStart) - (hours[0].getHours() * 60)
          : startMins + 30; // active sessions get 30min placeholder
        entries.push({
          alterId,
          startMins: Math.max(0, startMins),
          endMins: Math.min(totalMinutes, Math.max(endMins, startMins + 8)),
          isActive: session.is_active && !session.end_time,
          sessionId: session.id,
        });
      });
    });
    return entries;
  }, [sessions, dayStart, hours, totalMinutes]);

  // Assign each alter entry to a column (pack greedily)
  const columnsWithEntries = useMemo(() => {
    const columns = [];
    alterEntries.forEach((entry) => {
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

  // Events (activities + emotions) positioned by time
  const events = useMemo(() => {
    const evts = [];
    activities.forEach((a) => {
      const mins = minutesFromDayStart(new Date(a.timestamp), dayStart) - hours[0].getHours() * 60;
      evts.push({ type: "activity", mins: Math.max(0, mins), data: a });
    });
    emotions.forEach((e) => {
      const mins = minutesFromDayStart(new Date(e.timestamp), dayStart) - hours[0].getHours() * 60;
      evts.push({ type: "emotion", mins: Math.max(0, mins), data: e });
    });
    return evts;
  }, [activities, emotions, dayStart, hours]);

  const colWidth = 40; // px per alter column
  const eventsLeft = LABEL_WIDTH + columnsWithEntries.length * colWidth + 8;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Scrollable container */}
      <div className="overflow-y-auto max-h-[70vh]">
        <div
          className="relative"
          style={{ height: `${containerHeight}px`, minWidth: "320px" }}
        >
          {/* Hour grid lines + labels */}
          {hours.map((hour, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 flex items-start"
              style={{ top: `${i * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
            >
              {/* Time label */}
              <div
                className="flex-shrink-0 text-xs text-muted-foreground pt-1 pr-2 text-right"
                style={{ width: `${LABEL_WIDTH}px` }}
              >
                {format(hour, "h a")}
              </div>
              {/* Horizontal grid line */}
              <div className="flex-1 border-t border-border/40 mt-2" />
            </div>
          ))}

          {/* Alter columns */}
          {columnsWithEntries.map((col, colIdx) => (
            <div
              key={colIdx}
              className="absolute"
              style={{
                left: `${LABEL_WIDTH + colIdx * colWidth}px`,
                top: 0,
                width: `${colWidth}px`,
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
                    key={`${entry.sessionId}-${entry.alterId}`}
                    alter={alter}
                    color={color}
                    topOffsetPx={topPx}
                    heightPx={heightPx}
                  />
                );
              })}
            </div>
          ))}

          {/* Events (activities + emotions) */}
          <div
            className="absolute"
            style={{ left: `${eventsLeft}px`, top: 0, right: 8 }}
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
                    className="absolute left-0 right-0 cursor-pointer"
                    style={{ top: `${topPx}px` }}
                    onClick={() => setExpandedItem(isExpanded ? null : key)}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: a.color || "hsl(var(--primary))" }}
                      >
                        <Activity className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="text-xs pt-0.5">
                        <p className="font-semibold leading-tight">{a.activity_name}</p>
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
                    className="absolute left-0 right-0 cursor-pointer"
                    style={{ top: `${topPx}px` }}
                    onClick={() => setExpandedItem(isExpanded ? null : key)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-destructive/20">
                        <Heart className="w-3.5 h-3.5 text-destructive" />
                      </div>
                      <div className="text-xs pt-0.5">
                        {isExpanded ? (
                          <>
                            <p className="text-muted-foreground">{format(new Date(e.timestamp), "h:mm a")}</p>
                            {e.emotions?.length > 0 && (
                              <div className="flex gap-1 flex-wrap mt-0.5">
                                {e.emotions.map((em) => (
                                  <span key={em} className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                                    {em}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="font-semibold leading-tight text-muted-foreground">Check-in</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}