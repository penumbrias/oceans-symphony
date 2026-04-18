import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { startOfDay, endOfDay, format, eachDayOfInterval } from "date-fns";

export default function JournalAnalytics({ journals = [], bulletins = [], alters = [], from, to }) {
  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();

  const filteredJournals = useMemo(() => {
    return journals.filter(j => {
      const ts = new Date(j.created_date).getTime();
      return ts >= fromMs && ts <= toMs;
    });
  }, [journals, from, to]);

  const filteredBulletins = useMemo(() => {
    return bulletins.filter(b => {
      const ts = new Date(b.created_date).getTime();
      return ts >= fromMs && ts <= toMs;
    });
  }, [bulletins, from, to]);

  const journalsByDay = useMemo(() => {
    const map = {};
    eachDayOfInterval({ start: from, end: to }).forEach(d => {
      const key = format(d, 'MMM dd');
      map[key] = 0;
    });
    filteredJournals.forEach(j => {
      const key = format(new Date(j.created_date), 'MMM dd');
      if (map[key] !== undefined) map[key]++;
    });
    return Object.entries(map).map(([date, count]) => ({ date, count }));
  }, [filteredJournals, from, to]);

  const authorStats = useMemo(() => {
    const map = {};
    filteredJournals.forEach(j => {
      const alterId = j.author_alter_id;
      if (!alterId) return;
      const alter = alters.find(a => a.id === alterId);
      const name = alter?.name || "Unknown";
      map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredJournals, alters]);

  const mentionedAlters = useMemo(() => {
    const map = {};
    filteredJournals.forEach(j => {
      (j.mentioned_alter_ids || []).forEach(id => {
        const alter = alters.find(a => a.id === id);
        const name = alter?.name || "Unknown";
        map[name] = (map[name] || 0) + 1;
      });
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filteredJournals, alters]);

  const bulletinsByDay = useMemo(() => {
    const map = {};
    eachDayOfInterval({ start: from, end: to }).forEach(d => {
      const key = format(d, 'MMM dd');
      map[key] = 0;
    });
    filteredBulletins.forEach(b => {
      const key = format(new Date(b.created_date), 'MMM dd');
      if (map[key] !== undefined) map[key]++;
    });
    return Object.entries(map).map(([date, count]) => ({ date, count }));
  }, [filteredBulletins, from, to]);

  const totalEntries = filteredJournals.length;
  const totalBulletins = filteredBulletins.length;
  const topAuthor = authorStats[0]?.name || "—";

  const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#14b8a6", "#ef4444", "#22c55e", "#f97316"];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Journal entries</p>
          <p className="text-lg font-semibold">{totalEntries}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Bulletins</p>
          <p className="text-lg font-semibold">{totalBulletins}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Top author</p>
          <p className="text-sm font-semibold truncate">{topAuthor}</p>
        </div>
      </div>

      {/* Entries per day */}
      {journalsByDay.length > 0 && journalsByDay.some(d => d.count > 0) && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Journal entries per day</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={journalsByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} stroke="var(--color-text-secondary)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--color-text-secondary)" />
              <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-muted)", borderRadius: "0.5rem" }} />
              <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Author breakdown */}
      {authorStats.length > 0 && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Entries by author</h3>
          {authorStats.length <= 5 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={authorStats} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {authorStats.map((_, i) => (
                    <Cell key={`cell-${i}`} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-muted)", borderRadius: "0.5rem" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="space-y-2">
              {authorStats.map((a, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm">{a.name}</span>
                  <span className="text-sm font-semibold">{a.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Most mentioned alters */}
      {mentionedAlters.length > 0 && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Most mentioned alters</h3>
          <div className="space-y-2">
            {mentionedAlters.map((a, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm">{a.name}</span>
                <span className="text-xs font-semibold px-2 py-1 bg-muted/40 rounded">{a.count} mentions</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bulletin activity */}
      {bulletinsByDay.length > 0 && bulletinsByDay.some(d => d.count > 0) && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Bulletin activity</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bulletinsByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} stroke="var(--color-text-secondary)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--color-text-secondary)" />
              <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-muted)", borderRadius: "0.5rem" }} />
              <Bar dataKey="count" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {totalEntries === 0 && totalBulletins === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground text-sm">No journal entries or bulletins in this date range.</p>
        </div>
      )}
    </div>
  );
}