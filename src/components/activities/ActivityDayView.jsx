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

const INTERVAL = 60; // 1-hour slots in day view
const ROW_H = 72;

function formatHour(h) {
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 || 12;
  return `${h12}${period}`;
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

  // Filter activities to this day
  const dayActivities = useMemo(() =>
    activities.filter(a => format(parseDate(a.timestamp), "yyyy-MM-dd") === dateStr),
    [activities, dateStr]
  );

  // Determine hour range: earliest activity hour to latest, min 6–23
  const { startHour, endHour } = useMemo(() => {
    if (dayActivities.length === 0) return { startHour: 6, endHour: 23 };
    let min = 23, max = 6;
    dayActivities.forEach(a => {
      const h = parseDate(a.timestamp).getHours();
      if (h < min) min = h;
      const endH = a.duration_minutes
        ? Math.min(23, Math.ceil((parseDate(a.timestamp).getHours() * 60 + parseDate(a.timestamp).getMinutes() + a.duration_minutes) / 60))
        : h;
      if (endH > max) max = endH;
    });
    return { startHour: Math.max(0, Math.min(min, 6)), endHour: Math.min(23, Math.max(max + 1, 22)) };
  }, [dayActivities]);

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

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

  const totalDuration = dayActivities.reduce((s, a) => s + (a.duration_minutes || 0), 0);

  const getColor = useCallback((act) => getActivityColor(act, catById), [catById]);

  const handleAddNow = () => {
    const now = new Date();
    onTimeRangeSelect(date, now.getHours(), null, now.getMinutes(), null);
  };

  // Now line top offset
  const nowTop = isToday
    ? ((nowMins - startHour * 60) / 60) * ROW_H
    : null;

  return (
    <div
      className="fixed inset-0 bg-background z-50 overflow-y-auto flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground leading-tight">
            {format(date, "EEEE, MMMM d, yyyy")}
          </h2>
          {dayActivities.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {dayActivities.length} activit{dayActivities.length !== 1 ? "ies" : "y"}
              {totalDuration > 0 && ` · ${Math.floor(totalDuration / 60)}h ${totalDuration % 60 > 0 ? `${totalDuration % 60}m` : ""}`.trim()}
            </p>
          )}
        </div>
        <Button size="sm" onClick={handleAddNow} className="gap-1.5 flex-shrink-0">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {/* Timeline */}
      <div className="flex-1 px-4 py-4">
        <div className="relative" style={{ paddingLeft: 52 }}>
          {/* Now line */}
          {isToday && nowTop !== null && nowTop >= 0 && nowTop <= hours.length * ROW_H && (
            <div className="absolute left-0 right-0 z-10 pointer-events-none flex items-center"
              style={{ top: nowTop }}>
              <div className="w-3 h-3 rounded-full bg-primary flex-shrink-0" style={{ marginLeft: 44 }} />
              <div className="flex-1 h-0.5 bg-primary opacity-80" />
            </div>
          )}

          {hours.map(hour => {
            const { timed, logged } = getActivitiesForSlot(date, hour, 0, INTERVAL, dayActivities);
            const alterIds = getAlterIdsForSlot(date, hour, 0, INTERVAL, frontingHistory);
            const emotions = getEmotionsForSlot(date, hour, 0, INTERVAL, dayActivities, emotionCheckIns);
            const hasContent = timed.length > 0 || logged.length > 0;
            const isCurrentHour = isToday && new Date().getHours() === hour;

            return (
              <div key={hour} className="relative flex" style={{ minHeight: ROW_H }}>
                {/* Hour label */}
                <div className="absolute left-0 top-0 w-12 text-right pr-3 pt-1 flex-shrink-0"
                  style={{ fontSize: 14, color: isCurrentHour ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))", fontWeight: isCurrentHour ? 700 : 500 }}>
                  {formatHour(hour)}
                </div>

                {/* Slot content */}
                <div
                  className={`flex-1 border-t border-border/40 cursor-pointer transition-colors rounded-r-lg min-h-[72px] px-3 py-2
                    ${isCurrentHour ? "bg-primary/5" : "hover:bg-muted/20"}
                    ${hasContent ? "" : "hover:bg-primary/5"}
                  `}
                  onClick={() => {
                    if (!hasContent) {
                      onTimeRangeSelect(date, hour, null, 0, null);
                    } else {
                      const allActs = [...timed, ...logged];
                      onActivityClick?.(allActs);
                    }
                  }}
                >
                  {/* Timed activities */}
                  {timed.map(a => (
                    <div key={a.id} className="mb-2 rounded-lg px-3 py-2"
                      style={{ backgroundColor: getColor(a) + "22", borderLeft: `3px solid ${getColor(a)}` }}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-sm">{a.activity_name}</span>
                        {a.duration_minutes && (
                          <span className="text-xs text-muted-foreground">{a.duration_minutes}m</span>
                        )}
                      </div>
                      {a.notes && <p className="text-xs text-muted-foreground italic mt-0.5 leading-snug">{a.notes}</p>}
                    </div>
                  ))}

                  {/* Logged (no-duration) activities */}
                  {logged.map(a => (
                    <div key={a.id} className="mb-1.5 flex items-start gap-2">
                      <div className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: getColor(a) }} />
                      <div>
                        <span className="font-medium text-foreground text-sm">{a.activity_name}</span>
                        {a.notes && <p className="text-xs text-muted-foreground italic leading-snug">{a.notes}</p>}
                      </div>
                    </div>
                  ))}

                  {/* Emotions */}
                  {emotions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {emotions.map((em, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full text-white font-medium"
                          style={{ fontSize: 10, backgroundColor: emotionColor(em) }}>
                          {em}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Alters */}
                  {alterIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {alterIds.map(alterId => {
                        const alter = alters.find(a => a.id === alterId);
                        return (
                          <div key={alterId} className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full border border-border overflow-hidden flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: alter?.color || "#9333ea" }}>
                              {alter?.avatar_url
                                ? <img src={alter.avatar_url} alt={alter?.name} className="w-full h-full object-cover" />
                                : <span className="font-bold text-white" style={{ fontSize: 8 }}>{alter?.name?.charAt(0)?.toUpperCase() || "?"}</span>
                              }
                            </div>
                            <span className="text-xs text-muted-foreground">{alter?.name || "Unknown"}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Empty slot hint */}
                  {!hasContent && (
                    <span className="text-xs text-muted-foreground/40">Tap to add activity</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}