import React from "react";
import { Bell, X } from "lucide-react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

export default function NotificationPopups({ mentionLogs = [], alters = [], frontingAlterIds = [], onNotifClick }) {
  const queryClient = useQueryClient();

  // Show notifications where:
  // - the mentioned alter is currently fronting
  // - that specific alter hasn't dismissed it yet
  const relevant = mentionLogs.filter((m) => {
    if (m.log_type === "authored") return false;
    if (!frontingAlterIds.includes(m.mentioned_alter_id)) return false;
    const dismissedBy = m.dismissed_by_alter_ids || [];
    return !dismissedBy.includes(m.mentioned_alter_id);
  });

  const handleDismiss = async (m) => {
    const dismissedBy = m.dismissed_by_alter_ids || [];
    if (dismissedBy.includes(m.mentioned_alter_id)) return;
    await base44.entities.MentionLog.update(m.id, {
      dismissed_by_alter_ids: [...dismissedBy, m.mentioned_alter_id],
    });
    queryClient.invalidateQueries({ queryKey: ["mentionLogs"] });
  };

  const handleClick = async (m) => {
    await handleDismiss(m);
    onNotifClick?.(m);
  };

  if (relevant.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {relevant.slice(0, 5).map((m) => {
        const alter = alters.find((a) => a.id === m.mentioned_alter_id);
        return (
          <div
            key={m.id}
            className="pointer-events-auto bg-card border border-primary/30 rounded-xl shadow-lg p-3 flex gap-3 animate-in slide-in-from-right-4 fade-in"
          >
            <div
              className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5"
              style={{ backgroundColor: alter?.color || "#8b5cf6" }}
            >
              {alter?.name?.charAt(0)}
            </div>
            <button className="flex-1 text-left min-w-0" onClick={() => handleClick(m)}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Bell className="w-3 h-3 text-primary flex-shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate">
                  {alter?.name} was mentioned
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
                  {m.source_date ? format(new Date(m.source_date), "MM/dd") : ""}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{m.preview_text}</p>
              <span className="text-[10px] text-primary mt-1 block">in {m.source_label} · tap to view</span>
            </button>
            <button
              onClick={() => handleDismiss(m)}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}