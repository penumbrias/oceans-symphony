import React, { useMemo, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import {
  getTodayString,
  getPeriodKey,
  buildAutoCompletedTriggers,
  isTaskCompleted,
  totalPossiblePoints,
  getLevelFromTotalXP,
  DEFAULT_TASK_TEMPLATES,
  applyTerms,
  FREQUENCY_LABELS,
  hasBackupExportedToday,
} from "@/lib/dailyTaskSystem";
import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { startOfWeek, format } from "date-fns";
import { useTerms } from "@/lib/useTerms";
import LevelBar from "@/components/tasks/LevelBar";
import TaskCard from "@/components/tasks/TaskCard";
import TaskTemplateManager from "@/components/tasks/TaskTemplateManager";
import PeriodReview from "@/components/tasks/PeriodReview";
import { Button } from "@/components/ui/button";
import { Settings, LayoutGrid, CalendarDays } from "lucide-react";
import { toast } from "sonner";

const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"];

export default function DailyTasks() {
  const queryClient = useQueryClient();
  const terms = useTerms();
  const TODAY = getTodayString();

  const [showManager, setShowManager] = useState(false);
  const [activeFreq, setActiveFreq] = useState("daily");
  const [showReview, setShowReview] = useState(false);

  // Task templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["dailyTaskTemplates"],
    queryFn: () => base44.entities.DailyTaskTemplate.list("sort_order", 200),
    staleTime: 0,
  });

  // Seed defaults for new users
  useEffect(() => {
    if (templatesLoading) return;
    if (templates.length === 0) {
      const seed = async () => {
        for (const def of DEFAULT_TASK_TEMPLATES) {
          await base44.entities.DailyTaskTemplate.create({ ...def, frequency: "daily" });
        }
        queryClient.invalidateQueries({ queryKey: ["dailyTaskTemplates"] });
      };
      seed();
    } else {
      // Migrate missing frequency field
      const toMigrate = templates.filter(t => !t.frequency);
      if (toMigrate.length > 0) {
        const migrate = async () => {
          for (const t of toMigrate) {
            await base44.entities.DailyTaskTemplate.update(t.id, { frequency: "daily" });
          }
          queryClient.invalidateQueries({ queryKey: ["dailyTaskTemplates"] });
        };
        migrate();
      }
    }
  }, [templatesLoading, templates.length]);

  // All progress records
  const { data: allProgress = [], isLoading: progressLoading } = useQuery({
    queryKey: ["dailyProgress"],
    queryFn: () => base44.entities.DailyProgress.list("-date", 1000),
    staleTime: 0,
  });

  // Auto-trigger data (daily only). We over-fetch a bit (recent N rows) and
  // filter to today client-side rather than asking the entity layer for
  // per-day filtered queries — most entities don't expose a uniform
  // timestamp-or-created_date filter and the row counts are tiny.
  const { data: journals = [] } = useQuery({
    queryKey: ["journalEntriesToday", TODAY],
    queryFn: () => base44.entities.JournalEntry.list("-created_date", 50),
    staleTime: 0,
  });
  const { data: systemCheckIns = [] } = useQuery({
    queryKey: ["systemCheckInsToday", TODAY],
    queryFn: () => base44.entities.SystemCheckIn.filter({ date: TODAY }),
    staleTime: 0,
  });
  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasksForDailyTriggers"],
    queryFn: () => base44.entities.Task.list("-completed_date", 200),
    staleTime: 0,
  });
  const { data: allActivities = [] } = useQuery({
    queryKey: ["activitiesForDailyTriggers"],
    queryFn: () => base44.entities.Activity.list("-timestamp", 200),
    staleTime: 0,
  });
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckInsForDailyTriggers"],
    queryFn: () => base44.entities.EmotionCheckIn.list("-timestamp", 100),
    staleTime: 0,
  });
  const { data: statusNotes = [] } = useQuery({
    queryKey: ["statusNotesForDailyTriggers"],
    queryFn: () => base44.entities.StatusNote.list("-timestamp", 50),
    staleTime: 0,
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["locationsForDailyTriggers"],
    queryFn: () => base44.entities.Location.list("-timestamp", 50),
    staleTime: 0,
  });
  const { data: sleepRows = [] } = useQuery({
    queryKey: ["sleepForDailyTriggers"],
    queryFn: () => base44.entities.Sleep.list("-end_time", 30),
    staleTime: 0,
  });
  const { data: frontingSessions = [] } = useQuery({
    queryKey: ["frontingSessionsForDailyTriggers"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 100),
    staleTime: 0,
  });
  const { data: symptomCheckIns = [] } = useQuery({
    queryKey: ["symptomCheckInsForDailyTriggers"],
    queryFn: () => base44.entities.SymptomCheckIn.list("-timestamp", 100),
    staleTime: 0,
  });
  const { data: reminderInstances = [] } = useQuery({
    queryKey: ["reminderInstancesForDailyTriggers"],
    queryFn: () => base44.entities.ReminderInstance.list("-scheduled_for", 100),
    staleTime: 0,
  });
  const { data: activityGoals = [] } = useQuery({
    queryKey: ["activityGoalsForDailyTriggers"],
    queryFn: () => base44.entities.ActivityGoal.list(),
    staleTime: 0,
  });

  // Helper: turn an ISO timestamp into the user-local "YYYY-MM-DD" string
  // we compare against TODAY. Anything missing / malformed → null (won't
  // match TODAY, so the trigger won't fire — fail-quiet by design).
  const localDateKey = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const hasJournalToday = journals.some((j) => localDateKey(j.created_date) === TODAY);

  const hasTodoCompletedToday = allTasks.some((t) => t.completed && localDateKey(t.completed_date) === TODAY);

  // activity_logged: any Activity timestamped today in a logged/done state
  // (note: planned activities that have been done count; scheduled ones don't).
  const hasActivityLoggedToday = allActivities.some((a) => {
    if (localDateKey(a.timestamp) !== TODAY) return false;
    const st = statusFor(a);
    return st === ACTIVITY_STATUSES.LOGGED || st === ACTIVITY_STATUSES.DONE;
  });

  // plan_completed: an activity whose lifecycle finished as `done` today.
  // Partial / skipped / cancelled don't count — those are explicit "not done".
  const hasPlanCompletedToday = allActivities.some((a) => {
    if (localDateKey(a.timestamp) !== TODAY) return false;
    return statusFor(a) === ACTIVITY_STATUSES.DONE;
  });

  const hasEmotionCheckInToday = emotionCheckIns.some((e) => localDateKey(e.timestamp) === TODAY);

  // Quick-Check-In modal currently always creates an EmotionCheckIn row, so
  // until that flow diverges we treat the two as aliases. Keeping them as
  // separate trigger ids in the catalogue lets us tease them apart later
  // without breaking already-saved templates.
  const hasQuickCheckInToday = hasEmotionCheckInToday;

  const hasStatusNoteToday = statusNotes.some((n) => localDateKey(n.timestamp) === TODAY);

  const hasLocationToday = locations.some((l) => localDateKey(l.timestamp) === TODAY);

  // sleep_logged fires when a Sleep row has end_time today (i.e. you woke
  // up today). Logging a nap also counts. Sleep rows without end_time are
  // still in progress and don't fire the trigger.
  const hasSleepToday = sleepRows.some((s) => localDateKey(s.end_time) === TODAY);

  // switch_logged fires when a fronting session started today. We don't
  // gate on is_primary — any new front today counts as "a switch happened
  // today", which matches what testers asked for.
  const hasSwitchToday = frontingSessions.some((s) => localDateKey(s.start_time) === TODAY);

  const hasSymptomCheckInToday = symptomCheckIns.some((s) => localDateKey(s.timestamp) === TODAY);

  // reminder_acknowledged: a ReminderInstance flipped to "acted" today.
  // We don't have an acted_at field, so use scheduled_for as a proxy —
  // anything acted on for a today-scheduled instance counts.
  const hasReminderAckToday = reminderInstances.some((r) =>
    r.status === "acted" && localDateKey(r.scheduled_for) === TODAY
  );

  const hasBackupExported = hasBackupExportedToday();

  // goal_met: any ActivityGoal whose actual minutes for the current week
  // are >= target. Because this is pure derivation, "first time per week"
  // is automatic — once met, the trigger stays satisfied for the rest of
  // the week, but it never double-fires the underlying task.
  const hasGoalMetThisWeek = useMemo(() => {
    const weekStart = format(startOfWeek(new Date()), "yyyy-MM-dd");
    const weekGoals = activityGoals.filter((g) => g.week_start_date === weekStart);
    if (weekGoals.length === 0) return false;
    return weekGoals.some((g) => {
      const target = g.weekly_minutes || g.target_minutes || 0;
      if (target <= 0) return false;
      const actual = allActivities
        .filter((a) => {
          if (!(a.activity_category_ids || []).includes(g.activity_category_id)) return false;
          const st = statusFor(a);
          return st === ACTIVITY_STATUSES.LOGGED ||
            st === ACTIVITY_STATUSES.DONE ||
            st === ACTIVITY_STATUSES.PARTIAL;
        })
        .reduce((sum, a) => sum + (a.actual_duration_minutes || a.duration_minutes || 0), 0);
      return actual >= target;
    });
  }, [activityGoals, allActivities]);

  const autoTriggers = useMemo(
    () => buildAutoCompletedTriggers({
      hasJournal: hasJournalToday,
      hasPartsCheckIn: systemCheckIns.length > 0,
      hasTodoCompleted: hasTodoCompletedToday,
      hasActivityLogged: hasActivityLoggedToday,
      hasPlanCompleted: hasPlanCompletedToday,
      hasEmotionCheckIn: hasEmotionCheckInToday,
      hasQuickCheckIn: hasQuickCheckInToday,
      hasStatusNote: hasStatusNoteToday,
      hasLocation: hasLocationToday,
      hasSleep: hasSleepToday,
      hasSwitch: hasSwitchToday,
      hasSymptomCheckIn: hasSymptomCheckInToday,
      hasReminderAcknowledged: hasReminderAckToday,
      hasBackupExported,
      hasGoalMet: hasGoalMetThisWeek,
    }),
    [
      hasJournalToday,
      systemCheckIns.length,
      hasTodoCompletedToday,
      hasActivityLoggedToday,
      hasPlanCompletedToday,
      hasEmotionCheckInToday,
      hasQuickCheckInToday,
      hasStatusNoteToday,
      hasLocationToday,
      hasSleepToday,
      hasSwitchToday,
      hasSymptomCheckInToday,
      hasReminderAckToday,
      hasBackupExported,
      hasGoalMetThisWeek,
    ]
  );

  // Current period key per frequency
  const currentPeriodKey = useMemo(() => getPeriodKey(activeFreq), [activeFreq]);

  // Active templates for current tab
  const activeTasks = useMemo(
    () => [...templates]
      .filter(t => t.is_active && (t.frequency || "daily") === activeFreq)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [templates, activeFreq]
  );

  // IDs of AUTO tasks that are currently triggered today (must come after activeTasks)
  const autoCompletedIds = useMemo(
    () => activeTasks.filter(t => t.mode === "AUTO" && autoTriggers.has(t.auto_trigger)).map(t => t.id),
    [activeTasks, autoTriggers]
  );

  // Find progress record for current period
  const currentRecord = useMemo(() => {
    return allProgress.find(p =>
      (p.frequency === activeFreq || (!p.frequency && activeFreq === "daily")) &&
      (p.period_key === currentPeriodKey || (activeFreq === "daily" && p.date === currentPeriodKey))
    );
  }, [allProgress, activeFreq, currentPeriodKey]);

  const manualCompletedIds = new Set(currentRecord?.completed_task_ids || []);

  const todayXP = useMemo(
    () => activeTasks.reduce((sum, t) => {
      const done = activeFreq === "daily" ? isTaskCompleted(t, manualCompletedIds, autoTriggers) : manualCompletedIds.has(t.id);
      return done ? sum + (t.points || 0) : sum;
    }, 0),
    [activeTasks, manualCompletedIds, autoTriggers, activeFreq]
  );

  const possibleXP = useMemo(() => totalPossiblePoints(templates), [templates]);

  // Total XP across all periods
  const totalXP = useMemo(
    () => allProgress.reduce((sum, p) => sum + (p.xp_earned || 0), 0),
    [allProgress]
  );

  // Streak (daily only)
  const { streak, bestStreak } = useMemo(() => {
    const dailyProgress = allProgress.filter(p => !p.frequency || p.frequency === "daily");
    const dates = new Set(dailyProgress.filter(p => (p.xp_earned || 0) > 0).map(p => p.date));
    let streak = 0;
    let d = new Date();
    if (dates.has(TODAY) || (activeFreq === "daily" && todayXP > 0)) {
      streak = 1;
      d.setDate(d.getDate() - 1);
    }
    while (true) {
      const s = d.toISOString().split("T")[0];
      if (dates.has(s)) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    let best = 0, cur = 0, prev = null;
    for (const p of [...dailyProgress].sort((a, b) => a.date.localeCompare(b.date))) {
      if ((p.xp_earned || 0) > 0) {
        if (prev) {
          const diff = (new Date(p.date) - new Date(prev)) / 86400000;
          cur = diff === 1 ? cur + 1 : 1;
        } else cur = 1;
        if (cur > best) best = cur;
        prev = p.date;
      }
    }
    return { streak, bestStreak: Math.max(best, streak) };
  }, [allProgress, todayXP, TODAY, activeFreq]);

  const toggleHistoryTask = async (taskId, periodKey, currentDone) => {
    const record = allProgress.find(p =>
      (p.frequency === activeFreq || (!p.frequency && activeFreq === "daily")) &&
      (p.period_key === periodKey || (activeFreq === "daily" && p.date === periodKey))
    );
    const existing = new Set(record?.completed_task_ids || []);
    currentDone ? existing.delete(taskId) : existing.add(taskId);
    const newIds = [...existing];
    const newXP = templates.filter(t => t.is_active && (t.frequency || "daily") === activeFreq)
      .reduce((sum, t) => existing.has(t.id) ? sum + (t.points || 0) : sum, 0);
    if (record) {
      queryClient.setQueryData(["dailyProgress"], old =>
        Array.isArray(old) ? old.map(p => p.id === record.id ? { ...p, completed_task_ids: newIds, xp_earned: newXP } : p) : old
      );
      await base44.entities.DailyProgress.update(record.id, { completed_task_ids: newIds, xp_earned: newXP });
    } else {
      await base44.entities.DailyProgress.create({
        date: periodKey,
        period_key: periodKey,
        frequency: activeFreq,
        completed_task_ids: newIds,
        xp_earned: newXP,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["dailyProgress"] });
  };

  const toggleManual = async (templateId) => {
    const task = templates.find(t => t.id === templateId);
    if (!task || task.mode !== "MANUAL") return;

    const nowCompleted = !manualCompletedIds.has(templateId);
    const newCompleted = new Set(manualCompletedIds);
    nowCompleted ? newCompleted.add(templateId) : newCompleted.delete(templateId);

    const newXP = activeTasks.reduce((sum, t) => {
      const done = t.mode === "AUTO" && activeFreq === "daily"
        ? autoTriggers.has(t.auto_trigger)
        : newCompleted.has(t.id);
      return done ? sum + (t.points || 0) : sum;
    }, 0);

    // Merge manual + auto IDs so the review grid can see both
    const allCompleted = [...new Set([...newCompleted, ...autoCompletedIds])];

    // Optimistic update
    const optimistic = {
      date: TODAY,
      period_key: currentPeriodKey,
      frequency: activeFreq,
      completed_task_ids: allCompleted,
      xp_earned: newXP,
    };
    queryClient.setQueryData(["dailyProgress"], (old) => {
      if (!Array.isArray(old)) return old;
      const exists = old.find(p =>
        (p.frequency === activeFreq || (!p.frequency && activeFreq === "daily")) &&
        (p.period_key === currentPeriodKey || (activeFreq === "daily" && p.date === currentPeriodKey))
      );
      return exists
        ? old.map(p => p.id === exists.id ? { ...p, ...optimistic } : p)
        : [...old, { id: "__optimistic__", ...optimistic }];
    });

    if (nowCompleted) toast.success(`+${task.points} XP — ${applyTerms(task.title, terms)} done! 🎉`);

    if (currentRecord) {
      await base44.entities.DailyProgress.update(currentRecord.id, {
        completed_task_ids: allCompleted,
        xp_earned: newXP,
      });
    } else {
      await base44.entities.DailyProgress.create({
        date: TODAY,
        period_key: currentPeriodKey,
        frequency: activeFreq,
        completed_task_ids: allCompleted,
        xp_earned: newXP,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["dailyProgress"] });
  };

  // Persist auto XP + auto task IDs for daily tasks so the review grid shows them
  useEffect(() => {
    if (progressLoading || templatesLoading || activeFreq !== "daily") return;
    const allIds = [...new Set([...manualCompletedIds, ...autoCompletedIds])];
    if (!currentRecord && todayXP > 0) {
      base44.entities.DailyProgress.create({
        date: TODAY,
        period_key: currentPeriodKey,
        frequency: "daily",
        completed_task_ids: allIds,
        xp_earned: todayXP,
      }).then(() => queryClient.invalidateQueries({ queryKey: ["dailyProgress"] }));
    } else if (currentRecord) {
      // Backfill any auto IDs missing from the stored record
      const stored = new Set(currentRecord.completed_task_ids || []);
      const missingAuto = autoCompletedIds.some(id => !stored.has(id));
      if (missingAuto) {
        const merged = [...new Set([...stored, ...autoCompletedIds])];
        base44.entities.DailyProgress.update(currentRecord.id, {
          completed_task_ids: merged,
          xp_earned: todayXP,
        }).then(() => queryClient.invalidateQueries({ queryKey: ["dailyProgress"] }));
      }
    }
  }, [progressLoading, templatesLoading, currentRecord?.id, activeFreq, autoTriggers]);

  const freqCounts = useMemo(() => {
    const counts = {};
    FREQUENCIES.forEach(f => {
      counts[f] = templates.filter(t => t.is_active && (t.frequency || "daily") === f).length;
    });
    return counts;
  }, [templates]);

  return (
    <motion.div data-tour="tasks-daily" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Tasks</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Daily, weekly, monthly & yearly check-ins.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showReview ? "default" : "outline"}
            size="sm"
            onClick={() => setShowReview(v => !v)}
            className="gap-1.5"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Review
          </Button>
          <Button data-tour="tasks-edit-btn" variant="outline" size="sm" onClick={() => setShowManager(!showManager)} className="gap-1.5">
            <Settings className="w-3.5 h-3.5" />
            {showManager ? "Close" : "Edit"}
          </Button>
        </div>
      </div>

      {/* Manager */}
      <AnimatePresence>
        {showManager && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-card border border-border rounded-xl p-4">
              <TaskTemplateManager templates={templates} onClose={() => setShowManager(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level bar (always daily XP) */}
      <div data-tour="tasks-level-bar">
        <LevelBar
          totalXP={totalXP}
          todayXP={activeFreq === "daily" ? todayXP : undefined}
          todayPossibleXP={activeFreq === "daily" ? possibleXP : undefined}
          streak={streak}
          bestStreak={bestStreak}
        />
      </div>

      {/* Frequency tabs */}
      <div data-tour="tasks-freq-tabs" className="flex gap-1 bg-muted/40 rounded-xl p-1">
        {FREQUENCIES.map(f => (
          <button
            key={f}
            onClick={() => { setActiveFreq(f); setShowReview(false); }}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-all ${
              activeFreq === f
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="capitalize">{f}</span>
            {freqCounts[f] > 0 && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${activeFreq === f ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                {freqCounts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Review or task list */}
      <AnimatePresence mode="wait">
        {showReview ? (
          <motion.div key="review" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <PeriodReview
              frequency={activeFreq}
              templates={templates}
              allProgress={allProgress}
              onToggleTask={toggleHistoryTask}
            />
          </motion.div>
        ) : (
          <motion.div key={activeFreq} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            {/* Period indicator */}
            <div className="text-xs text-muted-foreground px-1">
              {activeFreq === "daily" && `Today · ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
              {activeFreq === "weekly" && `This week · ${currentPeriodKey}`}
              {activeFreq === "monthly" && `This month · ${new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}`}
              {activeFreq === "yearly" && `This year · ${new Date().getFullYear()}`}
              {activeTasks.length > 0 && (
                <span className="ml-2 font-semibold text-foreground">
                  {activeTasks.filter(t => {
                    const done = activeFreq === "daily" ? isTaskCompleted(t, manualCompletedIds, autoTriggers) : manualCompletedIds.has(t.id);
                    return done;
                  }).length}/{activeTasks.length} done
                </span>
              )}
            </div>

            {activeTasks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground space-y-2">
                <LayoutGrid className="w-10 h-10 mx-auto opacity-30" />
                <p className="text-sm">No {FREQUENCY_LABELS[activeFreq].toLowerCase()} tasks yet.</p>
                <p className="text-xs">Open "Edit" to add {activeFreq} tasks.</p>
              </div>
            ) : (
              activeTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={{
                    ...task,
                    title: applyTerms(task.title, terms),
                    description: applyTerms(task.description, terms),
                  }}
                  completed={activeFreq === "daily"
                    ? isTaskCompleted(task, manualCompletedIds, autoTriggers)
                    : manualCompletedIds.has(task.id)
                  }
                  onToggle={toggleManual}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}