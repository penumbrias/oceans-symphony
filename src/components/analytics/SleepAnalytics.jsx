import React, { useMemo } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { startOfDay, endOfDay, eachDayOfInterval, isWithinInterval, format } from "date-fns";

export default function SleepAnalytics({ sleepRecords = [], from, to }) {
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
      const key = format(new Date(r.date), 'MMM dd');
      if (!map[key]) map[key] = { date: key, duration: 0, quality: null };
      if (r.duration_minutes) map[key].duration += r.duration_minutes;
      if (r.quality_rating) map[key].quality = r.quality_rating;
    });
    return Object.values(map).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [filtered]);

  const allDays = useMemo(() => {
    const days = eachDayOfInterval({ start: from, end: to });
    return days.map(d => ({
      date: format(d, 'MMM dd'),
      logged: durationData.some(x => x.date === format(d, 'MMM dd')) ? 1 : 0,
    }));
  }, [from, to, durationData]);

  const stats = useMemo(() => {
    if (durationData.length === 0) return { avg: 0, min: 0, max: 0, total: 0 };
    const durations = durationData.map(d => d.duration).filter(d => d > 0);
    if (durations.length === 0) return { avg: 0, min: 0, max: 0, total: 0 };
    return {
      avg: (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1),
      min: Math.min(...durations),
      max: Math.max(...durations),
      total: durations.length,
    };
  }, [durationData]);

  const timeStats = useMemo(() => {
    if (filtered.length === 0) return { earliest: "—", latest: "—" };
    const times = filtered.filter(r => r.bedtime).map(r => r.bedtime).sort();
    const wakeup = filtered.filter(r => r.wake_time).map(r => r.wake_time).sort();
    return {
      earliest: times.length > 0 ? times[0] : "—",
      latest: wakeup.length > 0 ? wakeup[wakeup.length - 1] : "—",
    };
  }, [filtered]);

  const loggedDays = allDays.filter(d => d.logged).length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Avg duration</p>
          <p className="text-lg font-semibold">{stats.avg}h</p>
        </div>
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Days logged</p>
          <p className="text-lg font-semibold">{loggedDays}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Earliest bed</p>
          <p className="text-lg font-semibold text-sm">{timeStats.earliest}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Latest wake</p>
          <p className="text-lg font-semibold text-sm">{timeStats.latest}</p>
        </div>
      </div>

      {/* Duration chart */}
      {durationData.length > 0 && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Sleep duration per night</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={durationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--color-text-secondary)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--color-text-secondary)" label={{ value: "Hours", angle: -90, position: "insideLeft" }} />
              <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-muted)", borderRadius: "0.5rem" }} />
              <Bar dataKey="duration" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quality chart */}
      {durationData.some(d => d.quality) && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Sleep quality rating</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={durationData.filter(d => d.quality)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--color-text-secondary)" />
              <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} stroke="var(--color-text-secondary)" label={{ value: "Rating", angle: -90, position: "insideLeft" }} />
              <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-muted)", borderRadius: "0.5rem" }} />
              <Line type="monotone" dataKey="quality" stroke="var(--color-accent)" dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Logging coverage */}
      <div className="bg-card border border-border/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Logging coverage</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={allDays}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} stroke="var(--color-text-secondary)" />
            <YAxis tick={{ fontSize: 12 }} stroke="var(--color-text-secondary)" />
            <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-muted)", borderRadius: "0.5rem" }} />
            <Bar dataKey="logged" fill="var(--color-secondary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {durationData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground text-sm">No sleep data logged in this date range.</p>
        </div>
      )}
    </div>
  );
}