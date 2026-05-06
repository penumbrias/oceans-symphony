import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronUp, ChevronDown, Trash2, Plus, Check, X, Pencil } from "lucide-react";
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

const DEFAULT_EMOJIS = {
  open_checkin: "💜",
  open_checkin_section: "📍",
  set_front_alter: "👤",
  log_activity: "⚡",
  log_symptom: "🩺",
  log_emotion: "😊",
  open_set_front: "🔄",
};

function blankForm() {
  return { label: "", type: "open_checkin", emoji: "", config: {} };
}

function ActionForm({ initialData, alters, symptoms, activityCategories, customEmotions, onSave, onCancel, terms }) {
  const [data, setData] = useState(initialData || blankForm());

  const actionTypes = [
    { id: "open_checkin", label: "Open full Quick Check-In" },
    { id: "open_checkin_section", label: "Open Check-In at a specific section" },
    { id: "open_set_front", label: `Open Set ${terms.Front}ers modal` },
    { id: "set_front_alter", label: `Set a specific ${terms.alter} to ${terms.front}` },
    { id: "log_activity", label: "Instantly log an activity" },
    { id: "log_symptom", label: "Instantly log a symptom or habit" },
    { id: "log_emotion", label: "Instantly log an emotion" },
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

  const applySuggestion = () => {
    if (data.label.trim()) return;
    let suggestion = "";
    if (data.type === "set_front_alter" && data.config?.alter_id) {
      const a = activeAlters.find((a) => a.id === data.config.alter_id);
      if (a) suggestion = `Set ${terms.front}: ${a.name}`;
    } else if (data.type === "log_activity" && data.config?.category_id) {
      const c = sortedCategories.find((c) => c.id === data.config.category_id);
      if (c) suggestion = `Log: ${c.name}`;
    } else if (data.type === "open_checkin_section" && data.config?.section) {
      const s = CHECKIN_SECTIONS.find((s) => s.id === data.config.section);
      if (s) suggestion = `Check-In: ${s.label}`;
    } else if (data.type === "log_symptom" && data.config?.symptom_id) {
      const s = activeSymptoms.find((s) => s.id === data.config.symptom_id);
      if (s) suggestion = `Log: ${s.label}`;
    } else if (data.type === "log_emotion" && data.config?.emotion_label) {
      suggestion = `Log: ${data.config.emotion_label}`;
    } else if (data.type === "open_set_front") {
      suggestion = `Open Set ${terms.Front}ers`;
    } else if (data.type === "open_checkin") {
      suggestion = "Quick Check-In";
    }
    if (suggestion) setData((d) => ({ ...d, label: suggestion }));
  };

  const handleSave = () => {
    if (!data.label.trim()) { toast.error("Add a label"); return; }
    if (data.type === "set_front_alter" && !data.config?.alter_id) { toast.error(`Choose an ${terms.alter}`); return; }
    if (data.type === "log_activity" && !data.config?.category_id) { toast.error("Choose an activity category"); return; }
    if (data.type === "open_checkin_section" && !data.config?.section) { toast.error("Choose a section"); return; }
    if (data.type === "log_symptom" && !data.config?.symptom_id) { toast.error("Choose a symptom"); return; }
    if (data.type === "log_emotion" && !data.config?.emotion_label?.trim()) { toast.error("Enter an emotion"); return; }
    onSave(data);
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
            onBlur={applySuggestion}
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
            onBlur={applySuggestion}
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
            <select
              value={data.config?.category_id || ""}
              onChange={(e) => setConfig("category_id", e.target.value)}
              onBlur={applySuggestion}
              className="w-full h-9 px-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select a category…</option>
              {sortedCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {sortedCategories.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No activity categories yet. Add them via Check-In → Activity section.
              </p>
            )}
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
        <div className="space-y-2">
          <div>
            <Label className="text-xs font-medium mb-1 block">Symptom / habit</Label>
            <select
              value={data.config?.symptom_id || ""}
              onChange={(e) => setConfig("symptom_id", e.target.value)}
              onBlur={applySuggestion}
              className="w-full h-9 px-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select a symptom…</option>
              {activeSymptoms.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            {activeSymptoms.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No symptoms defined yet. Add them via Check-In → Symptoms section.
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs font-medium mb-1 block">Default severity (1–5, optional)</Label>
            <Input
              type="number"
              value={data.config?.severity || ""}
              onChange={(e) => setConfig("severity", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="e.g. 3"
              min="1"
              max="5"
              className="h-8 text-sm"
            />
          </div>
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
                onBlur={applySuggestion}
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
                onBlur={applySuggestion}
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
          <div>
            <Label className="text-xs font-medium mb-1 block">Intensity (1–10, optional)</Label>
            <Input
              type="number"
              value={data.config?.intensity || ""}
              onChange={(e) => setConfig("intensity", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="e.g. 7"
              min="1"
              max="10"
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}

      {/* Label */}
      <div>
        <Label className="text-xs font-medium mb-1 block">Button label</Label>
        <Input
          value={data.label}
          onChange={(e) => setData((d) => ({ ...d, label: e.target.value }))}
          onFocus={applySuggestion}
          placeholder="e.g. Log shower, Check in emotions…"
          className="h-8 text-sm"
        />
      </div>

      {/* Emoji */}
      <div>
        <Label className="text-xs font-medium mb-1 block">Emoji (optional)</Label>
        <Input
          value={data.emoji}
          onChange={(e) => setData((d) => ({ ...d, emoji: e.target.value }))}
          placeholder={DEFAULT_EMOJIS[data.type] || "⚡"}
          className="h-8 text-sm w-24"
          maxLength={2}
        />
      </div>

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
      label: formData.label.trim(),
      type: formData.type,
      emoji: formData.emoji.trim() || null,
      config: formData.config || {},
      order: sorted.length,
    });
  };

  const handleEdit = (formData) => {
    updateMut.mutate({
      id: editId,
      data: {
        label: formData.label.trim(),
        type: formData.type,
        emoji: formData.emoji.trim() || null,
        config: formData.config || {},
      },
    });
  };

  const typeLabel = (type) => ({
    open_checkin: "Open full Check-In",
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
            Hold the Quick Check-In button for 3 seconds to pop these up.
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
                <span className="text-base leading-none w-6 text-center flex-shrink-0">
                  {action.emoji || DEFAULT_EMOJIS[action.type] || "⚡"}
                </span>
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
