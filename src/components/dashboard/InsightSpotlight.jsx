import React, { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { lastNDays, priorRange, buildRange, DAY_MS } from "@/lib/analytics/range";
import { frontingRollup, emotionRollup, sleepRollup } from "@/lib/analytics/rollups";
import { generateInsights, spotlightInsight } from "@/lib/analytics/insights";
import InsightCard from "@/components/analytics/primitives/InsightCard";

// The ONE dashboard insight card (locked decision: Analytics feed + a single
// dismissible dashboard card, pull-based — never pushed). Shows the most
// notable non-gentle insight; hard-stretch ("gentle") insights are never
// billboarded on the dashboard, and unlock nags don't appear here either.
// Dismissing remembers the insight id, so the card only returns when there
// is something new to say. Queries share keys with Analytics so react-query
// dedupes — no extra fetch cost on the dashboard.
const SPOTLIGHT_DISMISSED_KEY = "symphony_insight_spotlight_dismissed_v1";
const MUTED_KEY = "symphony_insights_muted_kinds_v1";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}

export default function InsightSpotlight() {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const navigate = useNavigate();
  const [dismissedId, setDismissedId] = useState(() => readJson(SPOTLIGHT_DISMISSED_KEY, null));

  // OPT-IN (Kane, v0.73.10/11): the spotlight renders NOTHING unless the user
  // enabled it in Settings → the analytics preferences ("Dashboard insight
  // spotlight" toggle, persisted on SystemSettings). Even the earlier
  // explainer card felt intrusive on the dashboard — so when off, no trace.
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const spotlightEnabled = pickPrimarySystemSettings(settingsList)?.analytics_spotlight_enabled === true;

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 2000),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list("-timestamp", 1000),
  });
  const { data: sleepRecords = [] } = useQuery({
    queryKey: ["sleep"],
    queryFn: () => base44.entities.Sleep.list("-date", 500),
  });

  const altersById = useMemo(() => {
    const map = {};
    for (const a of alters) map[a.id] = a;
    return map;
  }, [alters]);

  const insight = useMemo(() => {
    if (!spotlightEnabled) return null; // opt-in — skip the whole compute
    const week = lastNDays(7);
    const prior = priorRange(week);
    const baselineWin = buildRange(new Date(week.fromMs - 30 * DAY_MS), new Date(week.fromMs - 1), week.now);
    const days30 = lastNDays(30);

    const fronting = frontingRollup({ sessions, range: week, priorRangeObj: prior, baselineRange: baselineWin });
    const fronting30 = frontingRollup({ sessions, range: days30 });
    const emotions = emotionRollup({ emotionCheckIns, range: week, priorRangeObj: prior, baselineRange: baselineWin });
    const sleep = sleepRollup({ sleepRecords, range: week, baselineRange: baselineWin });

    const feed = generateInsights({
      terms,
      formatAlter,
      altersById,
      rollups: { fronting: { ...fronting, coFrontPairs: fronting30.coFrontPairs }, emotions, sleep },
      weekLabel: "this week",
      mutedKinds: readJson(MUTED_KEY, []),
      dismissedIds: [],
      max: 5,
    });
    return spotlightInsight(feed);
  }, [spotlightEnabled, sessions, emotionCheckIns, sleepRecords, terms, formatAlter, altersById]);

  const handleDismiss = useCallback((ins) => {
    setDismissedId(ins.id);
    try { localStorage.setItem(SPOTLIGHT_DISMISSED_KEY, JSON.stringify(ins.id)); } catch { /* ignore */ }
  }, []);

  if (!spotlightEnabled || !insight || insight.id === dismissedId) return null;

  return (
    <div className="mb-4">
      <InsightCard
        insight={insight}
        onDismiss={handleDismiss}
        onDrill={() => navigate("/analytics")}
      />
    </div>
  );
}
