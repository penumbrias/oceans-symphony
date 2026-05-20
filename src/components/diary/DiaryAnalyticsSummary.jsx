import React, { useState, useMemo } from "react";
import { format, parseISO, subDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell,
} from "recharts";

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "All", days: 3650 },
];

const EMOTION_COLORS = [
  "#8b5cf6", "#3b82f6", "#14b8a6", "#f59e0b", "#ec4899",
  "#ef4444", "#22c55e", "#f97316", "#6366f1", "#a78bfa",
];

function truncate(str, n = 12) {
  return str && str.length > n ? str.slice(0, n) + "…" : str;
}

export default function DiaryAnalyticsSummary({ cards, checkIns = [] }) {
  const [rangeDays, setRangeDays] = useState(14);

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  const { data: symptomCheckIns = [] } = useQuery({
    queryKey: ["symptomCheckIns"],
    queryFn: () => base44.entities.SymptomCheckIn.list("-timestamp", 1000),
  });

  const symptomById = useMemo(
    () => Object.fromEntries(symptoms.map(s => [s.id, s])),
    [symptoms]
  );

  const filtered = useMemo(() => {
    const cutoff = subDays(new Date(), rangeDays).getTime();
    return cards
      .filter(c => c.date && new Date(c.date).getTime() >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [cards, rangeDays]);

  // EmotionCheckIn records (Quick Check-In + Check-In Log entries)
  // also live on this page, so the analytics surface needs to count
  // their emotions and treat them as "entries" for range / empty-
  // state purposes. Previously only DiaryCard rows fed the tally,
  // which made the chart look empty for users who never filled out
  // a diary card.
  const filteredCheckIns = useMemo(() => {
    const cutoff = subDays(new Date(), rangeDays).getTime();
    return (checkIns || []).filter(ci => {
      if (!ci.timestamp) return false;
      const t = new Date(ci.timestamp).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [checkIns, rangeDays]);

  const filteredSymptomCheckIns = useMemo(() => {
    const cutoff = subDays(new Date(), rangeDays).getTime();
    return symptomCheckIns.filter(sc => {
      if (!sc.timestamp) return false;
      const t = new Date(sc.timestamp).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [symptomCheckIns, rangeDays]);

  // Mood trend: emotional_misery and joy over time
  const moodTrend = useMemo(() => {
    return filtered
      .filter(c => c.body_mind?.emotional_misery !== undefined || c.body_mind?.joy !== undefined)
      .map(c => ({
        date: format(parseISO(c.date), "MMM d"),
        misery: c.body_mind?.emotional_misery,
        joy: c.body_mind?.joy,
      }));
  }, [filtered]);

  // Top emotions frequency — counts emotions across BOTH diary
  // cards and emotion check-ins (the latter are what most users
  // actually log on the Check-In Log page).
  const topEmotions = useMemo(() => {
    const freq = {};
    filtered.forEach(c => (c.emotions || []).forEach(e => { freq[e] = (freq[e] || 0) + 1; }));
    filteredCheckIns.forEach(ci => (ci.emotions || []).forEach(e => { freq[e] = (freq[e] || 0) + 1; }));
    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([label, count]) => ({ label, count }));
  }, [filtered, filteredCheckIns]);

  // Intensity trend — average EmotionCheckIn.intensity per day. Lets
  // users with no diary cards still see a mood-ish line. Diary cards
  // don't carry an intensity field, so this is check-in-only.
  const intensityTrend = useMemo(() => {
    if (filteredCheckIns.length < 2) return [];
    const byDay = new Map();
    for (const ci of filteredCheckIns) {
      if (ci.intensity == null) continue;
      const day = format(new Date(ci.timestamp), "MMM d");
      const bucket = byDay.get(day) || { day, total: 0, count: 0 };
      bucket.total += Number(ci.intensity) || 0;
      bucket.count += 1;
      byDay.set(day, bucket);
    }
    return [...byDay.values()]
      .filter(b => b.count > 0)
      .map(b => ({ date: b.day, intensity: Number((b.total / b.count).toFixed(2)) }));
  }, [filteredCheckIns]);

  // Symptom frequency table — merges DiaryCard.checklist data with the
  // standalone SymptomCheckIn entity (Quick Check-In writes to the latter,
  // not into the diary checklist, so omitting it makes the chart look empty
  // for users who never fill out the diary's symptoms grid).
  const symptomFreq = useMemo(() => {
    const freq = {};
    const bump = (key, val) => {
      if (val === undefined || val === null || val === false) return;
      if (!freq[key]) freq[key] = { count: 0, total: 0, entries: 0 };
      freq[key].entries++;
      if (typeof val === "number") { freq[key].total += val; freq[key].count++; }
      else if (val === true) freq[key].count++;
    };

    filtered.forEach(c => {
      const syms = { ...(c.checklist?.symptoms || {}), ...(c.checklist?.habits || {}) };
      Object.entries(syms).forEach(([key, val]) => bump(key, val));
    });

    filteredSymptomCheckIns.forEach(sc => {
      if (!sc.symptom_id) return;
      const sym = symptomById[sc.symptom_id];
      const label = sym?.label || sc.symptom_id;
      const val = sc.severity !== null && sc.severity !== undefined
        ? Number(sc.severity)
        : true;
      bump(label, val);
    });

    const denom = filtered.length + filteredSymptomCheckIns.length;
    return Object.entries(freq)
      .map(([key, v]) => ({
        label: key.replace(/_/g, " "),
        count: v.count,
        avg: v.entries > 0 && v.total > 0 ? (v.total / v.entries).toFixed(1) : null,
        pct: Math.round((v.count / (denom || 1)) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [filtered, filteredSymptomCheckIns, symptomById]);

  if (cards.length === 0 && (checkIns || []).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground text-sm">No check-ins or diary cards yet — log a few entries to see analytics here.</p>
      </div>
    );
  }

  const totalEntries = filtered.length + filteredCheckIns.length;

  return (
    <div className="space-y-5">
      {/* Range picker */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Range:</span>
        <div className="flex gap-1 bg-muted/40 p-1 rounded-xl">
          {RANGE_OPTIONS.map(r => (
            <button key={r.label} onClick={() => setRangeDays(r.days)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${rangeDays === r.days ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{totalEntries} entries</span>
      </div>

      {/* Mood Trend Line Chart — diary cards only (they're the
          source of the misery/joy axes). For users who don't fill
          out diary cards, the Intensity Trend block below picks up
          their EmotionCheckIn data instead. */}
      <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold">Mood Trend</p>
          <p className="text-xs text-muted-foreground">Emotional misery vs. joy from diary cards</p>
        </div>
        {moodTrend.length < 2 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Need at least 2 rated diary entries to show trend.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={moodTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => truncate(v, 6)} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} width={24} />
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-muted)", borderRadius: 8, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="misery" name="Misery" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="joy" name="Joy" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Check-In Intensity Trend — average EmotionCheckIn intensity
          per day. Surfaces a mood-ish line for users whose primary
          input is the Quick Check-In rather than the diary card. */}
      {(checkIns || []).length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">Check-In Intensity</p>
            <p className="text-xs text-muted-foreground">Average emotion intensity per day, from check-ins</p>
          </div>
          {intensityTrend.length < 2 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Need at least 2 rated check-ins to show trend.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={intensityTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => truncate(v, 6)} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} width={24} />
                <Tooltip
                  contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-muted)", borderRadius: 8, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="intensity" name="Intensity" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Top Emotions Bar Chart */}
      <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold">Top Emotions</p>
          <p className="text-xs text-muted-foreground">Most frequently logged emotions</p>
        </div>
        {topEmotions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No emotion data in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topEmotions} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={90}
                tickFormatter={v => truncate(v, 12)} />
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-muted)", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="count" name="Times logged" radius={[0, 4, 4, 0]}>
                {topEmotions.map((_, i) => (
                  <Cell key={i} fill={EMOTION_COLORS[i % EMOTION_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Symptom Frequency Table */}
      <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold">Symptom & Habit Frequency</p>
          <p className="text-xs text-muted-foreground">How often each symptom or habit was logged</p>
        </div>
        {symptomFreq.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No symptom data in this range.</p>
        ) : (
          <div className="space-y-2">
            {symptomFreq.map(({ label, count, avg, pct }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs text-foreground capitalize w-32 flex-shrink-0 truncate" title={label}>
                  {truncate(label, 16)}
                </span>
                <div className="flex-1 bg-muted/50 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-16 text-right flex-shrink-0">
                  {count}x {avg !== null ? `(avg ${avg})` : `(${pct}%)`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}