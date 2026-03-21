import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Filter } from "lucide-react";
import TaskItem from "@/components/tasks/TaskItem";
import TaskFormModal from "@/components/tasks/TaskFormModal";

export default function ToDoList() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");

  // Fetch tasks
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list(),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (taskId) => base44.entities.Task.delete(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  // Toggle completion mutation
  const toggleMutation = useMutation({
    mutationFn: ({ taskId, completed }) =>
      base44.entities.Task.update(taskId, {
        completed,
        completed_date: completed ? new Date().toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  // Organize tasks by hierarchy
  const tasksByParent = useMemo(() => {
    const map = new Map();
    tasks.forEach((task) => {
      const parentId = task.parent_task_id || "root";
      if (!map.has(parentId)) map.set(parentId, []);
      map.get(parentId).push(task);
    });
    return map;
  }, [tasks]);

  // Filter tasks
  const rootTasks = useMemo(() => {
    const root = tasksByParent.get("root") || [];
    let filtered = root.filter((t) =>
      filterCategory === "all" ? true : t.category === filterCategory
    );
    if (!showCompleted) {
      filtered = filtered.filter((t) => !t.completed);
    }
    return filtered.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(b.created_date) - new Date(a.created_date);
    });
  }, [tasksByParent, filterCategory, showCompleted]);

  const completedTasks = useMemo(() => {
    return (tasksByParent.get("root") || [])
      .filter((t) => t.completed)
      .sort((a, b) => new Date(b.completed_date) - new Date(a.completed_date));
  }, [tasksByParent]);

  const handleToggleExpand = (taskId) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setShowForm(true);
  };

  const handleDelete = (taskId) => {
    if (confirm("Delete this task and all subtasks?")) {
      deleteMutation.mutate(taskId);
    }
  };

  const handleToggle = (taskId) => {
    const task = tasks.find((t) => t.id === taskId);
    toggleMutation.mutate({ taskId, completed: !task.completed });
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTask(null);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">To-Do List</h1>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
        >
          <option value="all">All Categories</option>
          <option value="work">Work</option>
          <option value="health">Health</option>
          <option value="personal">Personal</option>
          <option value="learning">Learning</option>
          <option value="other">Other</option>
        </select>
        <Button
          variant={showCompleted ? "default" : "outline"}
          onClick={() => setShowCompleted(!showCompleted)}
          className="gap-2"
          size="sm"
        >
          <Filter className="w-4 h-4" />
          {showCompleted ? "Hide Completed" : "Show Completed"}
        </Button>
      </div>

      {/* Active Tasks */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Active Tasks</h2>
        {rootTasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">No active tasks. Great job!</p>
        ) : (
          <div className="space-y-2">
            {rootTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                subTasks={tasksByParent.get(task.id) || []}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onEdit={handleEdit}
                isExpanded={expandedTasks.has(task.id)}
                onToggleExpand={() => handleToggleExpand(task.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div className="space-y-3 border-t border-border pt-6">
          <h2 className="text-lg font-semibold text-muted-foreground">
            Completed ({completedTasks.length})
          </h2>
          <div className="space-y-2">
            {completedTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                subTasks={[]}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onEdit={handleEdit}
              />
            ))}
          </div>
        </div>
      )}

      {/* Task Form Modal */}
      {showForm && (
        <TaskFormModal
          open={showForm}
          onClose={handleCloseForm}
          editingTask={editingTask}
          parentTaskId={null}
          allTasks={tasks}
        />
      )}
    </div>
  );
}