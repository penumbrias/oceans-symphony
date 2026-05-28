import React, { useState, useMemo, useEffect } from "react";
import { format, parseISO, subDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell,
} from "recharts";
import {
  parseSessionEmotions,
  parseSessionSymptoms,
} from "@/lib/perAlterSessionEntries";

// "Log Analytics" rendered above the Check-In Log. Pulls from every
// entity the log itself surfaces — EmotionCheckIn, SymptomCheckIn,
// DiaryCard, StatusNote, FrontingSession (incl. session_emotions /
// session_symptoms), Activity — so the analytics actually reflects
// what the user has been tracking instead of just the diary subset.
//
// All optional props default to empty so any caller can pass only
// what they have. We still fall back to internal useQuery for the
// fields a caller would always want (symptomCheckIns + Symptom
// catalogue) so the component works even when used standalone.

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: 3650 },
];

const EMOTION_COLORS = [
  "#8b5cf6", "#3b82f6", "#14b8a6", "#f59e0b", "#ec4899",
  "#ef4444", "#22c55e", "#f97316", "#6366f1", "#a78bfa",
];

function truncate(str, n = 12) {
  return str && str.length > n ? str.slice(0, n) + "…" : str;
}

function withinRange(tsLike, cutoff) {
  if (!tsLike) return false;
  const t = new Date(tsLike).getTime();
  return Number.isFinite(t) && t >= cutoff;
}

function formatDay(tsLike) {
  return format(new Date(tsLike), "MMM d");
}

