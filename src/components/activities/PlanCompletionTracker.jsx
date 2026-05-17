import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format, startOfWeek, startOfMonth, subMonths, addMonths } from "date-fns";
import { Calendar, CheckCircle2, XCircle, RotateCcw, ClipboardList } from "lucide-react";
import {
  summarisePlans,
  byCategory,
  byTimeOfDay,
  byDayOfWeek,
  weeklyTrend,
  findContrastingPattern,
  TIME_OF_DAY_LABELS,
  DAY_OF_WEEK_LABELS,
} from "@/lib/planAnalytics";

// Plan completion tracker — analytics surface for the lifecycle data
// added in Phase 1/2. Lives on the Activity Tracker page as a third
// tab next to "Logged" / "Planned". Pure read-only; no mutations.

const RANGE_OPTIONS = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "quarter", label: "Last 3 months" },
  { id: "all", label: "All time" },
];

function rangeBounds(rangeId) {
  const now = new Date();
  if (rangeId === "week") {
    const from = startOfWeek(now, { weekStartsOn: 0 });
    return { from, to: null };
  }
  if (rangeId === "month") {
    return { from: startOfMonth(now), to: null };
  }
  if (rangeId === "quarter") {
    return { from: startOfMonth(subMonths(now, 2)), to: null };
  }
  return { from: null, to: null };
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-xl border border-border/60 bg-card p-4 ${className}`}>
      {children}
    </div>
  );
}

function StatTile({ label, value, sublabel, accent = "default", icon: Icon }) {
  const accentClass = {
    default: "text-foreground",
    good: "text-emerald-500",
    bad: "text-rose-500",
    warn: "text-amber-500",
  }[accent] || "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className={`text-2xl font-bold ${accentClass}`}>{value}</div>
      {sublabel && <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>}
    </div>
  );
}

// Stacked-bar row used in both category and time-of-day breakdowns.
// `bucket` carries done / partial / skipped / cancelled counts; resolved
// is the sum.
function ResolutionBar({ bucket }) {
  if (bucket.resolved === 0) {
    return (
      <div className="h-2 rounded-full bg-muted/40" />
    );
  }
  const seg = (n) => `${(n / bucket.resolved) * 100}%`;
  return (
    <div className="h-2 rounded-full overflow-hidden bg-muted/40 flex">
      {bucket.done > 0 && (
        <div className="bg-emerald-500" style={{ width: seg(bucket.done) }} title={`Done: ${bucket.done}`} />
      )}
      {bucket.partial > 0 && (
        <div className="bg-emerald-300" style={{ width: seg(bucket.partial) }} title={`Partial: ${bucket.partial}`} />
      )}
      {bucket.skipped > 0 && (
        <div className="bg-amber-500" style={{ width: seg(bucket.skipped) }} title={`Skipped: ${bucket.skipped}`} />
      )}
      {bucket.cancelled > 0 && (
        <div className="bg-rose-500" style={{ width: seg(bucket.cancelled) }} title={`Cancelled: ${bucket.cancelled}`} />
      )}
    </div>
  );
}

function patternInsightText(pattern) {
  if (!pattern) return null;
  const labels = pattern.kind === "timeOfDay" ? TIME_OF_DAY_LABELS : DAY_OF_WEEK_LABELS;
  const lowLabel = (labels[pattern.low.key] || pattern.low.key).split(" ")[0].toLowerCase();
  const highLabel = (labels[pattern.high.key] || pattern.high.key).split(" ")[0].toLowerCase();
  if (pattern.low.completedPct === pattern.high.completedPct) return null;
  return `You completed ${pattern.high.completedPct}% of ${highLabel} plans but only ${pattern.low.completedPct}% of ${lowLabel} plans in this window.`;
}

export default function PlanCompletionTracker() {
  const [rangeId, setRangeId] = useState("month");
  const { from, to } = useMemo(() => rangeBounds(rangeId), [rangeId]);

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const summary = useMemo(() => summarisePlans(activities, { from, to }), [activities, from, to]);
  const categoryRows = useMemo(() => byCategory(activities, categories, { from, to }), [activities, categories, from, to]);
  const todBuckets = useMemo(() => byTimeOfDay(activities, { from, to }), [activities, from, to]);
  const dowBuckets = useMemo(() => byDayOfWeek(activities, { from, to }), [activities, from, to]);
  const trend = useMemo(() => weeklyTrend(activities, { weeks: 8 }), [activities]);
  const pattern = useMemo(() => findContrastingPattern(activities, { from, to }), [activities, from, to]);

  const noData = summary.scheduled === 0;

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex flex-wrap gap-2">
        {RANGE_OPTIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRangeId(r.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              rangeId === r.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {noData ? (
        <Card className="text-center py-10">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">
            No plans in this window yet. Schedule a plan, then come back to see how often you follow through.
          </p>
        </Card>
      ) : (
        <>
          {/* Top-line summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile
              label="Plans scheduled"
              value={summary.scheduled}
              sublabel={summary.stillScheduledFuture > 0 ? `${summary.stillScheduledFuture} upcoming` : null}
              icon={Calendar}
            />
            <StatTile
              label="Completed"
              value={`${summary.completedPct}%`}
              sublabel={`${summary.completed} of ${summary.resolved} resolved`}
              accent="good"
              icon={CheckCircle2}
            />
            <StatTile
              label="Cancelled / skipped"
              value={`${summary.cancelledPct + summary.skippedPct}%`}
              sublabel={`${summary.cancelled + summary.skipped} of ${summary.resolved}`}
              accent={summary.cancelledPct + summary.skippedPct > 40 ? "bad" : "warn"}
              icon={XCircle}
            />
            <StatTile
              label="Avg reschedules"
              value={summary.avgRescheduleCount.toFixed(1)}
              sublabel={summary.rescheduleSamples > 0 ? `across ${summary.rescheduleSamples} plans` : "no reschedules"}
              accent={summary.avgRescheduleCount >= 2 ? "warn" : "default"}
              icon={RotateCcw}
            />
          </div>

          {summary.unresolvedPast > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              {summary.unresolvedPast} {summary.unresolvedPast === 1 ? "plan is" : "plans are"} still marked
              "scheduled" but the time has already passed. They aren't counted in the completion rate above — resolve
              them from the Dashboard or the lifecycle popover to update your stats.
            </div>
          )}

          {/* Per-category */}
          <Card>
            <h3 className="font-semibold text-sm mb-1">By category</h3>
            <p className="text-xs text-muted-foreground mb-3">Sorted by completion rate — the categories you struggle with most appear first.</p>
            {categoryRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No category data in this window.</p>
            ) : (
              <div className="space-y-3">
                {categoryRows.map((row) => (
                  <div key={row.categoryId || row.label}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {row.color && (
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
                        )}
                        <span className="text-sm font-medium truncate">{row.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 flex-shrink-0">
                        {row.resolved > 0 ? (
                          <span><strong className="text-foreground">{row.completedPct}%</strong> completed</span>
                        ) : (
                          <span className="italic">unresolved</span>
                        )}
                        <span>{row.total} plan{row.total === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                    <ResolutionBar bucket={row} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Time of day */}
          <Card>
            <h3 className="font-semibold text-sm mb-1">By time of day</h3>
            <p className="text-xs text-muted-foreground mb-3">When you schedule plans matters — see when you actually follow through.</p>
            <div className="space-y-3">
              {Object.entries(TIME_OF_DAY_LABELS).map(([key, label]) => {
                const row = todBuckets[key];
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium">{label}</span>
                      <div className="text-xs text-muted-foreground flex items-center gap-3">
                        {row.resolved > 0 ? (
                          <span><strong className="text-foreground">{row.completedPct}%</strong> completed</span>
                        ) : (
                          <span className="italic">no data</span>
                        )}
                        <span>{row.total} plan{row.total === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                    <ResolutionBar bucket={row} />
                  </div>
                );
              })}
            </div>
            {pattern && pattern.kind === "timeOfDay" && (
              <p className="text-xs text-muted-foreground mt-3 leading-snug">
                {patternInsightText(pattern)}
              </p>
            )}
          </Card>

          {/* Day of week */}
          <Card>
            <h3 className="font-semibold text-sm mb-1">By day of week</h3>
            <p className="text-xs text-muted-foreground mb-3">The same plans on different days can have very different outcomes.</p>
            <div className="space-y-2">
              {Object.entries(DAY_OF_WEEK_LABELS).map(([key, label]) => {
                const row = dowBuckets[key];
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium">{label}</span>
                      <div className="text-xs text-muted-foreground flex items-center gap-3">
                        {row.resolved > 0 ? (
                          <span><strong className="text-foreground">{row.completedPct}%</strong> completed</span>
                        ) : (
                          <span className="italic">no data</span>
                        )}
                        <span>{row.total}</span>
                      </div>
                    </div>
                    <ResolutionBar bucket={row} />
                  </div>
                );
              })}
            </div>
            {pattern && pattern.kind === "dayOfWeek" && (
              <p className="text-xs text-muted-foreground mt-3 leading-snug">
                {patternInsightText(pattern)}
              </p>
            )}
          </Card>

          {/* Weekly trend */}
          <Card>
            <h3 className="font-semibold text-sm mb-1">Weekly trend</h3>
            <p className="text-xs text-muted-foreground mb-3">Completion rate over the last 8 weeks. Weeks with no resolved plans show as flat.</p>
            <WeeklyTrendChart trend={trend} />
          </Card>
        </>
      )}
    </div>
  );
}

function WeeklyTrendChart({ trend }) {
  const maxPct = 100;
  return (
    <div>
      <div className="flex items-end gap-1 h-32">
        {trend.map((w, i) => {
          const hasData = w.resolved > 0;
          const h = hasData ? `${(w.completedPct / maxPct) * 100}%` : "4%";
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full h-full flex items-end">
                <div
                  className={`w-full rounded-t-sm ${hasData ? "bg-primary/70" : "bg-muted/40"}`}
                  style={{ height: h }}
                  title={hasData ? `${w.label}: ${w.completedPct}% of ${w.resolved} resolved` : `${w.label}: no resolved plans`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1">
        {trend.map((w, i) => (
          <div key={i} className="flex-1 text-[0.625rem] text-center text-muted-foreground">
            {w.label}
          </div>
        ))}
      </div>
    </div>
  );
}
