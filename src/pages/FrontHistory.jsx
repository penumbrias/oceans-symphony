import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format, intervalToDuration } from "date-fns";
import { Star, User, Clock } from "lucide-react";
import DateRangePicker from "@/components/analytics/DateRangePicker";
import { subDays, startOfDay, endOfDay } from "date-fns";

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function AlterAvatar({ alter, size = 10 }) {
  const bg = alter?.color || null;
  const text = bg ? getContrastColor(bg) : null;
  return (
    <div
      className="rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border-2 border-background shadow"
      style={{
        width: size, height: size,
        backgroundColor: bg || "hsl(var(--muted))",
        borderColor: bg || "hsl(var(--border))",
      }}
    >
      {alter?.avatar_url ? (
        <img src={alter.avatar_url} alt={alter?.name} className="w-full h-full object-cover" />
      ) : (
        <User style={{ width: size * 0.45, height: size * 0.45, color: text || "hsl(var(--muted-foreground))" }} />
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

// SP-style session block with vertical colored bar and avatar pin at top
function SessionBlock({ session, altersById, columnIndex, totalColumns }) {
  const primary = altersById[session.primary_alter_id];
  const coFronters = (session.co_fronter_ids || []).map((id) => altersById[id]).filter(Boolean);
  const isActive = session.is_active;
  const color = primary?.color || "hsl(var(--primary))";

  return (
    <div
      className="flex flex-col items-center group"
      style={{ minWidth: 52, flex: "0 0 auto" }}
    >
      {/* Avatar pinned at top */}
      <div className="relative mb-1">
        <AlterAvatar alter={primary} size={40} />
        {isActive && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
        )}
      </div>

      {/* Vertical bar */}
      <div
        className="w-2.5 rounded-full"
        style={{
          backgroundColor: color,
          minHeight: 60,
          opacity: 0.85,
        }}
      />

      {/* Co-fronter avatars along bar */}
      {coFronters.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          {coFronters.map((a) => (
            <AlterAvatar key={a.id} alter={a} size={28} />
          ))}
        </div>
      )}

      {/* Duration label */}
      <p className="text-[10px] text-muted-foreground mt-1 text-center">
        {durationLabel(session.start_time, session.end_time)}
      </p>

      {/* Custom status note on hover */}
      {session.note && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-2 bg-card border border-border rounded-lg p-2 text-[10px] text-foreground whitespace-nowrap shadow-lg z-10">
          {session.note}
        </div>
      )}
    </div>
  );
}

function DaySection({ dateKey, sessions, altersById }) {
  return (
    <div className="mb-8">
      {/* Date header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {format(new Date(dateKey + "T12:00:00"), "d MMMM yyyy")}
        </h2>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      {/* Time + blocks */}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {/* Time column */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          {sessions.map((s) => (
            <div key={s.id} className="text-[10px] text-muted-foreground/70 w-14 text-right">
              {format(new Date(s.start_time), "h:mm a")}
            </div>
          ))}
        </div>
        {/* Session blocks */}
        <div className="flex gap-3 items-end">
          {sessions.map((session, i) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <SessionBlock
                session={session}
                altersById={altersById}
                columnIndex={i}
                totalColumns={sessions.length}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FrontHistory() {
  const [from, setFrom] = useState(subDays(new Date(), 7));
  const [to, setTo] = useState(new Date());

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 200),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const altersById = Object.fromEntries(alters.map((a) => [a.id, a]));

  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();

  const filtered = sessions.filter((s) => {
    const st = new Date(s.start_time).getTime();
    return st >= fromMs && st <= toMs;
  });

  const grouped = filtered.reduce((acc, s) => {
    const dateKey = format(new Date(s.start_time), "yyyy-MM-dd");
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(s);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <h1 className="font-display text-3xl font-semibold text-foreground mb-1">Front History</h1>
        <p className="text-muted-foreground text-sm flex items-center gap-2">
          <Clock className="w-4 h-4" />
          {filtered.length} session{filtered.length !== 1 ? "s" : ""} in range
        </p>
      </motion.div>

      <div className="mb-6">
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <Clock className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No sessions in this date range.</p>
        </div>
      ) : (
        <div>
          {sortedDates.map((dateKey) => (
            <DaySection
              key={dateKey}
              dateKey={dateKey}
              sessions={grouped[dateKey]}
              altersById={altersById}
            />
          ))}
        </div>
      )}
    </div>
  );
}