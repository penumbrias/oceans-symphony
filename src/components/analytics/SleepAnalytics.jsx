import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { localEntities } from "@/api/base44Client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { startOfDay, endOfDay, eachDayOfInterval, format, isWithinInterval } from "date-fns";
import { AlarmClock, Cloud, ZapOff } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-card border border-border/50 rounded-lg p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function AlterBadge({ alter, count, total }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  const [err, setErr] = React.useState(false);
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden"
        style={{ backgroundColor: alter?.color || "#9333ea" }}>
        {resolved && !err
          ? <img src={resolved} alt={alter?.name} className="w-full h-full object-cover" onError={() => setErr(true)} />
          : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white">
              {alter?.name?.charAt(0)?.toUpperCase()}
            </div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-sm font-medium text-foreground truncate">{alter?.name}</span>
          <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{count} night{count !== 1 ? "s" : ""} · {pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-red-500/70" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function SleepAnalytics({ sleepRecords = [], from, to }) {
  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => localEntities.FrontingSession.list(),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => localEntities.Alter.list(),
  });
  const altersById = useMemo(() => Object.fromEntries(alters.map(a => [a.id, a])), [alters]);

  const filtered = useMemo(() => {
    const fromMs = startOfDay(from).getTime();
    const toMs = endOfDay(to).getTime();
    return sleepRecords.filter(r => {
      const ts = new Date(r.date).getTime();
      return ts >= fromMs && ts <= toMs;
    });
  }, [sleepRecords, from, to]);

  const durationData = useMemo(() => {
    const map = {};
    filtered.forEach(r => {
      const key = format(new Date(r.date), "MMM dd");
      if (!map[key]) map[key] = { date: key, duration: 0, quality: null };
      if (r.bedtime && r.wake_time) {
        const hrs = (new Date(r.wake_time) - new Date(r.bedtime)) / 3600000;
        if (hrs > 0) map[key].duration = parseFloat(hrs.toFixed(1));
      }
      if (r.quality) map[key].quality = r.quality;
    });
    return Object.values(map).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [filtered]);

  const allDays = useMemo(() => {
    const days = eachDayOfInterval({ start: from, end: to });
    return days.map(d => ({
      date: format(d, "MMM dd"),
      logged: durationData.some(x => x.date === format(d, "MMM dd")) ? 1 : 0,
    }));
  }, [from, to, durationData]);

  const stats = useMemo(() => {
    if (durationData.length === 0) return { avg: "—", min: 0, max: 0, total: 0 };
    const durations = durationData.map(d => d.duration).filter(d => d > 0);
    if (durations.length === 0) return { avg: "—", min: 0, max: 0, total: 0 };
    return {
      avg: (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1),
      total: durations.length,
    };
  }, [durationData]);

  // Interrupted / dreamed / nightmare rates
  const dreamStats = useMemo(() => {
    const n = filtered.length;
    if (n === 0) return null;
    const interruptedNights = filtered.filter(r => r.is_interrupted);
    const interrupted = interruptedNights.length;
    const dreamed = filtered.filter(r => r.dreamed).length;
    const nightmares = filtered.filter(r => r.had_nightmare).length;
    const totalInterruptions = interruptedNights.reduce((sum, r) =>
      sum + (r.interruption_times?.length || (r.interruption_count || 0)), 0
    );
    const avgInterruptions = interrupted > 0 ? (totalInterruptions / interrupted).toFixed(1) : null;
    return {
      interrupted, dreamed, nightmares, n, avgInterruptions,
      interruptedPct: Math.round((interrupted / n) * 100),
      dreamedPct: Math.round((dreamed / n) * 100),
      nightmaresPct: Math.round((nightmares / n) * 100),
    };
  }, [filtered]);

  // Which alters fronted during nightmare nights
  const nightmareAlterCounts = useMemo(() => {
    const nightmareNights = filtered.filter(r => r.had_nightmare && r.bedtime && r.wake_time);
    if (nightmareNights.length === 0) return [];

    const counts = {};
    for (const night of nightmareNights) {
      const bedMs = new Date(night.bedtime).getTime();
      const wakeMs = new Date(night.wake_time).getTime();
      // Find sessions that overlap with this sleep window (±2h buffer)
      const windowStart = bedMs - 2 * 3600000;
      const windowEnd = wakeMs + 2 * 3600000;
      for (const s of sessions) {
        if (!s.start_time) continue;
        const sStart = new Date(s.start_time).getTime();
        const sEnd = s.end_time ? new Date(s.end_time).getTime() : sStart + 3600000;
        if (sStart <= windowEnd && sEnd >= windowStart) {
          const alterId = s.alter_id || s.primary_alter_id;
          if (alterId) counts[alterId] = (counts[alterId] || 0) + 1;
          // Also count co-fronters
          for (const id of (s.co_fronter_ids || [])) {
            counts[id] = (counts[id] || 0) + 1;
          }
        }
      }
    }

    return Object.entries(counts)
      .map(([id, count]) => ({ alter: altersById[id], count }))
      .filter(x => x.alter)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filtered, sessions, altersById]);

  const loggedDays = allDays.filter(d => d.logged).length;

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-sm">No sleep data in this date range.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Avg duration" value={`${stats.avg}h`} />
        <StatCard label="Days logged" value={loggedDays} />
        {dreamStats && <StatCard label="Nights dreamed" value={`${dreamStats.dreamedPct}%`} sub={`${dreamStats.dreamed} of ${dreamStats.n}`} />}
        {dreamStats && <StatCard label="Nightmare rate" value={`${dreamStats.nightmaresPct}%`} sub={`${dreamStats.nightmares} of ${dreamStats.n}`} />}
      </div>

      {/* Dream / nightmare / interrupted breakdown */}
      {dreamStats && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Sleep quality breakdown</h3>
          <div className="space-y-3">
            {[
              { label: `Interrupted nights${dreamStats.avgInterruptions ? ` · avg ${dreamStats.avgInterruptions}×` : ""}`, count: dreamStats.interrupted, pct: dreamStats.interruptedPct, icon: AlarmClock, color: "bg-orange-500" },
              { label: "Nights with dreams", count: dreamStats.dreamed,     pct: dreamStats.dreamedPct,    icon: Cloud,       color: "bg-blue-500" },
              { label: "Nightmare nights",   count: dreamStats.nightmares,  pct: dreamStats.nightmaresPct, icon: ZapOff,      color: "bg-red-500" },
            ].map(row => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{row.label}</span>
                      <span className="text-xs font-medium text-foreground">{row.count} ({row.pct}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${row.color}/70`} style={{ width: `${row.pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Duration chart */}
      {durationData.length > 0 && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Sleep duration per night (hours)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={durationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: 12 }} />
              <Bar dataKey="duration" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Hours" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quality chart */}
      {durationData.some(d => d.quality) && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Sleep quality rating</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={durationData.filter(d => d.quality)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[1, 10]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: 12 }} />
              <Line type="monotone" dataKey="quality" stroke="hsl(var(--primary))" dot={{ r: 4 }} name="Quality" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Alters fronting during nightmare nights */}
      {nightmareAlterCounts.length > 0 && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <ZapOff className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold">Alters active around nightmare nights</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Fronting sessions overlapping with nights marked as nightmares (±2h buffer).</p>
          <div className="divide-y divide-border/40">
            {nightmareAlterCounts.map(({ alter, count }) => (
              <AlterBadge key={alter.id} alter={alter} count={count} total={filtered.filter(r => r.had_nightmare).length} />
            ))}
          </div>
        </div>
      )}

      {/* Logging coverage */}
      <div className="bg-card border border-border/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Logging coverage</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={allDays}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} stroke="hsl(var(--muted-foreground))" />
            <YAxis hide />
            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: 12 }} />
            <Bar dataKey="logged" fill="hsl(var(--primary) / 0.5)" radius={[4, 4, 0, 0]} name="Logged" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
