import React, { useMemo, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import {
  getTodayString,
  buildAutoCompletedTriggers,
  isTaskCompleted,
  totalPossiblePoints,
  getLevelFromTotalXP,
  DEFAULT_TASK_TEMPLATES,
  applyTerms,
} from "@/lib/dailyTaskSystem";
import { useTerms } from "@/lib/useTerms";
import LevelBar from "@/components/tasks/LevelBar";
import TaskCard from "@/components/tasks/TaskCard";
import TaskTemplateManager from "@/components/tasks/TaskTemplateManager";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { useMentionHighlight } from "@/lib/useMentionHighlight";

export default function DailyTasks() {
  const queryClient = useQueryClient();
  const terms = useTerms();
  const TODAY = getTodayString();
  const [showManager, setShowManager] = useState(false);
  const [searchParams] = useSearchParams();
  const pendingId = searchParams.get("id");

  useMentionHighlight("id", true);

  // Task templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["dailyTaskTemplates"],
    queryFn: () => base44.entities.DailyTaskTemplate.list("sort_order", 200),
    staleTime: 0,
  });

  // Seed defaults for new users (once templates have loaded and are empty)
 useEffect(() => {
  if (templatesLoading) return;
  if (templates.length === 0) {
    const seed = async () => {
      for (const def of DEFAULT_TASK_TEMPLATES) {
        await base44.entities.DailyTaskTemplate.create({ ...def });
      }
      queryClient.invalidateQueries({ queryKey: ["dailyTaskTemplates"] });
    };
    seed();
  } else {
    // Migrate any old hardcoded titles to use terminology tokens
    const migrations = {
      "Parts check-in": "{{System}} check-in",
      "parts check-in": "{{System}} check-in",
      " check-in": "{{System}} check-in",
    };
    const toMigrate = templates.filter(t => migrations[t.title]);
    if (toMigrate.length > 0) {
      const migrate = async () => {
        for (const t of toMigrate) {
          await base44.entities.DailyTaskTemplate.update(t.id, {
            title: migrations[t.title],
          });
        }
        queryClient.invalidateQueries({ queryKey: ["dailyTaskTemplates"] });
      };
      migrate();
    }
  }
}, [templatesLoading, templates.length]);

  // Daily progress records
  const { data: allProgress = [], isLoading: progressLoading } = useQuery({
    queryKey: ["dailyProgress"],
    queryFn: () => base44.entities.DailyProgress.list("-date", 365),
    staleTime: 0,
  });

  // Data for AUTO trigger detection
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

  // Build auto-triggers set
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

  const todayRecord = allProgress.find((p) => p.date === TODAY);
  const manualCompletedIds = new Set(todayRecord?.completed_task_ids || []);

  // Active templates sorted
  const activeTasks = useMemo(
    () => [...templates]
      .filter((t) => t.is_active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [templates]
  );

  const todayXP = useMemo(
    () => activeTasks.reduce((sum, t) => isTaskCompleted(t, manualCompletedIds, autoTriggers) ? sum + (t.points || 0) : sum, 0),
    [activeTasks, manualCompletedIds, autoTriggers]
  );

  const possibleXP = useMemo(() => totalPossiblePoints(templates), [templates]);

  // Total XP across all days
  const totalXP = useMemo(
    () => allProgress.reduce((sum, p) => sum + (p.xp_earned || 0), 0),
    [allProgress]
  );

  // Streak calculation
  const { streak, bestStreak } = useMemo(() => {
    const dates = new Set(allProgress.filter((p) => (p.xp_earned || 0) > 0).map((p) => p.date));
    let streak = 0;
    let d = new Date();
    if (dates.has(TODAY) || todayXP > 0) {
      streak = 1;
      d.setDate(d.getDate() - 1);
    }
    while (true) {
      const s = d.toISOString().split("T")[0];
      if (dates.has(s)) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    let best = 0, cur = 0, prev = null;
    for (const p of [...allProgress].sort((a, b) => a.date.localeCompare(b.date))) {
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
  }, [allProgress, todayXP, TODAY]);

  const toggleManual = async (templateId) => {
    const task = templates.find((t) => t.id === templateId);
    if (!task || task.mode !== "MANUAL") return;

    const nowCompleted = !manualCompletedIds.has(templateId);
    const newCompleted = new Set(manualCompletedIds);
    nowCompleted ? newCompleted.add(templateId) : newCompleted.delete(templateId);

    const newXP = activeTasks.reduce((sum, t) => {
      const done = t.mode === "AUTO" ? autoTriggers.has(t.auto_trigger) : newCompleted.has(t.id);
      return done ? sum + (t.points || 0) : sum;
    }, 0);

    // Optimistic update — immediately reflect new state in the cache
    const optimisticRecord = { date: TODAY, completed_task_ids: [...newCompleted], xp_earned: newXP };
    queryClient.setQueryData(["dailyProgress"], (old) => {
      if (!Array.isArray(old)) return old;
      const exists = old.find(p => p.date === TODAY);
      return exists
        ? old.map(p => p.date === TODAY ? { ...p, ...optimisticRecord } : p)
        : [...old, { id: "__optimistic__", ...optimisticRecord }];
    });

    if (nowCompleted) toast.success(`+${task.points} XP — ${task.title} done! 🎉`);

    if (todayRecord) {
      await base44.entities.DailyProgress.update(todayRecord.id, { completed_task_ids: [...newCompleted], xp_earned: newXP });
    } else {
      await base44.entities.DailyProgress.create({ date: TODAY, completed_task_ids: [...newCompleted], xp_earned: newXP });
    }
    queryClient.invalidateQueries({ queryKey: ["dailyProgress"] });
  };

  // Persist auto XP when it changes
  useEffect(() => {
    if (progressLoading || templatesLoading) return;
    if (!todayRecord && todayXP > 0) {
      base44.entities.DailyProgress.create({ date: TODAY, completed_task_ids: [], xp_earned: todayXP })
        .then(() => queryClient.invalidateQueries({ queryKey: ["dailyProgress"] }));
    } else if (todayRecord && todayXP !== (todayRecord.xp_earned || 0)) {
      base44.entities.DailyProgress.update(todayRecord.id, { completed_task_ids: [...manualCompletedIds], xp_earned: todayXP })
        .then(() => queryClient.invalidateQueries({ queryKey: ["dailyProgress"] }));
    }
  }, [progressLoading, templatesLoading, todayXP, todayRecord]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Daily Tasks</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track small daily check-ins and reminders.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowManager(!showManager)} className="gap-1.5">
          <Settings className="w-3.5 h-3.5" />
          {showManager ? "Close" : "Edit Tasks"}
        </Button>
      </div>

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

      <LevelBar
        totalXP={totalXP}
        todayXP={todayXP}
        todayPossibleXP={possibleXP}
        streak={streak}
        bestStreak={bestStreak}
      />

      <div className="space-y-3">
        {activeTasks.map((task) => (
  <div key={task.id} id={`item-${task.id}`}>
    <TaskCard
      task={{
        ...task,
        title: applyTerms(task.title, terms),
        description: applyTerms(task.description, terms),
      }}
      completed={isTaskCompleted(task, manualCompletedIds, autoTriggers)}
      onToggle={toggleManual}
    />
  </div>
))}
      </div>
    </motion.div>
  );
}