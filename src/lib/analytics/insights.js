// Gated, terms-aware insight generators for the analytics Overview feed
// (and the single dashboard spotlight card).
//
// Hard rules (see memory: analytics-rebuild-plan — do not relax):
//   - Descriptive language only: "linked to / tended to / more than usual".
//     NEVER causal ("improved", "caused"), never judgmental ("worse").
//     Switch counts / distress going up is NOT framed as bad.
//   - Every insight carries `basedOn` (how many observed days) and a
//     `confidence` chip, and states its method in `method` for the
//     "how is this computed?" explainer.
//   - Minimum-data gates: below a gate a generator returns an UNLOCK
//     insight ("4 of 7 days — keep logging and this appears") instead of
//     a bare "not enough data", or returns null (silently skipped).
//   - All wording goes through the passed `terms` (useTerms) and
//     `formatAlter` (useAlterLabel) — nothing hardcodes "alter"/"switch"/
//     "fronting".
//
// Insight shape:
//   { id, kind, emoji, headline, detail, confidence, basedOn, method,
//     tone: "neutral"|"celebrate"|"gentle", drillTab, unlock: null|{have,need} }

import { confidenceForDays, MIN_BASELINE_DAYS } from "./baselines";

// Canonical duration formatter for analytics surfaces.
export function formatHoursMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function pctText(pct) {
  if (pct == null) return "";
  const v = Math.round(Math.abs(pct) * 100);
  return `${v}%`;
}

// ---- Individual generators -------------------------------------------------

function switchRhythmInsight({ terms, fronting, weekLabel }) {
  const t = fronting?.switchesTrend;
  const base = fronting?.switchesBaseline;
  if (!base || !base.sufficient) {
    const have = base ? base.n : 0;
    return {
      id: `unlock-switch-rhythm`,
      kind: "switch-rhythm",
      emoji: "🔄",
      headline: `${terms.Switch} rhythm unlocks with a bit more history`,
      detail: `${have} of ${MIN_BASELINE_DAYS} days with ${terms.fronting} logs — keep logging ${terms.switches} and your rhythm card appears here.`,
      confidence: null,
      basedOn: null,
      method: `Needs ${MIN_BASELINE_DAYS} days of ${terms.fronting} history to compute your usual rhythm.`,
      tone: "neutral",
      drillTab: "fronting",
      unlock: { have, need: MIN_BASELINE_DAYS },
    };
  }
  if (!t || !t.sufficient || t.direction === "flat") return null;
  const dir = t.direction === "up" ? "more" : "less";
  return {
    id: `switch-rhythm`,
    kind: "switch-rhythm",
    emoji: "🔄",
    headline: `${dir === "more" ? "More" : "Less"} switching than usual ${weekLabel}`,
    detail: `About ${t.recentMean.toFixed(1)} ${terms.switches}/day vs your usual ${t.priorMean.toFixed(1)} (${pctText(t.pctChange)} ${dir}). That can mean lots of things — worth a gentle check-in with yourselves?`,
    confidence: confidenceForDays(t.recentN + t.priorN),
    basedOn: `${t.recentN + t.priorN} logged days`,
    method: `Compares average ${terms.switches} per day this period against the previous period of the same length. Counts describe tracked ${terms.switches} only.`,
    tone: "neutral",
    drillTab: "fronting",
    unlock: null,
  };
}

function topEmotionInsight({ emotions, weekLabel }) {
  if (!emotions || emotions.checkInsTotal < 5) return null;
  const top = emotions.topEmotions[0];
  if (!top) return null;
  const second = emotions.topEmotions[1];
  return {
    id: `top-emotion-${top.label}`,
    kind: "top-emotion",
    emoji: "💜",
    headline: `"${top.label}" showed up most ${weekLabel}`,
    detail: `Logged ${top.count} time${top.count === 1 ? "" : "s"}${second ? `, followed by "${second.label}" (${second.count})` : ""} across ${emotions.checkInsTotal} check-ins.`,
    confidence: confidenceForDays(emotions.countSeries.filter((p) => p.value > 0).length),
    basedOn: `${emotions.checkInsTotal} check-ins`,
    method: "Counts how often each emotion appears across check-ins in this period.",
    tone: "neutral",
    drillTab: "wellbeing",
    unlock: null,
  };
}

function sleepInsight({ sleep, weekLabel }) {
  if (!sleep || sleep.avgHours == null) return null;
  const base = sleep.hoursBaseline;
  if (!base || !base.sufficient || base.mean == null) return null;
  const diff = sleep.avgHours - base.mean;
  if (Math.abs(diff) < 0.75) return null; // under ~45min difference isn't worth a card
  const dir = diff > 0 ? "more" : "less";
  return {
    id: `sleep-vs-usual`,
    kind: "sleep",
    emoji: "😴",
    headline: `Sleeping ${dir} than usual ${weekLabel}`,
    detail: `Averaging ${sleep.avgHours.toFixed(1)}h per night vs your usual ${base.mean.toFixed(1)}h. Only logged nights are counted — unlogged nights aren't assumed.`,
    confidence: confidenceForDays(base.n),
    basedOn: `${sleep.nightsLogged} logged night${sleep.nightsLogged === 1 ? "" : "s"} this period, ${base.n} in your baseline`,
    method: "Compares this period's average sleep duration against your rolling baseline. Nights without a sleep log are left out, not counted as zero.",
    tone: "neutral",
    drillTab: "wellbeing",
    unlock: null,
  };
}

