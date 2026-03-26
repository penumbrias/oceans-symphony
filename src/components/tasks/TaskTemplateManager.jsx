import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { AUTO_TRIGGER_OPTIONS, DEFAULT_TASK_TEMPLATES } from "@/lib/dailyTaskSystem";
import { Plus, GripVertical, Pencil, Trash2, RotateCcw, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const EMPTY_FORM = {
  title: "",
  description: "",
  points: 3,
  mode: "MANUAL",
  is_active: true,
  sort_order: 0,
  auto_trigger: "",
  nav_path: "",
};

function TaskForm({ initial, onSave, onCancel, isNew }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <input
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Task title"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <textarea
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Optional description"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Points</label>
          <input
            type="number"
            min={1}
            max={100}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.points}
            onChange={(e) => set("points", Number(e.target.value))}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Mode</label>
          <select
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.mode}
            onChange={(e) => set("mode", e.target.value)}
          >
            <option value="MANUAL">MANUAL</option>
            <option value="AUTO">AUTO</option>
          </select>
        </div>
        {form.mode === "AUTO" && (
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Auto trigger</label>
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.auto_trigger || ""}
              onChange={(e) => set("auto_trigger", e.target.value)}
            >
              <option value="">— Select trigger —</option>
              {AUTO_TRIGGER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}
        {form.mode === "MANUAL" && (
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Navigation path (optional)</label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.nav_path || ""}
              onChange={(e) => set("nav_path", e.target.value)}
              placeholder="/page-path"
            />
          </div>
        )}
        <div className="col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="is_active"
            checked={form.is_active}
            onChange={(e) => set("is_active", e.target.checked)}
            className="rounded"
          />
          <label htmlFor="is_active" className="text-sm text-foreground">Active (show in daily checklist)</label>
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

export default function TaskTemplateManager({ templates, onClose }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [restoringDefaults, setRestoringDefaults] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["dailyTaskTemplates"] });

  const handleSave = async (id, form) => {
    await base44.entities.DailyTaskTemplate.update(id, {
      title: form.title,
      description: form.description,
      points: form.points,
      mode: form.mode,
      is_active: form.is_active,
      auto_trigger: form.mode === "AUTO" ? form.auto_trigger : null,
      nav_path: form.mode === "MANUAL" ? (form.nav_path || null) : null,
    });
    setEditingId(null);
    invalidate();
    toast.success("Task updated");
  };

  const handleAdd = async (form) => {
    await base44.entities.DailyTaskTemplate.create({
      ...form,
      sort_order: templates.length,
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

  const sorted = [...templates].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Manage Daily Tasks</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-2">
        {sorted.map((t) => (
          editingId === t.id ? (
            <TaskForm
              key={t.id}
              initial={t}
              onSave={(form) => handleSave(t.id, form)}
              onCancel={() => setEditingId(null)}
              isNew={false}
            />
          ) : (
            <div key={t.id} className={`flex items-center gap-2 rounded-xl border p-3 transition-all ${t.is_active ? "bg-card border-border/50" : "bg-muted/20 border-border/30 opacity-60"}`}>
              <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium">{t.title}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${t.mode === "AUTO" ? "border-blue-400/50 text-blue-500" : "border-border text-muted-foreground"}`}>
                    {t.mode}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t.points} pts</span>
                  {!t.is_active && <span className="text-xs text-muted-foreground">hidden</span>}
                </div>
                {t.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => handleToggleActive(t)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title={t.is_active ? "Hide task" : "Show task"}>
                  <span className="text-xs">{t.is_active ? "Hide" : "Show"}</span>
                </button>
                <button onClick={() => setEditingId(t.id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        ))}
      </div>

      {showAddForm ? (
        <TaskForm initial={EMPTY_FORM} onSave={handleAdd} onCancel={() => setShowAddForm(false)} isNew={true} />
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => setShowAddForm(true)}>
            <Plus className="w-3.5 h-3.5" /> Add Task
          </Button>
          {templates.length === 0 && (
            <Button variant="outline" size="sm" onClick={handleRestoreDefaults} disabled={restoringDefaults} className="gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> {restoringDefaults ? "Restoring..." : "Restore Defaults"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}