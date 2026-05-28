import React, { useState, useMemo } from "react";
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
import { WHEEL } from "@/components/emotions/EmotionWheelPicker";
import { loadSystemDistressSet } from "@/lib/emotionDistress";
import { useTerms } from "@/lib/useTerms";

// "Log Analytics" rendered above the Check-In Log. Pulls from every
// entity the log itself surfaces — EmotionCheckIn, SymptomCheckIn,
// DiaryCard, StatusNote, FrontingSession (incl. session_emotions /
// session_symptoms), Activity — and surfaces patterns: emotional
// balance, time-of-day distribution, per-alter breakdowns, and
// distress co-occurrence.
//
// Most aggregations are O(filtered_records) per useMemo, so the page
// stays snappy even with thousands of records.

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

const CATEGORY_META = {
  good:    { label: "Good",    color: "#22c55e" },
  neutral: { label: "Neutral", color: "#6b7280" },
  bad:     { label: "Bad",     color: "#ef4444" },
  body:    { label: "Body",    color: "#f97316" },
};

const CATEGORY_ORDER = ["good", "neutral", "bad", "body"];

// Build a label → category lookup from the WHEEL constant. Built-in
// emotions live across cores + subs + flat lists; we flatten them all
// once at module load. Custom emotions get folded in at runtime via
// the data fetched in the component (CustomEmotion.category).
const BUILTIN_EMOTION_CATEGORY = (() => {
  const out = {};
  for (const [catKey, cat] of Object.entries(WHEEL)) {
    if (cat.flat) for (const label of cat.flat) out[label] = catKey;
    if (cat.cores) {
      for (const [coreName, { subs }] of Object.entries(cat.cores)) {
        out[coreName] = catKey;
        for (const sub of subs) out[sub] = catKey;
      }
    }
  }
  return out;
})();

// Body emotions break further into one of the five nervous-system
// states (Calm, Flight, Fight, Freeze, Collapse). Each WHEEL.body
// core's label IS a valid emotion, and so is every entry in its subs
// array — we map both to the core name.
const BODY_SUBCATEGORY = (() => {
  const out = {};
  const cores = WHEEL.body?.cores || {};
  for (const [coreName, { subs }] of Object.entries(cores)) {
    out[coreName] = coreName;
    for (const sub of subs || []) out[sub] = coreName;
  }
  return out;
})();

const BODY_SUB_ORDER = ["Calm", "Flight", "Fight", "Freeze", "Collapse"];

const BODY_SUB_META = {
  Calm:     { label: "Calm",     color: "#84cc16" },
  Flight:   { label: "Flight",   color: "#fbbf24" },
  Fight:    { label: "Fight",    color: "#f97316" },
  Freeze:   { label: "Freeze",   color: "#60a5fa" },
  Collapse: { label: "Collapse", color: "#94a3b8" },
};

function truncate(str, n = 12) {
  return str && str.length > n ? str.slice(0, n) + "…" : str;
}

function withinRange(tsLike, cutoff) {
  if (!tsLike) return false;
  const t = new Date(tsLike).getTime();
  return Number.isFinite(t) && t >= cutoff;
}

function ymd(tsLike) {
  return format(new Date(tsLike), "yyyy-MM-dd");
}