export default function DiaryAnalyticsSummary({
  cards = [],
  checkIns = [],
  statusNotes = [],
  frontingSessions = [],
  activities = [],
}) {
  const [rangeDays, setRangeDays] = useState(30);

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  const { data: symptomCheckIns = [] } = useQuery({
    queryKey: ["symptomCheckIns"],
    queryFn: () => base44.entities.SymptomCheckIn.list("-timestamp", 1000),
  });

  const symptomById = useMemo(
    () => Object.fromEntries(symptoms.map((s) => [s.id, s])),
    [symptoms]
  );

  const cutoff = useMemo(
    () => subDays(new Date(), rangeDays).getTime(),
    [rangeDays]
  );

  // Filter each entity by the active range. DiaryCard.date is a yyyy-MM-dd
  // string; everything else has a timestamp (or start_time for
  // FrontingSession).
  const filteredCards = useMemo(
    () => cards.filter((c) => withinRange(c.date, cutoff)),
    [cards, cutoff]
  );
  const filteredCheckIns = useMemo(
    () => checkIns.filter((ci) => withinRange(ci.timestamp, cutoff)),
    [checkIns, cutoff]
  );
  const filteredSymptomCheckIns = useMemo(
    () => symptomCheckIns.filter((sc) => withinRange(sc.timestamp, cutoff)),
    [symptomCheckIns, cutoff]
  );
  const filteredStatusNotes = useMemo(
    () => statusNotes.filter((n) => withinRange(n.timestamp, cutoff)),
    [statusNotes, cutoff]
  );
  const filteredSessions = useMemo(
    () => frontingSessions.filter((s) => withinRange(s.start_time, cutoff)),
    [frontingSessions, cutoff]
  );
  const filteredActivities = useMemo(
    () => activities.filter((a) => withinRange(a.timestamp, cutoff)),
    [activities, cutoff]
  );

  // Totals across all sources, used by both the summary card and the
  // "nothing in this range" hint.
  const totalInRange =
    filteredCards.length +
    filteredCheckIns.length +
    filteredSymptomCheckIns.length +
    filteredStatusNotes.length +
    filteredActivities.length;

  const totalAllTime =
    cards.length +
    checkIns.length +
    symptomCheckIns.length +
    statusNotes.length +
    activities.length;

  // Days active = unique days with any entry. Useful "engagement" stat.
  const daysActive = useMemo(() => {
    const set = new Set();
    filteredCards.forEach((c) => c.date && set.add(c.date));
    filteredCheckIns.forEach((ci) => ci.timestamp && set.add(format(new Date(ci.timestamp), "yyyy-MM-dd")));
    filteredSymptomCheckIns.forEach((sc) => sc.timestamp && set.add(format(new Date(sc.timestamp), "yyyy-MM-dd")));
    filteredStatusNotes.forEach((n) => n.timestamp && set.add(format(new Date(n.timestamp), "yyyy-MM-dd")));
    filteredActivities.forEach((a) => a.timestamp && set.add(format(new Date(a.timestamp), "yyyy-MM-dd")));
    return set.size;
  }, [filteredCards, filteredCheckIns, filteredSymptomCheckIns, filteredStatusNotes, filteredActivities]);

  // Distress rate per day. EmotionCheckIn has an `is_distress` flag;
  // historically intensity was supposed to power a mood-ish chart but
  // nothing in the codebase actually writes intensity, so the chart was
  // always empty. Distress rate is a more honest replacement —
  // 0% means "no distress flagged today", 100% means "every check-in
  // today was flagged distress".
  const distressTrend = useMemo(() => {
    const byDay = new Map();
    for (const ci of filteredCheckIns) {
      if (!ci.timestamp) continue;
      const day = format(new Date(ci.timestamp), "MMM d");
      const bucket = byDay.get(day) || { day, total: 0, distress: 0 };
      bucket.total += 1;
      if (ci.is_distress) bucket.distress += 1;
      byDay.set(day, bucket);
    }
    return [...byDay.values()]
      .filter((b) => b.total > 0)
      .map((b) => ({ date: b.day, rate: Math.round((b.distress / b.total) * 100) }));
  }, [filteredCheckIns]);

  // Daily entry count over time (any kind of entry counts as activity).
  // Useful for spotting tracking habits / gaps.
  const frequencyTrend = useMemo(() => {
    const byDay = new Map();
    const bump = (tsLike) => {
      if (!tsLike) return;
      const day = format(new Date(tsLike), "MMM d");
      byDay.set(day, (byDay.get(day) || 0) + 1);
    };
    filteredCheckIns.forEach((ci) => bump(ci.timestamp));
    filteredSymptomCheckIns.forEach((sc) => bump(sc.timestamp));
    filteredCards.forEach((c) => bump(c.date));
    filteredStatusNotes.forEach((n) => bump(n.timestamp));
    filteredActivities.forEach((a) => bump(a.timestamp));
    return [...byDay.entries()].map(([date, count]) => ({ date, count }));
  }, [filteredCheckIns, filteredSymptomCheckIns, filteredCards, filteredStatusNotes, filteredActivities]);

  // Top emotions — combines EmotionCheckIn.emotions, DiaryCard.emotions,
  // AND FrontingSession.session_emotions (the per-alter panel writes
  // there, separately from EmotionCheckIn).
  const topEmotions = useMemo(() => {
    const freq = {};
    const bump = (label) => {
      if (!label || typeof label !== "string") return;
      freq[label] = (freq[label] || 0) + 1;
    };
    filteredCards.forEach((c) => (c.emotions || []).forEach(bump));
    filteredCheckIns.forEach((ci) => (ci.emotions || []).forEach(bump));
    filteredSessions.forEach((s) => parseSessionEmotions(s.session_emotions).forEach(bump));
    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([label, count]) => ({ label, count }));
  }, [filteredCards, filteredCheckIns, filteredSessions]);

  // Top symptoms — combines SymptomCheckIn (with severity),
  // DiaryCard.checklist.{symptoms,habits} (boolean / numeric grid), AND
  // FrontingSession.session_symptoms (array of { id, label, value }).
  const topSymptoms = useMemo(() => {
    const freq = {};
    const bumpEntry = (label, severity) => {
      if (!label) return;
      if (!freq[label]) freq[label] = { count: 0, sevSum: 0, sevCount: 0 };
      freq[label].count += 1;
      if (typeof severity === "number" && Number.isFinite(severity)) {
        freq[label].sevSum += severity;
        freq[label].sevCount += 1;
      }
    };
    filteredSymptomCheckIns.forEach((sc) => {
      const sym = symptomById[sc.symptom_id];
      const label = sym?.label || sc.symptom_id || "Unknown";
      bumpEntry(label, typeof sc.severity === "number" ? sc.severity : null);
    });
    filteredCards.forEach((c) => {
      const grid = { ...(c.checklist?.symptoms || {}), ...(c.checklist?.habits || {}) };
      for (const [key, val] of Object.entries(grid)) {
        if (val === undefined || val === null || val === false) continue;
        const label = key.replace(/_/g, " ");
        bumpEntry(label, typeof val === "number" ? val : null);
      }
    });
    filteredSessions.forEach((s) => {
      const items = parseSessionSymptoms(s.session_symptoms);
      for (const item of items) {
        if (!item) continue;
        const sym = symptomById[item.id];
        const label = item.label || sym?.label || item.id;
        bumpEntry(label, typeof item.value === "number" ? item.value : null);
      }
    });
    return Object.entries(freq)
      .map(([label, v]) => ({
        label,
        count: v.count,
        avg: v.sevCount > 0 ? (v.sevSum / v.sevCount).toFixed(1) : null,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [filteredSymptomCheckIns, filteredCards, filteredSessions, symptomById]);

  // Mood Trend (DiaryCard-only). Kept so users who DO fill out diary
  // cards still get the emotional_misery / joy line — but moved below
  // the new always-populated charts so the page doesn't look bare on
  // its own.
  const moodTrend = useMemo(() => {
    return filteredCards
      .filter((c) => c.body_mind?.emotional_misery !== undefined || c.body_mind?.joy !== undefined)
      .map((c) => ({
        date: format(parseISO(c.date), "MMM d"),
        misery: c.body_mind?.emotional_misery,
        joy: c.body_mind?.joy,
      }));
  }, [filteredCards]);

  // Suggest widening the range when the user has data overall but
  // nothing in the current range — the most common reason the
  // analytics page looked empty before this rewrite.
  const showRangeHint = totalInRange === 0 && totalAllTime > 0;

  // Truly nothing yet — even "All" has no entries. Different message.
  if (totalAllTime === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground text-sm">
          No entries yet — log a check-in, status note, or symptom and analytics will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Range picker + headline counts */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Range:</span>
        <div className="flex gap-1 bg-muted/40 p-1 rounded-xl">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.label}
              onClick={() => setRangeDays(r.days)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                rangeDays === r.days
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {totalInRange} of {totalAllTime} entries
        </span>
      </div>

      {showRangeHint && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-center gap-3">
          <p className="flex-1 text-xs text-foreground leading-snug">
            Nothing in this range, but you have <strong>{totalAllTime}</strong> entries overall.
          </p>
          <button
            type="button"
            onClick={() => setRangeDays(3650)}
            className="text-xs font-medium text-primary hover:underline whitespace-nowrap"
          >
            View all →
          </button>
        </div>
      )}

      {/* Summary card */}
      <div className="bg-card border border-border/50 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryStat label="Days active" value={daysActive} />
        <SummaryStat label="Check-ins" value={filteredCheckIns.length} />
        <SummaryStat label="Symptoms logged" value={filteredSymptomCheckIns.length} />
        <SummaryStat label="Status notes" value={filteredStatusNotes.length} />
        <SummaryStat label="Activities" value={filteredActivities.length} />
        <SummaryStat label="Diary cards" value={filteredCards.length} />
      </div>

      {/* Entry frequency trend */}
      <ChartCard
        title="Entry Frequency"
        subtitle="Total entries (any kind) logged per day"
      >
        {frequencyTrend.length < 2 ? (
          <EmptyHint text="Need at least 2 days with entries in this range." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={frequencyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => truncate(v, 6)} />
              <YAxis tick={{ fontSize: 11 }} width={24} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-muted)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" name="Entries" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Distress rate */}
      <ChartCard
        title="Distress Rate"
        subtitle="Share of check-ins flagged as distress, per day"
      >
        {distressTrend.length < 2 ? (
          <EmptyHint text="Need at least 2 days of check-ins to show a trend." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={distressTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => truncate(v, 6)} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={32} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-muted)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v) => [`${v}%`, "Distress rate"]}
              />
              <Line type="monotone" dataKey="rate" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Top emotions */}
      <ChartCard
        title="Top Emotions"
        subtitle="Across check-ins, diary cards, and per-alter session entries"
      >
        {topEmotions.length === 0 ? (
          <EmptyHint text="No emotion data logged in this range." />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(140, topEmotions.length * 28)}>
            <BarChart data={topEmotions} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 11 }}
                width={90}
                tickFormatter={(v) => truncate(v, 12)}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-muted)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" name="Times logged" radius={[0, 4, 4, 0]}>
                {topEmotions.map((_, i) => (
                  <Cell key={i} fill={EMOTION_COLORS[i % EMOTION_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Top symptoms */}
      <ChartCard
        title="Top Symptoms"
        subtitle="Across symptom check-ins, diary checklists, and session symptoms"
      >
        {topSymptoms.length === 0 ? (
          <EmptyHint text="No symptom data logged in this range." />
        ) : (
          <div className="space-y-2">
            {topSymptoms.map(({ label, count, avg }) => {
              const maxCount = topSymptoms[0]?.count || 1;
              const pct = Math.round((count / maxCount) * 100);
              return (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-foreground capitalize w-32 flex-shrink-0 truncate" title={label}>
                    {truncate(label, 18)}
                  </span>
                  <div className="flex-1 bg-muted/50 rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-20 text-right flex-shrink-0">
                    {count}x{avg !== null ? ` · avg ${avg}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </ChartCard>

      {/* Mood Trend (diary only). Conditional — only renders when there's
          actual diary mood data, since most users haven't filled out
          the diary card grid. */}
      {moodTrend.length >= 2 && (
        <ChartCard
          title="Mood Trend"
          subtitle="Emotional misery vs. joy, from diary cards"
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={moodTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => truncate(v, 6)} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} width={24} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-muted)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line type="monotone" dataKey="misery" name="Misery" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="joy" name="Joy" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}

function SummaryStat({ label, value }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
      <p className="text-[0.6875rem] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ text }) {
  return <p className="text-xs text-muted-foreground text-center py-6">{text}</p>;
}
