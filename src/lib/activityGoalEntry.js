// THE weekly activity goal write path (house step 0.6, "plumbing out of
// the walls"). ActivityGoalsPanel creates, retargets and deletes through
// here. (The long-term Goal tree is a different record with its own path,
// goalTree.js.)
//
// A goal is one of two shapes (issue #248), both labelled by
// `category_name`:
//   { source_type: "category", source_id, activity_category_id, ... }
//   { source_type: "habit",    source_id, habit_id, ... }
// Deleting a goal sends it to the trash; activity history is never touched.
//
// scripts/test-activity-goal-entry.mjs pins the shapes.

import { base44 } from "@/api/base44Client";

const AG = () => base44.entities.ActivityGoal;

// `source` is the picked category ({ id, name, color }) or habit
// ({ id, label, color }). Returns null when there is nothing to save.
export async function createActivityGoal({ sourceType = "category", source, weeklyMinutes, weekStartDate }) {
  const minutes = parseInt(weeklyMinutes);
  if (!source || !weeklyMinutes) return null;
  if (sourceType === "habit") {
    return AG().create({
      source_type: "habit",
      source_id: source.id,
      habit_id: source.id,
      category_name: source.label,
      weekly_minutes: minutes,
      color: source.color || "#8b5cf6",
      week_start_date: weekStartDate,
    });
  }
  return AG().create({
    source_type: "category",
    source_id: source.id,
    activity_category_id: source.id,
    category_name: source.name,
    weekly_minutes: minutes,
    color: source.color || "#8b5cf6",
    week_start_date: weekStartDate,
  });
}

export async function setActivityGoalTarget(goalId, weeklyMinutes) {
  return AG().update(goalId, { weekly_minutes: weeklyMinutes });
}

export async function trashActivityGoal(goalId) {
  if (!goalId) return;
  await AG().delete(goalId);
}
