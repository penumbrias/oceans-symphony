import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Pin, Zap } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

// Compact sheet for the two most-toggled task fields (Pin / Urgent).
// Opened by long-pressing a to-do chip; saving issues a single
// Task.update without going through the full edit form.
export default function TaskQuickActionsSheet({ task, open, onOpenChange }) {
  const qc = useQueryClient();
  const [pinned, setPinned] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && task) {
      setPinned(!!task.pinned_to_dashboard);
      setUrgent(!!task.is_urgent);
    }
  }, [open, task]);

  if (!task) return null;

  const dirty = pinned !== !!task.pinned_to_dashboard || urgent !== !!task.is_urgent;

  const save = async () => {
    if (!dirty) { onOpenChange(false); return; }
    setSaving(true);
    try {
      await base44.entities.Task.update(task.id, {
        pinned_to_dashboard: pinned,
        is_urgent: urgent,
      });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["pinnedTasks"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.message || "Failed to update task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold truncate">{task.title}</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
          <label className="w-full flex items-center justify-between gap-2 text-sm font-medium cursor-pointer">
            <span className="flex items-center gap-1.5">
              <Pin className={`w-4 h-4 ${pinned ? "fill-primary text-primary" : ""}`} />
              Pin to dashboard
            </span>
            <Switch checked={pinned} onCheckedChange={setPinned} />
          </label>
          <label className={`w-full flex items-center justify-between gap-2 text-sm font-medium cursor-pointer ${urgent ? "text-amber-500" : ""}`}>
            <span className="flex items-center gap-1.5">
              <Zap className={`w-4 h-4 ${urgent ? "fill-amber-500 text-amber-500" : ""}`} />
              Mark as urgent
            </span>
            <Switch
              checked={urgent}
              onCheckedChange={setUrgent}
              className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
            />
          </label>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
