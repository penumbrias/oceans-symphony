import React, { useState, useMemo, useRef, useCallback } from "react";
import { format } from "date-fns";
import { parseDate } from "@/lib/dateUtils";
import { Plus, Eye, EyeOff, Settings, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import ActivityCustomizationMenu from "@/components/activities/ActivityCustomizationMenu";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

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

export default function ActivityWeeklyGrid({
  weekDays,
  activities,
  alters = [],
  frontingHistory = [],
  onTimeRangeSelect,
  onActivityClick,
  addMode = false,
  onToggleAddMode,
  highlightActivityId = null,
}) {
  const [showAlters, setShowAlters] = useState(false);
  const [showEmotions, setShowEmotions] = useState(false);
  const [showCustomMenu, setShowCustomMenu] = useState(false);
  const [expandedCells, setExpandedCells] = useState(new Set());
  // Two-tap add mode: first tap sets start, second sets end
  const [pendingStartCell, setPendingStartCell] = useState(null); // { date, hour }
  const lastTapRef = useRef({ key: "", time: 0 });

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

  const getEmotionsForHour = (date, hour) => {
    const hourStart = new Date(date);
    hourStart.setHours(hour, 0, 0, 0);
    const hourEnd = new Date(date);
    hourEnd.setHours(hour + 1, 0, 0, 0);
    const all = [];
    emotionCheckIns.forEach((e) => {
      const t = parseDate(e.timestamp);
      if (t >= hourStart && t < hourEnd) all.push(...(e.emotions || []));
    });
    return [...new Set(all)];
  };

  const getActivitiesForHour = (date, hour) => {
    const slotStart = new Date(date);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(date);
    slotEnd.setHours(hour + 1, 0, 0, 0);
    return activities.filter((a) => {
      const actStart = parseDate(a.timestamp);
      if (!a.duration_minutes) {
        // No duration: point-in-time, only show in the hour it started
        return actStart >= slotStart && actStart < slotEnd;
      }
      const actEnd = new Date(actStart.getTime() + a.duration_minutes * 60 * 1000);
      return actStart < slotEnd && actEnd > slotStart;
    });
  };

  // Resolve live color for an activity from its categories
  const getActivityColor = (act) => {
    const ids = act.activity_category_ids || [];
    for (const id of ids) {
      const cat = catById[id];
      if (cat?.color) return cat.color;
    }
    return act.color || "hsl(var(--primary))";
  };

  const getAlterIdsForHour = (date, hour) => {
    const hourStart = new Date(date);
    hourStart.setHours(hour, 0, 0, 0);
    const hourEnd = new Date(date);
    hourEnd.setHours(hour + 1, 0, 0, 0);
    const sessions = frontingHistory.filter((s) => {
      const start = parseDate(s.start_time);
      const end = s.end_time ? parseDate(s.end_time) : new Date();
      return start < hourEnd && end > hourStart;
    });
    const ids = new Set();
    sessions.forEach((s) => {
      if (s.primary_alter_id) ids.add(s.primary_alter_id);
      (s.co_fronter_ids || []).forEach((id) => ids.add(id));
    });
    return [...ids];
  };

  const getDayStats = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const dayActivities = activities.filter(a => format(parseDate(a.timestamp), "yyyy-MM-dd") === dateStr);
    const totalDuration = dayActivities.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
    return { count: dayActivities.length, duration: totalDuration };
  };

  const cellKey = (date, hour) => `${format(date, "yyyy-MM-dd")}-${hour}`;

  const handleCellTap = useCallback((date, hour) => {
    const key = cellKey(date, hour);
    const now = Date.now();
    const cellActivities = getActivitiesForHour(date, hour);

    const isDoubleTap = lastTapRef.current.key === key && now - lastTapRef.current.time < 300;
    lastTapRef.current = { key, time: now };

    if (isDoubleTap) {
      if (cellActivities.length > 0) {
        // Double tap filled cell → open edit modal
        onActivityClick?.(cellActivities);
      } else if (!addMode) {
        // Double tap empty cell → enable add mode with this cell as start
        onToggleAddMode?.();
        setPendingStartCell({ date, hour });
      }
      return;
    }

    if (addMode) {
      if (!pendingStartCell) {
        // First tap: select start
        setPendingStartCell({ date, hour });
      } else {
        // Second tap: open modal with start → end range
        const startHour = Math.min(pendingStartCell.hour, hour);
        const endHour = Math.max(pendingStartCell.hour, hour);
        onTimeRangeSelect(pendingStartCell.date, startHour, endHour);
        setPendingStartCell(null);
      }
    } else if (cellActivities.length > 0) {
      // Not in add mode: tap filled cell to expand/collapse
      setExpandedCells((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    }
  }, [addMode, pendingStartCell, onTimeRangeSelect, onActivityClick, activities, emotionCheckIns]);

  // When add mode turns off, clear pending start
  const handleToggleAddMode = () => {
    setPendingStartCell(null);
    onToggleAddMode?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2 flex-wrap">
        <Button
          variant={addMode ? "default" : "outline"}
          size="sm"
          onClick={handleToggleAddMode}
          className="gap-2"
        >
          {addMode ? <><X className="w-4 h-4" /> Cancel Add</> : <><Plus className="w-4 h-4" /> Add Activity</>}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowEmotions(!showEmotions)} className="gap-2">
          {showEmotions ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showEmotions ? "Hide" : "Show"} Emotions
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowAlters(!showAlters)} className="gap-2">
          {showAlters ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showAlters ? "Hide" : "Show"} Alters
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowCustomMenu(true)} className="gap-2">
          <Settings className="w-4 h-4" /> Customize
        </Button>
      </div>

      {addMode && (
        <div className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-xs text-primary font-medium">
          {pendingStartCell
            ? `Start selected at ${String(pendingStartCell.hour).padStart(2, "0")}:00 — now tap an end cell`
            : "Add mode active — tap a cell to select start time, then tap another for end time"}
        </div>
      )}

      {showCustomMenu && <ActivityCustomizationMenu onClose={() => setShowCustomMenu(false)} />}

      <div className="overflow-x-auto">
        <div className="inline-grid gap-0 border border-border rounded-lg overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[80px_repeat(7,120px)] gap-0 bg-card border-b border-border">
            <div className="bg-muted p-2 sticky left-0 z-20"></div>
            {weekDays.map((date) => {
              const stats = getDayStats(date);
              return (
                <div key={format(date, "yyyy-MM-dd")} className="p-3 text-center border-r border-border">
                  <div className="text-xs font-semibold text-muted-foreground">{format(date, "EEE")}</div>
                  <div className="text-lg font-bold text-foreground">{format(date, "d")}</div>
                  {stats.count > 0 && (
                    <div className="text-xs text-primary mt-1">
                      {stats.count} {stats.duration > 0 && `• ${Math.round(stats.duration / 60)}h`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Time blocks */}
          {HOURS.map((hour) => (
            <div key={hour} className="grid grid-cols-[80px_repeat(7,120px)] gap-0 border-b border-border/50">
              <div className="bg-muted px-2 py-3 text-xs font-medium text-muted-foreground text-right sticky left-0 z-10 border-r border-border/50">
                {String(hour).padStart(2, "0")}:00
              </div>
              {weekDays.map((date) => {
                const key = cellKey(date, hour);
                const cellActivities = getActivitiesForHour(date, hour);
                const alterIds = getAlterIdsForHour(date, hour);
                const emotions = getEmotionsForHour(date, hour);
                const isExpanded = expandedCells.has(key);

                return (
                  <button
                    key={key}
                    onClick={() => handleCellTap(date, hour)}
                    className={`border-r border-border/50 p-0 transition-all flex flex-col items-center justify-start relative group cursor-pointer overflow-hidden ${
                      isExpanded ? "min-h-32" : "min-h-16"
                    } ${
                      cellActivities.length === 0
                        ? addMode
                          ? "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          : "text-muted-foreground"
                        : "text-white font-medium text-xs"
                    }`}
                    style={{ userSelect: "none" }}
                  >
                    {/* Highlight from timeline nav */}
                    {highlightActivityId && cellActivities.some(a => a.id === highlightActivityId) && (
                      <div className="absolute inset-0 ring-4 ring-yellow-400 ring-inset pointer-events-none z-20 rounded animate-pulse" />
                    )}
                    {/* Pending start highlight */}
                    {addMode && pendingStartCell && pendingStartCell.date.toDateString() === date.toDateString() && pendingStartCell.hour === hour && (
                      <div className="absolute inset-0 ring-2 ring-primary ring-inset pointer-events-none z-20 rounded" />
                    )}

                    {cellActivities.length > 0 ? (
                      <>
                        {/* Color background strips */}
                        <div className="absolute inset-0 flex">
                          {cellActivities.map((a) => (
                            <div key={a.id} className="flex-1 h-full"
                              style={{ backgroundColor: getActivityColor(a) }} />
                          ))}
                        </div>
                        {/* Content overlay */}
                        <div className="relative z-10 text-center w-full px-1 pt-1.5 drop-shadow space-y-0.5">
                          <div className={`font-bold leading-tight ${isExpanded ? "text-xs" : "text-xs line-clamp-2"}`}>
                            {cellActivities.map(a => a.activity_name).join(" + ")}
                          </div>
                          {isExpanded && (
                            <div className="text-xs text-white/90 space-y-0.5 text-left px-0.5">
                              {cellActivities.map(a => (
                                <div key={a.id}>
                                  <span className="font-semibold">{a.activity_name}</span>
                                  {a.duration_minutes ? <span className="ml-1 opacity-80">{a.duration_minutes}m</span> : null}
                                  {a.notes ? <p className="italic opacity-80 text-xs leading-tight">{a.notes}</p> : null}
                                </div>
                              ))}
                              {showEmotions && emotions.length > 0 && (
                                <div className="flex flex-wrap gap-0.5 mt-0.5">
                                  {emotions.map((em, i) => (
                                    <span key={i} className="px-1 py-0.5 rounded-full text-white font-medium"
                                      style={{ fontSize: 8, backgroundColor: emotionColor(em) }}>
                                      {em}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {showAlters && alterIds.length > 0 && (
                                <div className="flex flex-wrap gap-0.5 mt-0.5">
                                  {alterIds.slice(0, 6).map((alterId) => {
                                    const alter = alters.find(a => a.id === alterId);
                                    return (
                                      <div key={alterId}
                                        className="w-4 h-4 rounded-full border border-white/50 overflow-hidden flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: alter?.color || "rgba(255,255,255,0.3)" }}
                                        title={alter?.name}>
                                        {alter?.avatar_url
                                          ? <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                                          : <span className="font-bold text-white" style={{ fontSize: 7 }}>{alter?.name?.charAt(0)?.toUpperCase()}</span>
                                        }
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Collapsed: show small alters/emotions indicators */}
                          {!isExpanded && (
                            <>
                              {showEmotions && emotions.length > 0 && (
                                <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                                  {emotions.slice(0, 3).map((em, i) => (
                                    <span key={i} className="px-1 py-0.5 rounded-full text-white font-medium leading-none"
                                      style={{ fontSize: 7, backgroundColor: emotionColor(em) }}>
                                      {em.charAt(0).toUpperCase()}{em.slice(1, 3)}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {showAlters && alterIds.length > 0 && (
                                <div className="flex gap-0.5 justify-center flex-wrap">
                                  {alterIds.slice(0, 4).map((alterId) => {
                                    const alter = alters.find(a => a.id === alterId);
                                    return (
                                      <div key={alterId}
                                        className="w-3.5 h-3.5 rounded-full border border-white/50 overflow-hidden flex items-center justify-center"
                                        style={{ backgroundColor: alter?.color || "rgba(255,255,255,0.3)" }}
                                        title={alter?.name}>
                                        {alter?.avatar_url
                                          ? <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                                          : <span className="font-bold text-white" style={{ fontSize: 6 }}>{alter?.name?.charAt(0)?.toUpperCase()}</span>
                                        }
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Empty cell: show alter dots always, + icon only in addMode */}
                        {alterIds.length > 0 && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 p-1">
                            {showAlters
                              ? alterIds.slice(0, 3).map((alterId) => {
                                  const alter = alters.find(a => a.id === alterId);
                                  return (
                                    <div key={alterId}
                                      className="w-5 h-5 rounded-full border border-border/60 flex items-center justify-center overflow-hidden"
                                      style={{ backgroundColor: alter?.color || "hsl(var(--muted-foreground))" }}
                                      title={alter?.name}>
                                      {alter?.avatar_url
                                        ? <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                                        : <span className="font-bold text-white" style={{ fontSize: 8 }}>{alter?.name?.charAt(0)?.toUpperCase() || "?"}</span>
                                      }
                                    </div>
                                  );
                                })
                              : (
                                <div className="flex gap-0.5 flex-wrap justify-center">
                                  {alterIds.slice(0, 3).map((alterId) => {
                                    const alter = alters.find(a => a.id === alterId);
                                    return (
                                      <div key={alterId} className="w-1.5 h-1.5 rounded-full"
                                        style={{ backgroundColor: alter?.color || "hsl(var(--muted-foreground))" }} />
                                    );
                                  })}
                                </div>
                              )
                            }
                          </div>
                        )}
                        {addMode && <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}