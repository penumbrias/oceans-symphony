import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

export default function MentionNotifications({ frontingAlterIds = [], alters = [] }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const { data: mentionLogs = [] } = useQuery({
    queryKey: ["mentionLogs"],
    queryFn: () => base44.entities.MentionLog.list("-created_date", 200),
    enabled: frontingAlterIds.length > 0,
  });

  const relevant = mentionLogs.filter((m) => frontingAlterIds.includes(m.mentioned_alter_id) && m.log_type !== "authored");
  if (relevant.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Bell className="w-4 h-4 text-primary animate-pulse" />
        <span className="text-sm font-semibold text-primary">
          {relevant.length} mention{relevant.length !== 1 ? "s" : ""} for current fronter{frontingAlterIds.length > 1 ? "s" : ""}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">{expanded ? "hide" : "show"}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {relevant.slice(0, 15).map((m) => {
            const alter = alters.find((a) => a.id === m.mentioned_alter_id);
            return (
              <button
                key={m.id}
                onClick={() => navigate(m.navigate_path || "/timeline")}
                className="w-full text-left rounded-lg bg-background border border-border/50 px-3 py-2 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: alter?.color || "#8b5cf6" }}
                  >
                    {alter?.name?.charAt(0)}
                  </div>
                  <span className="text-xs font-medium text-foreground">{alter?.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {m.source_label} {m.source_date ? `· ${format(new Date(m.source_date), "MM/dd/yyyy")}` : ""}
                  </span>
                </div>
                {m.preview_text && (
                  <p className="text-xs text-muted-foreground italic line-clamp-2">"{m.preview_text}"</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}