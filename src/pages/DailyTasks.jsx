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
} from "@/lib/dailyTaskSystem";
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

  // Auto-trigger data (daily only)
  const { data: journals = [] } = useQuery({
    queryKey: ["journalEntriesToday", TODAY],
    queryFn: () => base44.entities.JournalEntry.list("-created_date", 50),
    staleTime: 0,
  });
  const { data: diaryCards = [] } = useQuery({
    queryKey: ["diaryCardsToday", TODAY],
    queryFn: () => base44.entities.DiaryCard.filter({ date: TODAY }),
    staleTime: 0,
  });
  const { data: systemCheckIns = [] } = useQuery({
    queryKey: ["systemCheckInsToday", TODAY],
    queryFn: () => base44.entities.SystemCheckIn.filter({ date: TODAY }),
    staleTime: 0,
  });

  const hasJournalToday = journals.some((j) => {
    if (!j.created_date) return false;
    const d = new Date(j.created_date);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return local === TODAY;
  });

  const autoTriggers = useMemo(
    () => buildAutoCompletedTriggers({
      hasJournal: hasJournalToday,
      hasDiaryCard: diaryCards.length > 0,
      hasPartsCheckIn: systemCheckIns.length > 0,
    }),
    [hasJournalToday, diaryCards.length, systemCheckIns.length]
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

    // Optimistic update
    const optimistic = {
      date: TODAY,
      period_key: currentPeriodKey,
      frequency: activeFreq,
      completed_task_ids: [...newCompleted],
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
        completed_task_ids: [...newCompleted],
        xp_earned: newXP,
      });
    } else {
      await base44.entities.DailyProgress.create({
        date: TODAY,
        period_key: currentPeriodKey,
        frequency: activeFreq,
        completed_task_ids: [...newCompleted],
        xp_earned: newXP,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["dailyProgress"] });
  };

  // Persist auto XP for daily tasks
  useEffect(() => {
    if (progressLoading || templatesLoading || activeFreq !== "daily") return;
    const dailyAutoXP = activeTasks.reduce((sum, t) => {
      const done = isTaskCompleted(t, manualCompletedIds, autoTriggers);
      return done ? sum + (t.points || 0) : sum;
    }, 0);
    if (!currentRecord && dailyAutoXP > 0) {
      base44.entities.DailyProgress.create({
        date: TODAY,
        period_key: currentPeriodKey,
        frequency: "daily",
        completed_task_ids: [],
        xp_earned: dailyAutoXP,
      }).then(() => queryClient.invalidateQueries({ queryKey: ["dailyProgress"] }));
    } else if (currentRecord && dailyAutoXP !== (currentRecord.xp_earned || 0) && manualCompletedIds.size === 0) {
      base44.entities.DailyProgress.update(currentRecord.id, {
        completed_task_ids: [...manualCompletedIds],
        xp_earned: todayXP,
      }).then(() => queryClient.invalidateQueries({ queryKey: ["dailyProgress"] }));
    }
  }, [progressLoading, templatesLoading, todayXP, currentRecord, activeFreq]);

  const freqCounts = useMemo(() => {
    const counts = {};
    FREQUENCIES.forEach(f => {
      counts[f] = templates.filter(t => t.is_active && (t.frequency || "daily") === f).length;
    });
    return counts;
  }, [templates]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-2xl mx-auto">
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
          <Button variant="outline" size="sm" onClick={() => setShowManager(!showManager)} className="gap-1.5">
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
      <LevelBar
        totalXP={totalXP}
        todayXP={activeFreq === "daily" ? todayXP : undefined}
        todayPossibleXP={activeFreq === "daily" ? possibleXP : undefined}
        streak={streak}
        bestStreak={bestStreak}
      />

      {/* Frequency tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
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