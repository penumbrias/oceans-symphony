// The records a goal's lines read their state from (stepState in goals.js):
// to-dos, activities and their categories, daily tasks, habits, notes and
// decks. One hook, so the Notebook pages and every goal widget count the
// same way (same query keys, so they share one cache).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNoteLists } from "@/lib/noteLists";

const list = (entity, ...args) => () => base44.entities[entity].list(...args).catch(() => []);

export function useGoalCtx() {
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: list("Task") });
  const { data: activities = [] } = useQuery({ queryKey: ["activities"], queryFn: list("Activity") });
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: list("ActivityCategory") });
  const { data: templates = [] } = useQuery({ queryKey: ["dailyTaskTemplates"], queryFn: list("DailyTaskTemplate") });
  const { data: progress = [] } = useQuery({ queryKey: ["dailyProgress"], queryFn: list("DailyProgress") });
  const { data: symptoms = [] } = useQuery({ queryKey: ["symptoms"], queryFn: list("Symptom") });
  const { data: symptomSessions = [] } = useQuery({ queryKey: ["symptomSessions", "all"], queryFn: list("SymptomSession", "-start_time", 2000) });
  const notes = useNoteLists();
  const ctx = useMemo(() => ({
    tasks, activities, categories, templates, progress, symptomSessions,
    habits: symptoms.filter((s) => s.is_positive), now: new Date(),
    noteLists: notes.lists, noteItems: notes.idbItems, unlockedItems: notes.unlockedItems,
  }), [tasks, activities, categories, templates, progress, symptomSessions, symptoms, notes]);
  return { ctx, symptoms, categories };
}
