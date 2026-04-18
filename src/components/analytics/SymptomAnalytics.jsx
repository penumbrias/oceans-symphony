import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Cell,
} from "recharts";
import { format, parseISO, isWithinInterval } from "date-fns";

export default function SymptomAnalytics({ startDate, endDate }) {
  const { data: definitions = [] } = useQuery({
    queryKey: ["symptomDefinitions"],
    queryFn: () => base44.entities.SymptomDefinition.list(),
  });

  const { data: checkIns = [] } = useQuery({
    queryKey: ["symptomCheckIns"],
    queryFn: () => base44.entities.SymptomCheckIn.list("-timestamp", 500),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["symptomSessionsAll"],
    queryFn: () => base44.entities.SymptomSession.list("-start_time", 500),
  });

  const { data: frontSessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 500),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const defsById = useMemo(() => Object.fromEntries(definitions.map((d) => [d.id, d])), [definitions]);
  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  const interval = useMemo(() => ({ start: startDate, end: endDate }), [startDate, endDate]);

  const filteredCheckIns = useMemo(() =>
    checkIns.filter((c) => {
      try { return isWithinInterval(parseISO(c.timestamp), interval); } catch { return false; }
    }),
    [checkIns, interval]
  );

  const filteredSessions = useMemo(() =>
    sessions.filter((s) => {
      try { return isWithinInterval(parseISO(s.start_time), interval); } catch { return false; }
    }),
    [sessions, interval]
  );

  // 6.1 Frequency chart
  const frequencyData = useMemo(() => {
    const counts = {};
    filteredCheckIns.forEach((c) => {
      counts[c.symptom_definition_id] = (counts[c.symptom_definition_id] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([id, count]) => ({ name: defsById[id]?.name || id, count, color: defsById[id]?.color || "#8B5CF6" }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [filteredCheckIns, defsById]);

  // 6.2 Duration chart
  const durationData = useMemo(() => {
    const durations = {};
    filteredSessions.forEach((s) => {
      if (!s.end_time) return;
      const ms = new Date(s.end_time) - new Date(s.start_time);
      const hours = ms / 3600000;
      durations[s.symptom_definition_id] = (durations[s.symptom_definition_id] || 0) + hours;
    });
    return Object.entries(durations)
      .map(([id, hours]) => ({
        name: defsById[id]?.name || id,
        hours: Math.round(hours * 10) / 10,
        color: defsById[id]?.color || "#8B5CF6",
      }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 15);
  }, [filteredSessions, defsById]);

  // 6.3 Severity over time — pick top 5 symptoms with severity data
  const severityData = useMemo(() => {
    const bySym = {};
    filteredSessions.forEach((s) => {
      if (!s.severity_snapshots?.length) return;
      if (!bySym[s.symptom_definition_id]) bySym[s.symptom_definition_id] = [];
      s.severity_snapshots.forEach((snap) => {
        bySym[s.symptom_definition_id].push({ ts: snap.timestamp, severity: snap.severity });
      });
    });
    return Object.entries(bySym)
      .slice(0, 5)
      .map(([id, snaps]) => ({
        def: defsById[id],
        points: snaps
          .sort((a, b) => new Date(a.ts) - new Date(b.ts))
          .map((p) => ({ date: format(parseISO(p.ts), "MM/dd"), severity: p.severity })),
      }))
      .filter((x) => x.def);
  }, [filteredSessions, defsById]);

  // 6.4 Symptom × alter correlation
  const correlationData = useMemo(() => {
    return filteredSessions
      .filter((s) => s.end_time)
      .slice(0, 10)
      .map((symptomSess) => {
        const sStart = new Date(symptomSess.start_time);
        const sEnd = new Date(symptomSess.end_time);
        const overlapping = frontSessions.filter((fs) => {
          const fsStart = new Date(fs.start_time);
          const fsEnd = fs.end_time ? new Date(fs.end_time) : new Date();
          return fsStart < sEnd && fsEnd > sStart;
        });
        const alterIds = new Set(
          overlapping.flatMap((fs) =>
            fs.alter_id ? [fs.alter_id] : [fs.primary_alter_id, ...(fs.co_fronter_ids || [])].filter(Boolean)
          )
        );
        return {
          symptom: defsById[symptomSess.symptom_definition_id]?.name || "Unknown",
          color: defsById[symptomSess.symptom_definition_id]?.color || "#8B5CF6",
          alters: [...alterIds].map((id) => altersById[id]?.name).filter(Boolean),
        };
      })
      .filter((x) => x.alters.length > 0);
  }, [filteredSessions, frontSessions, defsById, altersById]);

  return (
    <div className="space-y-8">
      {/* 6.1 Frequency */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">Symptom Frequency</h3>
        {frequencyData.length === 0 ? (
          <p className="text-xs text-muted-foreground">No check-ins in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={frequencyData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v} times`, "Count"]} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {frequencyData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 6.2 Duration */}
      {durationData.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Active Session Duration (hours)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={durationData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v}h`, "Duration"]} />
              <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                {durationData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 6.3 Severity over time */}
      {severityData.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Severity Over Time</h3>
          {severityData.map(({ def, points }) => (
            <div key={def.id} className="space-y-1">
              <p className="text-xs font-medium" style={{ color: def.color }}>{def.name}</p>
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={points} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="severity" stroke={def.color} dot={{ r: 3 }} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}

      {/* 6.4 Correlation */}
      {correlationData.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Symptom × Alter Overlap</h3>
          <div className="space-y-2">
            {correlationData.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-card">
                <div
                  className="w-2 h-full min-h-[24px] rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <div>
                  <p className="text-sm font-medium">{item.symptom}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.alters.join(", ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}