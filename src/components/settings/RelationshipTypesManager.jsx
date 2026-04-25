import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Archive, RotateCcw, Check, X, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_RELATIONSHIP_TYPES } from "@/lib/relationshipTypes";

function TypeRow({ type, onUpdate, onToggleArchive }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(type.label);
  const [color, setColor] = useState(type.color || "#6b7280");

  const handleSave = () => {
    if (!label.trim()) return;
    onUpdate(type.id, { label: label.trim(), color });
    setEditing(false);
  };

  const handleCancel = () => {
    setLabel(type.label);
    setColor(type.color || "#6b7280");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg border border-primary/30 bg-primary/5">
        <input
          type="color"
          value={color}
          onChange={e => setColor(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border border-border flex-shrink-0 p-0.5 bg-background"
          title="Pick color"
        />
        <Input
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
          className="h-7 text-sm flex-1"
          autoFocus
        />
        <button onClick={handleSave} className="text-green-500 hover:text-green-600 flex-shrink-0">
          <Check className="w-4 h-4" />
        </button>
        <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/10 group transition-opacity ${type.is_archived ? "opacity-40" : ""}`}>
      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: type.color || "#6b7280" }} />
      <span className="text-sm font-medium flex-1 truncate">{type.label}</span>
      {type.is_archived && (
        <span className="text-xs text-muted-foreground italic flex-shrink-0">archived</span>
      )}
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground flex-shrink-0"
        title="Edit"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onToggleArchive(type)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground flex-shrink-0"
        title={type.is_archived ? "Restore" : "Archive"}
      >
        {type.is_archived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export default function RelationshipTypesManager() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#6b7280");
  const [saving, setSaving] = useState(false);

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["relationshipTypes"],
    queryFn: async () => {
      const existing = await base44.entities.RelationshipType.list();
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

  const sorted = [...types].sort((a, b) => (a.order || 0) - (b.order || 0));

  const handleUpdate = async (id, data) => {
    await base44.entities.RelationshipType.update(id, data);
    queryClient.invalidateQueries({ queryKey: ["relationshipTypes"] });
    toast.success("Updated");
  };

  const handleToggleArchive = async (t) => {
    await base44.entities.RelationshipType.update(t.id, { is_archived: !t.is_archived });
    queryClient.invalidateQueries({ queryKey: ["relationshipTypes"] });
    toast.success(t.is_archived ? "Restored" : "Archived");
  };

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    setSaving(true);
    try {
      await base44.entities.RelationshipType.create({
        label: newLabel.trim(),
        color: newColor,
        is_archived: false,
        is_default: false,
        order: types.length,
      });
      queryClient.invalidateQueries({ queryKey: ["relationshipTypes"] });
      toast.success("Added");
      setNewLabel("");
      setNewColor("#6b7280");
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return null;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Relationship Types</CardTitle>
            <CardDescription>
              {sorted.filter(t => !t.is_archived).length} active type{sorted.filter(t => !t.is_archived).length !== 1 ? "s" : ""}. Hover a row to edit or archive.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* List */}
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {sorted.map(t => (
            <TypeRow
              key={t.id}
              type={t}
              onUpdate={handleUpdate}
              onToggleArchive={handleToggleArchive}
            />
          ))}
        </div>

        {/* Add form */}
        {adding ? (
          <div className="flex items-center gap-2 p-2 rounded-lg border border-primary/30 bg-primary/5 mt-2">
            <input
              type="color"
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-border flex-shrink-0 p-0.5 bg-background"
              title="Pick color"
            />
            <Input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewLabel(""); } }}
              placeholder="Type name..."
              className="h-7 text-sm flex-1"
              autoFocus
            />
            <button onClick={handleAdd} disabled={saving || !newLabel.trim()} className="text-green-500 hover:text-green-600 disabled:opacity-40 flex-shrink-0">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => { setAdding(false); setNewLabel(""); }} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="w-full gap-1.5 mt-1">
            <Plus className="w-3 h-3" /> Add Relationship Type
          </Button>
        )}
      </CardContent>
    </Card>
  );
}