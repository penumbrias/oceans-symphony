import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Archive, RotateCcw, Check, X, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_RELATIONSHIP_TYPES,
  flattenTypeTree,
  indexTypesById,
  wouldCreateTypeCycle,
  MAX_TYPE_DEPTH,
} from "@/lib/relationshipTypes";
import ColorPickerModal from "@/components/shared/ColorPickerModal";

// A simple parent <select> that greys out / disables options which would
// create a cycle (a type can't be its own ancestor or descendant) and the
// type itself. The catalogue is small, so a native select is fine here.
function ParentSelect({ value, allTypes, excludeId, onChange }) {
  const byId = indexTypesById(allTypes);
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-7 px-2 rounded-md border border-border bg-background text-xs max-w-[9rem]"
      title="Parent type (for grouping)"
    >
      <option value="">No parent (top level)</option>
      {allTypes
        .filter((t) => t.id != null && t.id !== excludeId)
        .map((t) => {
          // Disallow choosing an option that would make excludeId its own
          // ancestor/descendant. When adding (excludeId null) nothing cycles.
          const cyclic = excludeId
            ? wouldCreateTypeCycle(excludeId, t.id, byId)
            : false;
          return (
            <option key={t.id} value={t.id} disabled={cyclic}>
              {t.label}{cyclic ? " (would loop)" : ""}
            </option>
          );
        })}
    </select>
  );
}

function TypeRow({ type, depth = 0, allTypes, onUpdate, onToggleArchive }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(type.label);
  const [color, setColor] = useState(type.color || "#6b7280");
  const [parentId, setParentId] = useState(type.parent_id || null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const indent = Math.min(depth, MAX_TYPE_DEPTH) * 16;

  const handleSave = () => {
    if (!label.trim()) return;
    onUpdate(type.id, { label: label.trim(), color, parent_id: parentId || null });
    setEditing(false);
  };

  const handleCancel = () => {
    setLabel(type.label);
    setColor(type.color || "#6b7280");
    setParentId(type.parent_id || null);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg border border-primary/30 bg-primary/5 flex-wrap"
        style={{ marginLeft: indent }}>
        <button
          type="button"
          onClick={() => setShowColorPicker(true)}
          className="w-7 h-7 rounded-lg border-2 border-border hover:border-primary/50 flex-shrink-0 shadow-sm transition-colors"
          style={{ backgroundColor: color }}
          title="Pick color"
        />
        {showColorPicker && (
          <ColorPickerModal
            color={color}
            label="Relationship type color"
            onSave={c => setColor(c)}
            onClose={() => setShowColorPicker(false)}
          />
        )}
        <Input
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
          className="h-7 text-sm flex-1 min-w-[6rem]"
          autoFocus
        />
        <ParentSelect
          value={parentId}
          allTypes={allTypes}
          excludeId={type.id}
          onChange={setParentId}
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
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/10 group transition-opacity ${type.is_archived ? "opacity-40" : ""}`}
      style={{ marginLeft: indent }}>
      {depth > 0 && (
        <span className="text-muted-foreground/50 text-xs flex-shrink-0 select-none" aria-hidden>└</span>
      )}
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
  const [newParentId, setNewParentId] = useState(null);
  const [showNewColorPicker, setShowNewColorPicker] = useState(false);
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

  // Indented, depth-tagged, cycle-safe render order. Active types only at the
  // top; archived types listed flat below so an archived parent never hides
  // its (active) children — they re-root sensibly in the active tree.
  const activeTypes = types.filter(t => !t.is_archived);
  const archivedTypes = [...types.filter(t => t.is_archived)]
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const tree = flattenTypeTree(activeTypes);

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
        parent_id: newParentId || null,
        order: types.length,
      });
      queryClient.invalidateQueries({ queryKey: ["relationshipTypes"] });
      toast.success("Added");
      setNewLabel("");
      setNewColor("#6b7280");
      setNewParentId(null);
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
              {activeTypes.length} active type{activeTypes.length !== 1 ? "s" : ""}. Nest types under a parent to group them. Hover a row to edit or archive.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {tree.map(t => (
            <TypeRow
              key={t.id}
              type={t}
              depth={t._depth}
              allTypes={activeTypes}
              onUpdate={handleUpdate}
              onToggleArchive={handleToggleArchive}
            />
          ))}

          {archivedTypes.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground/70 pt-2 pb-0.5">Archived</p>
              {archivedTypes.map(t => (
                <TypeRow
                  key={t.id}
                  type={t}
                  depth={0}
                  allTypes={activeTypes}
                  onUpdate={handleUpdate}
                  onToggleArchive={handleToggleArchive}
                />
              ))}
            </>
          )}
        </div>

        {adding ? (
          <div className="flex items-center gap-2 p-2 rounded-lg border border-primary/30 bg-primary/5 mt-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowNewColorPicker(true)}
              className="w-7 h-7 rounded-lg border-2 border-border hover:border-primary/50 flex-shrink-0 shadow-sm transition-colors"
              style={{ backgroundColor: newColor }}
              title="Pick color"
            />
            {showNewColorPicker && (
              <ColorPickerModal
                color={newColor}
                label="Relationship type color"
                onSave={c => setNewColor(c)}
                onClose={() => setShowNewColorPicker(false)}
              />
            )}
            <Input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewLabel(""); setNewParentId(null); } }}
              placeholder="Type name..."
              className="h-7 text-sm flex-1 min-w-[6rem]"
              autoFocus
            />
            <ParentSelect
              value={newParentId}
              allTypes={activeTypes}
              excludeId={null}
              onChange={setNewParentId}
            />
            <button onClick={handleAdd} disabled={saving || !newLabel.trim()} className="text-green-500 hover:text-green-600 disabled:opacity-40 flex-shrink-0">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => { setAdding(false); setNewLabel(""); setNewParentId(null); }} className="text-muted-foreground hover:text-foreground flex-shrink-0">
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
