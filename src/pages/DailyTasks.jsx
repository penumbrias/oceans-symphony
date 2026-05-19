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
  hasPollVotedToday,
  hasMentionAcknowledgedToday,
  hasFriendAddedToday,
  hasQuickActionUsedToday,
  hasThemeChangedToday,
  hasTermsCustomizedToday,
  hasTourCompletedToday,
  hasGroundingTechniqueUsedToday,
  hasDailyTaskCompletedToday,
  markDailyTaskCompletedToday,
  hasStreakMilestoneHitToday,
  markStreakMilestoneHitToday,
  isAutoTriggered,
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
  // Phase-2 trigger queries (v0.17.18). All of these check `created_date`
  // against TODAY — we don't need the actual content, so we sort by
  // created_date desc and only pull the recent N rows.
  const { data: altersForTriggers = [] } = useQuery({
    queryKey: ["altersForDailyTriggers"],
    queryFn: () => base44.entities.Alter.list("-created_date", 100),
    staleTime: 0,
  });
  const { data: alterNotesForTriggers = [] } = useQuery({
    queryKey: ["alterNotesForDailyTriggers"],
    queryFn: () => base44.entities.AlterNote.list("-created_date", 100),
    staleTime: 0,
  });
  const { data: bulletinsForTriggers = [] } = useQuery({
    queryKey: ["bulletinsForDailyTriggers"],
    queryFn: () => base44.entities.Bulletin.list("-created_date", 100),
    staleTime: 0,
  });
  const { data: bulletinCommentsForTriggers = [] } = useQuery({
    queryKey: ["bulletinCommentsForDailyTriggers"],
    queryFn: () => base44.entities.BulletinComment.list("-created_date", 100),
    staleTime: 0,
  });
  const { data: tasksCreatedForTriggers = [] } = useQuery({
    queryKey: ["tasksCreatedForDailyTriggers"],
    queryFn: () => base44.entities.Task.list("-created_date", 100),
    staleTime: 0,
  });
  const { data: goalsCreatedForTriggers = [] } = useQuery({
    queryKey: ["activityGoalsCreatedForDailyTriggers"],
    queryFn: () => base44.entities.ActivityGoal.list("-created_date", 100),
    staleTime: 0,
  });
  const { data: groupsForTriggers = [] } = useQuery({
    queryKey: ["groupsForDailyTriggers"],
    queryFn: () => base44.entities.Group.list("-created_date", 100),
    staleTime: 0,
  });
  const { data: systemChangeEventsForTriggers = [] } = useQuery({
    queryKey: ["systemChangeEventsForDailyTriggers"],
    queryFn: () => base44.entities.SystemChangeEvent.list("-created_date", 100),
    staleTime: 0,
  });
  const { data: supportJournalsForTriggers = [] } = useQuery({
    queryKey: ["supportJournalsForDailyTriggers"],
    queryFn: () => base44.entities.SupportJournalEntry.list("-created_date", 100),
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

  // Phase-2 derivations (v0.17.18). Entity-driven triggers check
  // `created_date === TODAY`; marker-driven triggers read a localStorage
  // day-stamp set at the firing site.
  const hasAlterAddedToday = altersForTriggers.some((a) => localDateKey(a.created_date) === TODAY);
  const hasNoteAddedToAlterToday = alterNotesForTriggers.some((n) => localDateKey(n.created_date) === TODAY);
  const hasBulletinPostedToday = bulletinsForTriggers.some((b) => localDateKey(b.created_date) === TODAY);
  const hasBulletinCommentMadeToday = bulletinCommentsForTriggers.some((c) => localDateKey(c.created_date) === TODAY);
  const hasTaskCreatedToday = tasksCreatedForTriggers.some((t) => localDateKey(t.created_date) === TODAY);
  const hasGoalCreatedToday = goalsCreatedForTriggers.some((g) => localDateKey(g.created_date) === TODAY);
  const hasGroupCreatedToday = groupsForTriggers.some((g) => localDateKey(g.created_date) === TODAY);
  const hasSystemChangeEventLoggedToday = systemChangeEventsForTriggers.some((e) => localDateKey(e.created_date) === TODAY);
  const hasReflectionSavedToday = supportJournalsForTriggers.some((r) => localDateKey(r.created_date) === TODAY);

  const hasPollVoted = hasPollVotedToday();
  const hasMentionAck = hasMentionAcknowledgedToday();
  const hasFriendAdded = hasFriendAddedToday();
  const hasQuickActionUsed = hasQuickActionUsedToday();
  const hasThemeChanged = hasThemeChangedToday();
  const hasTermsCustomized = hasTermsCustomizedToday();
  const hasTourCompleted = hasTourCompletedToday();
  const hasGroundingUsed = hasGroundingTechniqueUsedToday();
  const hasDailyTaskCompleted = hasDailyTaskCompletedToday();
  const hasStreakMilestone = hasStreakMilestoneHitToday();

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
      hasAlterAdded: hasAlterAddedToday,
      hasNoteAddedToAlter: hasNoteAddedToAlterToday,
      hasBulletinPosted: hasBulletinPostedToday,
      hasBulletinCommentMade: hasBulletinCommentMadeToday,
      hasPollVoted,
      hasTaskCreated: hasTaskCreatedToday,
      hasGoalCreated: hasGoalCreatedToday,
      hasGroupCreated: hasGroupCreatedToday,
      hasSystemChangeEventLogged: hasSystemChangeEventLoggedToday,
      hasMentionAcknowledged: hasMentionAck,
      hasFriendAdded,
      hasQuickActionUsed,
      hasThemeChanged,
      hasTermsCustomized,
      hasTourCompleted,
      hasReflectionSaved: hasReflectionSavedToday,
      hasGroundingTechniqueUsed: hasGroundingUsed,
      hasDailyTaskCompleted,
      hasStreakMilestoneHit: hasStreakMilestone,
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
      hasAlterAddedToday,
      hasNoteAddedToAlterToday,
      hasBulletinPostedToday,
      hasBulletinCommentMadeToday,
      hasPollVoted,
      hasTaskCreatedToday,
      hasGoalCreatedToday,
      hasGroupCreatedToday,
      hasSystemChangeEventLoggedToday,
      hasMentionAck,
      hasFriendAdded,
      hasQuickActionUsed,
      hasThemeChanged,
      hasTermsCustomized,
      hasTourCompleted,
      hasReflectionSavedToday,
      hasGroundingUsed,
      hasDailyTaskCompleted,
      hasStreakMilestone,
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
    () => activeTasks.filter(t => t.mode === "AUTO" && isAutoTriggered(t, autoTriggers)).map(t => t.id),
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

  // ──────────────────────────────────────────────────────────────────────
  // Period-aware leveling-label (v0.17.18).
  //
  // The Level-bar chip used to always read "N/M pts today" regardless of
  // which frequency tab the user is viewing. We now scale both the
  // earned and possible numbers to the selected window, AND swap the
  // suffix ("today" / "this week" / "this month" / "this year").
  //
  // Calculation strategy per window:
  //   daily   → today only
  //   weekly  → Monday-start week containing today
  //   monthly → current calendar month
  //   yearly  → current calendar year
  //
  // Earned XP sums DailyProgress.xp_earned across every record whose
  // `date` (always a YYYY-MM-DD string at write-time) falls inside the
  // window — this naturally includes daily/weekly/monthly/yearly tabs'
  // XP together, since each tab writes its own DailyProgress row.
  //
  // Possible XP is the same total-per-day daily-pool projected across
  // the window plus the higher-frequency templates' point totals (a
  // weekly template can be completed once per week, monthly once per
  // month, yearly once per year), so the denominator matches what
  // could theoretically be earned in this window.
  // ──────────────────────────────────────────────────────────────────────

  const periodBounds = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    if (activeFreq === "daily") {
      const ymd = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      return { from: ymd, to: ymd, daysInWindow: 1 };
    }
    if (activeFreq === "weekly") {
      const start = startOfWeek(now, { weekStartsOn: 1 });
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return {
        from: format(start, "yyyy-MM-dd"),
        to: format(end, "yyyy-MM-dd"),
        daysInWindow: 7,
      };
    }
    if (activeFreq === "monthly") {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return {
        from: format(start, "yyyy-MM-dd"),
        to: format(end, "yyyy-MM-dd"),
        daysInWindow: end.getDate(),
      };
    }
    // yearly
    const start = new Date(y, 0, 1);
    const end = new Date(y, 11, 31);
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return {
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
      daysInWindow: isLeap ? 366 : 365,
    };
  }, [activeFreq]);

  const periodEarnedXP = useMemo(() => {
    return allProgress.reduce((sum, p) => {
      const d = p.date;
      if (!d) return sum;
      if (d >= periodBounds.from && d <= periodBounds.to) {
        return sum + (p.xp_earned || 0);
      }
      return sum;
    }, 0);
  }, [allProgress, periodBounds]);

  const periodPossibleXP = useMemo(() => {
    const sumFor = (freq) => templates
      .filter((t) => t.is_active && (t.frequency || "daily") === freq)
      .reduce((s, t) => s + (t.points || 0), 0);
    const daily = sumFor("daily");
    const weekly = sumFor("weekly");
    const monthly = sumFor("monthly");
    const yearly = sumFor("yearly");
    const days = periodBounds.daysInWindow;
    if (activeFreq === "daily") return daily;
    if (activeFreq === "weekly") return daily * 7 + weekly;
    if (activeFreq === "monthly") {
      // Roughly one weekly slot per 7 days within this month, plus the
      // monthly template pool itself.
      const weeklySlots = Math.ceil(days / 7);
      return daily * days + weekly * weeklySlots + monthly;
    }
    // yearly
    return daily * days + weekly * 52 + monthly * 12 + yearly;
  }, [templates, periodBounds, activeFreq]);

  const periodLabel = {
    daily: "today",
    weekly: "this week",
    monthly: "this month",
    yearly: "this year",
  }[activeFreq] || "today";

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

  // Streak milestone trigger — fires once per day when the streak crosses
  // (or sits on) a multiple of 7. The localStorage marker stores both the
  // date and the milestone number so a streak that's still 7 across two
  // calendar days won't double-credit if today's flag is re-derived.
  useEffect(() => {
    if (streak <= 0 || streak % 7 !== 0) return;
    if (hasStreakMilestoneHitToday()) return;
    markStreakMilestoneHitToday(streak);
  }, [streak]);

  const toggleHistoryTask = async (taskId, periodKey, currentDone) => {
    // Refetch DailyProgress fresh before deciding update vs create.
    // The hold-to-change has a 1-second hold window during which the
    // query cache may have refetched. Using the render-captured
    // `allProgress` would let a stale snapshot drive the update — landing
    // on an old record id or duplicating a freshly-created row. Matches
    // the canonical refetch-before-write pattern from CLAUDE.md.
    const fresh = await base44.entities.DailyProgress.list();
    const record = fresh.find(p =>
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
        ? isAutoTriggered(t, autoTriggers)
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

    if (nowCompleted) {
      toast.success(`+${task.points} XP — ${applyTerms(task.title, terms)} done! 🎉`);
      // Meta trigger: any daily task completion marks the day. The
      // derivation pipeline guards re-entrancy implicitly — even though
      // setting the marker would re-fire the autoTriggers recompute, the
      // `daily_task_completed` template won't trigger a second
      // toggleManual call (only manual taps come through this path),
      // and the marker is just a date string, idempotent within a day.
      // Guard the self-firing case: a task whose own trigger is
      // `daily_task_completed` shouldn't bump the marker that
      // triggers itself. Multi-trigger templates need the same
      // guard — skip if the trigger list contains it.
      const tplTriggers = Array.isArray(task.auto_triggers) && task.auto_triggers.length > 0
        ? task.auto_triggers
        : (task.auto_trigger ? [task.auto_trigger] : []);
      if (activeFreq === "daily" && !tplTriggers.includes("daily_task_completed")) {
        markDailyTaskCompletedToday();
      }
    }

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

      {/* Level bar — chip text and numerator/denominator scale with the
          selected frequency tab. Level/XP-to-next-level remain driven by
          lifetime totalXP (not period-scoped). */}
      <div data-tour="tasks-level-bar">
        <LevelBar
          totalXP={totalXP}
          periodXP={periodEarnedXP}
          periodPossibleXP={periodPossibleXP}
          periodLabel={periodLabel}
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