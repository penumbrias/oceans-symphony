import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Hash, Type, ToggleLeft, Tags, FileText, MoreVertical, GripVertical, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const TYPE_ICONS = {
  text: Type,
  number: Hash,
  boolean: ToggleLeft,
  list: Tags,
  richtext: FileText,
};

const TYPE_LABELS = {
  text: "Text",
  number: "Number",
  boolean: "Yes/No",
  list: "List",
  richtext: "Rich text",
};

function SortableFieldRow({ field, isEditing, editName, editType, setEditName, setEditType, onStartEdit, onSaveEdit, onCancelEdit, onDelete }) {
  const Icon = TYPE_ICONS[field.field_type] || Type;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style} className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
        <Input
          value={editName}
          onChange={e => setEditName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") onCancelEdit(); }}
          autoFocus
          placeholder="Field name..."
        />
        <div className="flex gap-2 flex-wrap">
          {Object.entries(TYPE_LABELS).map(([key, label]) => {
            const TypeIcon = TYPE_ICONS[key];
            const selected = editType === key;
            return (
              <button key={key} type="button" onClick={() => setEditType(key)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${selected ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-border"}`}>
                <TypeIcon className="w-3 h-3" /> {label}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancelEdit}>Cancel</Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={onSaveEdit} disabled={!editName.trim()}>
            <Check className="w-3.5 h-3.5 mr-1" /> Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-3 py-3 rounded-xl border border-border/50 bg-muted/10">
      <button
        type="button"
        {...attributes}
        {...listeners}
        // touchAction: none lets dnd-kit own the touch gesture so
        // mobile drag doesn't fight with vertical page scroll.
        style={{ touchAction: "none" }}
        aria-label={`Drag to reorder ${field.name}`}
        className="flex-shrink-0 p-1 -m-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{field.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="flex items-center gap-1 text-xs text-muted-foreground border border-border/50 rounded-md px-2 py-0.5">
            <Icon className="w-3 h-3" />
            {TYPE_LABELS[field.field_type] || field.field_type}
          </span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onStartEdit}>
            <Pencil className="w-4 h-4 mr-2" /> Rename / Change type
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="w-4 h-4 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function CustomFieldsManager({ embedded = false } = {}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("text");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("text");

  const { data: fields = [] } = useQuery({
    queryKey: ["customFields"],
    queryFn: () => base44.entities.CustomField.list("order"),
  });

  // Sort defensively — `.list("order")` can interleave rows that share
  // an `order` (or are missing one entirely) in arbitrary order. Fall
  // back to creation date / id so the visible order is stable between
  // renders even when persisted orders collide.
  const sortedFields = useMemo(() => {
    return [...fields].sort((a, b) => {
      const ao = typeof a.order === "number" ? a.order : Number.POSITIVE_INFINITY;
      const bo = typeof b.order === "number" ? b.order : Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      const ac = a.created_date || a.id || "";
      const bc = b.created_date || b.id || "";
      return String(ac).localeCompare(String(bc));
    });
  }, [fields]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const persistOrder = async (nextList) => {
    // Always normalise to 0..N-1 so duplicate / missing `order` values
    // (the root cause of the "arrows stop working past a few rows"
    // bug) self-heal on every reorder. Only writes rows whose order
    // actually changed.
    const writes = [];
    nextList.forEach((f, i) => {
      if (f.order !== i) {
        writes.push(base44.entities.CustomField.update(f.id, { order: i }));
      }
    });
    if (writes.length === 0) return;
    await Promise.all(writes);
    queryClient.invalidateQueries({ queryKey: ["customFields"] });
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedFields.findIndex((f) => f.id === active.id);
    const newIndex = sortedFields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(sortedFields, oldIndex, newIndex);
    // Optimistic write so the UI doesn't jitter while the updates
    // round-trip through IDB.
    queryClient.setQueryData(["customFields"], next.map((f, i) => ({ ...f, order: i })));
    try {
      await persistOrder(next);
    } catch {
      queryClient.invalidateQueries({ queryKey: ["customFields"] });
    }
  };

  const addField = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    await base44.entities.CustomField.create({
      name: newName.trim(),
      field_type: newType,
      order: sortedFields.length,
    });
    queryClient.invalidateQueries({ queryKey: ["customFields"] });
    setNewName("");
    setNewType("text");
    setAdding(false);
    setSaving(false);
  };

  const deleteField = async (field) => {
    if (!window.confirm(`Delete custom field "${field.name}"? Per-alter values for this field will also be removed. This cannot be undone.`)) return;
    await base44.entities.CustomField.delete(field.id);
    queryClient.invalidateQueries({ queryKey: ["customFields"] });
  };

  const startEdit = (field) => {
    setEditingId(field.id);
    setEditName(field.name);
    setEditType(field.field_type);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditType("text");
  };

  const saveEdit = async () => {
    if (!editName.trim()) return;
    await base44.entities.CustomField.update(editingId, {
      name: editName.trim(),
      field_type: editType,
    });
    queryClient.invalidateQueries({ queryKey: ["customFields"] });
    cancelEdit();
  };

  const body = (
    <div className="space-y-3">
        {sortedFields.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground italic py-2">No custom fields defined yet.</p>
        )}

        {/* Once a user has more than a handful of custom fields, the
            uncapped list pushes everything else on the Settings page
            way down. Cap the visible area at ~6 rows tall and let
            longer lists scroll inside the card. */}
        <div
          className={sortedFields.length > 6 ? "max-h-[24rem] overflow-y-auto pr-1 -mr-1 space-y-3" : "space-y-3"}
          data-scrollable={sortedFields.length > 6 || undefined}
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortedFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
              {sortedFields.map((field) => (
                <SortableFieldRow
                  key={field.id}
                  field={field}
                  isEditing={editingId === field.id}
                  editName={editName}
                  editType={editType}
                  setEditName={setEditName}
                  setEditType={setEditType}
                  onStartEdit={() => startEdit(field)}
                  onSaveEdit={saveEdit}
                  onCancelEdit={cancelEdit}
                  onDelete={() => deleteField(field)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {adding ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
            <Input
              placeholder="Field name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addField()}
              autoFocus
              className="text-sm"
            />
            <div className="flex gap-2">
              {["text", "number", "boolean", "list"].map((t) => {
                const Icon = TYPE_ICONS[t];
                return (
                  <button key={t} onClick={() => setNewType(t)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      newType === t ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-border"
                    }`}>
                    <Icon className="w-3.5 h-3.5" />
                    {TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(""); }}>Cancel</Button>
              <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={addField} disabled={saving || !newName.trim()}>
                Add Field
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5 w-full" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" /> Add Custom Field
          </Button>
        )}
    </div>
  );

  if (embedded) return body;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Hash className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Custom Fields</CardTitle>
            <CardDescription>
              Fields that appear on every alter's Info tab. You can fill them in per-alter. Drag the handle to reorder.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
