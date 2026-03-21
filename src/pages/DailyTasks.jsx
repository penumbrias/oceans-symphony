import React, { useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { DAILY_TASKS, TOTAL_POSSIBLE_XP, getTodayString } from "@/lib/dailyTasks";
import LevelBar from "@/components/tasks/LevelBar";
import TaskCard from "@/components/tasks/TaskCard";
import { toast } from "sonner";

export default function DailyTasks() {
  const queryClient = useQueryClient();
  const TODAY = getTodayString();

  // Today's progress record
  const { data: allProgress = [], isLoading: progressLoading } = useQuery({
    queryKey: ["dailyProgress"],
    queryFn: () => base44.entities.DailyProgress.list("-date", 365),
    staleTime: 0,
  });

  // Journal entries today — fetch recent and filter by local date
  const { data: journals = [] } = useQuery({
    queryKey: ["journalEntriesToday", TODAY],
    queryFn: () => base44.entities.JournalEntry.list("-created_date", 50),
    staleTime: 0,
  });

  // Diary cards today — filter directly for today's date
  const { data: diaryCards = [] } = useQuery({
    queryKey: ["diaryCardsToday", TODAY],
    queryFn: () => base44.entities.DiaryCard.filter({ date: TODAY }),
    staleTime: 0,
  });

  const todayRecord = allProgress.find((p) => p.date === TODAY);
  const manualCompleted = new Set(todayRecord?.completed_task_ids || []);

  // AUTO task detection
  const hasJournalToday = journals.some((j) => {
    const d = j.created_date ? j.created_date.split("T")[0] : null;
    return d === TODAY;
  });
  const hasDiaryToday = diaryCards.length > 0;
  // check_in is always true if user is viewing this page
  const autoCompleted = useMemo(() => {
    const s = new Set(["check_in"]);
    if (hasJournalToday) s.add("journal_entry");
    if (hasDiaryToday) s.add("card_entry");
    return s;
  }, [hasJournalToday, hasDiaryToday]);

  const isCompleted = (id) => manualCompleted.has(id) || autoCompleted.has(id);

  // XP for today
  const todayXP = DAILY_TASKS.filter((t) => isCompleted(t.id)).reduce((sum, t) => sum + t.xp, 0);

  // Total XP across all days
  const totalXP = useMemo(() => {
    return allProgress.reduce((sum, p) => sum + (p.xp_earned || 0), 0);
  }, [allProgress]);

  // Streak calculation
  const { streak, bestStreak } = useMemo(() => {
    const dates = new Set(allProgress.filter((p) => (p.xp_earned || 0) > 0).map((p) => p.date));
    let streak = 0;
    let d = new Date();
    // allow today to count even if not saved yet
    const todayStr = TODAY;
    if (dates.has(todayStr) || todayXP > 0) {
      streak = 1;
      d.setDate(d.getDate() - 1);
    }
    while (true) {
      const s = d.toISOString().split("T")[0];
      if (dates.has(s)) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    // best streak
    let best = 0, cur = 0;
    const sorted = [...allProgress].sort((a, b) => a.date.localeCompare(b.date));
    let prev = null;
    for (const p of sorted) {
      if ((p.xp_earned || 0) > 0) {
        if (prev) {
          const prevD = new Date(prev);
          const curD = new Date(p.date);
          const diff = (curD - prevD) / 86400000;
          if (diff === 1) cur++;
          else cur = 1;
        } else cur = 1;
        if (cur > best) best = cur;
        prev = p.date;
      }
    }
    best = Math.max(best, streak);
    return { streak, bestStreak: best };
  }, [allProgress, todayXP]);

  const toggleManual = async (taskId) => {
    const task = DAILY_TASKS.find((t) => t.id === taskId);
    if (!task || task.type !== "MANUAL") return;

    const nowCompleted = !manualCompleted.has(taskId);
    const newCompleted = new Set(manualCompleted);
    nowCompleted ? newCompleted.add(taskId) : newCompleted.delete(taskId);

    // Recalc XP including auto
    const newXP = DAILY_TASKS.filter((t) => newCompleted.has(t.id) || autoCompleted.has(t.id)).reduce((sum, t) => sum + t.xp, 0);

    if (todayRecord) {
      await base44.entities.DailyProgress.update(todayRecord.id, {
        completed_task_ids: [...newCompleted],
        xp_earned: newXP,
      });
    } else {
      await base44.entities.DailyProgress.create({
        date: TODAY,
        completed_task_ids: [...newCompleted],
        xp_earned: newXP,
      });
    }

    if (nowCompleted) toast.success(`+${task.xp} XP — ${task.label} done! 🎉`);
    queryClient.invalidateQueries({ queryKey: ["dailyProgress"] });
  };

  // Save auto-completed XP to today's record if not yet saved
  // IMPORTANT: only run after progress has loaded to avoid overwriting existing data
  useEffect(() => {
    if (progressLoading) return;
    if (!todayRecord && todayXP > 0) {
      base44.entities.DailyProgress.create({
        date: TODAY,
        completed_task_ids: [],
        xp_earned: todayXP,
      }).then(() => queryClient.invalidateQueries({ queryKey: ["dailyProgress"] }));
    } else if (todayRecord) {
      const savedXP = todayRecord.xp_earned || 0;
      if (todayXP !== savedXP) {
        base44.entities.DailyProgress.update(todayRecord.id, {
          completed_task_ids: [...manualCompleted],
          xp_earned: todayXP,
        }).then(() => queryClient.invalidateQueries({ queryKey: ["dailyProgress"] }));
      }
    }
  }, [progressLoading, hasJournalToday, hasDiaryToday]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-lg mx-auto">
      <div>
        <h1 className="font-display text-3xl font-semibold">Daily Tasks</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Track small daily check-ins and reminders.</p>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Daily tasks</span>
        <span className="px-3 py-1 rounded-full bg-muted text-foreground text-xs font-medium">
          {todayXP}/{TOTAL_POSSIBLE_XP} points today
        </span>
      </div>

      <LevelBar
        totalXP={totalXP}
        todayXP={todayXP}
        todayPossibleXP={TOTAL_POSSIBLE_XP}
        streak={streak}
        bestStreak={bestStreak}
      />

      <div className="space-y-3">
        {DAILY_TASKS.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            completed={isCompleted(task.id)}
            onToggle={toggleManual}
          />
        ))}
      </div>
    </motion.div>
  );
}