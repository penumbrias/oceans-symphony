import React, { useState, useMemo, useRef } from "react";
import { format } from "date-fns";
import { Plus, Eye, EyeOff, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ActivityCustomizationMenu from "@/components/activities/ActivityCustomizationMenu";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function ActivityWeeklyGrid({
  weekDays,
  activities,
  alters = [],
  frontingHistory = [],
  onTimeRangeSelect,
  onActivityClick,
}) {
  const [showAlters, setShowAlters] = useState(false);
  const [showEmotions, setShowEmotions] = useState(false);
  const [showCustomMenu, setShowCustomMenu] = useState(false);
  const [expandedCells, setExpandedCells] = useState(new Set());
  const expandTimerRef = useRef(null);
  const detailsTimerRef = useRef(null);
  const holdFiredRef = useRef(false);

  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list(),
  });

  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const getEmotionsForActivity = (activity) => {
    const emotionCheckIn = emotionCheckIns.find(e => {
      const checkInTime = new Date(e.timestamp);
      const actTime = new Date(activity.timestamp);
      return Math.abs(checkInTime - actTime) < 300000;
    });
    return emotionCheckIn?.emotions || [];
  };

  const getActivitiesForDay = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return activities.filter(a => format(new Date(a.timestamp), "yyyy-MM-dd") === dateStr);
  };

  const getDayStats = (date) => {
    const dayActivities = getActivitiesForDay(date);
    const totalDuration = dayActivities.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
    return { count: dayActivities.length, duration: totalDuration };
  };

  const getFrontingForHour = (date, hour) => {
    const hourStart = new Date(date);
    hourStart.setHours(hour, 0, 0, 0);
    const hourEnd = new Date(date);
    hourEnd.setHours(hour + 1, 0, 0, 0);
    return frontingHistory.filter((session) => {
      const sessionStart = new Date(session.start_time);
      const sessionEnd = session.end_time ? new Date(session.end_time) : new Date();
      return sessionStart < hourEnd && sessionEnd > hourStart;
    });
  };

  const getAlterColor = (alterId) => {
    const alter = alters.find((a) => a.id === alterId);
    return alter?.color || `hsl(${Math.abs(alterId.charCodeAt(0)) % 360}, 70%, 55%)`;
  };

  const getActivitiesForHour = (date, hour) => {
    const slotStart = new Date(date);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(date);
    slotEnd.setHours(hour + 1, 0, 0, 0);

    const matching = activities.filter((a) => {
      const actStart = new Date(a.timestamp);
      const durationMs = (a.duration_minutes || 60) * 60 * 1000;
      const actEnd = new Date(actStart.getTime() + durationMs);
      return actStart < slotEnd && actEnd > slotStart;
    });

    // Collapse duplicate activity names into one entry
    const seen = new Set();
    return matching.filter((a) => {
      if (seen.has(a.activity_name)) return false;
      seen.add(a.activity_name);
      return true;
    });
  };

  const cellKey = (date, hour) => `${format(date, "yyyy-MM-dd")}-${hour}`;

  const clearPressTimers = () => {
    if (expandTimerRef.current) { clearTimeout(expandTimerRef.current); expandTimerRef.current = null; }
    if (detailsTimerRef.current) { clearTimeout(detailsTimerRef.current); detailsTimerRef.current = null; }
  };

  const handlePressStart = (date, hour) => {
    holdFiredRef.current = false;
    expandTimerRef.current = setTimeout(() => {
      holdFiredRef.current = true;
      const key = cellKey(date, hour);
      setExpandedCells((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    }, 1500);
    detailsTimerRef.current = setTimeout(() => {
      holdFiredRef.current = true;
      const cellActivities = getActivitiesForHour(date, hour);
      if (cellActivities.length > 0) onActivityClick?.(cellActivities);
    }, 3000);
  };

  const handlePressEnd = () => { clearPressTimers(); };

  const handleCellClick = (date, hour) => {
    if (holdFiredRef.current) return;
    onTimeRangeSelect(date, hour, hour);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
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

      {showCustomMenu && <ActivityCustomizationMenu onClose={() => setShowCustomMenu(false)} />}

      <div className="overflow-x-auto">
        <div className="inline-grid gap-0 border border-border rounded-lg overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[80px_repeat(7,120px)] gap-0 bg-card border-b border-border">
            <div className="bg-muted/50 p-2"></div>
            {weekDays.map((date) => {
              const stats = getDayStats(date);
              return (
                <button key={format(date, "yyyy-MM-dd")} className="p-3 text-center border-r border-border hover:bg-muted/50 transition-colors cursor-pointer group">
                  <div className="text-xs font-semibold text-muted-foreground">{format(date, "EEE")}</div>
                  <div className="text-lg font-bold text-foreground">{format(date, "d")}</div>
                  {stats.count > 0 && (
                    <div className="text-xs text-primary mt-1">
                      {stats.count} {stats.duration > 0 && `• ${Math.round(stats.duration / 60)}h`}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1 opacity-0 group-hover:opacity-100 transition-opacity">+ Quick add</div>
                </button>
              );
            })}
          </div>

          {/* Time blocks */}
          {HOURS.map((hour) => (
            <div key={hour} className="grid grid-cols-[80px_repeat(7,120px)] gap-0 border-b border-border/50">
              <div className="bg-muted/30 px-2 py-3 text-xs font-medium text-muted-foreground text-right">
                {String(hour).padStart(2, "0")}:00
              </div>
              {weekDays.map((date) => {
                const fronting = getFrontingForHour(date, hour);
                const cellActivities = getActivitiesForHour(date, hour);
                const key = cellKey(date, hour);
                const isExpanded = expandedCells.has(key);

                return (
                  <button
                    key={`${format(date, "yyyy-MM-dd")}-${hour}`}
                    onClick={() => handleCellClick(date, hour)}
                    onMouseDown={() => handlePressStart(date, hour)}
                    onMouseUp={handlePressEnd}
                    onMouseLeave={handlePressEnd}
                    onTouchStart={(e) => { e.preventDefault(); handlePressStart(date, hour); }}
                    onTouchEnd={handlePressEnd}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (cellActivities.length > 0) onActivityClick?.(cellActivities);
                    }}
                    className={`border-r border-border/50 p-0 transition-all flex flex-col items-center justify-center relative group cursor-pointer overflow-hidden ${
                      isExpanded ? "min-h-32" : "min-h-16"
                    } ${
                      cellActivities.length === 0 ? "text-muted-foreground hover:bg-primary/10 hover:text-primary" : "text-white font-medium text-xs"
                    }`}
                  >
                    {cellActivities.length > 0 ? (
                      <>
                        {/* Color strips background */}
                        <div className="absolute inset-0 flex">
                          {cellActivities.map((a) => (
                            <div
                              key={a.id}
                              className="flex-1 h-full"
                              style={{ backgroundColor: a.color || "hsl(var(--primary))" }}
                            />
                          ))}
                        </div>
                        {/* Content overlay */}
                        <div className="relative z-10 text-center space-y-1 w-full px-0.5 drop-shadow">
                          <div className="text-xs font-bold line-clamp-2 leading-tight">
                            {cellActivities.map(a => a.activity_name).join(" + ")}
                          </div>
                          {isExpanded && (
                            <div className="text-xs text-white/90 space-y-0.5">
                              {cellActivities.map(a => a.duration_minutes ? (
                                <p key={a.id}>{a.duration_minutes}m</p>
                              ) : null)}
                              {cellActivities.some(a => a.notes) && (
                                <p className="italic line-clamp-2">{cellActivities.find(a => a.notes)?.notes}</p>
                              )}
                            </div>
                          )}
                          {showEmotions && (
                            <div className="text-xs leading-tight">
                              {getEmotionsForActivity(cellActivities[0]).slice(0, 2).map(e => e.charAt(0).toUpperCase()).join("")}
                            </div>
                          )}
                          {showAlters && fronting.length > 0 && (
                            <div className="flex gap-0.5 justify-center flex-wrap">
                              {Array.from(new Set(fronting.map(s => s.primary_alter_id).filter(Boolean))).slice(0, 4).map((alterId) => {
                                const alter = alters.find((a) => a.id === alterId);
                                return (
                                  <div
                                    key={alterId}
                                    className="w-4 h-4 rounded-full border border-white/50 overflow-hidden flex items-center justify-center"
                                    style={{ backgroundColor: alter?.color || "rgba(255,255,255,0.2)" }}
                                    title={alter?.name}
                                  >
                                    {alter?.avatar_url ? (
                                      <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="font-bold text-white" style={{ fontSize: 7 }}>{alter?.name?.charAt(0)?.toUpperCase()}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        {showAlters && fronting.length > 0 && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 p-0.5">
                            {Array.from(new Set(fronting.map(s => s.primary_alter_id).filter(Boolean))).slice(0, 3).map((alterId) => {
                              const alter = alters.find(a => a.id === alterId);
                              return (
                                <div
                                  key={alterId}
                                  className="w-5 h-5 rounded-full border border-border/60 flex items-center justify-center overflow-hidden flex-shrink-0"
                                  style={{ backgroundColor: alter?.color || "hsl(var(--muted-foreground))" }}
                                  title={alter?.name}
                                >
                                  {alter?.avatar_url ? (
                                    <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="font-bold text-white" style={{ fontSize: 8 }}>
                                      {alter?.name?.charAt(0)?.toUpperCase() || "?"}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {!showAlters && fronting.length > 0 && (
                          <div className="absolute top-1 left-1 right-1 flex gap-0.5 flex-wrap justify-center">
                            {Array.from(new Set(fronting.map(s => s.primary_alter_id).filter(Boolean))).slice(0, 3).map((alterId) => (
                              <div
                                key={alterId}
                                className="w-1.5 h-1.5 rounded-full border border-foreground/30"
                                style={{ backgroundColor: getAlterColor(alterId) }}
                              />
                            ))}
                          </div>
                        )}
                        <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
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