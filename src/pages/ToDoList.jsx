import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Filter } from "lucide-react";
import TaskItem from "@/components/tasks/TaskItem";
import TaskFormModal from "@/components/tasks/TaskFormModal";
import { useLocation, useSearchParams } from "react-router-dom";
import { useDeepLinkHighlight } from "@/lib/useDeepLinkHighlight";
import { useHighlightScroll } from "@/lib/useHighlightScroll";

export default function ToDoList() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [highlightId, setHighlightId] = useState(() => location.state?.highlightId || null);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [parentTaskId, setParentTaskId] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");

  // Handle deep link from search (?id=<task>) — the legacy hook.
  useDeepLinkHighlight("id", "item-");
  // Handle notification-driven highlight (?highlight=<task>) — the
  // generic hook used by every cross-page notification jump. Fires
  // after tasks load so the target row is already in the DOM.

  useEffect(() => {
    if (highlightId) {
      const timer = setTimeout(() => setHighlightId(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [highlightId]);

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list(),
  });

  // Wait for tasks to load before trying to highlight, otherwise the
  // target row isn't in the DOM yet when the hook runs.
  useHighlightScroll([tasks.length]);
  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId) => base44.entities.Task.delete(taskId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tasks"] }); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ taskId, completed }) =>
      base44.entities.Task.update(taskId, {
        completed,
        completed_date: completed ? new Date().toISOString() : null,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tasks"] }); },
  });

  const tasksByParent = useMemo(() => {
    const map = new Map();
    tasks.forEach((task) => {
      const parentId = task.parent_task_id || "root";
      if (!map.has(parentId)) map.set(parentId, []);
      map.get(parentId).push(task);
    });
    return map;
  }, [tasks]);

  const rootTasks = useMemo(() => {
    const root = tasksByParent.get("root") || [];
    let filtered = root.filter((t) => {
      if (filterCategory === "all") return true;
      const ids = t.activity_category_ids
        || (t.category ? [t.category] : []);
      return ids.includes(filterCategory);
    });
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
    if (newExpanded.has(taskId)) newExpanded.delete(taskId);
    else newExpanded.add(taskId);
    setExpandedTasks(newExpanded);
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setParentTaskId(task.parent_task_id || null);
    setShowForm(true);
  };

  const handleDelete = (taskId) => {
    if (confirm("Delete this task and all subtasks?")) deleteMutation.mutate(taskId);
  };

  const handleToggle = (taskId) => {
    const task = tasks.find((t) => t.id === taskId);
    toggleMutation.mutate({ taskId, completed: !task.completed });
  };

  const handleCreateSubtask = (parentId) => {
    setEditingTask(null);
    setParentTaskId(parentId);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTask(null);
    setParentTaskId(null);
  };

  return (
    <div data-tour="tasks-list" className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-foreground">To-Do List</h1>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Task
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
        >
          <option value="all">All categories</option>
          {activityCategories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
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

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Active Tasks</p>
          <div className="flex-1 h-px bg-border/50" />
        </div>
        {rootTasks.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm font-medium text-foreground mb-1">All caught up!</p>
            <p className="text-xs text-muted-foreground">No active tasks right now.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rootTasks.map((task) => (
              <div key={task.id} id={`item-${task.id}`} data-highlight-id={task.id}>
                <TaskItem
                  task={task}
                  highlight={highlightId === task.id}
                  subTasks={tasksByParent.get(task.id) || []}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  onCreateSubtask={handleCreateSubtask}
                  isExpanded={expandedTasks.has(task.id)}
                  onToggleExpand={() => handleToggleExpand(task.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {completedTasks.length > 0 && (
        <div className="space-y-3 border-t border-border pt-6">
          <div className="flex items-center gap-2">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Completed ({completedTasks.length})</p>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          <div className="space-y-2">
            {completedTasks.map((task) => (
              <div key={task.id} id={`item-${task.id}`} data-highlight-id={task.id}>
                <TaskItem
                  task={task}
                  highlight={highlightId === task.id}
                  subTasks={[]}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <TaskFormModal
          open={showForm}
          onClose={handleCloseForm}
          editingTask={editingTask}
          parentTaskId={parentTaskId}
          allTasks={tasks}
        />
      )}
    </div>
  );
}