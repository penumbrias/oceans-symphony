import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44, localEntities } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Target, AlertTriangle, ClipboardList, Bell, CheckSquare, Moon, MapPin, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { useTerms } from "@/lib/useTerms";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";
import {
  buildRange,
  computePlanLifecycle,
  computeGoalProgress,
  computeEmotionRollup,
  computeTaskCompletion,
  computeReminderAckRate,
  computeSleepQuality,
  computeLocationRollup,
  computeMoodActivityCorrelation,
} from "@/lib/analyticsAggregator";

// Composite analytics surface that pulls together the coverage
// gaps identified in the analytics audit:
//   - plan lifecycle (done / partial / skipped / cancelled %),
//   - goal completion progress for the window,
//   - distress check-in rate,
//   - task creation vs completion,
//   - reminder acknowledgement rate,
//   - sleep quality average,
//   - top locations,
//   - mood ↔ activity correlation.
//
// Each row is independently computed via the shared aggregator
// (src/lib/analyticsAggregator.js), so numbers are consistent
// with whatever other analytics surface reads from the same
// helpers. Renders nothing when there's no underlying data so
// users without (e.g.) sleep records don't see an empty card.

function formatHM(min) {
  if (!min || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function pct(ratio) {
  if (!Number.isFinite(ratio)) return "—";
  return `${Math.round(ratio * 100)}%`;
}

export default function InsightsHub({ from, to }) {
  const terms = useTerms();
  const range = useMemo(() => buildRange(from, to), [from, to]);

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });
  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });
  const { data: goals = [] } = useQuery({
    queryKey: ["activityGoals"],
    queryFn: () => base44.entities.ActivityGoal.list(),
  });
  const { data: checkIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list("-timestamp"),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list(),
  });
  const { data: reminderInstances = [] } = useQuery({
    queryKey: ["reminderInstances"],
    queryFn: () => base44.entities.ReminderInstance.list(),
  });
  const { data: sleepRecords = [] } = useQuery({
    queryKey: ["sleepRecords"],
    queryFn: () => base44.entities.Sleep.list(),
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => localEntities.Location.list(),
  });

  const planLifecycle = useMemo(() => computePlanLifecycle(activities, range), [activities, range]);
  const goalProgress = useMemo(() => computeGoalProgress(goals, activities, range), [goals, activities, range]);
  const emotionRollup = useMemo(() => computeEmotionRollup(checkIns, [], range), [checkIns, range]);
  const taskRollup = useMemo(() => computeTaskCompletion(tasks, range), [tasks, range]);
  const reminderRollup = useMemo(() => computeReminderAckRate(reminderInstances, range), [reminderInstances, range]);
  const sleepRollup = useMemo(() => computeSleepQuality(sleepRecords, range), [sleepRecords, range]);
  const locationRollup = useMemo(() => computeLocationRollup(locations, range), [locations, range]);
  const moodActivity = useMemo(
    () => computeMoodActivityCorrelation(activities, checkIns, activityCategories, range),
    [activities, checkIns, activityCategories, range]
  );

  return (
    <div className="space-y-3">
      {/* Plan completion */}
      {planLifecycle.totalPlans > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Plan completion</p>
            <span className="ml-auto text-xs text-muted-foreground">
              {planLifecycle.resolved}/{planLifecycle.totalPlans} resolved · {pct(planLifecycle.completionRate)} done
            </span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-muted/40">
            {[
              { st: ACTIVITY_STATUSES.DONE, color: "#10b981" },
              { st: ACTIVITY_STATUSES.PARTIAL, color: "#f59e0b" },
              { st: ACTIVITY_STATUSES.SKIPPED, color: "#94a3b8" },
              { st: ACTIVITY_STATUSES.CANCELLED, color: "#ef4444" },
              { st: ACTIVITY_STATUSES.SCHEDULED, color: "#6366f1" },
            ].map(({ st, color }) => {
              const w = planLifecycle.totalPlans > 0
                ? (planLifecycle.counts[st] || 0) / planLifecycle.totalPlans * 100
                : 0;
              if (w <= 0) return null;
              return <div key={st} style={{ width: `${w}%`, background: color }} title={`${st}: ${planLifecycle.counts[st]}`} />;
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />Done {planLifecycle.counts[ACTIVITY_STATUSES.DONE] || 0}</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />Partial {planLifecycle.counts[ACTIVITY_STATUSES.PARTIAL] || 0}</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1" />Skipped {planLifecycle.counts[ACTIVITY_STATUSES.SKIPPED] || 0}</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Cancelled {planLifecycle.counts[ACTIVITY_STATUSES.CANCELLED] || 0}</span>
            {planLifecycle.counts[ACTIVITY_STATUSES.SCHEDULED] > 0 && (
              <span><span className="inline-block w-2 h-2 rounded-full bg-indigo-500 mr-1" />Still scheduled {planLifecycle.counts[ACTIVITY_STATUSES.SCHEDULED]}</span>
            )}
          </div>
        </Card>
      )}

      {/* Goal progress */}
      {goalProgress.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Goal progress</p>
          </div>
          <div className="space-y-2">
            {goalProgress.map(({ goal, targetMinutes, achievedMinutes, ratio }) => (
              <div key={goal.id} className="space-y-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-foreground truncate">{goal.name || "Goal"}</span>
                  <span className="text-muted-foreground">{formatHM(achievedMinutes)} / {formatHM(targetMinutes)} ({pct(Math.min(ratio, 1))})</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full" style={{ width: `${Math.min(ratio, 1) * 100}%`, background: ratio >= 1 ? "#10b981" : "#8b5cf6" }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Distress + emotion intensity */}
      {emotionRollup.totalCheckIns > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold">Check-in summary</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-muted-foreground text-[11px]">Check-ins</p>
              <p className="text-foreground font-medium">{emotionRollup.totalCheckIns}</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-muted-foreground text-[11px]">Distress flagged</p>
              <p className="text-foreground font-medium">{emotionRollup.distressCount} ({pct(emotionRollup.distressRate)})</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-muted-foreground text-[11px]">Top emotion</p>
              <p className="text-foreground font-medium truncate">{emotionRollup.topEmotions[0]?.label || "—"}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Task completion */}
      {(taskRollup.createdInWindow > 0 || taskRollup.completedInWindow > 0) && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">To-dos this window</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-muted-foreground text-[11px]">Created</p>
              <p className="text-foreground font-medium">{taskRollup.createdInWindow}</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-muted-foreground text-[11px]">Completed</p>
              <p className="text-foreground font-medium">{taskRollup.completedInWindow}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Reminder ack */}
      {reminderRollup.scheduled > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Reminders</p>
            <span className="ml-auto text-xs text-muted-foreground">{pct(reminderRollup.ackRate)} acted on</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-muted/40">
            {[{ k: "acted", w: reminderRollup.acted, color: "#10b981" },
              { k: "dismissed", w: reminderRollup.dismissed, color: "#94a3b8" },
              { k: "missed", w: reminderRollup.missed, color: "#ef4444" }].map(({ k, w, color }) => {
              const wp = w / reminderRollup.scheduled * 100;
              return wp > 0 ? <div key={k} style={{ width: `${wp}%`, background: color }} title={`${k}: ${w}`} /> : null;
            })}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {reminderRollup.acted} acted · {reminderRollup.dismissed} dismissed · {reminderRollup.missed} missed · of {reminderRollup.scheduled} scheduled
          </div>
        </Card>
      )}

      {/* Sleep */}
      {sleepRollup.nights > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Sleep</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-muted-foreground text-[11px]">Nights logged</p>
              <p className="text-foreground font-medium">{sleepRollup.nights}</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-muted-foreground text-[11px]">Avg duration</p>
              <p className="text-foreground font-medium">{formatHM(sleepRollup.avgMinutes)}</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-muted-foreground text-[11px]">Avg quality</p>
              <p className="text-foreground font-medium">{sleepRollup.avgQuality != null ? sleepRollup.avgQuality.toFixed(1) : "—"}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Top locations */}
      {locationRollup.total > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Top locations</p>
          </div>
          <div className="space-y-1">
            {locationRollup.byName.slice(0, 5).map((row) => (
              <div key={row.name} className="flex items-center justify-between text-xs">
                <span className="text-foreground truncate">{row.name}</span>
                <span className="text-muted-foreground">{row.count}×</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Mood ↔ Activity correlation */}
      {moodActivity.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Mood after activity</p>
            <span className="ml-auto text-xs text-muted-foreground">avg check-in intensity within 3h</span>
          </div>
          <div className="space-y-1">
            {moodActivity.slice(0, 6).map((row) => (
              <div key={row.categoryId || row.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 truncate">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: row.color }} />
                  <span className="text-foreground truncate">{row.name}</span>
                </span>
                <span className="text-muted-foreground">{row.avgIntensity.toFixed(1)} · n={row.samples}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground italic">
            Activities listed in order of average emotion intensity logged within ~3 hours after they happened. Higher numbers track higher-energy follow-up emotions, not necessarily "good" — interpret with your own context.
          </p>
        </Card>
      )}

      {planLifecycle.totalPlans === 0
        && goalProgress.length === 0
        && emotionRollup.totalCheckIns === 0
        && taskRollup.createdInWindow === 0
        && reminderRollup.scheduled === 0
        && sleepRollup.nights === 0
        && locationRollup.total === 0
        && moodActivity.length === 0
        && (
        <p className="text-sm text-muted-foreground italic text-center py-12">
          No insights yet for this range — log activities, plans, check-ins, or sleep to populate this view.
        </p>
      )}
    </div>
  );
}
