import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";

export default function TaskWidget() {
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list(),
  });

  const activeTasks = tasks.filter((t) => !t.completed && !t.parent_task_id);
  const completedToday = tasks.filter(
    (t) =>
      t.completed &&
      new Date(t.completed_date).toDateString() === new Date().toDateString()
  ).length;

  const goalsWithProgress = activeTasks.filter((t) => t.goal_target);

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Tasks</h3>
        <Link to="/tasks">
          <Button variant="ghost" size="sm" className="gap-1">
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-2xl font-bold">{activeTasks.length}</p>
          <p className="text-xs text-muted-foreground">Active Tasks</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-2xl font-bold text-green-500">{completedToday}</p>
          <p className="text-xs text-muted-foreground">Completed Today</p>
        </div>
      </div>

      {goalsWithProgress.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Goals</p>
          {goalsWithProgress.slice(0, 3).map((task) => {
            const progress = Math.round((task.current_progress / task.goal_target) * 100);
            return (
              <div key={task.id} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="truncate">{task.title}</span>
                  <span className="text-muted-foreground">{progress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTasks.length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {activeTasks.slice(0, 5).map((task) => (
            <div key={task.id} className="flex items-start gap-2 text-sm">
              <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <span className="truncate text-muted-foreground">{task.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}