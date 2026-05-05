import React, { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { startOfDay, endOfDay, format, eachWeekOfInterval, endOfWeek } from "date-fns";

const SWITCH_SYMPTOMS = [
  { key: "anxiety",      label: "Anxiety",      color: "#f43f5e" },
  { key: "reactivity",   label: "Reactivity",   color: "#f97316" },
  { key: "dissociation", label: "Dissociation", color: "#a855f7" },
  { key: "memory",       label: "Memory gaps",  color: "#3b82f6" },
  { key: "tension",      label: "Tension",      color: "#14b8a6" },
];

export default function SwitchLogAnalytics({ journals = [], from, to }) {
  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();

  const switchLogs = useMemo(() =>
    journals.filter(j => {
      if (j.entry_type !== "switch_log") return false;
      const ts = new Date(j.created_date).getTime();
      return ts >= fromMs && ts <= toMs;
    }), [journals, from, to]);

  const logsWithData = useMemo(() =>
    switchLogs.filter(j => j.switch_data), [switchLogs]);

  const avgSymptoms = useMemo(() => {
    if (!logsWithData.length) return [];
    return SWITCH_SYMPTOMS.map(({ key, label, color }) => {
      const vals = logsWithData.map(j => j.switch_data.symptoms?.[key] ?? 0);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return { name: label, key, avg: parseFloat(avg.toFixed(1)), color };
    });
  }, [logsWithData]);

  const weeklyTrends = useMemo(() => {
    const weeks = eachWeekOfInterval({ start: from, end: to }, { weekStartsOn: 1 });
    return weeks.map(weekStart => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const wLogs = logsWithData.filter(j => {
        const ts = new Date(j.created_date).getTime();
        return ts >= weekStart.getTime() && ts <= weekEnd.getTime();
      });
      const point = { week: format(weekStart, "MMM d") };
      SWITCH_SYMPTOMS.forEach(({ key }) => {
        if (wLogs.length) {
          const vals = wLogs.map(j => j.switch_data.symptoms?.[key] ?? 0);
          point[key] = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
        } else {
          point[key] = null;
        }
      });
      return point;
    });
  }, [logsWithData, from, to]);

  const triggerFreq = useMemo(() => {
    const freq = {};
    logsWithData.forEach(j => {
      const t = (j.switch_data.trigger || "").trim();
      if (t) freq[t] = (freq[t] || 0) + 1;
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, count]) => ({ label, count }));
  }, [logsWithData]);

  const topAvgSymptom = avgSymptoms.length
    ? [...avgSymptoms].sort((a, b) => b.avg - a.avg)[0]
    : null;

  if (!switchLogs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-sm">No switch logs in this date range.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Switch logs</p>
          <p className="text-lg font-semibold">{switchLogs.length}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">With symptom data</p>
          <p className="text-lg font-semibold">{logsWithData.length}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Highest avg symptom</p>
          <p className="text-sm font-semibold truncate">
            {topAvgSymptom ? `${topAvgSymptom.name} (${topAvgSymptom.avg}/10)` : "—"}
          </p>
        </div>
      </div>

      {/* Average symptom levels */}
      {avgSymptoms.length > 0 && logsWithData.length > 0 && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Average symptom levels at switch</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={avgSymptoms} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={95} />
              <Tooltip formatter={(v) => [`${v}/10`, "Average"]} />
              <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                {avgSymptoms.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Weekly symptom trends */}
      {weeklyTrends.length > 1 && logsWithData.length > 1 && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Symptom trends over time</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={weeklyTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {SWITCH_SYMPTOMS.map(({ key, label, color }) => (
                <Line
                  key={key} type="monotone" dataKey={key} name={label}
                  stroke={color} dot={false} strokeWidth={2} connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Trigger patterns */}
      {triggerFreq.length > 0 && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Reported triggers</h3>
          <div className="flex flex-wrap gap-2">
            {triggerFreq.map(({ label, count }) => (
              <span key={label}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm">
                {label}
                {count > 1 && <span className="text-xs font-semibold opacity-70">×{count}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {logsWithData.length === 0 && (
        <div className="bg-muted/30 rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Symptom and trigger data is recorded when switch logs are filled out using the switch journal form.
          </p>
        </div>
      )}
    </div>
  );
}
