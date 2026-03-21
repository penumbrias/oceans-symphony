import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { formatDistanceStrict, format } from "date-fns";
import { Clock } from "lucide-react";

function formatDuration(start, end) {
  if (!end) return "Active now";
  const diff = new Date(end) - new Date(start);
  const s = Math.floor(diff / 1000) % 60;
  const m = Math.floor(diff / 60000) % 60;
  const h = Math.floor(diff / 3600000) % 24;
  const d = Math.floor(diff / 86400000);
  const parts = [];
  if (d > 0) parts.push(`${d} Day${d > 1 ? "s" : ""}`);
  if (h > 0) parts.push(`${h} Hour${h > 1 ? "s" : ""}`);
  if (m > 0) parts.push(`${m} Minute${m > 1 ? "s" : ""}`);
  if (s > 0 || parts.length === 0) parts.push(`${String(s).padStart(2, "0")} Seconds`);
  return parts.join(", ");
}

export default function HistoryTab({ alterId }) {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 200),
  });

  const alterSessions = sessions.filter(
    (s) => s.primary_alter_id === alterId || (s.co_fronter_ids || []).includes(alterId)
  );

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  if (alterSessions.length === 0) return (
    <div className="text-center py-16 text-muted-foreground text-sm">
      <Clock className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
      No fronting history for this alter yet.
    </div>
  );

  return (
    <div className="space-y-2">
      {alterSessions.map((session) => {
        const start = new Date(session.start_time);
        const end = session.end_time ? new Date(session.end_time) : null;
        const isPrimary = session.primary_alter_id === alterId;
        return (
          <div key={session.id} className="rounded-xl border border-border/50 bg-muted/10 p-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{format(start, "dd/MM/yyyy")}<br />{format(start, "h:mm a")}</span>
              {end && (
                <span className="text-right">
                  {format(end, "dd/MM/yyyy")}<br />{format(end, "h:mm a")}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground mt-1">
              {formatDuration(start, end)}
            </p>
            {!isPrimary && (
              <span className="text-xs text-muted-foreground/60 mt-1 inline-block">co-fronting</span>
            )}
            {session.note && (
              <p className="text-xs text-muted-foreground mt-2 border-t border-border/30 pt-2">{session.note}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}