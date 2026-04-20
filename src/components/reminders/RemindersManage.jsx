import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CATEGORY_ICONS, triggerSummary } from "./reminderHelpers";
import ReminderEditorModal from "./ReminderEditorModal";
import { toast } from "sonner";

export default function RemindersManage() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders", "all"],
    queryFn: () => base44.entities.Reminder.list(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["reminders"] });
    queryClient.invalidateQueries({ queryKey: ["reminders", "all"] });
  };

  const handleToggle = async (r) => {
    const next = !r.is_active;
    await base44.entities.Reminder.update(r.id, { is_active: next });
    invalidate();
    toast(next ? "Reminder enabled" : "Reminder paused");
  };

  const handleDelete = async (r) => {
    if (!confirm(`Delete "${r.title}"?`)) return;
    await base44.entities.Reminder.delete(r.id);
    invalidate();
    toast.success(`"${r.title}" deleted`);
  };

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (r) => { setEditing(r); setEditorOpen(true); };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={openNew}>
          <Plus className="w-4 h-4" /> New Reminder
        </Button>
      </div>

      {reminders.length === 0 ? (
        <p className="text-center text-muted-foreground py-10 text-sm">No reminders yet. Create one above.</p>
      ) : (
        <div className="space-y-2">
          {reminders.map(r => {
            const Icon = CATEGORY_ICONS[r.category] || CATEGORY_ICONS.custom;
            return (
              <div key={r.id} className="flex items-center gap-3 bg-card border border-border/50 rounded-xl px-4 py-3">
                <span className="text-lg flex-shrink-0">{Icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm truncate ${!r.is_active ? "text-muted-foreground line-through" : ""}`}>{r.title}</p>
                  <p className="text-xs text-muted-foreground">{triggerSummary(r)}</p>
                </div>
                <Switch checked={!!r.is_active} onCheckedChange={() => handleToggle(r)} />
                <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(r)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(r)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <ReminderEditorModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        existing={editing}
        onSaved={invalidate}
      />
    </div>
  );
}