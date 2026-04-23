import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ColorPickerModal from "@/components/shared/ColorPickerModal";

const TABS = ["symptom", "habit"];
const TAB_LABELS = { symptom: "Symptoms", habit: "Habits" };

export default function SymptomManager() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("symptom");
  const [editing, setEditing] = useState(null);
  const [addingNew, setAddingNew] = useState(false);
  const [form, setForm] = useState({ label: "", type: "boolean", is_positive: false, color: "#8B5CF6" });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  const visible = symptoms.filter(s => s.category === tab);

  const startEdit = (s) => {
    setEditing(s);
    setForm({ label: s.label || "", type: s.type || "boolean", is_positive: !!s.is_positive, color: s.color || "#8B5CF6" });
    setAddingNew(false);
  };

  const startAdd = () => {
    setEditing(null);
    setForm({ label: "", type: "boolean", is_positive: tab === "habit", color: "#8B5CF6" });
    setAddingNew(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await base44.entities.Symptom.update(editing.id, { label: form.label.trim(), type: form.type, is_positive: form.is_positive, color: form.color });
        toast.success("Updated");
      } else {
        await base44.entities.Symptom.create({ label: form.label.trim(), category: tab, type: form.type, is_positive: form.is_positive, color: form.color, is_default: false, is_archived: false, order: 999 });
        toast.success("Added");
      }
      queryClient.invalidateQueries({ queryKey: ["symptoms"] });
      setEditing(null); setAddingNew(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (s) => {
    await base44.entities.Symptom.update(s.id, { is_archived: !s.is_archived });
    queryClient.invalidateQueries({ queryKey: ["symptoms"] });
    toast.success(s.is_archived ? "Restored" : "Archived");
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Symptoms & Habits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Tabs */}
        <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
          {TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); setEditing(null); setAddingNew(false); }}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Edit / Add form */}
        {(editing || addingNew) && (
          <div className="border border-primary/30 rounded-xl p-3 space-y-3 bg-primary/5">
            <p className="text-xs font-medium text-primary">{editing ? "Edit" : "New"} {TAB_LABELS[tab].slice(0, -1)}</p>
            <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Label" className="h-8 text-sm" />
            <div className="flex gap-2">
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="flex-1 px-2 py-1.5 text-xs bg-muted/40 border border-border/50 rounded-lg focus:outline-none">
                <option value="boolean">Yes/No</option>
                <option value="rating">Rating (0–5)</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={form.is_positive} onChange={e => setForm(f => ({ ...f, is_positive: e.target.checked }))} />
                Positive
              </label>
              <button type="button" onClick={() => setShowColorPicker(true)}
                className="w-8 h-8 rounded-lg border-2 border-border cursor-pointer flex-shrink-0"
                style={{ backgroundColor: form.color }} />
              {showColorPicker && <ColorPickerModal color={form.color} onSave={c => setForm(f => ({ ...f, color: c }))} onClose={() => setShowColorPicker(false)} />}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving || !form.label.trim()} className="flex-1">Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(null); setAddingNew(false); }} className="flex-1">Cancel</Button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {visible.map(s => (
            <div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${s.is_archived ? "opacity-40 border-border/30" : "border-border/50"}`}>
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color || "#8B5CF6" }} />
              <span className="flex-1 text-sm truncate">{s.label}</span>
              <span className="text-xs text-muted-foreground">{s.type}</span>
              <button onClick={() => startEdit(s)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => toggleArchive(s)} className="p-1 text-muted-foreground hover:text-foreground" title={s.is_archived ? "Restore" : "Archive"}>
                {s.is_archived ? <RotateCcw className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
              </button>
            </div>
          ))}
        </div>

        <Button size="sm" variant="outline" onClick={startAdd} className="w-full gap-1.5">
          <Plus className="w-3 h-3" /> Add {TAB_LABELS[tab].slice(0, -1)}
        </Button>
      </CardContent>
    </Card>
  );
}