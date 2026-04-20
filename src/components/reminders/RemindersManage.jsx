import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CATEGORY_ICONS, triggerSummary } from "./reminderHelpers";
import { useTerms } from "@/lib/useTerms";
import ReminderEditorModal from "./ReminderEditorModal";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function AlterDot({ alter }) {
  if (!alter) return null;
  const color = alter.color || "#3B82F6";
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 border-2 overflow-hidden"
      style={{ borderColor: color, backgroundColor: color }}
    >
      {alter.avatar_url ? (
        <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
      ) : (
        alter.name?.[0]?.toUpperCase() || "?"
      )}
    </div>
  );
}

export default function RemindersManage() {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterValue, setFilterValue] = useState("all"); // "all" | "system" | "per_alter" | alter.id

  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders", "all"],
    queryFn: () => base44.entities.Reminder.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const alterMap = Object.fromEntries(alters.map(a => [a.id, a]));

  // Alters that actually have reminders scoped to them
  const scopedAlterIds = [...new Set(reminders.filter(r => r.alter_id).map(r => r.alter_id))];
  const scopedAlters = scopedAlterIds.map(id => alterMap[id]).filter(Boolean);

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

  // Filter logic
  const filtered = reminders.filter(r => {
    if (filterValue === "all") return true;
    if (filterValue === "system") return !r.alter_id;
    if (filterValue === "per_alter") return !!r.alter_id;
    return r.alter_id === filterValue; // specific alter id
  });

  const filterLabel = () => {
    if (filterValue === "all") return "All reminders";
    if (filterValue === "system") return `${terms.System}-wide`;
    if (filterValue === "per_alter") return `Per-${terms.alter}`;
    const a = alterMap[filterValue];
    return a ? `For ${a.name}` : `Specific ${terms.alter}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {/* Filter dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              {filterLabel()} <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
             <DropdownMenuItem onClick={() => setFilterValue("all")}>All reminders</DropdownMenuItem>
             <DropdownMenuItem onClick={() => setFilterValue("system")}>{terms.System}-wide</DropdownMenuItem>
             <DropdownMenuItem onClick={() => setFilterValue("per_alter")}>Per-{terms.alter}</DropdownMenuItem>
            {scopedAlters.map(a => (
              <DropdownMenuItem key={a.id} onClick={() => setFilterValue(a.id)}>
                <span className="flex items-center gap-2">
                  <AlterDot alter={a} />
                  {a.name}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" className="gap-2" onClick={openNew}>
          <Plus className="w-4 h-4" /> New Reminder
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-10 text-sm">No reminders found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const Icon = CATEGORY_ICONS[r.category] || CATEGORY_ICONS.custom;
            const alter = r.alter_id ? alterMap[r.alter_id] : null;
            const isArchivedAlter = alter?.is_archived;

            return (
              <div key={r.id} className={`flex items-center gap-3 bg-card border rounded-xl px-4 py-3 ${isArchivedAlter ? "border-amber-200/60 dark:border-amber-800/40" : "border-border/50"}`}>
                {/* Icon or alter avatar */}
                {alter ? (
                  <AlterDot alter={alter} />
                ) : (
                  <span className="text-lg flex-shrink-0">{Icon}</span>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-medium text-sm truncate ${!r.is_active ? "text-muted-foreground line-through" : ""}`}>{r.title}</p>
                    {alter && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                        style={{
                          backgroundColor: (alter.color || "#3B82F6") + "22",
                          color: alter.is_archived ? "#94A3B8" : (alter.color || "#3B82F6"),
                          border: `1px solid ${(alter.color || "#3B82F6")}44`,
                        }}
                      >
                        {isArchivedAlter ? "[archived alter]" : `For ${alter.name}`}
                        {r.alter_scope === "when_fronting" && !isArchivedAlter && " · when fronting"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{triggerSummary(r)}</p>
                  {isArchivedAlter && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                      <p className="text-xs text-amber-600 dark:text-amber-400">Tied to archived alter — currently paused</p>
                    </div>
                  )}
                </div>

                <Switch checked={!!r.is_active && !isArchivedAlter} disabled={isArchivedAlter} onCheckedChange={() => handleToggle(r)} />
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