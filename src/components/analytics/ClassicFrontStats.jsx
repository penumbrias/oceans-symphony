import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { startOfDay, endOfDay } from "date-fns";
import { Clock, Star, Users, Timer, TrendingUp, TrendingDown, Hash, BarChart2 } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import {
  normalizeSessions,
  sessionsInRange,
  sliceByOverlap,
} from "@/lib/sessionNormalizer";
import AlterStatRow from "@/components/analytics/AlterStatRow";
import AlterFrontingTimeline from "@/components/analytics/AlterFrontingTimeline";

// The CLASSIC per-alter fronting stat bars + stacked daily timeline from the
// pre-rebuild Analytics page, restored by request — the mode pills
// (total / solo / primary / co-front / average / max / min / count) with
// AlterStatRow bars and the AlterFrontingTimeline chart underneath. Lives as
// a collapsed section under the Fronting tab; the engine-driven cards above
// it are the primary surface, this is the familiar deep-dive view.
//
// Self-contained: computes its own per-alter sweep-line stats (same
// normalizeSessions / sliceByOverlap math the engine and the old
// computeStats used) so it needs only raw sessions + alters.

const MODES = [
  { id: "total",      label: "Total",    icon: Clock },
  { id: "solo",       label: "Solo",     icon: Clock },
  { id: "primary",    label: "Primary",  icon: Star },
  { id: "cofronting", label: "Co-front", icon: Users },
  { id: "average",    label: "Average",  icon: Timer },
  { id: "max",        label: "Max",      icon: TrendingUp },
  { id: "min",        label: "Min",      icon: TrendingDown },
  { id: "count",      label: "Count",    icon: Hash },
];

export default function ClassicFrontStats({ sessions = [], alters = [], from, to }) {
  const terms = useTerms();
  const [mode, setMode] = useState("total");
  const [showArchived, setShowArchived] = useState(false);

  const { alterMap, filteredRaw } = useMemo(() => {
    const fromMs = startOfDay(from).getTime();
    const toMs = endOfDay(to).getTime();
    const now = Date.now();
    const normalised = normalizeSessions(sessions, now);
    const filtered = sessionsInRange(normalised, fromMs, toMs, now);

    const map = {};
    for (const alter of alters) {
      map[alter.id] = { alter, total: 0, primary: 0, cofronting: 0, solo: 0, sessions: [], count: 0 };
    }

    // Solo / co-front / total via the sweep-line slice: each slice has a
    // stable set of active alters; |set|==1 → solo, else co-front for all.
    const slices = sliceByOverlap(filtered, fromMs, toMs, now);
    for (const slice of slices) {
      const dur = slice.endMs - slice.startMs;
      if (dur <= 0) continue;
      const ids = [...slice.aliveAlterIds];
      const isSolo = ids.length === 1;
      for (const id of ids) {
        const row = map[id];
        if (!row) continue;
        row.total += dur;
        if (isSolo) row.solo += dur;
        else row.cofronting += dur;
      }
    }

    // Per-alter session lengths + counts + primary time (in-range portion).
    for (const s of filtered) {
      const start = Math.max(s.startMs, fromMs);
      const end = s.endMs != null ? Math.min(s.endMs, toMs) : Math.min(now, toMs);
      const dur = Math.max(0, end - start);
      if (dur <= 0) continue;
      for (const id of s.alterIds) {
        const row = map[id];
        if (!row) continue;
        row.sessions.push(dur);
        row.count += 1;
        if (id === s.primaryAlterId) row.primary += dur;
      }
    }

    return { alterMap: map, filteredRaw: filtered.map((s) => s.raw) };
  }, [sessions, alters, from, to]);

  const rows = useMemo(() => {
    return Object.values(alterMap)
      .filter((d) => d.count > 0 && (showArchived || !d.alter.is_archived))
      .map((d) => {
        let stat = 0;
        if (mode === "total")           stat = d.total;
        else if (mode === "solo")       stat = d.solo;
        else if (mode === "primary")    stat = d.primary;
        else if (mode === "cofronting") stat = d.cofronting;
        else if (mode === "average")    stat = d.sessions.length ? d.total / d.sessions.length : 0;
        else if (mode === "max")        stat = d.sessions.length ? Math.max(...d.sessions) : 0;
        else if (mode === "min")        stat = d.sessions.length ? Math.min(...d.sessions) : 0;
        else if (mode === "count")      stat = d.count;
        return { alter: d.alter, stat };
      })
      .sort((a, b) => b.stat - a.stat);
  }, [alterMap, mode, showArchived]);

  const maxStat = rows.length > 0 ? rows[0].stat : 1;

  return (
    <div className="space-y-4">
      {/* Mode pills + archived toggle */}
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border flex-shrink-0 transition-all ${
                  mode === m.id
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            showArchived
              ? "bg-muted text-foreground border-border"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">No {terms.fronting} data in this date range.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(({ alter, stat }) => {
            const d = alterMap[alter.id];
            return (
              <motion.div key={alter.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <AlterStatRow
                  alter={alter} stat={stat} mode={mode} maxStat={maxStat}
                  primaryMs={d?.primary || 0}
                  cofrontingMs={d?.cofronting || 0}
                  totalMs={d?.total || 0}
                />
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <AlterFrontingTimeline sessions={filteredRaw} alters={alters} from={from} to={to} />
      </div>
    </div>
  );
}
