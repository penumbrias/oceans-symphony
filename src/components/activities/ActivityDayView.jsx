import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { format } from "date-fns";
import { ArrowLeft, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { parseDate } from "@/lib/dateUtils";
import {
  emotionColor,
  getActivityColor,
  getActivitiesForSlot,
  getAlterIdsForSlot,
  getEmotionsForSlot,
} from "./activityHelpers";

const INTERVAL = 60;
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h) {
  const period = h < 12 ? "am" : "pm";
  return `${h % 12 || 12}${period}`;
}

// Build a list of "segments": either an activity hour or a collapsed empty band
function buildSegments(hours, getSlotData) {
  const segments = [];
  let emptyBand = null;

  for (const hour of hours) {
    const data = getSlotData(hour);
    const isEmpty = data.timed.length === 0 && data.logged.length === 0;

    if (isEmpty) {
      if (!emptyBand) {
        emptyBand = { type: "empty", startHour: hour, endHour: hour };
      } else {
        emptyBand.endHour = hour;
      }
    } else {
      if (emptyBand) { segments.push(emptyBand); emptyBand = null; }
      segments.push({ type: "active", hour, data });
    }
  }
  if (emptyBand) segments.push(emptyBand);
  return segments;
}

function AlterAvatar({ alterId, alters }) {
  const alter = alters.find(a => a.id === alterId);
  return (
    <div
      className="w-5 h-5 rounded-full border border-white/60 overflow-hidden flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: alter?.color || "#9333ea" }}
      title={alter?.name}
    >
      {alter?.avatar_url
        ? <img src={alter.avatar_url} alt={alter?.name} className="w-full h-full object-cover" />
        : <span className="font-bold text-white" style={{ fontSize: 8 }}>{alter?.name?.charAt(0)?.toUpperCase() || "?"}</span>
      }
    </div>
  );
}

