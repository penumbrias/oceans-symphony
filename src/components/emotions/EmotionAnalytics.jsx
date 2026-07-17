import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, TrendingUp, Users, Link2, Activity as ActivityIcon, AlertCircle, CalendarRange } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { parseSessionEmotions } from "@/lib/perAlterSessionEntries";
import { useAuthoredPresence } from "@/hooks/useAuthoredPresence";

// Emotion analytics — revamped. Pulls events from BOTH
// EmotionCheckIn AND FrontingSession.session_emotions so per-alter
// emotions logged inside a fronting session count alongside the
// stand-alone check-ins. Surfaces:
//   - Frequency counts (readable horizontal bars)
//   - Common emotions per alter
//   - Co-occurring emotion pairs (which emotions tend to show up
//     together in the same event)
//   - Emotion ↔ activity correlation (which activities tend to
//     happen within ±90 min of a logged emotion)
//   - Emotion ↔ symptom correlation (same window)
//   - Frequency over time (line chart, daily / weekly / monthly
//     bucketing depending on range length)
//   - Time-of-day distribution

const EMOTION_COLORS = {
  angry: "#ef4444", anxious: "#f97316", calm: "#eab308", confused: "#22c55e",
  happy: "#10b981", hopeful: "#3b82f6", loved: "#ec4899", numb: "#cbd5e1",
  overwhelmed: "#d97706", sad: "#6366f1", stressed: "#fbbf24", tired: "#94a3b8",
};
const FALLBACK_PALETTE = ["#8b5cf6","#06b6d4","#f43f5e","#84cc16","#f59e0b","#10b981","#3b82f6","#ec4899","#14b8a6","#a78bfa"];