function distressInsight({ emotions, weekLabel }) {
  const t = emotions?.distressTrend;
  if (!t || !t.sufficient || t.direction === "flat" || t.direction === "unknown") return null;
  if (t.direction === "down") {
    return {
      id: `distress-down`,
      kind: "distress",
      emoji: "🌤️",
      headline: `Fewer distress check-ins ${weekLabel}`,
      detail: `Distress-flagged check-ins came up less often than the period before. Whatever you're doing, it's yours to keep.`,
      confidence: confidenceForDays(t.recentN + t.priorN),
      basedOn: `${t.recentN + t.priorN} logged days`,
      method: "Compares how often check-ins carried a distress flag this period vs the previous period. Describes logging frequency only.",
      tone: "celebrate",
      drillTab: "wellbeing",
      unlock: null,
    };
  }
  return {
    id: `distress-up`,
    kind: "distress",
    emoji: "🫂",
    headline: `More distress check-ins ${weekLabel}`,
    detail: `Distress-flagged check-ins came up more often than the period before. No judgment in the numbers — logging through hard stretches is itself a skill. Grounding tools are a tap away if wanted.`,
    confidence: confidenceForDays(t.recentN + t.priorN),
    basedOn: `${t.recentN + t.priorN} logged days`,
    method: "Compares how often check-ins carried a distress flag this period vs the previous period. Describes logging frequency only.",
    tone: "gentle",
    drillTab: "wellbeing",
    unlock: null,
  };
}

function coFrontPairInsight({ terms, fronting, altersById, formatAlter }) {
  const pair = (fronting?.coFrontPairs || []).find(
    (p) => p.days >= 5 && altersById[p.a] && altersById[p.b],
  );
  if (!pair) return null;
  const nameA = formatAlter ? formatAlter(altersById[pair.a]) : altersById[pair.a].name;
  const nameB = formatAlter ? formatAlter(altersById[pair.b]) : altersById[pair.b].name;
  return {
    id: `cofront-${pair.a}-${pair.b}`,
    kind: "cofront-pair",
    emoji: "🤝",
    headline: `${nameA} & ${nameB} often ${terms.front} together`,
    detail: `They shared ${terms.fronting} time on ${pair.days} different days recently.`,
    confidence: confidenceForDays(pair.days * 2),
    basedOn: `${pair.days} shared days`,
    method: `Counts distinct days both were ${terms.fronting} at the same time. Shown once a pair reaches 5 shared days.`,
    tone: "neutral",
    drillTab: "fronting",
    unlock: null,
  };
}

function presenceInsight({ presence }) {
  if (!presence || presence.daysPresent < 1) return null;
  return {
    id: `presence-${presence.daysPresent}`,
    kind: "presence",
    emoji: "🌱",
    headline: `You showed up ${presence.daysPresent} day${presence.daysPresent === 1 ? "" : "s"} recently`,
    detail: `${presence.daysPresent} of the last ${presence.daysInRange} days have at least one log. Gaps are just gaps — unlogged doesn't mean nothing happened.`,
    confidence: null,
    basedOn: `${presence.daysInRange} days`,
    method: "Counts days with at least one entry of any kind. Not a streak — there is nothing to break.",
    tone: "celebrate",
    drillTab: "overview",
    unlock: null,
  };
}

// ---- Feed assembly ----------------------------------------------------------

const TONE_ORDER = { gentle: 0, neutral: 1, celebrate: 2 };

/**
 * Generate the insight feed.
 *   { terms, formatAlter, altersById, rollups: {fronting, emotions, sleep,
 *     activities, presence}, weekLabel, mutedKinds, dismissedIds, max }
 * Unlock cards are kept at most one per feed so the feed never turns into
 * a wall of "keep logging".
 */
export function generateInsights(ctx) {
  const {
    mutedKinds = [],
    dismissedIds = [],
    max = 5,
    weekLabel = "this week",
  } = ctx;
  const muted = new Set(mutedKinds);
  const dismissed = new Set(dismissedIds);
  const c = { ...ctx, weekLabel, fronting: ctx.rollups?.fronting, emotions: ctx.rollups?.emotions, sleep: ctx.rollups?.sleep, presence: ctx.rollups?.presence };

  const candidates = [
    distressInsight(c),
    switchRhythmInsight(c),
    sleepInsight(c),
    coFrontPairInsight(c),
    topEmotionInsight(c),
    presenceInsight(c),
  ].filter(Boolean)
    .filter((i) => !muted.has(i.kind))
    .filter((i) => !dismissed.has(i.id));

  // At most one unlock card, and unlocks sort last.
  const unlocks = candidates.filter((i) => i.unlock);
  const real = candidates.filter((i) => !i.unlock);
  real.sort((a, b) => (TONE_ORDER[a.tone] ?? 1) - (TONE_ORDER[b.tone] ?? 1));
  const feed = [...real, ...unlocks.slice(0, 1)].slice(0, max);
  return feed;
}

// The single most notable insight for the dashboard spotlight card —
// never an unlock card, never a gentle-tone card pushed at the user on
// the dashboard (pull-based rule: hard stretches aren't billboarded).
export function spotlightInsight(feed) {
  return feed.find((i) => !i.unlock && i.tone !== "gentle") || null;
}
