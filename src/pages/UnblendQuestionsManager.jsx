import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44, localEntities } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Plus, Trash2, Sparkles, Cog, User, Pencil, Copy, RotateCcw, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import {
  PRESET_QUESTIONS,
  buildDynamicQuestions,
  buildDominantFeelingQuestion,
  instantiateUserQuestion,
} from "@/lib/unblendQuestions";
import AddUnblendQuestionModal from "@/components/unblend/AddUnblendQuestionModal";

// Convert a preset / auto-generated question into the user-editable
// UnblendQuestion spec shape. Used when the user customises a built-in
// question (Edit / Duplicate). The runtime shape coming in can be:
//   - preset color → kind=color
//   - preset choice → kind=multiple_choice with options carried over
//   - dyn_pronouns / dyn_role / dyn_age → matching kind
//   - dyn_field_<fieldId> → kind=custom_field with field=<fieldId>
//   - dyn_dominant_feeling → multiple_choice with the snapshot of
//                            emotion options (will diverge from the
//                            live emotion data once cloned — that's
//                            the price of edit; the user can re-clone)
function convertToUserSpec(q, { promptSuffix = "" } = {}) {
  const base = { prompt: `${q.prompt}${promptSuffix}`, kind: q.kind };
  if (q.id === "dyn_pronouns") return { ...base, kind: "pronouns" };
  if (q.id === "dyn_role") return { ...base, kind: "role" };
  if (q.id === "dyn_age") return { ...base, kind: "age" };
  if (typeof q.id === "string" && q.id.startsWith("dyn_field_")) {
    return { ...base, kind: "custom_field", field: q.id.slice("dyn_field_".length) };
  }
  if (q.kind === "color") return { ...base, kind: "color" };
  // Choice presets + dominant feeling → snapshot as multiple_choice
  if (q.kind === "choice" && Array.isArray(q.options)) {
    return {
      ...base,
      kind: "multiple_choice",
      options: q.options.map((o, i) => ({
        id: `opt-${i + 1}-${Date.now()}`,
        label: o.label || "",
        alterIds: [],
      })),
    };
  }
  return base;
}

