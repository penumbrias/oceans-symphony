import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import { DEFAULT_RELATIONSHIP_TYPES } from "@/lib/relationshipTypes";

export default function RelationshipTypesManager() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [addingNew, setAddingNew] = useState(false);
  const [form, setForm] = useState({ label: "", color: "#6b7280" });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["relationshipTypes"],
    queryFn: async () => {
      const existing = await base44.entities.RelationshipType.list();
      // Seed defaults if none exist yet
      if (existing.length === 0) {
        await Promise.all(
          DEFAULT_RELATIONSHIP_TYPES.map((t, i) =>
            base44.entities.RelationshipType.create({ ...t, order: i, is_default: true })
          )
        );
        return base44.entities.RelationshipType.list();
      }
      return existing;
    },
  });

  const visible = [...types].sort((a, b) => (a.order || 0) - (b.order || 0));

  const startEdit = (t) => {
    setEditing(t);
    setForm({ label: t.label || "", color: t.color || "#6b7280" });
    setAddingNew(false);
  };

  const startAdd = () => {
    setEditing(null);
    setForm({ label: "", color: "#6b7280" });
    setAddingNew(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await base44.entities.RelationshipType.update(editing.id, {
          label: form.label.trim(),
          color: form.color,
        });
        toast.success("Updated");
      } else {
        await base44.entities.RelationshipType.create({
          label: form.label.trim(),
          color: form.color,
          is_archived: false,
          is_default: false,
          order: types.length,
        });
        toast.success("Added");
      }
      queryClient.invalidateQueries({ queryKey: ["relationshipTypes"] });
      setEditing(null);
      setAddingNew(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (t) => {
    await base44.entities.RelationshipType.update(t.id, { is_archived: !t.is_archived });
    queryClient.invalidateQueries({ queryKey: ["relationshipTypes"] });
    toast.success(t.is_archived ? "Restored" : "Archived");
  };

  if (isLoading) return null;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Relationship Types</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Edit / Add form */}
        {(editing || addingNew) && (
          <div className="border border-primary/30 rounded-xl p-3 space-y-3 bg-primary/5">
            <p className="text-xs font-medium text-primary">{editing ? "Edit" : "New"} Relationship Type</p>
            <div className="flex gap-2 items-center">
              <Input
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Label"
                className="h-8 text-sm flex-1"
              />
              <button
                type="button"
                onClick={() => setShowColorPicker(true)}
                className="w-8 h-8 rounded-lg border-2 border-border cursor-pointer flex-shrink-0"
                style={{ backgroundColor: form.color }}
              />
              {showColorPicker && (
                <ColorPickerModal
                  color={form.color}
                  onSave={c => setForm(f => ({ ...f, color: c }))}
                  onClose={() => setShowColorPicker(false)}
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving || !form.label.trim()} className="flex-1">Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(null); setAddingNew(false); }} className="flex-1">Cancel</Button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {visible.map(t => (
            <div
              key={t.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${t.is_archived ? "opacity-40 border-border/30" : "border-border/50"}`}
            >
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || "#6b7280" }} />
              <span className="flex-1 text-sm truncate">{t.label}</span>
              <button onClick={() => startEdit(t)} className="p-1 text-muted-foreground hover:text-foreground">
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={() => toggleArchive(t)}
                className="p-1 text-muted-foreground hover:text-foreground"
                title={t.is_archived ? "Restore" : "Archive"}
              >
                {t.is_archived ? <RotateCcw className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
              </button>
            </div>
          ))}
        </div>

        <Button size="sm" variant="outline" onClick={startAdd} className="w-full gap-1.5">
          <Plus className="w-3 h-3" /> Add Relationship Type
        </Button>
      </CardContent>
    </Card>
  );
}