function ActivityBlock({ activity, getColor, alters, emotions, alterIds }) {
  const color = getColor(activity);
  return (
    <div
      className="rounded-lg overflow-hidden relative"
      style={{ backgroundColor: color, minHeight: 72 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Emotions + alters overlay — top right */}
      {(emotions.length > 0 || alterIds.length > 0) && (
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10">
          {alterIds.length > 0 && (
            <div className="flex gap-0.5">
              {alterIds.slice(0, 4).map(id => <AlterAvatar key={id} alterId={id} alters={alters} />)}
            </div>
          )}
          {emotions.length > 0 && (
            <div className="flex gap-0.5 flex-wrap justify-end">
              {emotions.slice(0, 4).map((em, i) => (
                <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: emotionColor(em) }} title={em} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-3 pr-14">
        <p className="font-bold text-white text-base leading-tight">{activity.activity_name}</p>
        {activity.duration_minutes > 0 && (
          <p className="text-white/80 text-xs mt-0.5">{activity.duration_minutes}m</p>
        )}
        {activity.notes && (
          <p className="text-white/70 text-xs italic mt-1 leading-snug">{activity.notes}</p>
        )}
      </div>
    </div>
  );
}

function LoggedPill({ activity, getColor }) {
  const color = getColor(activity);
  return (
    <div className="flex items-start gap-2">
      <div className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: color }} />
      <div>
        <span className="font-medium text-foreground text-sm">{activity.activity_name}</span>
        {activity.notes && <p className="text-xs text-muted-foreground italic leading-snug">{activity.notes}</p>}
      </div>
    </div>
  );
}

export default function ActivityDayView({
  date,
  activities,
  alters = [],
  frontingHistory = [],
  onClose,
  onActivityClick,
  onTimeRangeSelect,
}) {
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list(),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const catById = useMemo(() => {
    const m = {};
    categories.forEach(c => { m[c.id] = c; });
    return m;
  }, [categories]);

  const dateStr = format(date, "yyyy-MM-dd");
  const isToday = dateStr === format(new Date(), "yyyy-MM-dd");

  const dayActivities = useMemo(() =>
    activities.filter(a => format(parseDate(a.timestamp), "yyyy-MM-dd") === dateStr),
    [activities, dateStr]
  );

  const totalDuration = useMemo(() =>
    dayActivities.reduce((s, a) => s + (a.duration_minutes || 0), 0),
    [dayActivities]
  );

  const getColor = useCallback((act) => getActivityColor(act, catById), [catById]);

  const getSlotData = useCallback((hour) => {
    const { timed, logged } = getActivitiesForSlot(date, hour, 0, INTERVAL, dayActivities);
    const alterIds = getAlterIdsForSlot(date, hour, 0, INTERVAL, frontingHistory);
    const emotions = getEmotionsForSlot(date, hour, 0, INTERVAL, dayActivities, emotionCheckIns);
    // Only show alters if there are activities in this slot
    const hasActivities = timed.length > 0 || logged.length > 0;
    return { timed, logged, alterIds: hasActivities ? alterIds : [], emotions };
  }, [date, dayActivities, frontingHistory, emotionCheckIns]);

  const segments = useMemo(() => buildSegments(ALL_HOURS, getSlotData), [getSlotData]);

  // Now line
  const [nowMins, setNowMins] = useState(() => {
    const n = new Date(); return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    if (!isToday) return;
    const t = setInterval(() => {
      const n = new Date(); setNowMins(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(t);
  }, [isToday]);

  // ESC to close
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Swipe-down to close
  const touchStartY = useRef(null);
  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e) => {
    if (touchStartY.current !== null && e.changedTouches[0].clientY - touchStartY.current > 80) onClose();
    touchStartY.current = null;
  };

  // Auto-scroll to current time or first activity
  const scrollRef = useRef(null);
  const nowLineRef = useRef(null);
  const firstActivityRef = useRef(null);
  useEffect(() => {
    setTimeout(() => {
      if (isToday && nowLineRef.current) {
        nowLineRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
      } else if (firstActivityRef.current) {
        firstActivityRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }, 100);
  }, [isToday]);

  const handleAddNow = () => {
    const now = new Date();
    onTimeRangeSelect(date, now.getHours(), null, now.getMinutes(), null);
  };

  // Track which hours are "active" for now-line positioning
  // We render a flat list, so track cumulative pixel offset manually
  // Instead, use a ref on each segment row for the now line
  const nowHour = isToday ? Math.floor(nowMins / 60) : null;

  let firstActivitySet = false;

  return (
    <div
      className="fixed inset-0 bg-background z-50 flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-foreground leading-tight">
            {format(date, "EEEE, MMMM d")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {dayActivities.length > 0
              ? `${dayActivities.length} activit${dayActivities.length !== 1 ? "ies" : "y"}${totalDuration > 0 ? ` · ${Math.floor(totalDuration / 60)}h${totalDuration % 60 > 0 ? ` ${totalDuration % 60}m` : ""}` : ""}`
              : "No activities"}
          </p>
        </div>
        <Button size="sm" onClick={handleAddNow} className="gap-1.5 flex-shrink-0">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {/* Scrollable timeline */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="relative" style={{ paddingLeft: 52, paddingBottom: 80 }}>

          {segments.map((seg, segIdx) => {
            // Collapsed empty band
            if (seg.type === "empty") {
              // Check if now is in this band
              const nowInBand = nowHour !== null && nowHour >= seg.startHour && nowHour <= seg.endHour;
              return (
                <div
                  key={`empty-${seg.startHour}`}
                  ref={nowInBand ? nowLineRef : null}
                  className="relative flex items-center group"
                  style={{ height: 32 }}
                  onClick={() => onTimeRangeSelect(date, seg.startHour, null, 0, null)}
                >
                  {/* Hour label */}
                  <div
                    className="absolute left-0 text-right pr-3 select-none"
                    style={{ width: 48, fontSize: 11, color: "hsl(var(--muted-foreground))", opacity: 0.5 }}
                  >
                    {formatHour(seg.startHour)}
                  </div>
                  {/* Band label */}
                  <div className="flex-1 border-t border-border/20 flex items-center cursor-pointer hover:bg-primary/5 transition-colors rounded-r">
                    <span className="text-xs text-muted-foreground/40 px-2 group-hover:text-muted-foreground/60 transition-colors select-none">
                      {seg.startHour === seg.endHour
                        ? formatHour(seg.startHour)
                        : `${formatHour(seg.startHour)} – ${formatHour(seg.endHour + 1)}`}
                      {" · no activities"}
                    </span>
                  </div>
                  {/* Now line in empty band */}
                  {nowInBand && (
                    <div className="absolute left-0 right-0 pointer-events-none flex items-center z-10" style={{ top: "50%" }}>
                      <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" style={{ marginLeft: 44 }} />
                      <div className="flex-1 h-0.5 bg-primary opacity-80" />
                    </div>
                  )}
                </div>
              );
            }

            // Active hour row
            const { timed, logged, alterIds, emotions } = seg.data;
            const isCurrentHour = isToday && new Date().getHours() === seg.hour;
            const isFirstActivity = !firstActivitySet && (timed.length > 0 || logged.length > 0);
            if (isFirstActivity) firstActivitySet = true;

            return (
              <div
                key={`active-${seg.hour}`}
                ref={isToday && isCurrentHour ? nowLineRef : (isFirstActivity ? firstActivityRef : null)}
                className="relative flex"
                style={{ minHeight: 80 }}
              >
                {/* Hour label */}
                <div
                  className="absolute left-0 top-3 text-right pr-3 select-none"
                  style={{
                    width: 48,
                    fontSize: 13,
                    fontWeight: isCurrentHour ? 700 : 500,
                    color: isCurrentHour ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"
                  }}
                >
                  {formatHour(seg.hour)}
                </div>

                {/* Now line */}
                {isToday && isCurrentHour && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none flex items-center z-10"
                    style={{ top: ((nowMins % 60) / 60) * 80 }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" style={{ marginLeft: 44 }} />
                    <div className="flex-1 h-0.5 bg-primary opacity-80" />
                  </div>
                )}

                {/* Content area */}
                <div
                  className={`flex-1 border-t border-border/20 px-2 py-2 space-y-2
                    ${isCurrentHour ? "bg-primary/5" : ""}
                  `}
                  onClick={() => {
                    const allActs = [...timed, ...logged];
                    if (allActs.length > 0) onActivityClick?.(allActs);
                    else onTimeRangeSelect(date, seg.hour, null, 0, null);
                  }}
                >
                  {timed.map(a => (
                    <ActivityBlock
                      key={a.id}
                      activity={a}
                      getColor={getColor}
                      alters={alters}
                      emotions={emotions}
                      alterIds={alterIds}
                    />
                  ))}
                  {logged.map(a => (
                    <LoggedPill key={a.id} activity={a} getColor={getColor} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating add button */}
      <button
        onClick={handleAddNow}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center text-white z-20 hover:bg-primary/90 transition-colors"
        aria-label="Add activity"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}