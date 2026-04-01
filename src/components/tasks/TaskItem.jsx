import React, { useState } from "react";
import { format } from "date-fns";
import { ChevronRight, Trash2, Edit2, CheckCircle2, Circle, Flag, Plus } from "lucide-react";
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
    highlight = false,
}) {
  const progress = task.goal_target
    ? Math.round((task.current_progress / task.goal_target) * 100)
    : null;

  const priorityColors = {
    low: "text-blue-500",
    medium: "text-yellow-500",
    high: "text-red-500",
  };

  const categoryColors = {
    work: "bg-blue-500/10 text-blue-600",
    health: "bg-green-500/10 text-green-600",
    personal: "bg-purple-500/10 text-purple-600",
    learning: "bg-orange-500/10 text-orange-600",
    other: "bg-gray-500/10 text-gray-600",
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
            {task.category && (
              <span className={cn("text-xs px-2 py-0.5 rounded-full", categoryColors[task.category])}>
                {task.category}
              </span>
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

          {/* Due date */}
          {task.due_date && (
            <p className="text-xs text-muted-foreground mt-1">
              Due: {format(new Date(task.due_date), "MMM d, yyyy")}
            </p>
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