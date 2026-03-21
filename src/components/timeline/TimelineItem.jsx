import React, { useMemo, useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { Activity, Heart, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TimelineItem({ item, alters, allItems }) {
  const [expandedSwitch, setExpandedSwitch] = useState(false);

  const getAlterName = (alterId) => {
    return alters.find((a) => a.id === alterId)?.name || "Unknown";
  };

  const getAlterColor = (alterId) => {
    return alters.find((a) => a.id === alterId)?.color || "#9333ea";
  };

  const getAlterAvatar = (alterId) => {
    return alters.find((a) => a.id === alterId)?.avatar_url || null;
  };

  // Calculate duration for a switch (time until next switch or end of day)
  const getSwitchDuration = useMemo(() => {
    if (item.type !== "switch" || !allItems) return null;
    const currentIdx = allItems.findIndex((i) => i.type === item.type && i.timestamp === item.timestamp);
    if (currentIdx === -1) return null;
    
    // Find next switch
    for (let i = currentIdx + 1; i < allItems.length; i++) {
      if (allItems[i].type === "switch") {
        return differenceInMinutes(new Date(allItems[i].timestamp), new Date(item.timestamp));
      }
    }
    return null; // Still fronting or no next switch recorded
  }, [item, allItems]);

  if (item.type === "activity") {
    return (
      <div className="flex gap-4">
        <div className="flex flex-col items-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0"
            style={{ backgroundColor: item.data.color || "hsl(var(--primary))" }}
          >
            <Activity className="w-5 h-5" />
          </div>
          <div className="w-0.5 bg-border flex-1 mt-2 mb-2" />
        </div>
        <div className="pb-4 pt-2 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-sm">{item.data.activity_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(item.data.timestamp), "h:mm a")}
              </p>
            </div>
            {item.data.category && (
              <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                {item.data.category}
              </span>
            )}
          </div>
          {item.data.duration_minutes && (
            <p className="text-xs text-muted-foreground mt-2">
              Duration: {item.data.duration_minutes} minutes
            </p>
          )}
          {item.data.fronting_alter_ids?.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {item.data.fronting_alter_ids.map((alterId) => (
                <span
                  key={alterId}
                  className="text-xs px-2 py-1 rounded-full text-white"
                  style={{ backgroundColor: getAlterColor(alterId) }}
                >
                  {getAlterName(alterId)}
                </span>
              ))}
            </div>
          )}
          {item.data.notes && (
            <p className="text-xs text-muted-foreground mt-2 italic">{item.data.notes}</p>
          )}
        </div>
      </div>
    );
  }

  if (item.type === "switch") {
    const primaryAlter = alters.find((a) => a.id === item.data.primary_alter_id);
    const durationMins = getSwitchDuration;
    const durationLabel = durationMins
      ? durationMins < 60
        ? `${durationMins}m`
        : `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
      : "Active";

    return (
      <div className="flex items-start gap-3 pb-2">
        {/* Alter avatar */}
        <div className="flex flex-col items-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-border overflow-hidden"
            style={{ backgroundColor: primaryAlter?.color || "#9333ea" }}
          >
            {primaryAlter?.avatar_url ? (
              <img src={primaryAlter.avatar_url} alt={primaryAlter.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-white">{primaryAlter?.name?.charAt(0)?.toUpperCase()}</span>
            )}
          </div>
          {/* Vertical line (duration indicator) */}
          <div className="w-0.5 bg-gradient-to-b mt-1 flex-1" style={{ backgroundImage: `linear-gradient(to bottom, ${primaryAlter?.color || "#9333ea"}, ${primaryAlter?.color || "#9333ea"}80)`, minHeight: durationMins ? `${Math.min(durationMins / 5, 120)}px` : "40px" }} />
        </div>

        {/* Content */}
        <div className="pt-1.5 flex-1">
          <p className="font-semibold text-sm">{getAlterName(item.data.primary_alter_id)}</p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(item.data.start_time), "h:mm a")} — {durationLabel}
          </p>
          {item.data.co_fronter_ids?.length > 0 && (
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {item.data.co_fronter_ids.map((alterId) => (
                <span
                  key={alterId}
                  className="text-xs px-2 py-0.5 rounded-full text-white text-center"
                  style={{ backgroundColor: getAlterColor(alterId) }}
                >
                  {getAlterName(alterId)}
                </span>
              ))}
            </div>
          )}
          {item.data.note && (
            <p className="text-xs text-muted-foreground mt-1.5 italic">{item.data.note}</p>
          )}
        </div>
      </div>
    );
  }

  if (item.type === "emotion") {
    return (
      <div className="flex gap-4">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-destructive/10 text-destructive flex-shrink-0">
            <Heart className="w-5 h-5" />
          </div>
          <div className="w-0.5 bg-border flex-1 mt-2 mb-2" />
        </div>
        <div className="pb-4 pt-2 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-sm">Emotion Check-In</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(item.data.timestamp), "h:mm a")}
              </p>
            </div>
          </div>
          {item.data.emotions?.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {item.data.emotions.map((emotion) => (
                <span key={emotion} className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                  {emotion}
                </span>
              ))}
            </div>
          )}
          {item.data.fronting_alter_ids?.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {item.data.fronting_alter_ids.map((alterId) => (
                <span
                  key={alterId}
                  className="text-xs px-2 py-1 rounded-full text-white"
                  style={{ backgroundColor: getAlterColor(alterId) }}
                >
                  {getAlterName(alterId)}
                </span>
              ))}
            </div>
          )}
          {item.data.note && (
            <p className="text-xs text-muted-foreground mt-2 italic">{item.data.note}</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}