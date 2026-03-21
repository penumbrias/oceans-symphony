import React, { useState, useMemo } from "react";
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
  const [startSelection, setStartSelection] = useState(null);
  const [showAlters, setShowAlters] = useState(false);
  const [showEmotions, setShowEmotions] = useState(false);
  const [showCustomMenu, setShowCustomMenu] = useState(false);

  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list(),
  });

  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  // Map activity category IDs to names
  const getCategoryNames = (categoryIds) => {
    if (!categoryIds || categoryIds.length === 0) return null;
    return categoryIds
      .map(id => activityCategories.find(c => c.id === id)?.name)
      .filter(Boolean)
      .join(" + ");
  };

  // Get emotions for activity by timestamp
  const getEmotionsForActivity = (activity) => {
    const emotionCheckIn = emotionCheckIns.find(e => {
      const checkInTime = new Date(e.timestamp);
      const actTime = new Date(activity.timestamp);
      return Math.abs(checkInTime - actTime) < 300000; // Within 5 minutes
    });
    return emotionCheckIn?.emotions || [];
  };
  const getActivitiesForDay = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return activities.filter(
      (a) => format(new Date(a.timestamp), "yyyy-MM-dd") === dateStr
    );
  };

  const getDayStats = (date) => {
    const dayActivities = getActivitiesForDay(date);
    const totalDuration = dayActivities.reduce(
      (sum, a) => sum + (a.duration_minutes || 0),
      0
    );
    return {
      count: dayActivities.length,
      duration: totalDuration,
    };
  };

  const handleTimeBlockClick = (date, hour) => {
    if (!startSelection) {
      setStartSelection({ date, hour });
    } else if (startSelection.date.toDateString() === date.toDateString()) {
      const start = Math.min(startSelection.hour, hour);
      const end = Math.max(startSelection.hour, hour);
      onTimeRangeSelect(date, start, end);
      setStartSelection(null);
    } else {
      setStartSelection({ date, hour });
    }
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

  const getActivityForHour = (date, hour) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return activities.find((a) => {
      const actTimestamp = new Date(a.timestamp);
      const actDate = format(actTimestamp, "yyyy-MM-dd");
      const actHour = actTimestamp.getHours();
      const durationHours = Math.ceil((a.duration_minutes || 60) / 60);
      return actDate === dateStr && actHour <= hour && actHour + durationHours > hour;
    });
  };

  const getActivitiesForHour = (date, hour) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return activities.filter((a) => {
      const actTimestamp = new Date(a.timestamp);
      const actDate = format(actTimestamp, "yyyy-MM-dd");
      const actHour = actTimestamp.getHours();
      const durationHours = Math.ceil((a.duration_minutes || 60) / 60);
      return actDate === dateStr && actHour <= hour && actHour + durationHours > hour;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowEmotions(!showEmotions)}
          className="gap-2"
        >
          {showEmotions ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showEmotions ? "Hide" : "Show"} Emotions
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAlters(!showAlters)}
          className="gap-2"
        >
          {showAlters ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showAlters ? "Hide" : "Show"} Alters
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCustomMenu(true)}
          className="gap-2"
        >
          <Settings className="w-4 h-4" />
          Customize
        </Button>
      </div>

      {showCustomMenu && (
        <ActivityCustomizationMenu onClose={() => setShowCustomMenu(false)} />
      )}

      <div className="overflow-x-auto">
        <div className="inline-grid gap-0 border border-border rounded-lg overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[80px_repeat(7,120px)] gap-0 bg-card border-b border-border">
            <div className="bg-muted/50 p-2"></div>
            {weekDays.map((date) => {
              const stats = getDayStats(date);
              return (
                <button
                  key={format(date, "yyyy-MM-dd")}
                  className="p-3 text-center border-r border-border hover:bg-muted/50 transition-colors cursor-pointer group"
                >
                  <div className="text-xs font-semibold text-muted-foreground">
                    {format(date, "EEE")}
                  </div>
                  <div className="text-lg font-bold text-foreground">
                    {format(date, "d")}
                  </div>
                  {stats.count > 0 && (
                    <div className="text-xs text-primary mt-1">
                      {stats.count} {stats.duration > 0 && `• ${Math.round(stats.duration / 60)}h`}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    + Quick add
                  </div>
                </button>
              );
            })}
          </div>

          {/* Time blocks grid */}
          {HOURS.map((hour) => (
          <div
            key={hour}
            className="grid grid-cols-[80px_repeat(7,120px)] gap-0 border-b border-border/50"
          >
            {/* Hour label */}
            <div className="bg-muted/30 px-2 py-3 text-xs font-medium text-muted-foreground text-right">
              {String(hour).padStart(2, "0")}:00
            </div>

            {/* Day cells */}
            {weekDays.map((date) => {
              const fronting = getFrontingForHour(date, hour);
              const activity = getActivityForHour(date, hour);
              const isStartSelected =
                startSelection?.date.toDateString() === date.toDateString() &&
                startSelection?.hour === hour;

              return (
                <button
                  key={`${format(date, "yyyy-MM-dd")}-${hour}`}
                  onClick={() => {
                    const cellActivities = getActivitiesForHour(date, hour);
                    if (cellActivities.length > 0) {
                      onActivityClick?.(cellActivities);
                    } else {
                      handleTimeBlockClick(date, hour);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (activity) onActivityClick?.(activity);
                  }}
                  onMouseDown={(e) => {
                    if (e.button === 2 || e.timeStamp) {
                      const touchStart = Date.now();
                      const handleMouseUp = () => {
                        if (Date.now() - touchStart > 500 && activity) {
                          onActivityClick?.(activity);
                        }
                        document.removeEventListener("mouseup", handleMouseUp);
                      };
                      document.addEventListener("mouseup", handleMouseUp);
                    }
                  }}
                  className={`min-h-16 border-r border-border/50 p-1 transition-colors flex flex-col items-center justify-center relative group cursor-pointer ${
                    activity
                      ? "text-white font-medium text-xs"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  } ${
                    isStartSelected ? "border-primary ring-2 ring-primary" : ""
                  }`}
                  style={{
                    backgroundColor: activity ? activity.color : undefined,
                  }}
                >
                  {activity ? (
                    <div className="text-center space-y-1">
                      <div className="text-xs font-bold line-clamp-2 leading-tight">
                        {getCategoryNames(activity.activity_category_ids) || activity.activity_name}
                      </div>
                      {showEmotions && (
                        <div className="text-xs leading-tight">
                          {getEmotionsForActivity(activity).slice(0, 2).map(e => e.charAt(0).toUpperCase()).join("")}
                        </div>
                      )}
                      {showAlters && activity.fronting_alter_ids?.length > 0 && (
                        <div className="flex gap-0.5 justify-center flex-wrap">
                          {activity.fronting_alter_ids.slice(0, 4).map((alterId) => {
                            const alter = alters.find((a) => a.id === alterId);
                            return (
                              <div
                                key={alterId}
                                className="w-4 h-4 rounded-full border border-white/50 flex items-center justify-center text-xs"
                                style={{
                                  backgroundColor: alter?.color || "rgba(255,255,255,0.2)",
                                }}
                                title={alter?.name}
                              >
                                {alter?.avatar_url && (
                                  <img
                                    src={alter.avatar_url}
                                    alt={alter.name}
                                    className="w-full h-full rounded-full object-cover"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Fronting indicators when no activity */}
                      {fronting.length > 0 && !showAlters && (
                        <div className="absolute top-1 left-1 right-1 flex gap-0.5 flex-wrap justify-center">
                          {fronting.slice(0, 3).map((session, idx) => (
                            <div
                              key={idx}
                              className="w-1.5 h-1.5 rounded-full border border-foreground/30"
                              style={{
                                backgroundColor: session.primary_alter_id
                                  ? getAlterColor(session.primary_alter_id)
                                  : "hsl(var(--muted-foreground))",
                              }}
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