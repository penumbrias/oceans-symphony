import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, GripVertical, ChevronDown, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { DEFAULT_GROUPS } from "@/components/diary/DiarySection";

function FieldItem({ field, groupId, index, total, onEdit, onDelete, onToggle, onIsPositiveToggle, onMoveUp, onMoveDown }) {
  return (
    <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
      <div className="flex flex-col gap-0.5">
        <button onClick={onMoveUp} disabled={index === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
          <ChevronDown className="w-3 h-3 rotate-180" />
        </button>
        <button onClick={onMoveDown} disabled={index === total - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{field.label}</p>
        <p className="text-xs text-muted-foreground capitalize">{field.type}</p>
      </div>
      {field.type === "rating" && (
        <button
          onClick={() => onIsPositiveToggle(field.id)}
          title="Toggle: higher values are better"
          className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 transition-colors border ${
            field.is_positive
              ? "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800"
              : "text-muted-foreground bg-muted/50 border-border/50 hover:border-border"
          }`}
        >
          {field.is_positive ? "↑ good" : "↑ bad"}
        </button>
      )}
      <Switch checked={field.enabled !== false} onCheckedChange={() => onToggle(field.id)} />
      <button onClick={() => onDelete(field.id)} className="p-1 hover:bg-destructive/10 rounded">
        <Trash2 className="w-3 h-3 text-destructive" />
      </button>
    </div>
  );
}

function SortableGroupItem({ group, allGroups, onGroupEdit, onGroupDelete, onGroupToggle, onFieldEdit, onFieldDelete, onFieldToggle, onFieldReorder }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
  });

  const fieldSensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [expandedFields, setExpandedFields] = useState(true);
  const [editingField, setEditingField] = useState(null);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState("rating");
  const [newFieldMax, setNewFieldMax] = useState(5);
  const [newFieldIsPositive, setNewFieldIsPositive] = useState(false);


  const sortedFields = [...(group.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0));

  const handleAddField = () => {
    if (!newFieldLabel.trim()) return;
    const newField = {
      id: `${group.id}-field-${Date.now()}`,
      data_key: `${group.id}_${newFieldLabel.toLowerCase().replace(/\s+/g, "_")}`,
      label: newFieldLabel,
      type: newFieldType,
      max: newFieldType === "rating" ? newFieldMax : undefined,
      is_positive: newFieldIsPositive,
      enabled: true,
      order: (sortedFields[sortedFields.length - 1]?.order || 0) + 1,
    };
    onFieldEdit(group.id, newField, true);
    setNewFieldLabel("");
    setNewFieldType("rating");
    setNewFieldMax(5);
    setNewFieldIsPositive(false);
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-card border border-border/50 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/20">
        <button {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground">
          <GripVertical className="w-4 h-4" />
        </button>
        <input
          value={group.label}
          onChange={e => onGroupEdit(group.id, { label: e.target.value })}
          className="flex-1 text-sm font-medium bg-transparent border-none outline-none"
        />
        <Switch checked={group.enabled !== false} onCheckedChange={() => onGroupToggle(group.id)} />
        <button onClick={() => onGroupDelete(group.id)} className="p-1 hover:bg-destructive/10 rounded">
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </button>
        <button onClick={() => setExpandedFields(v => !v)} className="p-1">
          <ChevronDown className={`w-4 h-4 transition-transform ${expandedFields ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expandedFields && (
        <div className="px-4 py-3 space-y-2 border-t border-border/30">
          {sortedFields.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No fields in this group</p>
          ) : (
            <>{sortedFields.map((field, index) => (
              <FieldItem
                key={field.id}
                field={field}
                groupId={group.id}
                index={index}
                total={sortedFields.length}
                onDelete={fid => onFieldDelete(group.id, fid)}
                onToggle={fid => onFieldToggle(group.id, fid)}
                onIsPositiveToggle={fid => {
                  const f = sortedFields.find(x => x.id === fid);
                  if (f) onFieldEdit(group.id, { ...f, is_positive: !f.is_positive }, false);
                }}
                onMoveUp={() => {
                  const newFields = [...sortedFields];
                  [newFields[index - 1], newFields[index]] = [newFields[index], newFields[index - 1]];
                  const reordered = newFields.map((f, i) => ({ ...f, order: i }));
                  onFieldReorder(group.id, reordered);
                }}
                onMoveDown={() => {
                  const newFields = [...sortedFields];
                  [newFields[index], newFields[index + 1]] = [newFields[index + 1], newFields[index]];
                  const reordered = newFields.map((f, i) => ({ ...f, order: i }));
                  onFieldReorder(group.id, reordered);
                }}
              />
            ))}</>
          )}

          <div className="border-t border-border/30 pt-2 space-y-2">
            <p className="text-xs font-medium text-foreground">Add field</p>
            <Input
              placeholder="Label"
              value={newFieldLabel}
              onChange={e => setNewFieldLabel(e.target.value)}
              className="h-8 text-xs"
              onKeyPress={e => e.key === "Enter" && handleAddField()}
            />
            <select
              value={newFieldType}
              onChange={e => setNewFieldType(e.target.value)}
              className="w-full h-8 px-2 text-xs border border-border rounded bg-background"
            >
              <option value="rating">Rating</option>
              <option value="boolean">Boolean</option>
              <option value="number">Number</option>
              <option value="text">Text</option>
            </select>
            {newFieldType === "rating" && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Max:</label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={newFieldMax}
                  onChange={e => setNewFieldMax(parseInt(e.target.value))}
                  className="h-8 text-xs w-16"
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={newFieldIsPositive}
                onChange={e => setNewFieldIsPositive(e.target.checked)}
                className="w-3 h-3 accent-primary"
              />
              <span className="text-muted-foreground">Higher values are better</span>
            </label>
            <Button size="sm" onClick={handleAddField} disabled={!newFieldLabel.trim()} className="w-full gap-1">
              <Plus className="w-3 h-3" /> Add field
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DiaryTemplateManager() {
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const { data: templateData } = useQuery({
    queryKey: ["diaryTemplate"],
    queryFn: () => base44.entities.DiaryTemplate.list(),
  });

  const [groups, setGroups] = useState(() => {
    if (templateData?.[0]?.groups) return templateData[0].groups;
    return structuredClone(DEFAULT_GROUPS);
  });

  React.useEffect(() => {
    if (templateData?.[0]?.groups) {
      setGroups(templateData[0].groups);
    }
  }, [templateData]);

  const handleGroupEdit = (groupId, fields) => {
    setGroups(prev =>
      prev.map(g => (g.id === groupId ? { ...g, ...fields } : g))
    );
  };

  const handleGroupDelete = (groupId) => {
    if (!confirm("Delete this group?")) return;
    setGroups(prev => prev.filter(g => g.id !== groupId));
  };

  const handleGroupToggle = (groupId) => {
    setGroups(prev =>
      prev.map(g => (g.id === groupId ? { ...g, enabled: !g.enabled } : g))
    );
  };

  const handleFieldEdit = (groupId, field, isNew) => {
    setGroups(prev =>
      prev.map(g => {
        if (g.id !== groupId) return g;
        if (isNew) return { ...g, fields: [...(g.fields || []), field] };
        return { ...g, fields: (g.fields || []).map(f => (f.id === field.id ? field : f)) };
      })
    );
  };

  const handleFieldDelete = (groupId, fieldId) => {
    setGroups(prev =>
      prev.map(g =>
        g.id === groupId ? { ...g, fields: (g.fields || []).filter(f => f.id !== fieldId) } : g
      )
    );
  };

  const handleFieldToggle = (groupId, fieldId) => {
    setGroups(prev =>
      prev.map(g =>
        g.id === groupId
          ? {
              ...g,
              fields: (g.fields || []).map(f => (f.id === fieldId ? { ...f, enabled: !f.enabled } : f)),
            }
          : g
      )
    );
  };

  const handleAddGroup = () => {
    const newGroup = {
      id: `group-${Date.now()}`,
      label: "New Group",
      order: Math.max(...groups.map(g => g.order || 0), 0) + 1,
      enabled: true,
      fields: [],
    };
    setGroups(prev => [...prev, newGroup]);
  };

  const handleSave = async () => {
    const templateId = templateData?.[0]?.id;
    try {
      if (templateId) {
        await base44.entities.DiaryTemplate.update(templateId, { groups });
      } else {
        await base44.entities.DiaryTemplate.create({ groups });
      }
      queryClient.invalidateQueries({ queryKey: ["diaryTemplate"] });
      toast.success("Diary template saved");
    } catch (error) {
      toast.error("Failed to save");
    }
  };

  const handleReset = () => {
    if (!confirm("Reset to defaults? This will overwrite your current configuration.")) return;
    setGroups(structuredClone(DEFAULT_GROUPS));
  };

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => (a.order || 0) - (b.order || 0)), [groups]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Diary Card Fields</p>
          <p className="text-xs text-muted-foreground">Customize groups and fields shown in check-ins</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleReset}>
          Reset defaults
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter}>
        <SortableContext items={sortedGroups.map(g => g.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {sortedGroups.map(group => (
              <SortableGroupItem
                key={group.id}
                group={group}
                allGroups={sortedGroups}
                onGroupEdit={handleGroupEdit}
                onGroupDelete={handleGroupDelete}
                onGroupToggle={handleGroupToggle}
                onFieldEdit={handleFieldEdit}
                onFieldDelete={handleFieldDelete}
                onFieldToggle={handleFieldToggle}
                onFieldReorder={(groupId, newFields) =>
                  setGroups(prev => prev.map(g => g.id === groupId ? { ...g, fields: newFields } : g))
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button size="sm" onClick={handleAddGroup} className="w-full gap-1">
        <Plus className="w-3 h-3" /> Add group
      </Button>

      <div className="flex gap-2 pt-4 border-t border-border/30">
        <Button className="flex-1" onClick={handleSave}>
          <Check className="w-3.5 h-3.5 mr-1" /> Save template
        </Button>
      </div>
    </div>
  );
}