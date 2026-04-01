import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X, Check, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function InfoTab({ alter, systemFields }) {
  const queryClient = useQueryClient();
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editingAlterIdx, setEditingAlterIdx] = useState(null);
  const [newAlterField, setNewAlterField] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const systemSettings = settingsList[0] || null;
  const hiddenFieldIds = systemSettings?.hidden_field_ids || [];

  const customFieldValues = alter.custom_fields || {};
  const alterSpecificFields = alter.alter_custom_fields || [];

  const isVisible = (fieldId) => !hiddenFieldIds.includes(fieldId);

  const toggleFieldVisibility = async (fieldId) => {
    if (!systemSettings) return;
    const updated = isVisible(fieldId)
      ? [...hiddenFieldIds, fieldId]
      : hiddenFieldIds.filter(id => id !== fieldId);
    await base44.entities.SystemSettings.update(systemSettings.id, {
      hidden_field_ids: updated,
    });
    queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
  };

  const startEditSystem = (field) => {
    setEditingFieldId(field.id);
    setEditValue(customFieldValues[field.id] || "");
  };

  const saveSystemField = async (fieldId) => {
    setSaving(true);
    await base44.entities.Alter.update(alter.id, {
      custom_fields: { ...customFieldValues, [fieldId]: editValue },
    });
    queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
    setEditingFieldId(null);
    setSaving(false);
  };

  const startEditAlter = (idx) => {
    setEditingAlterIdx(idx);
    setEditValue(alterSpecificFields[idx]?.value || "");
  };

  const saveAlterField = async (idx) => {
    setSaving(true);
    const updated = [...alterSpecificFields];
    updated[idx] = { ...updated[idx], value: editValue };
    await base44.entities.Alter.update(alter.id, { alter_custom_fields: updated });
    queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
    setEditingAlterIdx(null);
    setSaving(false);
  };

  const deleteAlterField = async (idx) => {
    const updated = alterSpecificFields.filter((_, i) => i !== idx);
    await base44.entities.Alter.update(alter.id, { alter_custom_fields: updated });
    queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
  };

  const saveNewAlterField = async () => {
    if (!newAlterField?.name?.trim()) return;
    setSaving(true);
    const updated = [...alterSpecificFields, { name: newAlterField.name.trim(), value: newAlterField.value || "" }];
    await base44.entities.Alter.update(alter.id, { alter_custom_fields: updated });
    queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
    setNewAlterField(null);
    setSaving(false);
  };

  const hasAnyData =
    systemFields.some((f) => customFieldValues[f.id]) ||
    alterSpecificFields.length > 0;

  return (
    <div className="space-y-6">
      {systemFields.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">System Fields</p>
          {systemFields.map((field) => {
            const visible = isVisible(field.id);
            return (
              <div key={field.id} className={`rounded-xl border p-3 transition-all ${visible ? "border-border/50 bg-muted/10" : "border-border/30 bg-muted/5 opacity-60"}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">{field.name}</p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleFieldVisibility(field.id)}
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      title={visible ? "Hide from profile" : "Show on profile"}
                    >
                      {visible
                        ? <Eye className="w-3.5 h-3.5 text-primary/70" />
                        : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    {editingFieldId !== field.id && (
                      <button onClick={() => startEditSystem(field)} className="text-muted-foreground hover:text-foreground p-0.5">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {editingFieldId === field.id ? (
                  <div className="flex gap-2 mt-1">
                    {field.field_type === "text" ? (
                      <Textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 text-sm min-h-[60px]"
                        autoFocus
                      />
                    ) : field.field_type === "boolean" ? (
                      <select
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                        autoFocus
                      >
                        <option value="">Select...</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <Input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 text-sm"
                        autoFocus
                      />
                    )}
                    <div className="flex flex-col gap-1">
                      <Button size="icon" className="h-7 w-7 bg-primary hover:bg-primary/90" onClick={() => saveSystemField(field.id)} disabled={saving}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingFieldId(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground min-h-[1.25rem]">
                    {field.field_type === "boolean" && customFieldValues[field.id]
                      ? (customFieldValues[field.id] === "true" || customFieldValues[field.id] === true ? "Yes" : "No")
                      : (customFieldValues[field.id] || <span className="text-muted-foreground/50 italic">Not filled</span>)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Alter-specific fields */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Alter-Specific Fields</p>
        {alterSpecificFields.length === 0 && !newAlterField && (
          <p className="text-sm text-muted-foreground/60 italic py-2">No alter-specific fields yet.</p>
        )}
        {alterSpecificFields.map((field, idx) => (
          <div key={idx} className="rounded-xl border border-border/50 bg-muted/10 p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">{field.name}</p>
              <div className="flex gap-1">
                {editingAlterIdx !== idx && (
                  <>
                    <button onClick={() => startEditAlter(idx)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteAlterField(idx)} className="text-muted-foreground hover:text-destructive ml-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
            {editingAlterIdx === idx ? (
              <div className="flex gap-2 mt-1">
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="flex-1 text-sm min-h-[60px]"
                  autoFocus
                />
                <div className="flex flex-col gap-1">
                  <Button size="icon" className="h-7 w-7 bg-primary hover:bg-primary/90" onClick={() => saveAlterField(idx)} disabled={saving}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingAlterIdx(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground min-h-[1.25rem]">
                {field.value || <span className="text-muted-foreground/50 italic">Not filled</span>}
              </p>
            )}
          </div>
        ))}

        {newAlterField ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
            <Input
              placeholder="Field name..."
              value={newAlterField.name}
              onChange={(e) => setNewAlterField({ ...newAlterField, name: e.target.value })}
              className="text-sm"
              autoFocus
            />
            <Textarea
              placeholder="Value..."
              value={newAlterField.value}
              onChange={(e) => setNewAlterField({ ...newAlterField, value: e.target.value })}
              className="text-sm min-h-[60px]"
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setNewAlterField(null)}>Cancel</Button>
              <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={saveNewAlterField} disabled={saving || !newAlterField.name?.trim()}>
                Add Field
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5 w-full" onClick={() => setNewAlterField({ name: "", value: "" })}>
            <Plus className="w-4 h-4" />
            Add alter-specific field
          </Button>
        )}
      </div>

      {!hasAnyData && systemFields.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No fields info was filled out for this member
        </div>
      )}
    </div>
  );
}