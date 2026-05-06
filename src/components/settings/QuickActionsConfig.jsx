import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronUp, ChevronDown, ChevronRight, Trash2, Plus, Check, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";

const CHECKIN_SECTIONS = [
  { id: "feeling", label: "Feeling / Emotions" },
  { id: "fronting", label: "Fronting" },
  { id: "activity", label: "Activity" },
  { id: "symptoms", label: "Symptoms / Habits" },
  { id: "diary", label: "Diary" },
  { id: "note", label: "Note" },
  { id: "location", label: "Location" },
];

function blankForm() {
  return { label: "", type: "open_checkin_section", emoji: null, config: {} };
}

function ActivityCategoryPicker({ categories, selectedId, onChange }) {
  const [expandedId, setExpandedId] = useState(null);

  const roots = useMemo(
    () => [...categories.filter((c) => !c.parent_category_id)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [categories]
  );
  const childrenOf = useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      if (c.parent_category_id) {
        (map[c.parent_category_id] ??= []).push(c);
      }
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    return map;
  }, [categories]);

  const selectedCat = categories.find((c) => c.id === selectedId);

  if (categories.length === 0) {
    return <p className="text-xs text-muted-foreground mt-1">No activity categories yet. Add them via Check-In → Activity section.</p>;
  }

  return (
    <div className="space-y-1">
      {selectedCat && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-xs font-medium text-primary mb-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: selectedCat.color || "currentColor" }} />
          {selectedCat.name}
          <button onClick={() => onChange("")} className="ml-auto text-primary/60 hover:text-primary">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40 divide-y divide-border/30">
        {roots.map((root) => {
          const subs = childrenOf[root.id] || [];
          const isExpanded = expandedId === root.id;
          const isSelected = selectedId === root.id;
          return (
            <div key={root.id}>
              <div
                className={`flex items-center text-sm transition-colors ${
                  isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/40 text-foreground"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onChange(root.id)}
                  className="flex-1 flex items-center gap-2 px-3 py-2 text-left"
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: root.color || "#888" }} />
                  <span className="flex-1">{root.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                </button>
                {subs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : root.id)}
                    className="px-2 py-2 text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </button>
                )}
              </div>
              {isExpanded && subs.map((sub) => {
                const isSubSelected = selectedId === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => onChange(sub.id)}
                    className={`w-full flex items-center gap-2 pl-8 pr-3 py-1.5 text-xs transition-colors ${
                      isSubSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sub.color || root.color || "#888" }} />
                    <span className="flex-1 text-left">{sub.name}</span>
                    {isSubSelected && <Check className="w-3 h-3 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActionForm({ initialData, alters, symptoms, activityCategories, customEmotions, onSave, onCancel, terms }) {
  const [data, setData] = useState(initialData || blankForm());

  const actionTypes = [
    { id: "open_checkin_section", label: "Open Check-In at a specific section" },
    { id: "open_set_front", label: `Open Set ${terms.Front}ers modal` },
    { id: "set_front_alter", label: `Set a specific ${terms.alter} to ${terms.front}` },
    { id: "log_activity", label: "Log an activity" },
    { id: "log_symptom", label: "Log a symptom or habit" },
    { id: "log_emotion", label: "Log an emotion" },
  ];

  const activeAlters = alters.filter((a) => !a.is_archived);
  const activeSymptoms = symptoms.filter((s) => !s.is_archived);
  const sortedCategories = [...activityCategories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const setType = (type) => {
    setData((d) => ({ ...d, type, config: {} }));
  };

  const setConfig = (key, value) => {
    setData((d) => ({ ...d, config: { ...d.config, [key]: value } }));
  };

  const derivedLabel = () => {
    if (data.type === "set_front_alter") {
      const a = activeAlters.find((a) => a.id === data.config?.alter_id);
      return a?.name || "Set fronter";
    }
    if (data.type === "log_activity") {
      const c = activityCategories.find((c) => c.id === data.config?.category_id);
      return c?.name || "Activity";
    }
    if (data.type === "open_checkin_section") {
      const s = CHECKIN_SECTIONS.find((s) => s.id === data.config?.section);
      return s?.label || "Check-In section";
    }
    if (data.type === "log_symptom") {
      const s = activeSymptoms.find((s) => s.id === data.config?.symptom_id);
      return s?.label || "Symptom";
    }
    if (data.type === "log_emotion") return data.config?.emotion_label || "Emotion";
    if (data.type === "open_set_front") return `Set ${terms.Front}ers`;
    return data.type;
  };

  const handleSave = () => {
    if (data.type === "set_front_alter" && !data.config?.alter_id) { toast.error(`Choose an ${terms.alter}`); return; }
    if (data.type === "log_activity" && !data.config?.category_id) { toast.error("Choose an activity category"); return; }
    if (data.type === "open_checkin_section" && !data.config?.section) { toast.error("Choose a section"); return; }
    if (data.type === "log_symptom" && !data.config?.symptom_id) { toast.error("Choose a symptom"); return; }
    if (data.type === "log_emotion" && !data.config?.emotion_label?.trim()) { toast.error("Enter an emotion"); return; }
    onSave({ ...data, label: derivedLabel(), emoji: null });
  };

  return (
    <div className="space-y-3 p-3 bg-muted/20 rounded-xl border border-border/40">
      {/* Action type */}
      <div>
        <Label className="text-xs font-medium mb-1 block">Action type</Label>
        <select
          value={data.type}
          onChange={(e) => setType(e.target.value)}
          className="w-full h-9 px-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {actionTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Type-specific config */}
      {data.type === "set_front_alter" && (
        <div>
          <Label className="text-xs font-medium mb-1 block">Which {terms.alter}?</Label>
          <select
            value={data.config?.alter_id || ""}
            onChange={(e) => setConfig("alter_id", e.target.value)}
            className="w-full h-9 px-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Select an {terms.alter}…</option>
            {activeAlters.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {data.type === "open_checkin_section" && (
        <div>
          <Label className="text-xs font-medium mb-1 block">Which section?</Label>
          <select
            value={data.config?.section || ""}
            onChange={(e) => setConfig("section", e.target.value)}
            className="w-full h-9 px-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Select a section…</option>
            {CHECKIN_SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      {data.type === "log_activity" && (
        <div className="space-y-2">
          <div>
            <Label className="text-xs font-medium mb-1 block">Activity category</Label>
            <ActivityCategoryPicker
              categories={sortedCategories}
              selectedId={data.config?.category_id || ""}
              onChange={(id) => setConfig("category_id", id || undefined)}
            />
          </div>
          <div>
            <Label className="text-xs font-medium mb-1 block">Duration (minutes, optional)</Label>
            <Input
              type="number"
              value={data.config?.duration_minutes || ""}
              onChange={(e) => setConfig("duration_minutes", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="e.g. 15"
              className="h-8 text-sm"
              min="1"
            />
          </div>
        </div>
      )}

      {data.type === "log_symptom" && (
        <div>
          <Label className="text-xs font-medium mb-2 block">Symptom / habit</Label>
          {activeSymptoms.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No symptoms defined yet. Add them via Check-In → Symptoms section.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {activeSymptoms.map((s) => {
                const color = s.color || "#8B5CF6";
                const isSelected = data.config?.symptom_id === s.id;
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all"
                    style={{
                      borderColor: isSelected ? color : "hsl(var(--border))",
                      backgroundColor: isSelected ? `${color}15` : "hsl(var(--card))",
                    }}
                  >
                    <span className="flex-1 text-sm font-medium">{s.label}</span>
                    <button
                      type="button"
                      onClick={() => setConfig("symptom_id", isSelected ? undefined : s.id)}
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all border"
                      style={{
                        borderColor: isSelected ? color : "hsl(var(--border))",
                        backgroundColor: isSelected ? color : "transparent",
                        color: isSelected ? "#fff" : color,
                      }}
                    >
                      {isSelected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {data.type === "log_emotion" && (
        <div className="space-y-2">
          <div>
            <Label className="text-xs font-medium mb-1 block">Emotion</Label>
            {customEmotions.length > 0 ? (
              <select
                value={data.config?.emotion_label || ""}
                onChange={(e) => setConfig("emotion_label", e.target.value)}
                className="w-full h-9 px-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Select an emotion…</option>
                {customEmotions.map((e) => (
                  <option key={e.id} value={e.label}>{e.label}</option>
                ))}
              </select>
            ) : (
              <Input
                value={data.config?.emotion_label || ""}
                onChange={(e) => setConfig("emotion_label", e.target.value)}
                placeholder="e.g. Happy, Anxious, Calm…"
                className="h-8 text-sm"
              />
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {customEmotions.length > 0
                ? "Select from your custom emotions, or add more via Check-In → Feeling section."
                : "No custom emotions yet — type any emotion label, or add custom ones via Check-In → Feeling section."}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} className="gap-1">
          <Check className="w-3.5 h-3.5" /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="gap-1 text-muted-foreground">
          <X className="w-3.5 h-3.5" /> Cancel
        </Button>
      </div>
    </div>
  );
}

export default function QuickActionsConfig() {
  const queryClient = useQueryClient();
  const terms = useTerms();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);

  const { data: quickActions = [] } = useQuery({
    queryKey: ["quickActions"],
    queryFn: () => base44.entities.QuickAction.list("order"),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => base44.entities.CustomEmotion.list(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["quickActions"] });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.QuickAction.create(data),
    onSuccess: () => { invalidate(); setAdding(false); toast.success("Quick action added"); },
    onError: () => toast.error("Failed to save"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.QuickAction.update(id, data),
    onSuccess: () => { invalidate(); setEditId(null); toast.success("Updated"); },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.QuickAction.delete(id),
    onSuccess: () => { invalidate(); toast.success("Removed"); },
    onError: () => toast.error("Failed to remove"),
  });

  const sorted = [...quickActions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const moveAction = async (index, dir) => {
    const target = sorted[index];
    const swap = sorted[index + dir];
    if (!swap) return;
    await Promise.all([
      base44.entities.QuickAction.update(target.id, { order: swap.order ?? index + dir }),
      base44.entities.QuickAction.update(swap.id, { order: target.order ?? index }),
    ]);
    invalidate();
  };

  const handleAdd = (formData) => {
    createMut.mutate({
      label: formData.label,
      type: formData.type,
      emoji: null,
      config: formData.config || {},
      order: sorted.length,
    });
  };

  const handleEdit = (formData) => {
    updateMut.mutate({
      id: editId,
      data: {
        label: formData.label,
        type: formData.type,
        emoji: null,
        config: formData.config || {},
      },
    });
  };

  const typeLabel = (type) => ({
    open_checkin: "Open full Check-In",  // kept for any existing saved actions
    open_checkin_section: "Open at section",
    set_front_alter: `Set ${terms.alter} to ${terms.front}`,
    log_activity: "Log activity",
    log_symptom: "Log symptom",
    log_emotion: "Log emotion",
    open_set_front: `Open Set ${terms.Front}ers`,
  }[type] || type);

  return (
    <div data-tour="settings-quick-actions" className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Quick Actions</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hold the Quick Check-In button for 1.5 seconds to pop these up.
          </p>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        )}
      </div>

      {adding && (
        <ActionForm
          alters={alters}
          symptoms={symptoms}
          activityCategories={activityCategories}
          customEmotions={customEmotions}
          terms={terms}
          onSave={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {sorted.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground italic px-1">
          No quick actions yet. Add some to speed up your logging workflow.
        </p>
      )}

      <div className="space-y-1.5">
        {sorted.map((action, i) => (
          <div key={action.id}>
            {editId === action.id ? (
              <ActionForm
                initialData={{
                  label: action.label,
                  type: action.type,
                  emoji: action.emoji || "",
                  config: action.config || {},
                }}
                alters={alters}
                symptoms={symptoms}
                activityCategories={activityCategories}
                customEmotions={customEmotions}
                terms={terms}
                onSave={handleEdit}
                onCancel={() => setEditId(null)}
              />
            ) : (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/30 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{typeLabel(action.type)}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => moveAction(i, -1)}
                    disabled={i === 0}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveAction(i, 1)}
                    disabled={i === sorted.length - 1}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setEditId(action.id)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteMut.mutate(action.id)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
