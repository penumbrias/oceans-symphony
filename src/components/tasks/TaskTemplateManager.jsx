import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { AUTO_TRIGGER_OPTIONS, DEFAULT_TASK_TEMPLATES, FREQUENCY_LABELS } from "@/lib/dailyTaskSystem";
import { Plus, GripVertical, Pencil, Trash2, RotateCcw, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const FREQUENCY_ORDER = ["daily", "weekly", "monthly", "yearly"];

const SECTION_STYLE = {
  daily:   { label: "Daily",   dot: "bg-blue-500",   header: "text-blue-500",   badge: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  weekly:  { label: "Weekly",  dot: "bg-green-500",  header: "text-green-500",  badge: "bg-green-500/10 text-green-500 border-green-500/20" },
  monthly: { label: "Monthly", dot: "bg-amber-500",  header: "text-amber-500",  badge: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  yearly:  { label: "Yearly",  dot: "bg-purple-500", header: "text-purple-500", badge: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
};

const EMPTY_FORM = {
  title: "", description: "", points: 3, frequency: "daily",
  mode: "MANUAL", is_active: true, sort_order: 0, auto_trigger: "", nav_path: "",
};

function TaskForm({ initial, onSave, onCancel, isNew }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <input className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Task title" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <textarea className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
            rows={2} value={form.description} onChange={(e) => set("description", e.target.value)}
            placeholder="Optional description" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Frequency</label>
          <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.frequency || "daily"} onChange={(e) => set("frequency", e.target.value)}>
            {Object.entries(FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Points</label>
          <input type="number" min={1} max={100}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.points} onChange={(e) => set("points", Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Mode</label>
          <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.mode} onChange={(e) => set("mode", e.target.value)}>
            <option value="MANUAL">MANUAL</option>
            <option value="AUTO">AUTO</option>
          </select>
        </div>
        {form.mode === "AUTO" && (
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Auto trigger</label>
            <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.auto_trigger || ""} onChange={(e) => set("auto_trigger", e.target.value)}>
              <option value="">— Select trigger —</option>
              {AUTO_TRIGGER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        {form.mode === "MANUAL" && (
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Navigation path (optional)</label>
            <input className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.nav_path || ""} onChange={(e) => set("nav_path", e.target.value)} placeholder="/page-path" />
          </div>
        )}
        <div className="col-span-2 flex items-center gap-2">
          <input type="checkbox" id="is_active" checked={form.is_active}
            onChange={(e) => set("is_active", e.target.checked)} className="rounded" />
          <label htmlFor="is_active" className="text-sm text-foreground">Active (show in checklist)</label>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={!form.title.trim()}>
          <Check className="w-3.5 h-3.5 mr-1" /> {isNew ? "Add Task" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function TaskRow({ template: t, dragHandleProps, onEdit, onToggle, onDelete }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border p-3 bg-card transition-all ${
      t.is_active ? "border-border/50" : "border-border/30 opacity-60"
    }`}>
      <button
        {...dragHandleProps}
        className="touch-none cursor-grab active:cursor-grabbing p-0.5 -ml-0.5 text-muted-foreground hover:text-foreground flex-shrink-0"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium">{t.title}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${
            t.mode === "AUTO" ? "border-blue-400/50 text-blue-500" : "border-border text-muted-foreground"
          }`}>{t.mode}</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t.points} pts</span>
          {!t.is_active && <span className="text-xs text-muted-foreground italic">hidden</span>}
        </div>
        {t.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button onClick={() => onToggle(t)}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs">
          {t.is_active ? "Hide" : "Show"}
        </button>
        <button onClick={() => onEdit(t.id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(t.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function SortableTaskRow(props) {
  const { template } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: template.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-40 z-50" : ""}
    >
      <TaskRow {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

export default function TaskTemplateManager({ templates: propTemplates, onClose }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFrequency, setAddFrequency] = useState("daily");
  const [restoringDefaults, setRestoringDefaults] = useState(false);
  // Local optimistic state so drags feel instant
  const [localOrder, setLocalOrder] = useState(null);
  const templates = localOrder ?? propTemplates;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const invalidate = () => {
    setLocalOrder(null);
    queryClient.invalidateQueries({ queryKey: ["dailyTaskTemplates"] });
  };

  // Group + sort by frequency section
  const grouped = useMemo(() => {
    const g = {};
    for (const freq of FREQUENCY_ORDER) g[freq] = [];
    for (const t of templates) {
      const f = t.frequency || "daily";
      if (g[f]) g[f].push(t);
    }
    for (const freq of FREQUENCY_ORDER) {
      g[freq].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    return g;
  }, [templates]);

  const handleDragEnd = async (event, frequency) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const section = grouped[frequency];
    const oldIdx = section.findIndex((t) => t.id === active.id);
    const newIdx = section.findIndex((t) => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(section, oldIdx, newIdx).map((t, i) => ({ ...t, sort_order: i }));
    // Optimistic update
    setLocalOrder((prev) => {
      const base = prev ?? propTemplates;
      const others = base.filter((t) => (t.frequency || "daily") !== frequency);
      return [...others, ...reordered];
    });
    // Persist
    await Promise.all(reordered.map((t, i) =>
      base44.entities.DailyTaskTemplate.update(t.id, { sort_order: i })
    ));
    invalidate();
  };

  const handleSave = async (id, form) => {
    await base44.entities.DailyTaskTemplate.update(id, {
      title: form.title, description: form.description, points: form.points,
      frequency: form.frequency || "daily", mode: form.mode, is_active: form.is_active,
      auto_trigger: form.mode === "AUTO" ? form.auto_trigger : null,
      nav_path: form.mode === "MANUAL" ? (form.nav_path || null) : null,
    });
    setEditingId(null);
    invalidate();
    toast.success("Task updated");
  };

  const handleAdd = async (form) => {
    const sectionLen = grouped[form.frequency || "daily"]?.length ?? 0;
    await base44.entities.DailyTaskTemplate.create({
      ...form, frequency: form.frequency || "daily", sort_order: sectionLen,
      auto_trigger: form.mode === "AUTO" ? form.auto_trigger : null,
      nav_path: form.mode === "MANUAL" ? (form.nav_path || null) : null,
    });
    setShowAddForm(false);
    invalidate();
    toast.success("Task added");
  };

  const handleDelete = async (id) => {
    await base44.entities.DailyTaskTemplate.delete(id);
    invalidate();
    toast.success("Task deleted");
  };

  const handleToggleActive = async (template) => {
    await base44.entities.DailyTaskTemplate.update(template.id, { is_active: !template.is_active });
    invalidate();
  };

  const handleRestoreDefaults = async () => {
    setRestoringDefaults(true);
    for (const def of DEFAULT_TASK_TEMPLATES) {
      await base44.entities.DailyTaskTemplate.create({ ...def });
    }
    setRestoringDefaults(false);
    invalidate();
    toast.success("Default tasks added");
  };

  const hasAnyTasks = templates.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Manage Tasks</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      {FREQUENCY_ORDER.map((freq) => {
        const section = grouped[freq];
        const style = SECTION_STYLE[freq];
        if (section.length === 0 && freq !== "daily") return null;
        return (
          <div key={freq}>
            {/* Section header */}
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
              <p className={`text-xs font-bold uppercase tracking-widest ${style.header}`}>{style.label}</p>
              <div className="flex-1 h-px bg-border/50" />
              <button
                onClick={() => { setAddFrequency(freq); setShowAddForm(true); }}
                title={`Add ${style.label} task`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {section.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 italic px-1 pb-1">No {freq} tasks yet</p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => handleDragEnd(e, freq)}
              >
                <SortableContext items={section.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {section.map((t) =>
                      editingId === t.id ? (
                        <TaskForm key={t.id} initial={t}
                          onSave={(form) => handleSave(t.id, form)}
                          onCancel={() => setEditingId(null)} isNew={false} />
                      ) : (
                        <SortableTaskRow key={t.id} template={t}
                          onEdit={setEditingId}
                          onToggle={handleToggleActive}
                          onDelete={handleDelete} />
                      )
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        );
      })}

      {showAddForm ? (
        <TaskForm
          initial={{ ...EMPTY_FORM, frequency: addFrequency }}
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
          isNew={true}
        />
      ) : (
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => { setAddFrequency("daily"); setShowAddForm(true); }}>
            <Plus className="w-3.5 h-3.5" /> Add Task
          </Button>
          {!hasAnyTasks && (
            <Button variant="outline" size="sm" onClick={handleRestoreDefaults} disabled={restoringDefaults} className="gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> {restoringDefaults ? "Restoring..." : "Restore Defaults"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
