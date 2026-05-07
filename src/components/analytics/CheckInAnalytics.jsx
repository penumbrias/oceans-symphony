import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { startOfDay, endOfDay, format, eachDayOfInterval } from "date-fns";

export default function CheckInAnalytics({ checkIns = [], alters = [], from, to }) {
  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();

  const filtered = useMemo(() => {
    return checkIns.filter(c => {
      if (!c.date) return false;
      const [y, m, d] = c.date.split("-").map(Number);
      const ts = new Date(y, m - 1, d).getTime();
      return ts >= fromMs && ts <= toMs;
    });
  }, [checkIns, from, to]);

  // Check-ins per day
  const byDay = useMemo(() => {
    const map = {};
    eachDayOfInterval({ start: from, end: to }).forEach(d => {
      map[format(d, "MMM dd")] = 0;
    });
    filtered.forEach(c => {
      const [y, m, d] = c.date.split("-").map(Number);
      const key = format(new Date(y, m - 1, d), "MMM dd");
      if (map[key] !== undefined) map[key]++;
    });
    return Object.entries(map).map(([date, count]) => ({ date, count }));
  }, [filtered, from, to]);

  // Most commonly noticed alters
  const alterFreq = useMemo(() => {
    const freq = {};
    filtered.forEach(c => {
      (c.step2_notice?.alters_present || []).forEach(id => {
        freq[id] = (freq[id] || 0) + 1;
      });
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => {
        const alter = alters.find(a => a.id === id);
        return { name: alter?.name || "Unknown", count, color: alter?.color };
      });
  }, [filtered, alters]);

  // Completion stats
  const completionStats = useMemo(() => {
    if (!filtered.length) return [];
    const steps = [
      { key: "step1_arrive", label: "Arrive" },
      { key: "step2_notice", label: "Notice" },
      { key: "step3_greet",  label: "Greet"  },
      { key: "step4_share",  label: "Share"  },
      { key: "step5_closing", label: "Closing" },
    ];
    return steps.map(({ key, label }) => ({
      label,
      pct: Math.round((filtered.filter(c => c[key]).length / filtered.length) * 100),
    }));
  }, [filtered]);

  const gratitudeRate = useMemo(() => {
    if (!filtered.length) return null;
    const n = filtered.filter(c => c.step5_closing?.gratitude_expressed).length;
    return Math.round((n / filtered.length) * 100);
  }, [filtered]);

  if (!filtered.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-sm">No system check-ins in this date range.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Check-ins</p>
          <p className="text-lg font-semibold">{filtered.length}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Gratitude expressed</p>
          <p className="text-lg font-semibold">{gratitudeRate !== null ? `${gratitudeRate}%` : "—"}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Most noticed</p>
          <p className="text-sm font-semibold truncate">{alterFreq[0]?.name || "—"}</p>
        </div>
      </div>

      {/* Frequency */}
      {byDay.some(d => d.count > 0) && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Check-in frequency</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={55} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Step completion */}
      {completionStats.length > 0 && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Step completion rates</h3>
          <div className="space-y-2.5">
            {completionStats.map(({ label, pct }) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground font-medium">{label}</span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Most noticed alters */}
      {alterFreq.length > 0 && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Most noticed members</h3>
          <div className="space-y-2">
            {alterFreq.map(({ name, count, color }) => (
              <div key={name} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color || "#9333ea" }} />
                <span className="flex-1 text-sm">{name}</span>
                <span className="text-xs font-semibold px-2 py-0.5 bg-muted/50 rounded tabular-nums">
                  {count}×
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
