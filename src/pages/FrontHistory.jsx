import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Clock, Star, User, Calendar } from "lucide-react";
import { format, formatDuration, intervalToDuration } from "date-fns";

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--muted-foreground))";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function AlterAvatar({ alter, size = "sm" }) {
  const bg = alter?.color || null;
  const text = bg ? getContrastColor(bg) : null;
  const sz = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  return (
    <div
      className={`${sz} rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30`}
      style={{ backgroundColor: bg || "hsl(var(--muted))" }}
    >
      {alter?.avatar_url ? (
        <img src={alter.avatar_url} alt={alter?.name} className="w-full h-full object-cover" />
      ) : (
        <User className="w-4 h-4" style={{ color: text || "hsl(var(--muted-foreground))" }} />
      )}
    </div>
  );
}

function durationLabel(start, end) {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const dur = intervalToDuration({ start: startDate, end: endDate });
  if (dur.days > 0) return `${dur.days}d ${dur.hours || 0}h`;
  if (dur.hours > 0) return `${dur.hours}h ${dur.minutes || 0}m`;
  if (dur.minutes > 0) return `${dur.minutes}m`;
  return "< 1m";
}

function SessionCard({ session, altersById }) {
  const primary = altersById[session.primary_alter_id];
  const coFronters = (session.co_fronter_ids || [])
    .map((id) => altersById[id])
    .filter(Boolean);
  const isActive = session.is_active;
  const startDate = new Date(session.start_time);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border bg-card p-4 ${isActive ? "border-primary/40 bg-primary/5" : "border-border/50"}`}
    >
      <div className="flex items-start gap-3">
        {/* Timeline dot */}
        <div className="flex flex-col items-center pt-1">
          <div className={`w-3 h-3 rounded-full border-2 ${isActive ? "bg-green-500 border-green-400 animate-pulse" : "bg-muted border-border"}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {format(startDate, "MMM d, yyyy · h:mm a")}
              {isActive && (
                <span className="px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 font-medium text-xs">
                  Active
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {durationLabel(session.start_time, session.end_time)}
            </span>
          </div>

          {/* Primary fronter */}
          {primary && (
            <div className="flex items-center gap-2 mb-2">
              <AlterAvatar alter={primary} />
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-sm font-semibold text-foreground">{primary.name}</p>
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                </div>
                {primary.pronouns && (
                  <p className="text-xs text-muted-foreground">{primary.pronouns}</p>
                )}
              </div>
            </div>
          )}

          {/* Co-fronters */}
          {coFronters.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <span className="text-xs text-muted-foreground">also:</span>
              {coFronters.map((a) => (
                <div key={a.id} className="flex items-center gap-1">
                  <AlterAvatar alter={a} size="xs" />
                  <span className="text-xs text-foreground">{a.name}</span>
                </div>
              ))}
            </div>
          )}

          {session.note && (
            <p className="text-xs text-muted-foreground mt-2 italic border-l-2 border-border pl-2">
              {session.note}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function FrontHistory() {
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 100),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const altersById = Object.fromEntries(alters.map((a) => [a.id, a]));

  // Group sessions by date
  const grouped = sessions.reduce((acc, s) => {
    const dateKey = format(new Date(s.start_time), "yyyy-MM-dd");
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(s);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  if (sessionsLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-foreground">Front History</h1>
        <p className="text-muted-foreground mt-1 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          {sessions.length} session{sessions.length !== 1 ? "s" : ""} recorded
        </p>
      </motion.div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <Clock className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No front history yet. Set a front to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((dateKey) => (
            <div key={dateKey}>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {format(new Date(dateKey + "T12:00:00"), "EEEE, MMMM d, yyyy")}
              </h2>
              <div className="space-y-2">
                {grouped[dateKey].map((s) => (
                  <SessionCard key={s.id} session={s} altersById={altersById} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}