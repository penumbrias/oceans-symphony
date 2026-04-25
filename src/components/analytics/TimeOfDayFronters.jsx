import React, { useState, useMemo } from "react";
import { Coffee, Sun, Sunset, Moon, User } from "lucide-react";
import { getHours } from "date-fns";
import { Link } from "react-router-dom";
import { useTerms } from "@/lib/useTerms";

// Morning: 5–11, Day: 12–17, Evening: 18–21, Night: 22–4
const PERIOD_DEFS = [
  { id: "morning", labelPrefix: "Morning", icon: Coffee, range: [5, 11], color: "text-amber-400" },
  { id: "day",     labelPrefix: "Day",     icon: Sun,    range: [12, 17], color: "text-yellow-400" },
  { id: "evening", labelPrefix: "Evening", icon: Sunset, range: [18, 21], color: "text-orange-400" },
  { id: "night",   labelPrefix: "Night",   icon: Moon,   range: [22, 4],  color: "text-blue-400" },
];

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function inPeriod(hour, range) {
  const [start, end] = range;
  if (start <= end) return hour >= start && hour <= end;
  // wraps midnight (night: 22–4)
  return hour >= start || hour <= end;
}

function formatDuration(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function AlterRow({ alter, duration, periodLabel }) {
  const bg = alter.color || null;
  const text = bg ? getContrastColor(bg) : null;

  return (
    <Link to={`/alter/${alter.id}`}>
      <div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-all cursor-pointer"
        style={{ borderLeftColor: bg || "transparent", borderLeftWidth: bg ? 3 : 1 }}
      >
        <div
          className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30"
          style={{ backgroundColor: bg || "hsl(var(--muted))" }}
        >
          {alter.avatar_url ? (
            <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
          ) : (
            <User className="w-5 h-5" style={{ color: text || "hsl(var(--muted-foreground))" }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {alter.name}
            {alter.pronouns && (
              <span className="text-muted-foreground font-normal"> ‹ {alter.pronouns} ›</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDuration(duration)} during the {periodLabel}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function TimeOfDayFronters({ sessions, alters }) {
  const terms = useTerms();
  const PERIODS = PERIOD_DEFS.map(p => ({ ...p, label: `${p.labelPrefix} ${terms.alters}` }));
  const [activePeriod, setActivePeriod] = useState("morning");

  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  const [viewMode, setViewMode] = useState("total"); // "total" | "primary" | "cofronting"

  const periodData = useMemo(() => {
    const totals = {};   // alterId -> { total, primary, cofronting }

    for (const s of sessions) {
      const hour = getHours(new Date(s.start_time));
      const period = PERIODS.find((p) => inPeriod(hour, p.range));
      if (!period || period.id !== activePeriod) continue;

      const start = new Date(s.start_time).getTime();
      const end = s.end_time ? new Date(s.end_time).getTime() : Date.now();
      const duration = Math.max(end - start, 0);

      if (s.alter_id) {
        if (!totals[s.alter_id]) totals[s.alter_id] = { total: 0, primary: 0, cofronting: 0 };
        totals[s.alter_id].total += duration;
        if (s.is_primary) totals[s.alter_id].primary += duration;
      } else {
        const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
        for (const id of ids) {
          if (!totals[id]) totals[id] = { total: 0, primary: 0, cofronting: 0 };
          totals[id].total += duration;
          if (s.primary_alter_id === id) totals[id].primary += duration;
          else totals[id].cofronting += duration;
        }
      }
    }

    return Object.entries(totals)
      .map(([id, times]) => ({ alter: altersById[id], ...times }))
      .filter((d) => d.alter)
      .sort((a, b) => b.total - a.total);
  }, [sessions, altersById, activePeriod]);

  const current = PERIODS.find((p) => p.id === activePeriod);
  const periodLabel = activePeriod; // "morning", "day", etc.

  const displayedData = periodData.filter(d => {
    if (viewMode === "primary") return d.primary > 0;
    if (viewMode === "cofronting") return d.cofronting > 0;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Controls — NOW AT TOP */}
      <div className="space-y-3">
        {/* View mode toggle */}
        <div className="flex justify-center gap-1 p-1 bg-muted/30 rounded-xl w-fit mx-auto">
          {[
            { id: "total", label: "All" },
            { id: "primary", label: "⭐ Primary" },
            { id: "cofronting", label: "👥 Co-front" },
          ].map(opt => (
            <button key={opt.id} onClick={() => setViewMode(opt.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === opt.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Period label */}
        <div className="flex justify-center">
          <span className="text-sm font-semibold text-primary/80 bg-primary/10 px-4 py-1.5 rounded-full">
            {current.label}
          </span>
        </div>

        {/* Icon tab bar */}
        <div className="flex justify-around items-center bg-card border border-border/50 rounded-xl p-2">
          {PERIODS.map((p) => {
            const Icon = p.icon;
            const isActive = p.id === activePeriod;
            return (
              <button
                key={p.id}
                onClick={() => setActivePeriod(p.id)}
                className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all ${
                  isActive ? "bg-primary/15" : "hover:bg-muted/50"
                }`}
              >
                <Icon className={`w-5 h-5 transition-colors ${isActive ? p.color : "text-muted-foreground"}`} />
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-primary font-semibold uppercase tracking-wider">
          Time of {terms.fronting}
        </p>
      </div>

      {/* Results */}
      {displayedData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-muted-foreground text-sm">No {terms.fronting} data during this time</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayedData.map(({ alter, total, primary, cofronting }) => {
            const duration = viewMode === "primary" ? primary : viewMode === "cofronting" ? cofronting : total;
            return <AlterRow key={alter.id} alter={alter} duration={duration} periodLabel={periodLabel} />;
          })}
        </div>
      )}

    </div>
  );
}