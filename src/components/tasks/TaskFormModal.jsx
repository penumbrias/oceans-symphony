import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Loader2, Pin, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { saveMentions } from "@/lib/mentionUtils";
import { applyWhisper } from "@/lib/whisperUtils";
import { applyLogCommands } from "@/lib/logCommands";
import { useTerms } from "@/lib/useTerms";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import { format } from "date-fns";

const PRIORITIES = [
  { id: "low",    label: "Low",    cls: "border-blue-500/40 text-blue-500 bg-blue-500/10" },
  { id: "medium", label: "Medium", cls: "border-yellow-500/40 text-yellow-500 bg-yellow-500/10" },
  { id: "high",   label: "High",   cls: "border-red-500/40 text-red-500 bg-red-500/10" },
];

export default function TaskFormModal({ open, onClose, editingTask, parentTaskId, allTasks = [] }) {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    // Replaces the old hardcoded "work/health/personal/learning/other" string
    // with the user's activity categories (shared with the Activity Tracker
    // so categorising a to-do also lets you analyse time spent on it).
    activity_category_ids: [],
    priority: "medium",
    due_date: "",
    // Separate from due_date — a deliberate "I plan to do this at" time,
    // not the "must be done by" deadline. Surfaced on the Activity Tracker
    // grid so scheduled to-dos show alongside planned activities.
    scheduled_at: "",
    pinned_to_dashboard: false,
    is_urgent: false,
    goal_target: "",
    goal_unit: "",
  });

  useEffect(() => {
    if (editingTask) {
      setFormData({
        title: editingTask.title || "",
        description: editingTask.description || "",
        // Read either the new array field or the legacy single-string category.
        activity_category_ids: editingTask.activity_category_ids
          || (editingTask.category ? [editingTask.category] : []),
        priority: editingTask.priority || "medium",
        due_date: editingTask.due_date || "",
        scheduled_at: editingTask.scheduled_at || "",
        pinned_to_dashboard: !!editingTask.pinned_to_dashboard,
        is_urgent: !!editingTask.is_urgent,
        goal_target: editingTask.goal_target || "",
        goal_unit: editingTask.goal_unit || "",
      });
    } else {
      setFormData({
        title: "",
        description: "",
        activity_category_ids: [],
        priority: "medium",
        due_date: "",
        scheduled_at: "",
        pinned_to_dashboard: false,
        is_urgent: false,
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

    // Run inline ~commands first (each becomes a chip), then whisper handling.
    const lc = await applyLogCommands(formData.description || "", { isRich: false });
    // A "/w @name [secret]" in the description hides that part behind a
    // whisper bar (no brackets warns first — a task is a personal record,
    // not a post). Done before setLoading so a "go back" leaves the form be.
    const w = applyWhisper(lc.content, alters, { allowWholeBlur: false, rich: lc.logged.length > 0, surfaceLabel: "task" });
    if (w === null) return;
    const description = w.content;

    setLoading(true);
    try {
      const data = {
        ...formData,
        description,
        parent_task_id: parentTaskId || null,
        goal_target: formData.goal_target ? parseInt(formData.goal_target) : null,
        // Normalise empty strings to nulls so filters that look for
        // "has a due date" don't have to compare against "".
        due_date: formData.due_date || null,
        scheduled_at: formData.scheduled_at || null,
      };

      let savedTask;
      if (editingTask) {
        savedTask = await base44.entities.Task.update(editingTask.id, data);
        toast.success("Task updated!");
      } else {
        savedTask = await base44.entities.Task.create(data);
        toast.success("Task created!");
      }

      const fullContent = [formData.title, description].filter(Boolean).join(" ");
      await saveMentions({
        content: fullContent,
        alters,
        sourceType: "task",
        sourceId: savedTask?.id || editingTask?.id || "",
        sourceLabel: "To-Do List",
        navigatePath: "/todo",
      });
      // Whisper recipients are peeled off the description — notify them.
      for (const rid of (w.recipientIds || [])) {
        try {
          await base44.entities.MentionLog.create({
            mentioned_alter_id: rid,
            author_alter_id: null,
            log_type: "mention",
            source_type: "task",
            source_id: savedTask?.id || editingTask?.id || "",
            source_label: "To-Do List (whisper)",
            source_date: new Date().toISOString(),
            preview_text: "🔒 private whisper",
            navigate_path: "/todo",
          });
        } catch { /* best-effort */ }
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
            <MentionTextarea
              value={formData.description}
              onChange={(val) => setFormData({ ...formData, description: val })}
              alters={alters}
              placeholder={`Add details… @ to mention, /w @name [secret] to whisper`}
              rows={3}
            />
          </div>

          {/* Activity category — uses the same picker the Activity Tracker
              does, so a to-do can be tagged with the user's real categories
              instead of a hardcoded short list. */}
          <div>
            <label className="text-sm font-medium block mb-1">Activity category <span className="text-xs text-muted-foreground">(optional)</span></label>
            <ActivityPillSelector
              selectedActivities={formData.activity_category_ids}
              onActivityChange={(ids) => setFormData({ ...formData, activity_category_ids: ids })}
            />
          </div>

          {/* Priority — chip group instead of a native <select> so the
              selected state is readable on every OS / theme. */}
          <div>
            <label className="text-sm font-medium block mb-1">Priority</label>
            <div className="flex gap-2">
              {PRIORITIES.map(p => {
                const active = formData.priority === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, priority: p.id })}
                    className={`flex-1 text-sm px-3 py-1.5 rounded-full border transition-colors ${active ? p.cls : "border-border/60 text-muted-foreground hover:bg-muted/40"}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Due date vs scheduled-at — two different things. Due date is a
              deadline ("must be done by"); scheduled-at is a deliberate
              plan ("I'll do this at"). The to-do can have either, both,
              or neither. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Due date <span className="text-xs text-muted-foreground">(deadline)</span></label>
              <Input
                type="date"
                value={formData.due_date || ""}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Scheduled <span className="text-xs text-muted-foreground">(plan to do)</span></label>
              <Input
                type="datetime-local"
                value={formData.scheduled_at || ""}
                onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
              />
            </div>
          </div>

          {/* Surfacing toggles — pin to keep it visible on the dashboard,
              urgent to add it to the dashboard's pinned strip with an
              urgency badge regardless of pin state. */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
            <label className="w-full flex items-center justify-between gap-2 text-sm font-medium cursor-pointer">
              <span className="flex items-center gap-1.5">
                <Pin className={`w-4 h-4 ${formData.pinned_to_dashboard ? "fill-primary text-primary" : ""}`} />
                Pin to dashboard
              </span>
              <Switch
                checked={!!formData.pinned_to_dashboard}
                onCheckedChange={(v) => setFormData({ ...formData, pinned_to_dashboard: v })}
              />
            </label>
            <label className={`w-full flex items-center justify-between gap-2 text-sm font-medium cursor-pointer transition-colors ${formData.is_urgent ? "text-amber-500" : "text-foreground"}`}>
              <span className="flex items-center gap-1.5">
                <Zap className={`w-4 h-4 ${formData.is_urgent ? "fill-amber-500 text-amber-500" : ""}`} />
                Mark as urgent
              </span>
              <Switch
                checked={!!formData.is_urgent}
                onCheckedChange={(v) => setFormData({ ...formData, is_urgent: v })}
                className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Urgent to-dos show in the Pinned strip at the top of the Dashboard until completed. Pinned (non-urgent) ones show there too, without the urgency styling.
            </p>
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