// Question management menu for the Help me unblend feature. Lists
// every question that can show up in the queue, grouped by source:
//   - Your own (UnblendQuestion entity; editable / duplicable /
//     deletable)
//   - Auto-generated (built from alter / emotion data; can be hidden,
//     duplicated, or "customised" — which clones into a user question
//     and hides the source)
//   - Built-in presets (same set of actions as auto-generated)
// Hidden preset/auto questions go into a separate Hidden section with
// a restore button so nothing is ever lost without recourse.
export default function UnblendQuestionsManager() {
  const navigate = useNavigate();
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: customFields = [] } = useQuery({
    queryKey: ["customFields"],
    queryFn: () => base44.entities.CustomField.list("order"),
  });
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list("-timestamp", 1000),
  });
  const { data: userRecords = [] } = useQuery({
    queryKey: ["unblendQuestions"],
    queryFn: () => localEntities.UnblendQuestion.list(),
  });
  const { data: hiddenRecords = [] } = useQuery({
    queryKey: ["hiddenUnblendQuestions"],
    queryFn: () => localEntities.HiddenUnblendQuestion.list(),
  });
  const hiddenIds = useMemo(() => new Set(hiddenRecords.map((r) => r.originalId)), [hiddenRecords]);

  const dynamicQuestions = useMemo(() => buildDynamicQuestions(alters, customFields), [alters, customFields]);
  const dominantFeeling = useMemo(() => buildDominantFeelingQuestion(emotionCheckIns), [emotionCheckIns]);
  const userQuestions = useMemo(
    () => userRecords.map((rec) => ({
      rec,
      runtime: instantiateUserQuestion(rec, { alters, customFields }),
    })),
    [userRecords, alters, customFields]
  );

  const visiblePresets = PRESET_QUESTIONS.filter((q) => !hiddenIds.has(q.id));
  const visibleDynamic = dynamicQuestions.filter((q) => !hiddenIds.has(q.id));
  const visibleDominant = dominantFeeling && !hiddenIds.has(dominantFeeling.id) ? dominantFeeling : null;

  const hiddenList = useMemo(() => {
    const all = [...PRESET_QUESTIONS, ...dynamicQuestions, ...(dominantFeeling ? [dominantFeeling] : [])];
    return hiddenRecords
      .map((rec) => ({ rec, q: all.find((q) => q.id === rec.originalId) }))
      .filter((x) => x.q);
  }, [hiddenRecords, dynamicQuestions, dominantFeeling]);

  const saveUserQuestion = async (spec) => {
    if (editingRecord) {
      await localEntities.UnblendQuestion.update(editingRecord.id, spec);
      queryClient.invalidateQueries({ queryKey: ["unblendQuestions"] });
      toast.success("Question updated");
      setEditingRecord(null);
      return;
    }
    await localEntities.UnblendQuestion.create(spec);
    queryClient.invalidateQueries({ queryKey: ["unblendQuestions"] });
    toast.success("Question added");
  };

  const deleteUserQuestion = async (id) => {
    if (!window.confirm("Delete this question?")) return;
    await localEntities.UnblendQuestion.delete(id);
    queryClient.invalidateQueries({ queryKey: ["unblendQuestions"] });
    toast.success("Question removed");
  };

  const duplicateUserQuestion = async (rec) => {
    const copy = {
      prompt: `${rec.prompt} (copy)`,
      kind: rec.kind,
    };
    if (rec.field) copy.field = rec.field;
    if (Array.isArray(rec.options)) {
      copy.options = rec.options.map((o, i) => ({
        id: `opt-${i + 1}-${Date.now()}`,
        label: o.label || "",
        alterIds: Array.isArray(o.alterIds) ? [...o.alterIds] : [],
      }));
    }
    await localEntities.UnblendQuestion.create(copy);
    queryClient.invalidateQueries({ queryKey: ["unblendQuestions"] });
    toast.success("Question duplicated");
  };

  // Hide a preset / auto-generated question by id. Stored in a
  // dedicated local entity (HiddenUnblendQuestion) so the original
  // catalogue isn't mutated and the user can restore later.
  const hideBuiltIn = async (q) => {
    if (!window.confirm("Hide this question from Help me unblend? You can restore it from the Hidden section below.")) return;
    await localEntities.HiddenUnblendQuestion.create({ originalId: q.id, hiddenAt: new Date().toISOString() });
    queryClient.invalidateQueries({ queryKey: ["hiddenUnblendQuestions"] });
    toast.success("Question hidden");
  };

  const restoreBuiltIn = async (rec) => {
    await localEntities.HiddenUnblendQuestion.delete(rec.id);
    queryClient.invalidateQueries({ queryKey: ["hiddenUnblendQuestions"] });
    toast.success("Question restored");
  };

  // Clone a preset / auto into a user question without hiding the
  // original — the user gets their own copy to edit alongside the
  // built-in.
  const duplicateBuiltIn = async (q) => {
    const spec = convertToUserSpec(q, { promptSuffix: " (copy)" });
    await localEntities.UnblendQuestion.create(spec);
    queryClient.invalidateQueries({ queryKey: ["unblendQuestions"] });
    toast.success("Question duplicated to Your questions");
  };

  // "Customise" — clone into a user question, hide the source, and
  // open the edit modal pre-filled with the clone. This is what the
  // pencil icon on a preset / auto-generated row does, since the
  // original definition lives in code or is data-derived and can't
  // be edited in place.
  const customiseBuiltIn = async (q) => {
    const spec = convertToUserSpec(q);
    const created = await localEntities.UnblendQuestion.create(spec);
    await localEntities.HiddenUnblendQuestion.create({ originalId: q.id, hiddenAt: new Date().toISOString() });
    queryClient.invalidateQueries({ queryKey: ["unblendQuestions"] });
    queryClient.invalidateQueries({ queryKey: ["hiddenUnblendQuestions"] });
    setEditingRecord(created);
    setAddOpen(true);
  };

  const openEdit = (rec) => {
    setEditingRecord(rec);
    setAddOpen(true);
  };

  const handleModalClose = () => {
    setAddOpen(false);
    setEditingRecord(null);
  };

  const renderQuestionRow = ({ key, prompt, kindLabel, hint, onEdit, onDuplicate, onDelete }) => (
    <div key={key} className="rounded-xl border border-border/40 bg-card p-3 flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{prompt}</p>
        <p className="text-[0.6875rem] text-muted-foreground mt-0.5">{kindLabel}{hint ? ` · ${hint}` : ""}</p>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit question"
            title="Edit"
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted/40"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            aria-label="Duplicate question"
            title="Duplicate"
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted/40"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete question"
            title="Delete"
            className="text-muted-foreground hover:text-destructive p-1.5 rounded-md hover:bg-muted/40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  const sectionHeader = (icon, title, count, description) => (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[0.6875rem] text-muted-foreground">· {count}</span>
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-semibold">Manage unblend questions</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            See everything that can show up in Help me unblend's queue. Add, edit, duplicate, or hide any question.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      <section className="space-y-3">
        {sectionHeader(
          <User className="w-4 h-4 text-primary" />,
          "Your questions",
          userQuestions.length,
          "Created by you (or customised from a preset). Edit, duplicate, or delete freely."
        )}
        {userQuestions.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">None yet. Tap Add above to create one.</p>
        ) : (
          <div className="space-y-2">
            {userQuestions.map(({ rec, runtime }) =>
              renderQuestionRow({
                key: `user_${rec.id}`,
                prompt: rec.prompt,
                kindLabel: rec.kind === "custom_field" ? "Custom field" :
                          rec.kind === "multiple_choice" ? "Multiple choice" :
                          rec.kind === "color" ? "Color picker" :
                          rec.kind === "pronouns" ? "Pronouns" :
                          rec.kind === "role" ? "Role" :
                          rec.kind === "age" ? "Age" : rec.kind,
                hint: runtime ? null : "Needs more data to show in the queue",
                onEdit: () => openEdit(rec),
                onDuplicate: () => duplicateUserQuestion(rec),
                onDelete: () => deleteUserQuestion(rec.id),
              })
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        {sectionHeader(
          <Cog className="w-4 h-4 text-muted-foreground" />,
          "Auto-generated",
          visibleDynamic.length + (visibleDominant ? 1 : 0),
          `Built from your ${terms.alters || "alters"}' data and emotion history. Customise to save your own editable copy; delete to hide.`
        )}
        {visibleDynamic.length + (visibleDominant ? 1 : 0) === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">
            None visible — either no data yet, or all have been hidden. Restore from the Hidden section below.
          </p>
        ) : (
          <div className="space-y-2">
            {visibleDynamic.map((q) =>
              renderQuestionRow({
                key: q.id,
                prompt: q.prompt,
                kindLabel: "Auto-generated",
                hint: `${(q.options || []).length} options from data`,
                onEdit: () => customiseBuiltIn(q),
                onDuplicate: () => duplicateBuiltIn(q),
                onDelete: () => hideBuiltIn(q),
              })
            )}
            {visibleDominant && renderQuestionRow({
              key: visibleDominant.id,
              prompt: visibleDominant.prompt,
              kindLabel: "Auto-generated",
              hint: `${visibleDominant.options.length} emotions from your check-ins`,
              onEdit: () => customiseBuiltIn(visibleDominant),
              onDuplicate: () => duplicateBuiltIn(visibleDominant),
              onDelete: () => hideBuiltIn(visibleDominant),
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        {sectionHeader(
          <Sparkles className="w-4 h-4 text-muted-foreground" />,
          "Built-in presets",
          visiblePresets.length,
          "Ship with the app. Customise to make your own editable copy; delete to hide."
        )}
        {visiblePresets.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">
            All presets are hidden. Restore from the Hidden section below.
          </p>
        ) : (
          <div className="space-y-2">
            {visiblePresets.map((q) =>
              renderQuestionRow({
                key: q.id,
                prompt: q.prompt,
                kindLabel: q.kind === "color" ? "Color picker" : "Multiple choice",
                onEdit: () => customiseBuiltIn(q),
                onDuplicate: () => duplicateBuiltIn(q),
                onDelete: () => hideBuiltIn(q),
              })
            )}
          </div>
        )}
      </section>

      {hiddenList.length > 0 && (
        <section className="space-y-3">
          {sectionHeader(
            <EyeOff className="w-4 h-4 text-muted-foreground" />,
            "Hidden",
            hiddenList.length,
            "Built-in / auto-generated questions you've removed. Tap restore to bring them back."
          )}
          <div className="space-y-2">
            {hiddenList.map(({ rec, q }) => (
              <div key={`hidden_${rec.id}`} className="rounded-xl border border-border/40 bg-muted/20 p-3 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-muted-foreground line-through">{q.prompt}</p>
                  <p className="text-[0.6875rem] text-muted-foreground mt-0.5">Hidden</p>
                </div>
                <button
                  type="button"
                  onClick={() => restoreBuiltIn(rec)}
                  aria-label="Restore question"
                  title="Restore"
                  className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted/40 flex-shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <AddUnblendQuestionModal
        isOpen={addOpen}
        onClose={handleModalClose}
        onSave={saveUserQuestion}
        alters={alters.filter((a) => !a.is_archived)}
        customFields={customFields}
        editingRecord={editingRecord}
      />
    </div>
  );
}
