import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { subDays, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { BarChart2, Hash, Clock, TrendingUp, TrendingDown, Timer } from "lucide-react";
import DateRangePicker from "@/components/analytics/DateRangePicker";
import AlterStatRow from "@/components/analytics/AlterStatRow";
import ActivityHeatmap from "@/components/analytics/ActivityHeatmap";
import TimeOfDayFronters from "@/components/analytics/TimeOfDayFronters";

const MODES = [
  { id: "total", label: "Total", icon: Clock, description: "Total fronting times" },
  { id: "average", label: "Average", icon: Timer, description: "Average fronting times" },
  { id: "max", label: "Max", icon: TrendingUp, description: "Maximum fronting times" },
  { id: "min", label: "Min", icon: TrendingDown, description: "Minimum fronting times" },
  { id: "count", label: "Count", icon: Hash, description: "Fronting count" },
];

function computeStats(sessions, alters, from, to) {
  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();

  const filtered = sessions.filter((s) => {
    const st = new Date(s.start_time).getTime();
    return st >= fromMs && st <= toMs;
  });

  const alterMap = {};
  for (const alter of alters) {
    alterMap[alter.id] = {
      alter,
      total: 0,
      sessions: [],
      count: 0,
    };
  }

  for (const s of filtered) {
    const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
    const start = new Date(s.start_time).getTime();
    const end = s.end_time ? new Date(s.end_time).getTime() : Date.now();
    const dur = Math.max(end - start, 0);

    for (const id of ids) {
      if (!alterMap[id]) continue;
      alterMap[id].total += dur;
      alterMap[id].sessions.push(dur);
      alterMap[id].count += 1;
    }
  }

  return { alterMap, filtered };
}

export default function Analytics() {
  const [from, setFrom] = useState(subDays(new Date(), 30));
  const [to, setTo] = useState(new Date());
  const [mode, setMode] = useState("total");

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 500),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { alterMap, filtered } = useMemo(
    () => computeStats(sessions, alters, from, to),
    [sessions, alters, from, to]
  );

  const rows = useMemo(() => {
    return Object.values(alterMap)
      .filter((d) => d.count > 0)
      .map((d) => {
        let stat = 0;
        if (mode === "total") stat = d.total;
        else if (mode === "average") stat = d.sessions.length ? d.total / d.sessions.length : 0;
        else if (mode === "max") stat = d.sessions.length ? Math.max(...d.sessions) : 0;
        else if (mode === "min") stat = d.sessions.length ? Math.min(...d.sessions) : 0;
        else if (mode === "count") stat = d.count;
        return { alter: d.alter, stat };
      })
      .sort((a, b) => b.stat - a.stat);
  }, [alterMap, mode]);

  const maxStat = rows.length > 0 ? rows[0].stat : 1;

  const totalSessions = filtered.length;
  const uniqueFronters = rows.length;

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
        <div className="flex items-center gap-3 mb-1">
          <BarChart2 className="w-6 h-6 text-primary" />
          <h1 className="font-display text-3xl font-semibold text-foreground">Analytics</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          {totalSessions} session{totalSessions !== 1 ? "s" : ""} · {uniqueFronters} member{uniqueFronters !== 1 ? "s" : ""} fronted
        </p>
      </motion.div>

      {/* Date Range */}
      <div className="mb-5">
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>

      {/* Heatmap */}
      <div className="mb-5">
        <ActivityHeatmap sessions={filtered} from={from} to={to} />
      </div>

      {/* Mode tabs (SP-style bottom bar) */}
      <div className="bg-card border border-border/50 rounded-xl p-1 flex gap-1 mb-4">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-all text-xs font-medium ${
                mode === m.id
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Section label */}
      <p className="text-xs text-primary font-semibold uppercase tracking-wider mb-3">
        {MODES.find((m) => m.id === mode)?.description}
      </p>

      {/* Stats list */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BarChart2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">No fronting data in this date range.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(({ alter, stat }) => (
            <motion.div
              key={alter.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <AlterStatRow
                alter={alter}
                stat={stat}
                mode={mode}
                maxStat={maxStat}
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}