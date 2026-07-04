import React, { useMemo } from "react";
import { useTerms } from "@/lib/useTerms";
import { buildRange, priorRange } from "@/lib/analytics/range";
import { activitySummary, plansLifecycle, goalsThisWeek, tasksSummary, locationsTop, contactTime } from "@/lib/analytics/life";
import { formatHoursMs } from "@/lib/analytics/insights";
import DaySeriesChart from "@/components/analytics/primitives/DaySeriesChart";
import HBarList from "@/components/analytics/primitives/HBarList";
import Sparkline from "@/components/analytics/primitives/Sparkline";
import TrendArrow from "@/components/analytics/primitives/TrendArrow";
import CollapsedSection from "@/components/analytics/primitives/CollapsedSection";

// Rebuilt Life analytics (Phase 4): activities, plans, goals, tasks,
// locations, contact time — engine-driven, with the legacy deep-dive
// views collapsed below. Plan-completion is phrased as follow-through,
// never as failure; goals compare only against the user's own targets.

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

const fmtMins = (m) => formatHoursMs(m * 60000);

export default function LifeTab({
  activities = [],
  activityCategories = [],
  goals = [],
  tasks = [],
  locations = [],
  contacts = [],
  contactEncounters = [],
  from,
  to,
  legacySections = [],
}) {
  const terms = useTerms();
  const range = useMemo(() => buildRange(from, to), [from, to]);
  const prior = useMemo(() => priorRange(range), [range]);

  const acts = useMemo(
    () => activitySummary({ activities, categories: activityCategories, range, priorRangeObj: prior }),
    [activities, activityCategories, range, prior],
  );
  const plans = useMemo(() => plansLifecycle({ activities, range }), [activities, range]);
  const weekGoals = useMemo(() => goalsThisWeek({ goals, activities, categories: activityCategories }), [goals, activities, activityCategories]);
  const taskSum = useMemo(() => tasksSummary({ tasks, range }), [tasks, range]);
  const locs = useMemo(() => locationsTop({ locations, range }), [locations, range]);
  const contactSum = useMemo(() => contactTime({ encounters: contactEncounters, contacts, range }), [contactEncounters, contacts, range]);

  const t = acts.minutesTrend;
  const trendLabel = t?.sufficient
    ? t.direction === "flat" ? "about the same as the period before"
      : t.direction === "up" ? "more than the period before"
      : "less than the period before"
    : null;

  return (
    <div className="space-y-3">
      {/* ── Activity time ── */}
      <Card title="Activity time" sub="Minutes of logged activity per day.">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold tabular-nums leading-none">{fmtMins(acts.minutesTotal)}</p>
            <p className="text-[0.625rem] text-muted-foreground mt-1">{acts.activitiesTotal} activities in this period</p>
          </div>
          {trendLabel && <TrendArrow direction={t.direction} label={trendLabel} />}
        </div>
        <DaySeriesChart series={acts.minutesSeries} valueFormatter={(v) => fmtMins(v)} ariaLabel="activity minutes per day" />
        {acts.topCategories.length > 0 && (
          <HBarList
            rows={acts.topCategories.map((r) => ({
              id: r.category?.id || "?",
              label: r.category?.name || "Category",
              value: r.minutes,
              displayValue: `${fmtMins(r.minutes)} · ${r.count}×`,
              color: r.category?.color || undefined,
            }))}
          />
        )}
      </Card>

      {/* ── Plans ── */}
      {plans.plansTotal > 0 && (
        <Card title="Plans" sub="How scheduled plans in this period resolved.">
          <div className="flex items-baseline gap-2">
            {plans.completionRate != null && (
              <p className="text-sm text-foreground">
                Followed through on <span className="font-semibold">{plans.followedThrough} of {plans.resolved}</span> resolved plans.
              </p>
            )}
          </div>
          <HBarList
            rows={[
              { id: "done", label: "Done", value: plans.counts.done, color: "hsl(160 60% 45%)" },
              { id: "partial", label: "Partial", value: plans.counts.partial, color: "hsl(200 60% 50%)" },
              { id: "skipped", label: "Skipped", value: plans.counts.skipped, color: "hsl(var(--muted-foreground) / 0.5)" },
              { id: "cancelled", label: "Cancelled", value: plans.counts.cancelled, color: "hsl(var(--muted-foreground) / 0.35)" },
              { id: "scheduled", label: "Still scheduled", value: plans.counts.scheduled, color: "hsl(var(--primary) / 0.5)" },
            ].filter((r) => r.value > 0)}
          />
          <p className="text-[0.625rem] text-muted-foreground">
            Skipped and cancelled plans are normal — plans serve you, not the other way round.
          </p>
        </Card>
      )}

      {/* ── Goals (current week) ── */}
      {weekGoals.length > 0 && (
        <Card title="Goals this week" sub="Progress against your own weekly targets — this calendar week, whatever the date range above says.">
          <div className="space-y-2">
            {weekGoals.map((g, i) => {
              const cat = activityCategories.find((c) => c.id === g.categoryId);
              return (
                <div key={g.goal.id || i}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground truncate">{g.goal.name || cat?.name || "Goal"}</span>
                    <span className="text-[0.625rem] text-muted-foreground tabular-nums">
                      {fmtMins(g.achievedMinutes)} / {fmtMins(g.targetMinutes)}
                    </span>
                  </div>
                  <div className="mt-0.5 h-2 rounded-full bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, g.pct * 100)}%`, backgroundColor: cat?.color || "hsl(var(--primary))" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Tasks ── */}
      {(taskSum.createdN > 0 || taskSum.completedN > 0) && (
        <Card title="To-dos" sub="Created and completed in this period.">
          <div className="flex items-end justify-between gap-3">
            <p className="text-sm text-foreground">
              <span className="font-semibold">{taskSum.completedN}</span> completed · {taskSum.createdN} created
            </p>
            <Sparkline series={taskSum.completedSeries} width={120} height={30} ariaLabel="tasks completed per day" />
          </div>
        </Card>
      )}

      {/* ── Locations ── */}
      {locs.total > 0 && (
        <Card title="Places" sub={`${locs.total} location ${locs.total === 1 ? "entry" : "entries"} in this period.`}>
          <HBarList
            rows={locs.top.map((r) => ({ id: r.name, label: r.name, value: r.count, displayValue: `${r.count}×` }))}
          />
        </Card>
      )}

      {/* ── Contact time ── */}
      {contactSum.totalCount > 0 && (
        <Card title="Time with people" sub="Logged contact encounters in this period.">
          <p className="text-sm text-foreground">
            <span className="font-semibold">{contactSum.totalCount}</span> encounters
            {contactSum.totalMinutes > 0 && <> · about {fmtMins(contactSum.totalMinutes)} together</>}
          </p>
          {contactSum.top.length > 0 && (
            <HBarList
              rows={contactSum.top.map((r, i) => ({
                id: r.contact?.id || `c-${i}`,
                label: r.contact?.name || "Unknown contact",
                value: Math.max(r.minutes, r.count),
                displayValue: r.minutes > 0 ? `${fmtMins(r.minutes)} · ${r.count}×` : `${r.count}×`,
                color: r.contact?.color || undefined,
              }))}
            />
          )}
        </Card>
      )}

      {/* ── Legacy sections ── */}
      {legacySections.map((s) => (
        <CollapsedSection key={s.title} title={s.title}>{s.node}</CollapsedSection>
      ))}
    </div>
  );
}
