import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ChevronRight, Trash2, Edit2, CheckCircle2, Circle, Flag, Plus, Pin, Zap, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function TaskItem({
  task,
  subTasks = [],
  onToggle,
  onDelete,
  onEdit,
  onCreateSubtask,
  isExpanded,
  onToggleExpand,
  level = 0,
}) {
  const progress = task.goal_target
    ? Math.round((task.current_progress / task.goal_target) * 100)
    : null;

  // Fetch activity categories so we can render the new array-based tag with
  // its real name + colour, falling back to the legacy single-string field
  // for older records.
  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });
  const catById = Object.fromEntries(activityCategories.map(c => [c.id, c]));

  const priorityColors = {
    low: "text-blue-500",
    medium: "text-yellow-500",
    high: "text-red-500",
  };

  return (
    <div className={`space-y-1 ${level > 0 ? "ml-4" : ""}`}>
      <div
        className={cn(
          "group flex items-start gap-3 p-3 rounded-lg border transition-all hover:bg-muted/30",
          task.completed ? "bg-muted/20 border-border/50" : "border-border/60"
        )}
      >
        {/* Expand button */}
        {subTasks.length > 0 && (
          <button
            onClick={onToggleExpand}
            className="mt-1 p-1 hover:bg-muted rounded transition-colors"
          >
            <ChevronRight
              className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                isExpanded && "rotate-90"
              )}
            />
          </button>
        )}
        {subTasks.length === 0 && <div className="w-6" />}

        {/* Checkbox */}
        <button
          onClick={() => onToggle(task.id)}
          className="mt-1 p-1 hover:bg-muted rounded transition-colors flex-shrink-0"
        >
          {task.completed ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : (
            <Circle className="w-5 h-5 text-muted-foreground hover:text-foreground" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <p
              className={cn(
                "text-sm font-medium",
                task.completed && "line-through text-muted-foreground"
              )}
            >
              {task.title}
            </p>
            {/* Activity category chips (new array field) — render each by
                name + colour. Legacy `category` string still shows as a
                fallback chip for older tasks. */}
            {(task.activity_category_ids || []).map(id => {
              const c = catById[id];
              if (!c) return null;
              return (
                <span
                  key={id}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${c.color}22`, color: c.color }}
                >
                  {c.name}
                </span>
              );
            })}
            {!task.activity_category_ids?.length && task.category && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground/80">
                {task.category}
              </span>
            )}
            {task.is_urgent && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-500 flex items-center gap-0.5">
                <Zap className="w-3 h-3 fill-amber-500" /> Urgent
              </span>
            )}
            {task.pinned_to_dashboard && (
              <Pin className="w-3 h-3 fill-primary text-primary" />
            )}
            {task.priority && (
              <Flag className={cn("w-3.5 h-3.5 mt-0.5", priorityColors[task.priority])} />
            )}
          </div>

          {/* Goal progress */}
          {task.goal_target && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {task.current_progress} / {task.goal_target} {task.goal_unit}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Due date / scheduled time — separate fields, both rendered when set. */}
          {(task.due_date || task.scheduled_at) && (
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {task.due_date && (
                <p>
                  <span className="font-medium">Due:</span>{" "}
                  {format(new Date(task.due_date + (task.due_date.length === 10 ? "T00:00:00" : "")), "MMM d, yyyy")}
                </p>
              )}
              {task.scheduled_at && (
                <p className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span className="font-medium">Scheduled:</span>{" "}
                  {format(new Date(task.scheduled_at), "MMM d, p")}
                </p>
              )}
            </div>
          )}

          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {level === 0 && onCreateSubtask && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => onCreateSubtask(task.id)}
              title="Create subtask"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onEdit(task)}
            title="Edit task"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(task.id)}
            title="Delete task"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Subtasks */}
      {isExpanded && subTasks.length > 0 && (
        <div>
          {subTasks.map((subTask) => (
            <TaskItem
              key={subTask.id}
              task={subTask}
              subTasks={[]}
              onToggle={onToggle}
              onDelete={onDelete}
              onEdit={onEdit}
              onCreateSubtask={onCreateSubtask}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}