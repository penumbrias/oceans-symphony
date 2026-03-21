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
    const switchArray = Array.isArray(item.data) ? item.data : [item.data];

    return (
      <div>
        {/* Horizontal row of concurrent alters with individual duration lines */}
        <div className="flex gap-0 pb-2">
          {switchArray.map((switchRecord, idx) => {
            const alter = alters.find((a) => a.id === switchRecord.primary_alter_id);
            
            // Calculate duration for this specific alter
            const startTime = new Date(switchRecord.start_time);
            const endTime = switchRecord.endTime ? new Date(switchRecord.endTime) : null;
            const durationMins = endTime ? differenceInMinutes(endTime, startTime) : null;
            
            return (
              <div key={idx} className="flex flex-col items-center group">
                {/* Avatar icon */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-border overflow-hidden hover:ring-2 hover:ring-primary transition-all cursor-pointer"
                  style={{ backgroundColor: alter?.color || "#9333ea" }}
                  title={getAlterName(switchRecord.primary_alter_id)}
                  onClick={() => setExpandedSwitch(!expandedSwitch)}
                >
                  {alter?.avatar_url ? (
                    <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-white">{alter?.name?.charAt(0)?.toUpperCase()}</span>
                  )}
                </div>
                
                {/* Vertical duration line */}
                {durationMins && (
                  <div
                    className="w-0.5 mt-0.5"
                    style={{
                      backgroundImage: `linear-gradient(to bottom, ${alter?.color || "#9333ea"}, ${alter?.color || "#9333ea"}80)`,
                      height: `${Math.max(durationMins / 6, 20)}px`,
                    }}
                  />
                )}
              </div>
            );
          })}
          
          {/* Time label */}
          <div className="ml-2 pt-1">
            <p className="text-xs text-muted-foreground font-medium">
              {format(new Date(item.timestamp), "h:mm a")}
            </p>
          </div>
        </div>

        {/* Expanded details */}
        {expandedSwitch && (
          <div className="ml-4 space-y-2 mb-3 text-xs bg-muted/30 rounded p-2">
            {switchArray.map((switchRecord, idx) => {
              const durationMins = switchRecord.endTime 
                ? differenceInMinutes(new Date(switchRecord.endTime), new Date(switchRecord.start_time))
                : null;
              const durationLabel = durationMins
                ? durationMins < 60
                  ? `${durationMins}m`
                  : `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
                : "Active";

              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full border border-border flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: getAlterColor(switchRecord.primary_alter_id) }}
                    >
                      <span className="text-xs font-bold text-white">
                        {getAlterName(switchRecord.primary_alter_id).charAt(0)}
                      </span>
                    </div>
                    <span className="font-semibold">{getAlterName(switchRecord.primary_alter_id)}</span>
                    <span className="text-muted-foreground">{durationLabel}</span>
                  </div>
                  {switchRecord.co_fronter_ids?.length > 0 && (
                    <div className="flex gap-1.5 ml-8 flex-wrap">
                      {switchRecord.co_fronter_ids.map((alterId) => (
                        <span key={alterId} className="px-2 py-0.5 rounded-full text-white text-center text-xs" style={{ backgroundColor: getAlterColor(alterId) }}>
                          {getAlterName(alterId)}
                        </span>
                      ))}
                    </div>
                  )}
                  {switchRecord.note && (
                    <p className="text-muted-foreground italic ml-8">{switchRecord.note}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
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