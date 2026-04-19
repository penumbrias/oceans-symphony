import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, ChevronLeft, Check, X, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import DiaryTemplateManager from "@/components/settings/DiaryTemplateManager";

const DEFAULT_COLORS = ["#8b5cf6", "#ec4899", "#3b82f6", "#14b8a6", "#f59e0b", "#ef4444", "#22c55e", "#f97316"];

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {DEFAULT_COLORS.map(c => (
        <button key={c} onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full border-2 transition-all"
          style={{ backgroundColor: c, borderColor: value === c ? "#fff" : "transparent", boxShadow: value === c ? `0 0 0 2px ${c}` : "none" }} />
      ))}
    </div>
  );
}

function SymptomRow({ symptom, onSave, onDelete, onMoveUp, onMoveDown, index, total }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(symptom.label);
  const [type, setType] = useState(symptom.type || "boolean");
  const [color, setColor] = useState(symptom.color || "#8b5cf6");
  const [isPositive, setIsPositive] = useState(symptom.is_positive || false);

  const handleSave = async () => {
    await onSave(symptom.id, { label, type, color, is_positive: isPositive });
    setEditing(false);
  };

  return (
    <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <button onClick={onMoveUp} disabled={index === 0}
            className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
            <ChevronUp className="w-3 h-3" />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1}
            className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: symptom.color || "#8b5cf6" }} />
        <span className="flex-1 text-sm font-medium">{symptom.label}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{symptom.type || "boolean"}</span>
        <button onClick={() => setEditing(v => !v)}
          className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(symptom.id)}
          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {editing && (
        <div className="px-4 pb-4 pt-1 border-t border-border/30 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Label</label>
            <Input value={label} onChange={e => setLabel(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
            <div className="flex gap-2">
              {["boolean", "rating"].map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${type === t ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 border-border text-muted-foreground hover:border-primary/50"}`}>
                  {t === "boolean" ? "Yes/No" : "Rating (0–5)"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Color</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id={`pos-${symptom.id}`} checked={isPositive} onChange={e => setIsPositive(e.target.checked)} className="w-4 h-4 accent-primary" />
            <label htmlFor={`pos-${symptom.id}`} className="text-xs text-muted-foreground cursor-pointer select-none">Higher values are better (e.g. joy, energy)</label>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} className="gap-1"><Check className="w-3.5 h-3.5" /> Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddSymptomForm({ category, onAdd, onCancel }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("boolean");
  const [color, setColor] = useState("#8b5cf6");
  const [isPositive, setIsPositive] = useState(false);

  const handleAdd = () => {
    if (!label.trim()) return;
    onAdd({ label: label.trim(), type, color, is_positive: isPositive, category, is_default: false, is_archived: false, order: 999 });
  };

  return (
    <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3">
      <p className="text-sm font-medium">New {category === "symptom" ? "Symptom" : "Habit"}</p>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Label</label>
        <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Anxiety" className="h-8 text-sm" autoFocus />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Type</label>
        <div className="flex gap-2">
          {["boolean", "rating"].map(t => (
            <button key={t} onClick={() => setType(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${type === t ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 border-border text-muted-foreground"}`}>
              {t === "boolean" ? "Yes/No" : "Rating (0–5)"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Color</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="new-pos" checked={isPositive} onChange={e => setIsPositive(e.target.checked)} className="w-4 h-4 accent-primary" />
        <label htmlFor="new-pos" className="text-xs text-muted-foreground cursor-pointer select-none">Higher values are better</label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleAdd} disabled={!label.trim()} className="gap-1"><Check className="w-3.5 h-3.5" /> Add</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function SymptomTab({ category }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  const filtered = useMemo(() =>
    symptoms.filter(s => s.category === category && !s.is_archived).sort((a, b) => (a.order || 0) - (b.order || 0)),
    [symptoms, category]
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["symptoms"] });

  const handleSave = async (id, data) => {
    await base44.entities.Symptom.update(id, data);
    invalidate();
    toast.success("Saved");
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this item?")) return;
    await base44.entities.Symptom.update(id, { is_archived: true });
    invalidate();
    toast.success("Removed");
  };

  const handleAdd = async (data) => {
    await base44.entities.Symptom.create(data);
    invalidate();
    setShowAdd(false);
    toast.success("Added");
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add {category === "symptom" ? "Symptom" : "Habit"}
        </Button>
      </div>

      {showAdd && <AddSymptomForm category={category} onAdd={handleAdd} onCancel={() => setShowAdd(false)} />}

      {filtered.length === 0 && !showAdd && (
        <p className="text-sm text-muted-foreground text-center py-8">No {category === "symptom" ? "symptoms" : "habits"} configured yet.</p>
      )}

      <div className="space-y-2">
        {filtered.map((s, index) => (
          <SymptomRow key={s.id} symptom={s} index={index} total={filtered.length}
            onSave={handleSave} onDelete={handleDelete}
            onMoveUp={async () => {
              const a = filtered[index - 1];
              const b = filtered[index];
              await Promise.all([
                base44.entities.Symptom.update(a.id, { order: b.order ?? index }),
                base44.entities.Symptom.update(b.id, { order: a.order ?? index - 1 }),
              ]);
              invalidate();
            }}
            onMoveDown={async () => {
              const a = filtered[index];
              const b = filtered[index + 1];
              await Promise.all([
                base44.entities.Symptom.update(a.id, { order: b.order ?? index + 1 }),
                base44.entities.Symptom.update(b.id, { order: a.order ?? index }),
              ]);
              invalidate();
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ManageCheckIn() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("symptoms");

  const TABS = [
    { id: "symptoms", label: "Symptoms" },
    { id: "habits", label: "Habits" },
    { id: "diary", label: "Diary card fields" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="font-display text-2xl font-semibold">Manage Check-In</h1>
          <p className="text-muted-foreground text-xs">Configure symptoms and habits tracked in Quick Check-In</p>
        </div>
      </div>

      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "symptoms" && <SymptomTab category="symptom" />}
      {tab === "habits" && <SymptomTab category="habit" />}
      {tab === "diary" && <DiaryTemplateManager />}
    </motion.div>
  );
}