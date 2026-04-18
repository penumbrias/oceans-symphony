import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell,
} from "recharts";
import { format, parseISO, isWithinInterval } from "date-fns";

export default function SymptomAnalytics({ startDate, endDate, symptomSessions = null, symptomCheckIns = null, symptoms: propsSymptoms = null }) {
  // Use pre-fetched data if provided, otherwise fetch
  const { data: symptoms = propsSymptoms } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
    enabled: !propsSymptoms,
  });

  const { data: checkIns = symptomCheckIns } = useQuery({
    queryKey: ["symptomCheckIns"],
    queryFn: () => base44.entities.SymptomCheckIn.list("-timestamp", 500),
    enabled: !symptomCheckIns,
  });

  const { data: sessions = symptomSessions } = useQuery({
    queryKey: ["symptomSessionsAll"],
    queryFn: () => base44.entities.SymptomSession.list("-start_time", 500),
    enabled: !symptomSessions,
  });

  const { data: frontSessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 500),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const symptomsById = useMemo(() => Object.fromEntries(symptoms.map(s => [s.id, s])), [symptoms]);
  const altersById = useMemo(() => Object.fromEntries(alters.map(a => [a.id, a])), [alters]);
  const interval = useMemo(() => ({ start: startDate, end: endDate }), [startDate, endDate]);

  const filteredCheckIns = useMemo(() =>
    checkIns.filter(c => { try { return isWithinInterval(parseISO(c.timestamp), interval); } catch { return false; } }),
    [checkIns, interval]
  );

  const filteredSessions = useMemo(() =>
    sessions.filter(s => { try { return isWithinInterval(parseISO(s.start_time), interval); } catch { return false; } }),
    [sessions, interval]
  );

  // 8.1 Frequency
  const frequencyData = useMemo(() => {
    const counts = {};
    filteredCheckIns.forEach(c => { counts[c.symptom_id] = (counts[c.symptom_id] || 0) + 1; });
    return Object.entries(counts)
      .map(([id, count]) => ({ name: symptomsById[id]?.label || id, count, color: symptomsById[id]?.color || "#8B5CF6" }))
      .sort((a, b) => b.count - a.count).slice(0, 20);
  }, [filteredCheckIns, symptomsById]);

  // 8.2 Duration
  const durationData = useMemo(() => {
    const durations = {};
    filteredSessions.forEach(s => {
      if (!s.end_time) return;
      const ms = new Date(s.end_time) - new Date(s.start_time);
      durations[s.symptom_id] = (durations[s.symptom_id] || 0) + ms / 3600000;
    });
    return Object.entries(durations)
      .map(([id, hours]) => ({ name: symptomsById[id]?.label || id, hours: Math.round(hours * 10) / 10, color: symptomsById[id]?.color || "#8B5CF6" }))
      .sort((a, b) => b.hours - a.hours).slice(0, 15);
  }, [filteredSessions, symptomsById]);

  // 8.3 Severity over time
  const severityData = useMemo(() => {
    const bySym = {};
    filteredCheckIns.forEach(c => {
      if (c.severity == null) return;
      if (!bySym[c.symptom_id]) bySym[c.symptom_id] = [];
      bySym[c.symptom_id].push({ ts: c.timestamp, severity: c.severity });
    });
    return Object.entries(bySym).slice(0, 5).map(([id, points]) => ({
      symptom: symptomsById[id],
      points: points.sort((a, b) => new Date(a.ts) - new Date(b.ts))
        .map(p => ({ date: format(parseISO(p.ts), "MM/dd"), severity: p.severity })),
    })).filter(x => x.symptom);
  }, [filteredCheckIns, symptomsById]);

  // 8.4 Correlation
  const correlationData = useMemo(() =>
    filteredSessions.filter(s => s.end_time).slice(0, 10).map(ss => {
      const sStart = new Date(ss.start_time), sEnd = new Date(ss.end_time);
      const overlapping = frontSessions.filter(fs => {
        const fsStart = new Date(fs.start_time);
        const fsEnd = fs.end_time ? new Date(fs.end_time) : new Date();
        return fsStart < sEnd && fsEnd > sStart;
      });
      const alterIds = new Set(overlapping.flatMap(fs =>
        fs.alter_id ? [fs.alter_id] : [fs.primary_alter_id, ...(fs.co_fronter_ids || [])].filter(Boolean)
      ));
      return {
        symptom: symptomsById[ss.symptom_id]?.label || "Unknown",
        color: symptomsById[ss.symptom_id]?.color || "#8B5CF6",
        alters: [...alterIds].map(id => altersById[id]?.name).filter(Boolean),
      };
    }).filter(x => x.alters.length > 0),
    [filteredSessions, frontSessions, symptomsById, altersById]
  );

  return (
    <div className="space-y-8">
      {/* 8.1 Frequency */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">Symptom Frequency</h3>
        {frequencyData.length === 0 ? (
          <p className="text-xs text-muted-foreground">No check-ins in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, frequencyData.length * 28)}>
            <BarChart data={frequencyData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [`${v} times`, "Count"]} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {frequencyData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 8.2 Duration */}
      {durationData.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Active Session Duration (hours)</h3>
          <ResponsiveContainer width="100%" height={Math.max(120, durationData.length * 28)}>
            <BarChart data={durationData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [`${v}h`, "Duration"]} />
              <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                {durationData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 8.3 Severity over time */}
      {severityData.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-sm">Severity Over Time</h3>
          {severityData.map(({ symptom, points }) => (
            <div key={symptom.id} className="space-y-1">
              <p className="text-xs font-medium" style={{ color: symptom.color }}>{symptom.label}</p>
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={points} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="severity" stroke={symptom.color} dot={{ r: 3 }} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}

      {/* 8.4 Alter correlation */}
      {correlationData.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Symptom × Alter Overlap</h3>
          <div className="space-y-2">
            {correlationData.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-card">
                <div className="w-2 min-h-[24px] rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: item.color }} />
                <div>
                  <p className="text-sm font-medium">{item.symptom}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.alters.join(", ")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}