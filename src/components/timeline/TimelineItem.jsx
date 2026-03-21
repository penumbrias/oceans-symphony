import React from "react";
import { format } from "date-fns";
import { Activity, Users, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TimelineItem({ item, alters }) {
  const getAlterName = (alterId) => {
    return alters.find((a) => a.id === alterId)?.name || "Unknown";
  };

  const getAlterColor = (alterId) => {
    return alters.find((a) => a.id === alterId)?.color || "#9333ea";
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
    const allFronters = [
      item.data.primary_alter_id,
      ...(item.data.co_fronter_ids || []),
    ].filter(Boolean);

    return (
      <div className="flex gap-4">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-accent text-accent-foreground flex-shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="w-0.5 bg-border flex-1 mt-2 mb-2" />
        </div>
        <div className="pb-4 pt-2 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-sm">
                {item.data.is_active ? "Switched to" : "Switch ended"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(item.data.start_time), "h:mm a")}
              </p>
            </div>
          </div>
          {allFronters.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {item.data.primary_alter_id && (
                <span
                  className="text-xs px-2 py-1 rounded-full text-white font-medium"
                  style={{ backgroundColor: getAlterColor(item.data.primary_alter_id) }}
                >
                  {getAlterName(item.data.primary_alter_id)} (Primary)
                </span>
              )}
              {item.data.co_fronter_ids?.map((alterId) => (
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