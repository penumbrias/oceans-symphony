import React, { useState, useMemo } from "react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, Pencil, Activity as ActivityIcon, Zap } from "lucide-react";
import CircularProgressBar from "@/components/activities/CircularProgressBar";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { countableMinutes } from "@/lib/activityStatus";

export default function ActivityGoalsPanel({ weekStart }) {
  const qc = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Goal source: activity category (existing) or a habit (issue #248).
  // Defaults to "category" because that's how every existing goal works.
  const [sourceType, setSourceType] = useState("category");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedHabit, setSelectedHabit] = useState(null);
  const [targetMinutes, setTargetMinutes] = useState("");
  const [editingGoal, setEditingGoal] = useState(null);
  const [editTargetMinutes, setEditTargetMinutes] = useState("");

  const weekDate = format(startOfWeek(weekStart), "yyyy-MM-dd");

  // Fetch goals for this week
  const { data: goals = [] } = useQuery({
    queryKey: ["activityGoals", weekDate],
    queryFn: async () => {
      const allGoals = await base44.entities.ActivityGoal.list();
      return allGoals.filter((g) => g.week_start_date === weekDate);
    },
  });

  // Fetch all activities and categories
  const { data: activities = [] } = useQuery({
    queryKey: ["activities", weekDate],
    queryFn: () => base44.entities.Activity.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  // Habit data — Symptoms with is_positive: true are the "habits" tab.
  // Sessions hold start/end timestamps; minutes between them count
  // toward a habit-targeted goal.
  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });
  const habits = useMemo(() => symptoms.filter((s) => s.is_positive), [symptoms]);
  const habitsById = useMemo(() => Object.fromEntries(habits.map((h) => [h.id, h])), [habits]);

  const { data: symptomSessions = [] } = useQuery({
    queryKey: ["symptomSessions"],
    queryFn: () => base44.entities.SymptomSession.list("-start_time", 2000),
  });

  // Week window the habit sessions get clipped to. Mirrors the
  // category-goal calculation which counts every Activity row in the
  // history (no week filter — Activity rows are tagged with their
  // own timestamp). For habit sessions we clip to the goal's week
  // explicitly because the SymptomSession set spans all history.
  const weekStartDate = useMemo(() => startOfWeek(new Date(weekDate)), [weekDate]);
  const weekEndDate = useMemo(() => endOfWeek(weekStartDate), [weekStartDate]);

  // Calculate progress for each goal — branch on source_type.
  // Default ("category" or missing) walks Activity rows by category id;
  // "habit" walks SymptomSession rows by symptom_id with start_time
  // inside the goal's week.
  const progressData = useMemo(() => {
    return goals.map((goal) => {
      if (goal.source_type === "habit" && goal.source_id) {
        const habitSessions = symptomSessions.filter((s) => {
          if (s.symptom_id !== goal.source_id) return false;
          const start = s.start_time ? new Date(s.start_time) : null;
          if (!start) return false;
          return start >= weekStartDate && start <= weekEndDate;
        });
        const totalMinutes = habitSessions.reduce((sum, s) => {
          const start = new Date(s.start_time);
          const end = s.end_time ? new Date(s.end_time) : new Date();
          return sum + Math.max(0, Math.round((end - start) / 60000));
        }, 0);
        return { ...goal, currentMinutes: totalMinutes };
      }
      // Weekly target → only count THIS week's activities, and only ones
      // that actually happened (logged/done/partial). Scheduled, skipped
      // and cancelled contribute 0; partial uses actual_duration_minutes.
      // (Previously this summed duration_minutes for every matching row in
      // all of history, regardless of status — wildly inflating progress.)
      const goalActivities = activities.filter((a) => {
        if (!(a.activity_category_ids || []).includes(goal.activity_category_id)) return false;
        const ts = a.timestamp ? new Date(a.timestamp) : null;
        return ts && ts >= weekStartDate && ts <= weekEndDate;
      });
      const totalMinutes = goalActivities.reduce((sum, a) => sum + countableMinutes(a), 0);
      return { ...goal, currentMinutes: totalMinutes };
    });
  }, [goals, activities, symptomSessions, weekStartDate, weekEndDate]);

  // Available categories / habits for new goals — exclude anything
  // already targeted by a goal this week so the user can't double-add.
  const usedCategoryIds = useMemo(
    () => new Set(goals.filter((g) => (g.source_type || "category") === "category").map((g) => g.activity_category_id)),
    [goals]
  );
  const usedHabitIds = useMemo(
    () => new Set(goals.filter((g) => g.source_type === "habit").map((g) => g.source_id)),
    [goals]
  );
  const availableCategories = useMemo(
    () => categories.filter((c) => !usedCategoryIds.has(c.id)),
    [categories, usedCategoryIds]
  );
  const availableHabits = useMemo(
    () => habits.filter((h) => !usedHabitIds.has(h.id)),
    [habits, usedHabitIds]
  );

  // Create goal mutation — writes one of two shapes:
  //   { source_type: "category", source_id, activity_category_id, category_name, ... }  ← existing flow
  //   { source_type: "habit",    source_id, habit_id,             category_name, ... }  ← new flow (issue #248)
  // category_name is reused as the display label for both so the
  // CircularProgressBar / delete confirm / edit dialog title don't
  // need to branch.
  const createGoalMutation = useMutation({
    mutationFn: async () => {
      if (!targetMinutes) return;
      if (sourceType === "habit") {
        if (!selectedHabit) return;
        await base44.entities.ActivityGoal.create({
          source_type: "habit",
          source_id: selectedHabit.id,
          habit_id: selectedHabit.id,
          category_name: selectedHabit.label,
          weekly_minutes: parseInt(targetMinutes),
          color: selectedHabit.color || "#8b5cf6",
          week_start_date: weekDate,
        });
      } else {
        if (!selectedCategory) return;
        await base44.entities.ActivityGoal.create({
          source_type: "category",
          source_id: selectedCategory.id,
          activity_category_id: selectedCategory.id,
          category_name: selectedCategory.name,
          weekly_minutes: parseInt(targetMinutes),
          color: selectedCategory.color || "#8b5cf6",
          week_start_date: weekDate,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activityGoals", weekDate] });
      setIsDialogOpen(false);
      setSelectedCategory(null);
      setSelectedHabit(null);
      setSourceType("category");
      setTargetMinutes("");
    },
  });

  // Delete goal mutation
  const deleteGoalMutation = useMutation({
    mutationFn: async (goalId) => {
      await base44.entities.ActivityGoal.delete(goalId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activityGoals", weekDate] });
    },
  });

  // Update goal target mutation
  const updateGoalMutation = useMutation({
    mutationFn: async ({ goalId, weeklyMinutes }) => {
      await base44.entities.ActivityGoal.update(goalId, { weekly_minutes: weeklyMinutes });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activityGoals", weekDate] });
      setEditingGoal(null);
      setEditTargetMinutes("");
    },
  });

  const handleDeleteGoal = async (goal) => {
    if (!(await confirm(`Delete the weekly goal for "${goal.category_name}"? Your activity history will not be affected.`))) return;
    deleteGoalMutation.mutate(goal.id);
  };

  const handleEditGoal = (goal) => {
    setEditingGoal(goal);
    setEditTargetMinutes(String(goal.weekly_minutes || ""));
  };

  const handleSaveEdit = () => {
    const value = parseInt(editTargetMinutes, 10);
    if (!editingGoal || !value || value <= 0) return;
    updateGoalMutation.mutate({ goalId: editingGoal.id, weeklyMinutes: value });
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Weekly Goals</h3>
        <Button
          size="sm"
          onClick={() => setIsDialogOpen(true)}
          disabled={availableCategories.length === 0 && availableHabits.length === 0}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Goal
        </Button>
      </div>

      {progressData.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {availableCategories.length === 0 && availableHabits.length === 0
            ? "Every category and habit already has a goal set"
            : "No goals set yet"}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {progressData.map((data) => (
            <div key={data.id} className="relative group">
              <CircularProgressBar
                currentMinutes={data.currentMinutes}
                targetMinutes={data.weekly_minutes}
                categoryName={data.category_name}
                color={data.color}
                size="md"
              />
              <div className="absolute top-0 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEditGoal(data)}
                  className="p-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                  aria-label="Edit goal target"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleDeleteGoal(data)}
                  disabled={deleteGoalMutation.isPending}
                  className="p-1 rounded bg-destructive/20 hover:bg-destructive/30 text-destructive"
                  aria-label="Delete goal"
                >
                  {deleteGoalMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Goal Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsDialogOpen(false);
          setSelectedCategory(null);
          setSelectedHabit(null);
          setSourceType("category");
          setTargetMinutes("");
        } else {
          setIsDialogOpen(true);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Weekly Goal</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Source toggle — Activity category (the default) or a
                habit. Picked-from-Habits goals count SymptomSession
                minutes; category goals count Activity row minutes
                (unchanged). Issue #248: lets the user set goals
                like "Meditation 60 minutes / week" without needing
                to log it as an Activity too. */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setSourceType("category"); setSelectedHabit(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                  sourceType === "category"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/30"
                }`}
              >
                <ActivityIcon className="w-4 h-4" />
                Activity category
              </button>
              <button
                type="button"
                onClick={() => { setSourceType("habit"); setSelectedCategory(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                  sourceType === "habit"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/30"
                }`}
              >
                <Zap className="w-4 h-4" />
                Habit
              </button>
            </div>

            <div className="max-h-[40vh] overflow-y-auto -mx-2 px-2">
              {sourceType === "category" ? (
                <>
                  <ActivityPillSelector
                    selectedActivities={selectedCategory ? [selectedCategory.id] : []}
                    onActivityChange={(ids) => {
                      // Single-select: take the most recently added id, or clear
                      const next = ids[ids.length - 1];
                      if (!next) { setSelectedCategory(null); return; }
                      const cat = categories.find((c) => c.id === next);
                      if (!cat) return;
                      // Don't allow picking a category that already has a goal this week
                      if (!availableCategories.some((c) => c.id === cat.id)) return;
                      setSelectedCategory(cat);
                    }}
                  />
                  {availableCategories.length === 0 && (
                    <p className="text-xs text-muted-foreground italic mt-2">All categories already have a goal this week.</p>
                  )}
                </>
              ) : (
                <>
                  {availableHabits.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      {habits.length === 0
                        ? "No habits set up yet. Add one in System Check-In → Habits."
                        : "All habits already have a goal this week."}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {availableHabits.map((h) => {
                        const picked = selectedHabit?.id === h.id;
                        return (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => setSelectedHabit(picked ? null : h)}
                            className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                              picked
                                ? "border-primary/60 bg-primary/10"
                                : "border-border/60 bg-card hover:bg-muted/30"
                            }`}
                          >
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: h.color || "#8b5cf6" }}
                            />
                            <span className="text-sm flex-1">{h.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Target (minutes per week)</label>
              <Input
                type="number"
                value={targetMinutes}
                onChange={(e) => setTargetMinutes(e.target.value)}
                placeholder="e.g., 300"
                min="1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createGoalMutation.mutate()}
              disabled={
                (sourceType === "category" ? !selectedCategory : !selectedHabit) ||
                !targetMinutes ||
                createGoalMutation.isPending
              }
            >
              {createGoalMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Goal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Goal Dialog */}
      <Dialog open={!!editingGoal} onOpenChange={(open) => { if (!open) { setEditingGoal(null); setEditTargetMinutes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Weekly Goal{editingGoal ? ` — ${editingGoal.category_name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Target (minutes per week)</label>
              <Input
                type="number"
                value={editTargetMinutes}
                onChange={(e) => setEditTargetMinutes(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); }}
                min="1"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingGoal(null); setEditTargetMinutes(""); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editTargetMinutes || parseInt(editTargetMinutes, 10) <= 0 || updateGoalMutation.isPending}
            >
              {updateGoalMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}