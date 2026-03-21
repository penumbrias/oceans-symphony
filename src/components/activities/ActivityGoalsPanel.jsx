import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Loader2 } from "lucide-react";
import CircularProgressBar from "@/components/activities/CircularProgressBar";
import { format, startOfWeek } from "date-fns";

export default function ActivityGoalsPanel({ weekStart }) {
  const qc = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [targetMinutes, setTargetMinutes] = useState("");

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

  // Calculate progress for each goal
  const progressData = useMemo(() => {
    return goals.map((goal) => {
      const goalActivities = activities.filter((a) =>
        (a.activity_category_ids || []).includes(goal.activity_category_id)
      );
      const totalMinutes = goalActivities.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
      return { ...goal, currentMinutes: totalMinutes };
    });
  }, [goals, activities]);

  // Available categories for new goals (not already set)
  const availableCategories = useMemo(() => {
    const goalCategoryIds = new Set(goals.map((g) => g.activity_category_id));
    return categories.filter((c) => !goalCategoryIds.has(c.id));
  }, [categories, goals]);

  // Create goal mutation
  const createGoalMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCategory || !targetMinutes) return;
      await base44.entities.ActivityGoal.create({
        activity_category_id: selectedCategory.id,
        category_name: selectedCategory.name,
        weekly_minutes: parseInt(targetMinutes),
        color: selectedCategory.color || "#8b5cf6",
        week_start_date: weekDate,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activityGoals", weekDate] });
      setIsDialogOpen(false);
      setSelectedCategory(null);
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

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Weekly Goals</h3>
        <Button
          size="sm"
          onClick={() => setIsDialogOpen(true)}
          disabled={availableCategories.length === 0}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Goal
        </Button>
      </div>

      {progressData.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {availableCategories.length === 0
            ? "All categories have goals set"
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
              <button
                onClick={() => deleteGoalMutation.mutate(data.id)}
                disabled={deleteGoalMutation.isPending}
                className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-destructive/20 hover:bg-destructive/30 text-destructive"
              >
                {deleteGoalMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Goal Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Weekly Goal</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Category</label>
              <select
                value={selectedCategory?.id || ""}
                onChange={(e) => {
                  const cat = availableCategories.find((c) => c.id === e.target.value);
                  setSelectedCategory(cat);
                }}
                className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm"
              >
                <option value="">Select a category...</option>
                {availableCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
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
              disabled={!selectedCategory || !targetMinutes || createGoalMutation.isPending}
            >
              {createGoalMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Goal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}