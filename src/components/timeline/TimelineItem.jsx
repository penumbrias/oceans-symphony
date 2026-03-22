import React, { useMemo, useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { Activity, Heart } from "lucide-react";
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
    const { allFronterIds, startTime, endTime, isActive, note } = item.data;
    const durationMins = endTime
      ? differenceInMinutes(new Date(endTime), new Date(startTime))
      : null;
    const durationLabel = durationMins
      ? durationMins < 60
        ? `${durationMins}m`
        : `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
      : "Active";
    // Scale: 1 minute = 0.5px, min 20px, max 200px
    const lineHeight = durationMins ? Math.min(Math.max(durationMins * 0.5, 20), 200) : 30;

    return (
      <div className="flex items-start gap-3">
        {/* Horizontal row of alter avatars, each with its own vertical duration line */}
        <div className="flex gap-2 items-start">
          {allFronterIds.map((alterId) => {
            const alter = alters.find((a) => a.id === alterId);
            const color = alter?.color || "#9333ea";
            return (
              <div key={alterId} className="flex flex-col items-center cursor-pointer" onClick={() => setExpandedSwitch(!expandedSwitch)}>
                {/* Circle avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                  style={{ backgroundColor: color }}
                  title={alter?.name}
                >
                  {alter?.avatar_url ? (
                    <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-white">{alter?.name?.charAt(0)?.toUpperCase() || "?"}</span>
                  )}
                </div>
                {/* Vertical duration line */}
                <div
                  className="w-0.5 mt-0.5 rounded-full"
                  style={{
                    background: `linear-gradient(to bottom, ${color}, ${color}60)`,
                    height: `${lineHeight}px`,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Time + duration label */}
        <div className="pt-1 text-xs">
          <p className="text-muted-foreground font-medium">{format(new Date(startTime), "h:mm a")}</p>
          <p className="text-muted-foreground">{durationLabel}</p>
          {note && expandedSwitch && <p className="italic text-muted-foreground mt-1">{note}</p>}
        </div>
      </div>
    );
  }

  if (item.type === "emotion") {
    return (
      <div className="flex items-start gap-3 pb-2">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-destructive/10 text-destructive flex-shrink-0">
            <Heart className="w-5 h-5" />
          </div>
          <div className="w-0.5 bg-destructive/20 flex-1 mt-2" style={{ minHeight: "30px" }} />
        </div>
        <div className="pt-1 flex-1 text-xs space-y-1">
          <p className="font-semibold text-sm">Emotion Check-In</p>
          <p className="text-muted-foreground">{format(new Date(item.data.timestamp), "h:mm a")}</p>
          {item.data.emotions?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {item.data.emotions.map((emotion) => (
                <span key={emotion} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {emotion}
                </span>
              ))}
            </div>
          )}
          {item.data.fronting_alter_ids?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {item.data.fronting_alter_ids.map((alterId) => (
                <span
                  key={alterId}
                  className="px-2 py-0.5 rounded-full text-white text-center"
                  style={{ backgroundColor: getAlterColor(alterId) }}
                >
                  {getAlterName(alterId)}
                </span>
              ))}
            </div>
          )}
          {item.data.note && (
            <p className="text-muted-foreground italic">{item.data.note}</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}