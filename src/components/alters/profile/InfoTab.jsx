import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X, Check, Eye, EyeOff, ChevronUp, ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { PRESET_ANSWER_LABELS } from "@/lib/unblendQuestions";
import MarkdownText from "@/components/shared/MarkdownText";
import WysiwygEditor from "@/components/shared/WysiwygEditor";

const FIELD_ORDER_KEY = "_field_order";

export default function InfoTab({ alter, systemFields }) {
  const terms = useTerms();
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
  // alter_custom_fields is written by two unrelated features with
  // incompatible shapes: this tab's per-alter "ad-hoc one-off
  // fields" UI uses an array of { name, value } records, while
  // Get to know me / Help me unblend write an object map keyed by
  // CustomField id. If we land on the object shape, treat it as
  // empty here so the page doesn't crash — the data stays intact
  // for the other features and just doesn't surface in the per-
  // alter ad-hoc list.
  const alterSpecificFields = Array.isArray(alter.alter_custom_fields)
    ? alter.alter_custom_fields
    : [];

  // Per-alter system field order — falls back to global order
  const perAlterFieldOrder = customFieldValues[FIELD_ORDER_KEY] || null;
  const hasCustomOrder = !!perAlterFieldOrder;

  const orderedSystemFields = useMemo(() => {
    if (!perAlterFieldOrder) return systemFields;
    const orderMap = Object.fromEntries(perAlterFieldOrder.map((id, i) => [id, i]));
    return [...systemFields].sort((a, b) => {
      const ai = orderMap[a.id] ?? 9999;
      const bi = orderMap[b.id] ?? 9999;
      return ai - bi;
    });
  }, [systemFields, perAlterFieldOrder]);

  const isVisible = (fieldId) => !hiddenFieldIds.includes(fieldId);

  const toggleFieldVisibility = async (fieldId) => {
    if (!systemSettings) return;
    const updated = isVisible(fieldId)
      ? [...hiddenFieldIds, fieldId]
      : hiddenFieldIds.filter(id => id !== fieldId);
    await base44.entities.SystemSettings.update(systemSettings.id, { hidden_field_ids: updated });
    queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
  };

  const moveSystemField = async (index, dir) => {
    const swapIndex = index + dir;
    if (swapIndex < 0 || swapIndex >= orderedSystemFields.length) return;
    const newOrder = orderedSystemFields.map(f => f.id);
    [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];
    await base44.entities.Alter.update(alter.id, {
      custom_fields: { ...customFieldValues, [FIELD_ORDER_KEY]: newOrder },
    });
    queryClient.invalidateQueries({ queryKey: ["alters"] });
    queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
  };

  const resetFieldOrder = async () => {
    const cf = { ...customFieldValues };
    delete cf[FIELD_ORDER_KEY];
    await base44.entities.Alter.update(alter.id, { custom_fields: cf });
    queryClient.invalidateQueries({ queryKey: ["alters"] });
    queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
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

  const moveAlterField = async (index, dir) => {
    const swapIndex = index + dir;
    if (swapIndex < 0 || swapIndex >= alterSpecificFields.length) return;
    const updated = [...alterSpecificFields];
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];
    await base44.entities.Alter.update(alter.id, { alter_custom_fields: updated });
    queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
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

  // Preset answers (energy / body-or-head / role-lean / dominant-
  // feeling) come from Get to know me. Stored as comma-separated
  // list-style strings keyed by question id on
  // alter.preset_answers.
  const presetAnswersRaw = (alter?.preset_answers && typeof alter.preset_answers === "object" && !Array.isArray(alter.preset_answers))
    ? alter.preset_answers
    : null;
  const presetAnswerRows = useMemo(() => {
    if (!presetAnswersRaw) return [];
    return Object.entries(presetAnswersRaw)
      .map(([key, raw]) => ({
        key,
        label: PRESET_ANSWER_LABELS[key] || key.replace(/_/g, " "),
        values: typeof raw === "string"
          ? raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
          : [],
      }))
      .filter((row) => row.values.length > 0);
  }, [presetAnswersRaw]);

  const removePresetValue = async (questionKey, valueToRemove) => {
    if (!presetAnswersRaw) return;
    const prev = typeof presetAnswersRaw[questionKey] === "string" ? presetAnswersRaw[questionKey] : "";
    const next = prev.split(/[,;|]/).map((s) => s.trim()).filter(Boolean).filter((v) => v !== valueToRemove);
    const updated = { ...presetAnswersRaw };
    if (next.length === 0) delete updated[questionKey];
    else updated[questionKey] = next.join(", ");
    try {
      await base44.entities.Alter.update(alter.id, { preset_answers: updated });
      queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
    } catch (err) {
      toast.error(err?.message || "Couldn't remove answer");
    }
  };

  const hasAnyData = systemFields.some((f) => customFieldValues[f.id])
    || alterSpecificFields.length > 0
    || presetAnswerRows.length > 0;

  return (
    <div className="space-y-6">
      {presetAnswerRows.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            From Get to know me
          </p>
          <div className="space-y-2">
            {presetAnswerRows.map((row) => (
              <div key={row.key} className="rounded-xl border border-border/40 bg-card px-3 py-2">
                <p className="text-xs text-muted-foreground mb-1.5">{row.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {row.values.map((v) => (
                    <span key={v} className="group inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted/50 text-foreground border border-border/40">
                      {v}
                      <button
                        type="button"
                        onClick={() => removePresetValue(row.key, v)}
                        aria-label={`Remove ${v}`}
                        className="-mr-1 p-0.5 rounded-full text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {systemFields.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{terms.System} Fields</p>
            {hasCustomOrder && (
              <button onClick={resetFieldOrder}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <RotateCcw className="w-3 h-3" /> Reset order
              </button>
            )}
          </div>
          {orderedSystemFields.map((field, index) => {
            const visible = isVisible(field.id);
            return (
              <div key={field.id} className={`rounded-xl border p-3 transition-all ${visible ? "border-border/50 bg-muted/10" : "border-border/30 bg-muted/5 opacity-60"}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <div className="flex flex-col gap-0.5">
                      <button type="button" onClick={() => moveSystemField(index, -1)} disabled={index === 0}
                        className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button type="button" onClick={() => moveSystemField(index, 1)} disabled={index === orderedSystemFields.length - 1}
                        className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">{field.name}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleFieldVisibility(field.id)}
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      title={visible ? "Hide from profile" : "Show on profile"}>
                      {visible ? <Eye className="w-3.5 h-3.5 text-primary/70" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    {editingFieldId !== field.id && (
                      <button onClick={() => startEditSystem(field)} className="text-muted-foreground hover:text-foreground p-0.5">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {editingFieldId === field.id && field.field_type === "richtext" ? (
                  <div className="mt-1 space-y-2">
                    <WysiwygEditor value={editValue} onChange={setEditValue} placeholder="Write…" />
                    <div className="flex justify-end gap-1">
                      <Button size="icon" className="h-7 w-7 bg-primary hover:bg-primary/90"
                        onClick={() => saveSystemField(field.id)} disabled={saving}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingFieldId(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : editingFieldId === field.id ? (
                  <div className="flex gap-2 mt-1">
                    {field.field_type === "text" ? (
                      <Textarea value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 text-sm min-h-[60px]" autoFocus />
                    ) : field.field_type === "list" ? (
                      <div className="flex-1 flex flex-col gap-1">
                        <Textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder="item, item, item"
                          className="text-sm min-h-[44px]"
                          autoFocus
                        />
                        <p className="text-[0.625rem] text-muted-foreground leading-snug">
                          Separate items with commas — each one's stored and matched individually.
                        </p>
                      </div>
                    ) : field.field_type === "boolean" ? (
                      <select value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm" autoFocus>
                        <option value="">Select...</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 text-sm" autoFocus />
                    )}
                    <div className="flex flex-col gap-1">
                      <Button size="icon" className="h-7 w-7 bg-primary hover:bg-primary/90"
                        onClick={() => saveSystemField(field.id)} disabled={saving}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingFieldId(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-foreground min-h-[1.25rem]">
                    {(() => {
                      const value = customFieldValues[field.id];
                      if (!value && value !== false) {
                        return <span className="text-muted-foreground/50 italic">Not filled</span>;
                      }
                      if (field.field_type === "boolean") {
                        return (value === "true" || value === true) ? "Yes" : "No";
                      }
                      if (field.field_type === "list" && typeof value === "string") {
                        const items = value.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
                        if (items.length === 0) return <span className="text-muted-foreground/50 italic">Not filled</span>;
                        return (
                          <div className="flex flex-wrap gap-1">
                            {items.map((item, i) => (
                              <span
                                key={`${item}-${i}`}
                                className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                        );
                      }
                      // text & rich-text fields render as Markdown/HTML
                      // (MarkdownText sanitises raw HTML from the rich
                      // editor); number stays plain.
                      if (field.field_type === "text" || field.field_type === "richtext") {
                        return <MarkdownText>{String(value)}</MarkdownText>;
                      }
                      return <span className="whitespace-pre-wrap break-words">{value}</span>;
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{terms.Alter}-Specific Fields</p>
        {alterSpecificFields.length === 0 && !newAlterField && (
          <p className="text-sm text-muted-foreground/60 italic py-2">No {terms.alter}-specific fields yet.</p>
        )}
        {alterSpecificFields.map((field, idx) => (
          <div key={idx} className="rounded-xl border border-border/50 bg-muted/10 p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <div className="flex flex-col gap-0.5">
                  <button type="button" onClick={() => moveAlterField(idx, -1)} disabled={idx === 0}
                    className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={() => moveAlterField(idx, 1)} disabled={idx === alterSpecificFields.length - 1}
                    className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{field.name}</p>
              </div>
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
                <Textarea value={editValue} onChange={(e) => setEditValue(e.target.value)}
                  className="flex-1 text-sm min-h-[60px]" autoFocus />
                <div className="flex flex-col gap-1">
                  <Button size="icon" className="h-7 w-7 bg-primary hover:bg-primary/90"
                    onClick={() => saveAlterField(idx)} disabled={saving}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingAlterIdx(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              // Alter-specific ad-hoc fields are always free text, so they
              // render as Markdown like text-type system fields.
              <div className="text-sm text-foreground min-h-[1.25rem]">
                {field.value
                  ? <MarkdownText>{String(field.value)}</MarkdownText>
                  : <span className="text-muted-foreground/50 italic">Not filled</span>}
              </div>
            )}
          </div>
        ))}

        {newAlterField ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
            <Input placeholder="Field name..." value={newAlterField.name}
              onChange={(e) => setNewAlterField({ ...newAlterField, name: e.target.value })}
              className="text-sm" autoFocus />
            <Textarea placeholder="Value..." value={newAlterField.value}
              onChange={(e) => setNewAlterField({ ...newAlterField, value: e.target.value })}
              className="text-sm min-h-[60px]" />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setNewAlterField(null)}>Cancel</Button>
              <Button size="sm" className="bg-primary hover:bg-primary/90"
                onClick={saveNewAlterField} disabled={saving || !newAlterField.name?.trim()}>
                Add Field
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5 w-full"
            onClick={() => setNewAlterField({ name: "", value: "" })}>
            <Plus className="w-4 h-4" />
            Add {terms.alter}-specific field
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