// The XP goals have earned (src/lib/goalXp.js), for the recurring-tasks
// level. Reads the same caches as the Goals page, so nothing is fetched
// twice. Empty while the person turned "Goals earn XP" off.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { GOALS_QUERY_KEY, GOAL_STEPS_QUERY_KEY } from "@/lib/goals";
import { goalXpEvents, goalsEarnXp } from "@/lib/goalXp";
import { useNoteLists } from "@/lib/noteLists";

const list = (entity) => () => base44.entities[entity].list().catch(() => []);

export function useGoalXp() {
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settings = pickPrimarySystemSettings(settingsList) || null;
  const on = goalsEarnXp(settings);
  const q = (key, entity) => useQuery({ queryKey: key, queryFn: list(entity), enabled: on }).data || []; // eslint-disable-line react-hooks/rules-of-hooks
  const goals = q(GOALS_QUERY_KEY, "Goal");
  const steps = q(GOAL_STEPS_QUERY_KEY, "GoalStep");
  const tasks = q(["tasks"], "Task");
  const activities = q(["activities"], "Activity");
  const categories = q(["activityCategories"], "ActivityCategory");
  const notes = useNoteLists({ enabled: on });
  const events = useMemo(
    () => (on ? goalXpEvents({
      goals, steps, tasks, activities, categories, noteItems: notes.idbItems, unlockedItems: notes.unlockedItems, now: new Date(),
    }) : []),
    [on, goals, steps, tasks, activities, categories, notes],
  );
  return { on, available: true, settings, events };
}