function emotionColor(name, index = 0) {
  return EMOTION_COLORS[(name || "").toLowerCase()] || FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

const CORR_WINDOW_MS = 90 * 60 * 1000; // ±90 minutes for correlation

export default function EmotionAnalytics({ from, to }) {
  const t = useTerms();
  const { data: checkIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list(),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["frontingSessionsAll"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 2000),
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });
  const { data: symptomCheckIns = [] } = useQuery({
    queryKey: ["symptomCheckIns"],
    queryFn: () => base44.entities.SymptomCheckIn.list(),
  });
  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  const { inferAlters } = useAuthoredPresence();

  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const symptomsById = useMemo(() => Object.fromEntries(symptoms.map((s) => [s.id, s])), [symptoms]);
  const inRange = (ts) => ts >= +from && ts <= +to;

  // Unified "emotion event" list: { ts, labels[], alterIds[] }
  // Pulls both EmotionCheckIn and per-alter session_emotions, so the
  // analytics reflect every emotion logged anywhere — not just the
  // standalone check-in flow.
  const events = useMemo(() => {
    const out = [];
    for (const c of checkIns) {
      const ts = +new Date(c.timestamp);
      if (!Number.isFinite(ts) || !inRange(ts)) continue;
      const labels = Array.isArray(c.emotions) ? c.emotions.filter(Boolean) : [];
      if (labels.length === 0) continue;
      // Use the explicitly-recorded fronting alters; if none (e.g. the user
      // doesn't track fronting), fall back to whoever authored something near
      // this time so the emotion still gets attributed.
      const explicit = Array.isArray(c.fronting_alter_ids) ? c.fronting_alter_ids.filter(Boolean) : [];
      out.push({ ts, labels, alterIds: explicit.length ? explicit : inferAlters(ts) });
    }
    for (const s of sessions) {
      const labels = parseSessionEmotions(s.session_emotions);
      if (labels.length === 0) continue;
      const ts = +new Date(s.start_time || s.timestamp);
      if (!Number.isFinite(ts) || !inRange(ts)) continue;
      const alterId = s.alter_id || s.primary_alter_id;
      out.push({ ts, labels, alterIds: alterId ? [alterId] : [] });
    }
    return out.sort((a, b) => a.ts - b.ts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIns, sessions, +from, +to, inferAlters]);

  // 1) Frequency counts (sorted, readable)
  const emotionCounts = useMemo(() => {
    const counts = {};
    for (const e of events) for (const l of e.labels) counts[l] = (counts[l] || 0) + 1;
    return Object.entries(counts).map(([emotion, count]) => ({ emotion, count }))
      .sort((a, b) => b.count - a.count);
  }, [events]);
  const topEmotion = emotionCounts[0];
  const maxCount = topEmotion?.count || 1;

  // 2) Common emotions per alter
  const emotionsByAlter = useMemo(() => {
    const map = {};
    for (const e of events) {
      for (const aid of e.alterIds) {
        if (!map[aid]) map[aid] = {};
        for (const l of e.labels) map[aid][l] = (map[aid][l] || 0) + 1;
      }
    }
    return Object.entries(map)
      // Skip ids that don't resolve to a current alter (deleted/legacy
      // references) — they'd otherwise show as a raw hex id row.
      .filter(([aid]) => altersById[aid])
      .map(([aid, m]) => {
        const a = altersById[aid];
        const totalCount = Object.values(m).reduce((s, n) => s + n, 0);
        return {
          alterId: aid,
          name: a?.name || aid,
          color: a?.color,
          total: totalCount,
          top: Object.entries(m).map(([emotion, count]) => ({ emotion, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8),
        };
      })
      .filter((row) => row.top.length > 0)
      .sort((a, b) => b.total - a.total);
  }, [events, altersById]);

  // 3) Co-occurring emotion pairs (same event)
  const pairs = useMemo(() => {
    const counts = {};
    for (const e of events) {
      const unique = [...new Set(e.labels)];
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const key = [unique[i], unique[j]].sort().join(" ");
          counts[key] = (counts[key] || 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .map(([key, count]) => {
        const [a, b] = key.split(" ");
        return { a, b, count };
      })
      .sort((x, y) => y.count - x.count)
      .slice(0, 12);
  }, [events]);

  // 4) Emotion ↔ activity correlation. For each (emotion, activity)
  //    pair, count how many activity timestamps land within ±90min
  //    of an emotion event with that label.
  const emotionActivityPairs = useMemo(() => {
    const counts = new Map();
    for (const e of events) {
      for (const act of activities) {
        const ats = +new Date(act.timestamp);
        if (!Number.isFinite(ats) || !inRange(ats)) continue;
        if (Math.abs(ats - e.ts) > CORR_WINDOW_MS) continue;
        const aname = act.activity_name || "?";
        for (const l of e.labels) {
          const key = l + "||" + aname;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
    return [...counts.entries()]
      .map(([key, count]) => {
        const [emotion, activity] = key.split("||");
        return { emotion, activity, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, activities, +from, +to]);

  // 5) Emotion ↔ symptom correlation (same ±90min window)
  const emotionSymptomPairs = useMemo(() => {
    const counts = new Map();
    for (const e of events) {
      for (const sc of symptomCheckIns) {
        const sts = +new Date(sc.timestamp);
        if (!Number.isFinite(sts) || !inRange(sts)) continue;
        if (Math.abs(sts - e.ts) > CORR_WINDOW_MS) continue;
        const sym = symptomsById[sc.symptom_id];
        const symLabel = sym?.label || "?";
        for (const l of e.labels) {
          const key = l + "||" + symLabel;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
    return [...counts.entries()]
      .map(([key, count]) => {
        const [emotion, symptom] = key.split("||");
        return { emotion, symptom, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, symptomCheckIns, symptomsById, +from, +to]);

  // 6) Frequency over time. Auto-bucket: <=14 days = daily, <=120 = weekly,
  //    else monthly. Each bucket carries counts for the top 6 emotions.
  const overTime = useMemo(() => {
    if (events.length === 0) return { rows: [], topLabels: [] };
    const spanMs = +to - +from;
    const days = spanMs / (24 * 60 * 60 * 1000);
    const grain = days <= 14 ? "day" : days <= 120 ? "week" : "month";
    const bucketKey = (ts) => {
      const d = new Date(ts);
      if (grain === "day") return d.toISOString().slice(0, 10);
      if (grain === "week") {
        // Days since Monday (Mon=0 … Sun=6). getUTCDay() alone starts weeks on
        // Sunday, so buckets labelled "monday" were actually a day off.
        const day = (d.getUTCDay() + 6) % 7;
        const diff = d.getUTCDate() - day;
        const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
        return monday.toISOString().slice(0, 10);
      }
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    };
    const topLabels = emotionCounts.slice(0, 6).map((e) => e.emotion);
    const byBucket = new Map();
    for (const e of events) {
      const k = bucketKey(e.ts);
      if (!byBucket.has(k)) {
        const row = { bucket: k };
        for (const l of topLabels) row[l] = 0;
        byBucket.set(k, row);
      }
      const row = byBucket.get(k);
      for (const l of e.labels) {
        if (topLabels.includes(l)) row[l] = (row[l] || 0) + 1;
      }
    }
    return { rows: [...byBucket.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)), topLabels, grain };
  }, [events, emotionCounts, +from, +to]);

  // 7) Hour-of-day distribution + stacked top-emotion breakdown.
  const hourDistribution = useMemo(() => {
    const tally = Array.from({ length: 24 }, () => ({ count: 0, byLabel: {} }));
    for (const e of events) {
      const h = new Date(e.ts).getHours();
      tally[h].count += e.labels.length;
      for (const l of e.labels) tally[h].byLabel[l] = (tally[h].byLabel[l] || 0) + 1;
    }
    return tally.map((t, hour) => ({ hour: `${String(hour).padStart(2, "0")}:00`, count: t.count, byLabel: t.byLabel }));
  }, [events]);

  // 8) Day-of-week breakdown (Sun–Sat)
  const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOfWeekDistribution = useMemo(() => {
    const tally = Array.from({ length: 7 }, () => 0);
    for (const e of events) {
      const d = new Date(e.ts).getDay();
      tally[d] += e.labels.length;
    }
    return tally.map((count, i) => ({ label: DOW_LABELS[i], count }));
  }, [events]);

  // 9) Month-of-year breakdown
  const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthDistribution = useMemo(() => {
    const tally = Array.from({ length: 12 }, () => 0);
    for (const e of events) {
      const m = new Date(e.ts).getMonth();
      tally[m] += e.labels.length;
    }
    return tally.map((count, i) => ({ label: MONTH_LABELS[i], count }));
  }, [events]);

  // 10) Season breakdown (Northern hemisphere)
  const SEASON_LABELS = ["Winter", "Spring", "Summer", "Fall"];
  const seasonDistribution = useMemo(() => {
    const tally = [0, 0, 0, 0];
    const topByLabel = [{}, {}, {}, {}];
    const monthToSeason = (m) => {
      if (m === 11 || m === 0 || m === 1) return 0; // Winter (Dec/Jan/Feb)
      if (m >= 2 && m <= 4) return 1;               // Spring (Mar–May)
      if (m >= 5 && m <= 7) return 2;               // Summer (Jun–Aug)
      return 3;                                      // Fall (Sep–Nov)
    };
    for (const e of events) {
      const s = monthToSeason(new Date(e.ts).getMonth());
      tally[s] += e.labels.length;
      for (const l of e.labels) topByLabel[s][l] = (topByLabel[s][l] || 0) + 1;
    }
    return tally.map((count, i) => ({
      label: SEASON_LABELS[i],
      count,
      top: Object.entries(topByLabel[i]).sort((a, b) => b[1] - a[1]).slice(0, 3),
    }));
  }, [events]);

  // 11) Chronological list of every emotion event in this span
  const chronological = useMemo(() => {
    return [...events].sort((a, b) => b.ts - a.ts).slice(0, 200);
  }, [events]);

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No emotion data in this range yet. Log some quick check-ins or per-{t.alter || "alter"} session emotions to see analytics here.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header summary */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <Stat label="Emotion entries" value={events.length} />
            <Stat label="Unique emotions" value={emotionCounts.length} />
            <Stat label="Top emotion" value={topEmotion?.emotion || "—"} sublabel={topEmotion ? `${topEmotion.count}×` : null} />
            <Stat label={`${t.Alters || "Alters"} logged`} value={emotionsByAlter.length} />
          </div>
        </CardContent>
      </Card>

      {/* Frequency counts — readable horizontal bars */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Heart className="w-5 h-5 text-destructive" />
            Most Frequent Emotions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {emotionCounts.slice(0, 25).map((e, i) => {
              const color = emotionColor(e.emotion, i);
              const pct = Math.max(2, Math.round((e.count / maxCount) * 100));
              return (
                <div key={e.emotion} className="flex items-center gap-2">
                  <span className="text-xs font-medium w-32 truncate" style={{ color }}>{e.emotion}</span>
                  <div className="flex-1 h-5 rounded-md bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-md" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-xs tabular-nums w-10 text-right text-muted-foreground">{e.count}</span>
                </div>
              );
            })}
          </div>
          {emotionCounts.length > 25 && (
            <p className="text-[0.6875rem] text-muted-foreground mt-3">…and {emotionCounts.length - 25} more.</p>
          )}
        </CardContent>
      </Card>

      {/* Frequency over time */}
      {overTime.rows.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="w-5 h-5 text-primary" />
              Emotions over time
              <span className="text-[0.6875rem] font-normal text-muted-foreground ml-2">({overTime.grain}ly)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={overTime.rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="bucket" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                {overTime.topLabels.map((label, i) => (
                  <Line
                    key={label}
                    type="monotone"
                    dataKey={label}
                    stroke={emotionColor(label, i)}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-2">
              {overTime.topLabels.map((label, i) => (
                <span key={label} className="inline-flex items-center gap-1 text-[0.6875rem]">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: emotionColor(label, i) }} />
                  {label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Common emotions per alter */}
      {emotionsByAlter.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5 text-primary" />
              Common emotions per {t.alter || "alter"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {emotionsByAlter.map((row) => {
                const localMax = Math.max(...row.top.map((e) => e.count));
                return (
                  <div key={row.alterId} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color || "#8b5cf6" }} />
                      <p className="text-sm font-semibold flex-1">{row.name}</p>
                      <span className="text-[0.6875rem] text-muted-foreground">{row.total} entries</span>
                    </div>
                    {row.top.map((e, i) => {
                      const color = emotionColor(e.emotion, i);
                      const pct = Math.max(2, Math.round((e.count / localMax) * 100));
                      return (
                        <div key={e.emotion} className="flex items-center gap-2">
                          <span className="text-[0.6875rem] font-medium w-28 truncate" style={{ color }}>{e.emotion}</span>
                          <div className="flex-1 h-3.5 rounded-md bg-muted/40 overflow-hidden">
                            <div className="h-full rounded-md" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                          <span className="text-[0.6875rem] tabular-nums w-8 text-right text-muted-foreground">{e.count}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <p className="text-[0.6875rem] text-muted-foreground mt-3 leading-snug">
              Sources: per-{t.alter || "alter"} session emotions logged inside a fronting session AND Quick Check-In emotions
              while that {t.alter || "alter"} was {t.fronting || "fronting"}. This is the same dataset Help me unblend's "dominant feeling" question pulls from.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Co-occurring emotion pairs */}
      {pairs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Link2 className="w-5 h-5 text-primary" />
              Emotions that overlap
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">Pairs logged together in the same entry.</p>
            <div className="flex flex-wrap gap-2">
              {pairs.map(({ a, b, count }) => (
                <span
                  key={`${a}+${b}`}
                  className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border border-border/60 bg-muted/30"
                >
                  <span style={{ color: emotionColor(a, 0) }}>{a}</span>
                  <span className="text-muted-foreground">+</span>
                  <span style={{ color: emotionColor(b, 1) }}>{b}</span>
                  <span className="text-[0.6875rem] text-muted-foreground tabular-nums">× {count}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Emotion × Activity correlation */}
      {emotionActivityPairs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ActivityIcon className="w-5 h-5 text-primary" />
              Emotions associated with activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">
              When an emotion event lands within ±90 min of an activity log.
            </p>
            <div className="space-y-1">
              {emotionActivityPairs.map(({ emotion, activity, count }, i) => (
                <div key={`${emotion}+${activity}`} className="flex items-center gap-2 text-xs">
                  <span className="font-medium w-28 truncate" style={{ color: emotionColor(emotion, i) }}>{emotion}</span>
                  <span className="text-muted-foreground/60">↔</span>
                  <span className="flex-1 truncate">{activity}</span>
                  <span className="text-[0.6875rem] text-muted-foreground tabular-nums">× {count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Emotion × Symptom correlation */}
      {emotionSymptomPairs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="w-5 h-5 text-primary" />
              Emotions associated with symptoms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">
              When an emotion event lands within ±90 min of a symptom check-in.
            </p>
            <div className="space-y-1">
              {emotionSymptomPairs.map(({ emotion, symptom, count }, i) => (
                <div key={`${emotion}+${symptom}`} className="flex items-center gap-2 text-xs">
                  <span className="font-medium w-28 truncate" style={{ color: emotionColor(emotion, i) }}>{emotion}</span>
                  <span className="text-muted-foreground/60">↔</span>
                  <span className="flex-1 truncate">{symptom}</span>
                  <span className="text-[0.6875rem] text-muted-foreground tabular-nums">× {count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hour distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarRange className="w-5 h-5 text-primary" />
            Hour of day
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0.5">
            {hourDistribution.filter((h) => h.count > 0).map((h) => {
              const localMax = Math.max(...hourDistribution.map((x) => x.count), 1);
              const pct = Math.max(2, Math.round((h.count / localMax) * 100));
              return (
                <div key={h.hour} className="flex items-center gap-2">
                  <span className="text-[0.6875rem] tabular-nums w-12 text-muted-foreground">{h.hour}</span>
                  <div className="flex-1 h-3 rounded-md bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-md bg-primary/60" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[0.6875rem] tabular-nums w-8 text-right text-muted-foreground">{h.count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Day of week */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarRange className="w-5 h-5 text-primary" />
            Day of week
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DistributionBars rows={dayOfWeekDistribution} />
        </CardContent>
      </Card>

      {/* Month of year */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarRange className="w-5 h-5 text-primary" />
            Month of year
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DistributionBars rows={monthDistribution} />
        </CardContent>
      </Card>

      {/* Season */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarRange className="w-5 h-5 text-primary" />
            Season
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {seasonDistribution.map((s) => (
              <div key={s.label} className="rounded-xl border border-border/40 bg-card p-3 text-center space-y-1">
                <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className="text-xl font-semibold">{s.count}</p>
                {s.top.length > 0 && (
                  <p className="text-[0.6875rem] text-muted-foreground leading-snug">
                    {s.top.map(([em]) => em).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* All emotions in this span — chronological */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Heart className="w-5 h-5 text-destructive" />
            All emotions logged in this period
            <span className="text-[0.6875rem] font-normal text-muted-foreground ml-2">{events.length} entries</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {chronological.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-border/30 last:border-b-0">
                <span className="text-muted-foreground tabular-nums w-36 flex-shrink-0">
                  {new Date(e.ts).toLocaleString()}
                </span>
                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                  {e.labels.map((l, j) => (
                    <span
                      key={`${l}-${j}`}
                      className="inline-block text-[0.6875rem] px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${emotionColor(l, j)}33`, color: emotionColor(l, j) }}
                    >
                      {l}
                    </span>
                  ))}
                </div>
                {e.alterIds.length > 0 && (
                  <span className="text-[0.6875rem] text-muted-foreground truncate max-w-[90px]">
                    {e.alterIds.map((id) => altersById[id]?.name).filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
            ))}
            {events.length > chronological.length && (
              <p className="text-[0.6875rem] text-muted-foreground italic pt-2">
                Showing the {chronological.length} most recent of {events.length}.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DistributionBars({ rows }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-1">
      {rows.map((r) => {
        const pct = r.count === 0 ? 0 : Math.max(2, Math.round((r.count / max) * 100));
        return (
          <div key={r.label} className="flex items-center gap-2">
            <span className="text-[0.6875rem] tabular-nums w-10 text-muted-foreground">{r.label}</span>
            <div className="flex-1 h-3 rounded-md bg-muted/40 overflow-hidden">
              {pct > 0 && <div className="h-full rounded-md bg-primary/60" style={{ width: `${pct}%` }} />}
            </div>
            <span className="text-[0.6875rem] tabular-nums w-8 text-right text-muted-foreground">{r.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, sublabel }) {
  return (
    <div>
      <p className="text-xl font-semibold leading-tight">{value}</p>
      <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</p>
      {sublabel && <p className="text-[0.6875rem] text-muted-foreground">{sublabel}</p>}
    </div>
  );
}
