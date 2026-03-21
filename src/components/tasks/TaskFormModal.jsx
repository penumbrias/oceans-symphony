import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function TaskFormModal({ open, onClose, editingTask, parentTaskId, allTasks = [] }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "other",
    priority: "medium",
    due_date: "",
    goal_target: "",
    goal_unit: "",
  });

  useEffect(() => {
    if (editingTask) {
      setFormData({
        title: editingTask.title || "",
        description: editingTask.description || "",
        category: editingTask.category || "other",
        priority: editingTask.priority || "medium",
        due_date: editingTask.due_date || "",
        goal_target: editingTask.goal_target || "",
        goal_unit: editingTask.goal_unit || "",
      });
    } else {
      setFormData({
        title: "",
        description: "",
        category: "other",
        priority: "medium",
        due_date: "",
        goal_target: "",
        goal_unit: "",
      });
    }
  }, [editingTask, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error("Task title is required");
      return;
    }

    setLoading(true);
    try {
      const data = {
        ...formData,
        parent_task_id: parentTaskId || null,
        goal_target: formData.goal_target ? parseInt(formData.goal_target) : null,
      };

      if (editingTask) {
        await base44.entities.Task.update(editingTask.id, data);
        toast.success("Task updated!");
      } else {
        await base44.entities.Task.create(data);
        toast.success("Task created!");
      }

      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    } catch (error) {
      toast.error(error.message || "Failed to save task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingTask ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Title *</label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="What do you want to do?"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Add details..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-input text-sm"
              >
                <option value="work">Work</option>
                <option value="health">Health</option>
                <option value="personal">Personal</option>
                <option value="learning">Learning</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-input text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Due Date</label>
            <Input
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            />
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-sm font-medium">Goal (Optional)</p>
            <div className="flex gap-2">
              <Input
                type="number"
                value={formData.goal_target}
                onChange={(e) => setFormData({ ...formData, goal_target: e.target.value })}
                placeholder="Target count"
                className="flex-1"
              />
              <Input
                value={formData.goal_unit}
                onChange={(e) => setFormData({ ...formData, goal_unit: e.target.value })}
                placeholder="times, hours, km..."
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              E.g., exercise 5 times, drink 8 glasses of water daily
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingTask ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}