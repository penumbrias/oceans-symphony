import React, { useMemo, useState } from "react";
import { useTerms } from "@/lib/useTerms";
import { buildRange } from "@/lib/analytics/range";
import {
  sleepVsNextDayDistress,
  activityCategoriesVsDistress,
  encountersVsDistress,
  afterDistress,
  preSwitchSignature,
  topSymptoms,
  metricSeries,
  trendAnnotations,
  WELLBEING_METRICS,
} from "@/lib/analytics/wellbeing";
import { confidenceForDays } from "@/lib/analytics/baselines";
import DaySeriesChart from "@/components/analytics/primitives/DaySeriesChart";
import HBarList from "@/components/analytics/primitives/HBarList";
import UnlockGate from "@/components/analytics/primitives/UnlockGate";
import CollapsedSection from "@/components/analytics/primitives/CollapsedSection";

// Rebuilt Wellbeing analytics (Phase 3). Numbers come from
// src/lib/analytics/wellbeing.js; sentences here stay descriptive
// ("on days when… tended to…"), carry n + confidence, and lead with
// strengths. Legacy sections stay reachable, collapsed, below.

function Card({ title, sub, right = null, children }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {sub && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

const CONF_STYLES = {
  high: "bg-primary/15 text-primary",
  medium: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  low: "bg-muted text-muted-foreground",
};

function ConfidenceChip({ days }) {
  const level = confidenceForDays(days);
  return (
    <span className={`px-1.5 py-0.5 rounded text-[0.5625rem] font-semibold uppercase tracking-wide flex-shrink-0 ${CONF_STYLES[level]}`}>
      {level} confidence
    </span>
  );
}

// One phrased factor↔outcome finding. Distress outcome is a share of days:
// phrase as "distress came up on X of Y days".
function FindingRow({ headline, cmp }) {
  if (!cmp || cmp.gated) return null;
  const withPctDays = `${Math.round(cmp.withMean * cmp.withN)} of ${cmp.withN}`;
  const withoutPctDays = `${Math.round(cmp.withoutMean * cmp.withoutN)} of ${cmp.withoutN}`;
  return (
    <div className="rounded-xl bg-muted/25 p-2.5 space-y-1">
      <p className="text-xs text-foreground leading-relaxed">{headline}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[0.625rem] text-muted-foreground">
          Distress on {withPctDays} days with · {withoutPctDays} without
        </span>
        <ConfidenceChip days={cmp.withN + cmp.withoutN} />
      </div>
    </div>
  );
}

export default function WellbeingTab({
  sessions = [],
  emotionCheckIns = [],
  symptomCheckIns = [],
  symptoms = [],
  sleepRecords = [],
  activities = [],
  activityCategories = [],
  contactEncounters = [],
  systemChangeEvents = [],
  from,
  to,
  legacySections = [], // [{ title, node }]
}) {
  const terms = useTerms();
  const [metric, setMetric] = useState("checkins");
  const range = useMemo(() => buildRange(from, to), [from, to]);

  const series = useMemo(
    () => metricSeries({ metric, range, emotionCheckIns, symptomCheckIns, sleepRecords }),
    [metric, range, emotionCheckIns, symptomCheckIns, sleepRecords],
  );
  const annotations = useMemo(
    () => trendAnnotations({ systemChangeEvents, range }),
    [systemChangeEvents, range],
  );

  const recovery = useMemo(() => afterDistress({ emotionCheckIns, range }), [emotionCheckIns, range]);
  const preSwitch = useMemo(() => preSwitchSignature({ sessions, symptomCheckIns, range }), [sessions, symptomCheckIns, range]);
  const sleepCmp = useMemo(() => sleepVsNextDayDistress({ sleepRecords, emotionCheckIns, range }), [sleepRecords, emotionCheckIns, range]);
  const actCmps = useMemo(() => activityCategoriesVsDistress({ activities, categories: activityCategories, emotionCheckIns, range }), [activities, activityCategories, emotionCheckIns, range]);
  const encCmp = useMemo(() => encountersVsDistress({ encounters: contactEncounters, emotionCheckIns, range }), [contactEncounters, emotionCheckIns, range]);
  const symTop = useMemo(() => topSymptoms({ symptomCheckIns, range }), [symptomCheckIns, range]);

  const symptomsById = useMemo(() => {
    const map = {};
    for (const s of symptoms) map[s.id] = s;
    return map;
  }, [symptoms]);

  const hasAnyFinding = (!sleepCmp.gated) || actCmps.length > 0 || (!encCmp.gated);
  // Differences under 10 percentage points read as "about as often" — a
  // 20% vs 19% split must not be narrated as a direction.
  const distressDir = (cmp) => (Math.abs(cmp.diff) < 0.1 ? "about as" : cmp.diff < 0 ? "less" : "more");

  return (
    <div className="space-y-3">
      {/* ── Trends (annotated) ── */}
      <Card
        title="Trends"
        sub="Unlogged days are shown as gaps, never guessed. Markers are recorded system changes."
      >
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {WELLBEING_METRICS.map((m) => (
            <button key={m.id} type="button" onClick={() => setMetric(m.id)}
              className={`px-2.5 py-1 rounded-full text-[0.6875rem] font-medium border flex-shrink-0 transition-all ${
                metric === m.id
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}>
              {m.label}
            </button>
          ))}
        </div>
        <DaySeriesChart
          series={series}
          markers={annotations}
          ariaLabel={`${WELLBEING_METRICS.find((m) => m.id === metric)?.label} over time`}
        />
      </Card>

      {/* ── After distress (strengths-based recovery) ── */}
      <Card title="After distress" sub="What tends to happen after a distress-flagged check-in.">
        {recovery.gated ? (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Appears once {recovery.need} distress check-ins have a follow-up check-in within {recovery.windowHours ?? 12} hours.
            </p>
            <UnlockGate have={recovery.pairsN} need={recovery.need} />
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-sm text-foreground leading-relaxed">
              Your next check-in after distress was calmer <span className="font-semibold">{recovery.calmerN} of {recovery.pairsN}</span> times.
            </p>
            {recovery.medianCalmerMinutes != null && (
              <p className="text-xs text-muted-foreground">
                When things settled, it typically took about {recovery.medianCalmerMinutes >= 90 ? `${Math.round(recovery.medianCalmerMinutes / 60)}h` : `${recovery.medianCalmerMinutes}m`} to the calmer check-in.
              </p>
            )}
            <p className="text-[0.625rem] text-muted-foreground">
              Getting through hard moments and logging them is itself a skill. Based on {recovery.pairsN} follow-ups within {recovery.windowHours}h.
            </p>
          </div>
        )}
      </Card>

      {/* ── Before switches ── */}
      <Card title={`Before ${terms.switches}`} sub={`Symptoms that show up in the 12 hours before a tracked ${terms.switch} more often than they do in general.`}>
        {preSwitch.gated ? (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Appears once there are at least {preSwitch.need} tracked {terms.switches} and symptom check-ins in the period.
            </p>
            <UnlockGate have={Math.min(preSwitch.switchesN ?? 0, preSwitch.symptomsN ?? preSwitch.switchesN ?? 0)} need={preSwitch.need} />
          </div>
        ) : preSwitch.rows.length > 0 ? (
          <div className="space-y-1.5">
            {preSwitch.rows.map((r) => {
              const sym = symptomsById[r.symptomId];
              return (
                <div key={r.symptomId} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sym?.color || "hsl(var(--primary))" }} />
                  <span className="text-xs font-medium text-foreground flex-1 truncate">{sym?.label || sym?.name || "Symptom"}</span>
                  <span className="text-[0.625rem] text-muted-foreground tabular-nums">
                    {r.pre} of {r.total} logs fell before a {terms.switch} (~{r.lift.toFixed(1)}× its usual rate)
                  </span>
                </div>
              );
            })}
            <p className="text-[0.625rem] text-muted-foreground">
              Across {preSwitch.switchesN} tracked {terms.switches}. A pattern like this can be worth mentioning in therapy — it isn't a prediction.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No symptom stood out before {terms.switches} in this period — {terms.switches} aren't always preceded by anything trackable.
          </p>
        )}
      </Card>

      {/* ── Linked patterns (lag correlations) ── */}
      <Card
        title="Linked patterns"
        sub="Counted observations across this period — links, not causes. Only days with at least one check-in are compared."
      >
        {hasAnyFinding ? (
          <div className="space-y-2">
            {!sleepCmp.gated && (
              <FindingRow
                cmp={sleepCmp}
                headline={`After nights with at least your usual sleep (${sleepCmp.medianHours.toFixed(1)}h+), distress check-ins came up ${distressDir(sleepCmp)} often the next day.`}
              />
            )}
            {actCmps.map((r) => (
              <FindingRow
                key={r.category?.id}
                cmp={r}
                headline={`On days with ${r.category?.name || "that"} activity, distress check-ins came up ${distressDir(r)} often.`}
              />
            ))}
            {!encCmp.gated && (
              <FindingRow
                cmp={encCmp}
                headline={`On days you spent time with contacts, distress check-ins came up ${distressDir(encCmp)} often.`}
              />
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            These need at least 3 days with and 3 days without each factor (plus check-ins on those days). Keep logging and patterns appear here.
          </p>
        )}
      </Card>

      {/* ── Top symptoms ── */}
      {symTop.length > 0 && (
        <Card title="Symptoms this period" sub="How often each was logged, with its average severity.">
          <HBarList
            rows={symTop.map((r) => {
              const sym = symptomsById[r.symptomId];
              return {
                id: r.symptomId,
                label: sym?.label || sym?.name || "Symptom",
                value: r.count,
                displayValue: `${r.count}×${r.avgSeverity != null ? ` · avg ${r.avgSeverity.toFixed(1)}` : ""}`,
                color: sym?.color || undefined,
              };
            })}
          />
        </Card>
      )}

      {/* ── Legacy sections (until their rebuild phase) ── */}
      {legacySections.map((s) => (
        <CollapsedSection key={s.title} title={s.title}>{s.node}</CollapsedSection>
      ))}
    </div>
  );
}