export default function DiaryAnalyticsSummary({
  cards = [],
  checkIns = [],
  statusNotes = [],
  frontingSessions = [],
  activities = [],
}) {
  const t = useTerms();
  const [rangeDays, setRangeDays] = useState(30);

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  const { data: symptomCheckIns = [] } = useQuery({
    queryKey: ["symptomCheckIns"],
    queryFn: () => base44.entities.SymptomCheckIn.list("-timestamp", 1000),
  });

  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => base44.entities.CustomEmotion.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const symptomById = useMemo(
    () => Object.fromEntries(symptoms.map((s) => [s.id, s])),
    [symptoms]
  );

  const alterById = useMemo(
    () => Object.fromEntries(alters.map((a) => [a.id, a])),
    [alters]
  );

  const categoryById = useMemo(
    () => Object.fromEntries(activityCategories.map((c) => [c.id, c])),
    [activityCategories]
  );

  // Final emotion → category map = builtin + custom (custom wins if a
  // user has overridden a builtin label, which is unusual but legal).
  const emotionCategory = useMemo(() => {
    const out = { ...BUILTIN_EMOTION_CATEGORY };
    for (const ce of customEmotions) {
      if (!ce.label) continue;
      const cat = ce.category && CATEGORY_META[ce.category] ? ce.category : null;
      if (cat) out[ce.label] = cat;
    }
    return out;
  }, [customEmotions]);

  const cutoff = useMemo(
    () => subDays(new Date(), rangeDays).getTime(),
    [rangeDays]
  );

  // Filter each entity by the active range. DiaryCard.date is yyyy-MM-dd;
  // everything else uses timestamp / start_time.
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

  // Days active = unique days with ANY entry.
  const daysActive = useMemo(() => {
    const set = new Set();
    filteredCards.forEach((c) => c.date && set.add(c.date));
    filteredCheckIns.forEach((ci) => ci.timestamp && set.add(ymd(ci.timestamp)));
    filteredSymptomCheckIns.forEach((sc) => sc.timestamp && set.add(ymd(sc.timestamp)));
    filteredStatusNotes.forEach((n) => n.timestamp && set.add(ymd(n.timestamp)));
    filteredActivities.forEach((a) => a.timestamp && set.add(ymd(a.timestamp)));
    return set.size;
  }, [filteredCards, filteredCheckIns, filteredSymptomCheckIns, filteredStatusNotes, filteredActivities]);

  // Set of "distressing" emotion labels — combines the system distress
  // set (built-in labels the user has marked distressing in Settings ->
  // Emotions) with custom emotions flagged is_distressing. Comparisons
  // are case-insensitive because the system set is stored lowercase.
  // Distress in this analytics module is derived FROM the emotion
  // labels on each check-in (the EmotionCheckIn.is_distress field is
  // not written by any code path — verified by grepping `is_distress:`
  // across src/ — so it was always 0%).
  const distressLabelSet = useMemo(() => {
    const sys = loadSystemDistressSet(); // already lowercase
    const custom = new Set();
    for (const ce of customEmotions) {
      if (ce && ce.is_distressing && ce.label) custom.add(ce.label.toLowerCase());
    }
    return { sys, custom };
  }, [customEmotions]);

  const isLabelDistressing = (label) => {
    if (!label || typeof label !== "string") return false;
    const k = label.toLowerCase();
    return distressLabelSet.sys.has(k) || distressLabelSet.custom.has(k);
  };

  const isCheckInDistressing = (ci) =>
    (ci.emotions || []).some(isLabelDistressing);

  // Distress rate (overall) — share of check-ins whose emotions
  // include at least one label marked distressing.
  const distressOverall = useMemo(() => {
    if (filteredCheckIns.length === 0) return null;
    const distressed = filteredCheckIns.filter(isCheckInDistressing).length;
    return Math.round((distressed / filteredCheckIns.length) * 100);
  }, [filteredCheckIns, distressLabelSet]); // eslint-disable-line react-hooks/exhaustive-deps

  // Categorize a single emotion label using the merged builtin + custom
  // map. Unknown labels fall back to "neutral" — better than dropping
  // them, since we still want them to count in totals.
  const labelCategory = (label) => emotionCategory[label] || "neutral";

  // Pull every emotion the user logged across sources, attaching meta
  // (timestamp, alter_id, source). Used by multiple downstream charts.
  const emotionEvents = useMemo(() => {
    const out = [];
    filteredCheckIns.forEach((ci) => {
      const alterIds = ci.fronting_alter_ids?.length ? ci.fronting_alter_ids : (ci.alter_id ? [ci.alter_id] : []);
      const wasDistress = isCheckInDistressing(ci);
      (ci.emotions || []).forEach((label) => {
        if (typeof label !== "string") return;
        out.push({
          label,
          timestamp: ci.timestamp,
          alterIds,
          isDistress: wasDistress,
          source: "checkin",
        });
      });
    });
    filteredCards.forEach((c) => {
      const alterIds = c.alter_id ? [c.alter_id] : [];
      (c.emotions || []).forEach((label) => {
        if (typeof label !== "string") return;
        out.push({
          label,
          timestamp: c.date,
          alterIds,
          isDistress: false,
          source: "diary",
        });
      });
    });
    filteredSessions.forEach((s) => {
      const alterIds = s.alter_id ? [s.alter_id] : [];
      parseSessionEmotions(s.session_emotions).forEach((label) => {
        if (typeof label !== "string") return;
        out.push({
          label,
          timestamp: s.start_time,
          alterIds,
          isDistress: false,
          source: "session",
        });
      });
    });
    return out;
  }, [filteredCheckIns, filteredCards, filteredSessions]);

  // ── Aggregations ────────────────────────────────────────────────────

  // Emotional balance — counts per category across emotionEvents. Used
  // both as a summary stat and as a chart.
  const balance = useMemo(() => {
    const counts = { good: 0, neutral: 0, bad: 0, body: 0 };
    for (const e of emotionEvents) counts[labelCategory(e.label)] += 1;
    const total = counts.good + counts.neutral + counts.bad + counts.body;
    return { counts, total };
  }, [emotionEvents, emotionCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Body & Nervous System breakdown — every body-category emotion falls
  // into one of Calm / Flight / Fight / Freeze / Collapse via
  // BODY_SUBCATEGORY. We also build a per-day stacked trend so the user
  // can watch shifts (e.g. more Collapse over time, more Calm coming
  // back after stabilisation work).
  const bodyBreakdown = useMemo(() => {
    const counts = { Calm: 0, Flight: 0, Fight: 0, Freeze: 0, Collapse: 0 };
    for (const e of emotionEvents) {
      if (labelCategory(e.label) !== "body") continue;
      const sub = BODY_SUBCATEGORY[e.label];
      if (sub && counts[sub] != null) counts[sub] += 1;
    }
    const total = BODY_SUB_ORDER.reduce((s, k) => s + counts[k], 0);
    return { counts, total };
  }, [emotionEvents, emotionCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  const bodyTrendByDay = useMemo(() => {
    const byDay = new Map();
    for (const e of emotionEvents) {
      if (labelCategory(e.label) !== "body") continue;
      const sub = BODY_SUBCATEGORY[e.label];
      if (!sub) continue;
      if (!e.timestamp) continue;
      const day = format(new Date(e.timestamp), "MMM d");
      const bucket = byDay.get(day) || {
        date: day,
        Calm: 0, Flight: 0, Fight: 0, Freeze: 0, Collapse: 0,
      };
      bucket[sub] += 1;
      byDay.set(day, bucket);
    }
    return [...byDay.values()];
  }, [emotionEvents, emotionCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Time-of-day distribution (hour 0-23) for check-ins. Useful "when
  // do I tend to feel this way" pattern.
  const hourDistribution = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${h}:00`,
      total: 0,
      distress: 0,
    }));
    for (const ci of filteredCheckIns) {
      if (!ci.timestamp) continue;
      const h = new Date(ci.timestamp).getHours();
      buckets[h].total += 1;
      if (isCheckInDistressing(ci)) buckets[h].distress += 1;
    }
    return buckets;
  }, [filteredCheckIns, distressLabelSet]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stacked emotional balance per day. Built from emotionEvents so
  // all three sources (check-ins, diary cards, session emotions)
  // contribute.
  const balanceByDay = useMemo(() => {
    const byDay = new Map();
    for (const e of emotionEvents) {
      if (!e.timestamp) continue;
      const day = format(new Date(e.timestamp), "MMM d");
      const bucket = byDay.get(day) || { date: day, good: 0, neutral: 0, bad: 0, body: 0 };
      bucket[labelCategory(e.label)] += 1;
      byDay.set(day, bucket);
    }
    return [...byDay.values()];
  }, [emotionEvents, emotionCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Distress trend (daily %).
  const distressTrend = useMemo(() => {
    const byDay = new Map();
    for (const ci of filteredCheckIns) {
      if (!ci.timestamp) continue;
      const day = format(new Date(ci.timestamp), "MMM d");
      const bucket = byDay.get(day) || { day, total: 0, distress: 0 };
      bucket.total += 1;
      if (isCheckInDistressing(ci)) bucket.distress += 1;
      byDay.set(day, bucket);
    }
    return [...byDay.values()]
      .filter((b) => b.total > 0)
      .map((b) => ({ date: b.day, rate: Math.round((b.distress / b.total) * 100) }));
  }, [filteredCheckIns, distressLabelSet]); // eslint-disable-line react-hooks/exhaustive-deps

  // Daily entry count (any kind).
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

  // Top emotions overall (with category color attached for nicer chart).
  const topEmotions = useMemo(() => {
    const freq = {};
    for (const e of emotionEvents) freq[e.label] = (freq[e.label] || 0) + 1;
    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([label, count]) => ({
        label,
        count,
        category: labelCategory(label),
      }));
  }, [emotionEvents, emotionCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Top symptoms with severity averages and emotional context.
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

  // Per-alter patterns. For each alter with any emotion attribution in
  // range, surface their top emotion category, distress %, and entry
  // counts. Especially useful for systems tracking per-alter feelings.
  const perAlterStats = useMemo(() => {
    const stats = new Map();
    const ensure = (id) => {
      if (!stats.has(id)) {
        stats.set(id, {
          alterId: id,
          emotions: { good: 0, neutral: 0, bad: 0, body: 0 },
          distress: 0,
          checkinCount: 0,
          sessionCount: 0,
          topEmotions: {},
        });
      }
      return stats.get(id);
    };
    for (const e of emotionEvents) {
      const cat = labelCategory(e.label);
      for (const id of e.alterIds) {
        const s = ensure(id);
        s.emotions[cat] += 1;
        s.topEmotions[e.label] = (s.topEmotions[e.label] || 0) + 1;
      }
    }
    for (const ci of filteredCheckIns) {
      const alterIds = ci.fronting_alter_ids?.length ? ci.fronting_alter_ids : (ci.alter_id ? [ci.alter_id] : []);
      const wasDistress = isCheckInDistressing(ci);
      for (const id of alterIds) {
        const s = ensure(id);
        s.checkinCount += 1;
        if (wasDistress) s.distress += 1;
      }
    }
    for (const sess of filteredSessions) {
      if (!sess.alter_id) continue;
      const s = ensure(sess.alter_id);
      s.sessionCount += 1;
    }
    return [...stats.values()]
      .filter((s) => alterById[s.alterId])
      .map((s) => {
        const total = s.emotions.good + s.emotions.neutral + s.emotions.bad + s.emotions.body;
        const dominantCategory = total === 0
          ? null
          : Object.entries(s.emotions).sort((a, b) => b[1] - a[1])[0][0];
        const topLabel = Object.entries(s.topEmotions).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        return {
          ...s,
          alter: alterById[s.alterId],
          totalEmotions: total,
          dominantCategory,
          topLabel,
          distressPct: s.checkinCount > 0 ? Math.round((s.distress / s.checkinCount) * 100) : null,
        };
      })
      .sort((a, b) => (b.checkinCount + b.totalEmotions) - (a.checkinCount + a.totalEmotions))
      .slice(0, 10);
  }, [emotionEvents, filteredCheckIns, filteredSessions, alterById, emotionCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Distress co-occurrence — what other things were logged around the
  // same time as distress check-ins? Looks within +/- 30 minutes of
  // each distressed check-in. "Distress" now means "the check-in's
  // emotions include at least one label marked distressing" (system
  // distress set OR CustomEmotion.is_distressing) — see
  // distressLabelSet above.
  const distressContext = useMemo(() => {
    const distressed = filteredCheckIns.filter((ci) => ci.timestamp && isCheckInDistressing(ci));
    if (distressed.length === 0) return null;

    const WINDOW_MS = 30 * 60 * 1000;
    const cooccurringSymptoms = {};
    const cooccurringActivities = {};
    const cooccurringEmotions = {};
    const hourBuckets = Array.from({ length: 24 }, () => 0);

    for (const ci of distressed) {
      const ts = new Date(ci.timestamp).getTime();
      hourBuckets[new Date(ci.timestamp).getHours()] += 1;
      // Co-occurring emotions on the same check-in
      (ci.emotions || []).forEach((label) => {
        cooccurringEmotions[label] = (cooccurringEmotions[label] || 0) + 1;
      });
      // Symptoms logged within window
      for (const sc of filteredSymptomCheckIns) {
        if (!sc.timestamp) continue;
        const dt = Math.abs(new Date(sc.timestamp).getTime() - ts);
        if (dt > WINDOW_MS) continue;
        const sym = symptomById[sc.symptom_id];
        const label = sym?.label || sc.symptom_id;
        if (!label) continue;
        cooccurringSymptoms[label] = (cooccurringSymptoms[label] || 0) + 1;
      }
      // Activities within window
      for (const a of filteredActivities) {
        if (!a.timestamp) continue;
        const dt = Math.abs(new Date(a.timestamp).getTime() - ts);
        if (dt > WINDOW_MS) continue;
        const cat = a.parent_category_id ? categoryById[a.parent_category_id] : null;
        const label = a.activity_name || cat?.name || "Activity";
        cooccurringActivities[label] = (cooccurringActivities[label] || 0) + 1;
      }
    }

    const top = (obj, n = 5) =>
      Object.entries(obj)
        .sort(([, a], [, b]) => b - a)
        .slice(0, n)
        .map(([label, count]) => ({ label, count }));

    const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
    return {
      total: distressed.length,
      peakHour: hourBuckets[peakHour] > 0 ? peakHour : null,
      topEmotions: top(cooccurringEmotions),
      topSymptoms: top(cooccurringSymptoms),
      topActivities: top(cooccurringActivities),
    };
  }, [filteredCheckIns, filteredSymptomCheckIns, filteredActivities, symptomById, categoryById, distressLabelSet]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mood Trend (diary-only) — kept conditional so the page doesn't
  // get a "Need at least 2 rated diary entries" placeholder.
  const moodTrend = useMemo(() => {
    return filteredCards
      .filter((c) => c.body_mind?.emotional_misery !== undefined || c.body_mind?.joy !== undefined)
      .map((c) => ({
        date: format(parseISO(c.date), "MMM d"),
        misery: c.body_mind?.emotional_misery,
        joy: c.body_mind?.joy,
      }));
  }, [filteredCards]);

  const showRangeHint = totalInRange === 0 && totalAllTime > 0;

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
      {/* Range picker */}
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
        <SummaryStat
          label="Distress rate"
          value={distressOverall != null ? `${distressOverall}%` : "—"}
          accent={distressOverall != null && distressOverall >= 40 ? "warn" : null}
        />
      </div>

      {/* Emotional Balance — pie-style stat row + per-day stacked bars */}
      {balance.total > 0 && (
        <ChartCard
          title="Emotional Balance"
          subtitle="How your logged emotions split across Good / Neutral / Bad / Body"
        >
          <div className="space-y-3">
            {/* Single-row bar showing % per category */}
            <div className="flex h-3 rounded-full overflow-hidden border border-border/50">
              {CATEGORY_ORDER.map((cat) => {
                const pct = (balance.counts[cat] / balance.total) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={cat}
                    title={`${CATEGORY_META[cat].label}: ${Math.round(pct)}%`}
                    style={{ background: CATEGORY_META[cat].color, width: `${pct}%` }}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              {CATEGORY_ORDER.map((cat) => (
                <div key={cat} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_META[cat].color }} />
                  <span className="text-foreground">{CATEGORY_META[cat].label}</span>
                  <span className="text-muted-foreground">{balance.counts[cat]}</span>
                </div>
              ))}
            </div>
            {balanceByDay.length >= 2 && (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={balanceByDay}>
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
                  {CATEGORY_ORDER.map((cat) => (
                    <Bar key={cat} dataKey={cat} stackId="emo" name={CATEGORY_META[cat].label} fill={CATEGORY_META[cat].color} radius={cat === "body" ? [4, 4, 0, 0] : 0} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      )}

      {/* Body & Nervous System breakdown — only shows when there's any
          body-category emotion in range. Splits the body slice from the
          Emotional Balance bar into its five core states (Calm, Flight,
          Fight, Freeze, Collapse) so the user can see the texture of
          their somatic activation patterns. */}
      {bodyBreakdown.total > 0 && (
        <ChartCard
          title="Body & Nervous System States"
          subtitle="Calm / Flight / Fight / Freeze / Collapse — derived from your body-category emotions"
        >
          <div className="space-y-3">
            <div className="flex h-3 rounded-full overflow-hidden border border-border/50">
              {BODY_SUB_ORDER.map((sub) => {
                const pct = (bodyBreakdown.counts[sub] / bodyBreakdown.total) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={sub}
                    title={`${sub}: ${Math.round(pct)}%`}
                    style={{ background: BODY_SUB_META[sub].color, width: `${pct}%` }}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              {BODY_SUB_ORDER.map((sub) => (
                <div key={sub} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: BODY_SUB_META[sub].color }} />
                  <span className="text-foreground">{sub}</span>
                  <span className="text-muted-foreground">{bodyBreakdown.counts[sub]}</span>
                </div>
              ))}
            </div>
            {bodyTrendByDay.length >= 2 && (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={bodyTrendByDay}>
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
                  {BODY_SUB_ORDER.map((sub) => (
                    <Bar key={sub} dataKey={sub} stackId="body" name={sub} fill={BODY_SUB_META[sub].color} radius={sub === "Collapse" ? [4, 4, 0, 0] : 0} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      )}

      {/* Entry Frequency */}
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

      {/* Time-of-Day */}
      {filteredCheckIns.length > 0 && (
        <ChartCard
          title="Time of Day"
          subtitle="When you check in. Red overlay = check-ins that included an emotion marked distressing."
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={2} tickFormatter={(h) => `${h}:00`} />
              <YAxis tick={{ fontSize: 11 }} width={24} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-muted)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(h) => `${h}:00`}
              />
              <Bar dataKey="total" name="Check-ins" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="distress" name="Distress" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Distress Rate trend */}
      {filteredCheckIns.length > 0 && (
        <ChartCard
          title="Distress Rate"
          subtitle="Share of check-ins per day that included an emotion you marked distressing in Settings → Emotions"
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
      )}

      {/* Top Emotions, coloured by category */}
      <ChartCard
        title="Top Emotions"
        subtitle="Across check-ins, diary cards, and per-alter session entries"
      >
        {topEmotions.length === 0 ? (
          <EmptyHint text="No emotion data logged in this range." />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, topEmotions.length * 28)}>
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
                {topEmotions.map((e, i) => (
                  <Cell key={i} fill={CATEGORY_META[e.category]?.color || EMOTION_COLORS[i % EMOTION_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Top Symptoms */}
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

      {/* Per-Alter patterns */}
      {perAlterStats.length > 0 && (
        <ChartCard
          title={`Per-${t.Alter} Patterns`}
          subtitle={`Most active ${t.alters} in range, their dominant emotion category, and distress rate`}
        >
          <div className="space-y-2">
            {perAlterStats.map((s) => (
              <div key={s.alterId} className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: s.alter?.color || "#8b5cf6" }}
                />
                <span className="text-sm text-foreground font-medium truncate flex-1">
                  {s.alter?.name || "Unknown"}
                </span>
                {s.dominantCategory && (
                  <span
                    className="text-[0.625rem] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-md"
                    style={{
                      background: `${CATEGORY_META[s.dominantCategory].color}22`,
                      color: CATEGORY_META[s.dominantCategory].color,
                    }}
                  >
                    {CATEGORY_META[s.dominantCategory].label}
                  </span>
                )}
                {s.topLabel && (
                  <span className="text-[0.6875rem] text-muted-foreground hidden sm:inline truncate max-w-[8rem]">
                    most: {s.topLabel}
                  </span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {s.checkinCount > 0 && `${s.checkinCount} ck`}
                  {s.checkinCount > 0 && s.totalEmotions > 0 && " · "}
                  {s.totalEmotions > 0 && `${s.totalEmotions} emo`}
                </span>
                {s.distressPct != null && (
                  <span
                    className="text-xs font-medium tabular-nums w-12 text-right"
                    style={{ color: s.distressPct >= 40 ? CATEGORY_META.bad.color : "var(--color-muted-foreground)" }}
                  >
                    {s.distressPct}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      {/* Distress Co-occurrence */}
      {distressContext && distressContext.total > 0 && (
        <ChartCard
          title="When Distress Showed Up"
          subtitle={`Patterns around the ${distressContext.total} distress check-in${distressContext.total === 1 ? "" : "s"} in this range`}
        >
          <div className="space-y-4 text-xs">
            {distressContext.peakHour != null && (
              <div className="rounded-lg border border-border/40 px-3 py-2 flex items-center gap-2">
                <span className="text-muted-foreground">Most common hour:</span>
                <span className="font-semibold text-foreground">{distressContext.peakHour}:00–{distressContext.peakHour + 1}:00</span>
              </div>
            )}
            {distressContext.topEmotions.length > 0 && (
              <CoOccurrenceList
                title="Co-occurring emotions"
                items={distressContext.topEmotions}
              />
            )}
            {distressContext.topSymptoms.length > 0 && (
              <CoOccurrenceList
                title="Symptoms within ±30 min"
                items={distressContext.topSymptoms}
              />
            )}
            {distressContext.topActivities.length > 0 && (
              <CoOccurrenceList
                title="Activities within ±30 min"
                items={distressContext.topActivities}
              />
            )}
          </div>
        </ChartCard>
      )}

      {/* Mood Trend (diary-only) */}
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

function SummaryStat({ label, value, accent }) {
  return (
    <div>
      <p className={`text-2xl font-semibold tabular-nums ${accent === "warn" ? "text-amber-500" : "text-foreground"}`}>{value}</p>
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

function CoOccurrenceList({ title, items }) {
  const max = items[0]?.count || 1;
  return (
    <div className="space-y-1.5">
      <p className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground">{title}</p>
      {items.map(({ label, count }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-xs text-foreground capitalize w-28 flex-shrink-0 truncate" title={label}>
            {label.length > 18 ? label.slice(0, 18) + "…" : label}
          </span>
          <div className="flex-1 bg-muted/50 rounded-full h-2 overflow-hidden">
            <div className="h-2 rounded-full bg-red-500/60" style={{ width: `${Math.round((count / max) * 100)}%` }} />
          </div>
          <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyHint({ text }) {
  return <p className="text-xs text-muted-foreground text-center py-6">{text}</p>;
}
