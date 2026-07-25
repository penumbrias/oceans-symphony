import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell,
} from "recharts";
import { format, parseISO, isWithinInterval } from "date-fns";
import { useAuthoredPresence } from "@/hooks/useAuthoredPresence";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";

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

  const { data: rawFrontSessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 500),
  });
  // Augment real fronting sessions with inferred-from-authorship presence so
  // symptom↔alter correlation also reflects who was around (via what they
  // posted), not only tracked fronting.
  const { inferredSessions } = useAuthoredPresence();
  const frontSessions = useMemo(
    () => [...rawFrontSessions, ...inferredSessions],
    [rawFrontSessions, inferredSessions]
  );

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

  const terms = useTerms();
  const formatAlter = useAlterLabel();

  // 8.4a Symptoms by alter — from EXPLICIT check-in attribution
  // (fronting_alter_ids written since v0.83.2, per-item assignment or the
  // check-in's fronters; legacy alter_id honoured). This is the view that
  // keeps per-alter symptom analytics useful for systems with little or no
  // fronting history — it needs no sessions at all.
  const byAlterData = useMemo(() => {
    const map = {}; // alterId -> { symptomId: count }
    filteredCheckIns.forEach((c) => {
      const ids = Array.isArray(c.fronting_alter_ids) && c.fronting_alter_ids.length > 0
        ? c.fronting_alter_ids
        : (c.alter_id ? [c.alter_id] : []);
      for (const aid of ids) {
        if (!altersById[aid]) continue;
        if (!map[aid]) map[aid] = {};
        map[aid][c.symptom_id] = (map[aid][c.symptom_id] || 0) + 1;
      }
    });
    return Object.entries(map)
      .map(([aid, counts]) => ({
        alter: altersById[aid],
        total: Object.values(counts).reduce((s, n) => s + n, 0),
        items: Object.entries(counts)
          .map(([sid, count]) => ({ symptom: symptomsById[sid], count }))
          .filter((x) => x.symptom)
          .sort((a, b) => b.count - a.count)
          .slice(0, 6),
      }))
      .filter((r) => r.items.length > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [filteredCheckIns, altersById, symptomsById]);

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

      {/* 8.4a Symptoms by alter (explicit check-in attribution — works with
          zero fronting history) */}
      {byAlterData.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Symptoms by {terms.alter}</h3>
          <div className="space-y-2">
            {byAlterData.map(({ alter, items }) => (
              <div key={alter.id} className="p-3 rounded-xl border border-border/50 bg-card space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 border"
                    style={{ backgroundColor: alter.color || "transparent", borderColor: alter.color || "hsl(var(--border))" }} aria-hidden />
                  <p className="text-sm font-medium">{formatAlter(alter)}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {items.map(({ symptom, count }) => (
                    <span key={symptom.id} className="text-xs px-1.5 py-0.5 rounded-full border text-foreground"
                      style={{ backgroundColor: `${symptom.color || "#8B5CF6"}22`, borderColor: `${symptom.color || "#8B5CF6"}77` }}>
                      {symptom.label}{count > 1 ? ` ×${count}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Built from who each check-in was assigned to — no {terms.fronting} history needed.
          </p>
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