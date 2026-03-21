import React, { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { DAILY_TASKS, TOTAL_POSSIBLE_XP, getTodayString, getLevelFromTotalXP } from "@/lib/dailyTasks";
import LevelBar from "@/components/tasks/LevelBar";
import TaskCard from "@/components/tasks/TaskCard";

const TODAY = getTodayString();

export default function DailyTasks() {
  const queryClient = useQueryClient();

  const { data: allProgress = [] } = useQuery({
    queryKey: ["dailyProgress"],
    queryFn: () => base44.entities.DailyProgress.list("-date"),
  });

  // Check AUTO tasks — what exists in the app today
  const { data: journals = [] } = useQuery({
    queryKey: ["journalEntries"],
    queryFn: () => base44.entities.JournalEntry.list("-created_date", 5),
  });
  const { data: diaryCards = [] } = useQuery({
    queryKey: ["diaryCards"],
    queryFn: () => base44.entities.DiaryCard.list("-created_date", 5),
  });

  const todayProgress = allProgress.find((p) => p.date === TODAY);

  // Determine completed AUTO tasks
  const autoCompleted = useMemo(() => {
    const set = new Set();
    // check_in: always true if they're here
    set.add("check_in");
    // journal_entry: any journal created today
    if (journals.some((j) => j.created_date?.startsWith(TODAY))) set.add("journal_entry");
    // card_entry: any diary card today
    if (diaryCards.some((c) => c.date === TODAY || c.created_date?.startsWith(TODAY))) set.add("card_entry");
    return set;
  }, [journals, diaryCards]);

  const manualCompleted = useMemo(() =>
    new Set(todayProgress?.completed_task_ids?.filter((id) => {
      const t = DAILY_TASKS.find((t) => t.id === id);
      return t?.type === "MANUAL";
    }) || []),
    [todayProgress]
  );

  const completedIds = useMemo(() => {
    const all = new Set([...autoCompleted, ...manualCompleted]);
    return all;
  }, [autoCompleted, manualCompleted]);

  // XP today
  const todayXP = useMemo(() =>
    DAILY_TASKS.filter((t) => completedIds.has(t.id)).reduce((sum, t) => sum + t.xp, 0),
    [completedIds]
  );

  // Total XP across all days
  const totalXP = useMemo(() => {
    const historicalXP = allProgress
      .filter((p) => p.date !== TODAY)
      .reduce((sum, p) => sum + (p.xp_earned || 0), 0);
    return historicalXP + todayXP;
  }, [allProgress, todayXP]);

  // Streak calculation
  const { streak, bestStreak } = useMemo(() => {
    const dates = allProgress.map((p) => p.date).sort((a, b) => b.localeCompare(a));
    let streak = 0;
    let bestStreak = 0;
    let current = 0;
    const today = new Date(TODAY);

    // Check if today has any activity
    const hasToday = completedIds.size > 0;
    if (hasToday) streak = 1;

    for (let i = 0; i < dates.length; i++) {
      const d = new Date(dates[i]);
      const diff = Math.round((today - d) / (1000 * 60 * 60 * 24));
      if (diff === streak) streak++;
    }

    // Best streak from historical data
    let prev = null;
    current = 0;
    [...dates].reverse().forEach((dateStr) => {
      const d = new Date(dateStr);
      if (prev && Math.round((d - prev) / (1000 * 60 * 60 * 24)) === 1) {
        current++;
      } else {
        current = 1;
      }
      if (current > bestStreak) bestStreak = current;
      prev = d;
    });
    if (streak > bestStreak) bestStreak = streak;

    return { streak, bestStreak };
  }, [allProgress, completedIds]);

  const handleToggleManual = async (taskId) => {
    const isOn = manualCompleted.has(taskId);
    const newManual = new Set(manualCompleted);
    isOn ? newManual.delete(taskId) : newManual.add(taskId);

    const allCompletedNow = new Set([...autoCompleted, ...newManual]);
    const newXP = DAILY_TASKS.filter((t) => allCompletedNow.has(t.id)).reduce((sum, t) => sum + t.xp, 0);
    const newCompleted = [...autoCompleted, ...newManual];

    if (todayProgress) {
      await base44.entities.DailyProgress.update(todayProgress.id, {
        completed_task_ids: newCompleted,
        xp_earned: newXP,
      });
    } else {
      await base44.entities.DailyProgress.create({
        date: TODAY,
        completed_task_ids: newCompleted,
        xp_earned: newXP,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["dailyProgress"] });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground">Daily tasks</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track small daily check-ins and reminders.</p>
        </div>
        <span className="text-xs bg-primary/10 text-primary font-semibold px-3 py-1.5 rounded-full mt-1">
          {todayXP}/{TOTAL_POSSIBLE_XP} pts today
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
            completed={completedIds.has(task.id)}
            onToggle={handleToggleManual}
          />
        ))}
      </div>
    </motion.div>
  );
}