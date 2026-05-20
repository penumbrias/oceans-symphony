import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44, localEntities } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Plus, Trash2, Sparkles, Cog, User, Pencil, Copy } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import {
  PRESET_QUESTIONS,
  buildDynamicQuestions,
  buildDominantFeelingQuestion,
  instantiateUserQuestion,
} from "@/lib/unblendQuestions";
import AddUnblendQuestionModal from "@/components/unblend/AddUnblendQuestionModal";

// Question management menu for the Help me unblend feature. Lists
// every question that can show up in the queue, grouped by source:
//   - Presets             (built-in, not deletable)
//   - Auto-generated      (built from alter / emotion data; deletes
//                          would re-appear; not deletable, just
//                          shown so the user knows what's in the
//                          pool and where the data comes from)
//   - Your own            (UnblendQuestion entity; deletable)
//
// Add-question button opens the existing modal. Future enhancement:
// inline edit for user questions.
export default function UnblendQuestionsManager() {
  const navigate = useNavigate();
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  // When set, the modal opens in edit mode pre-filled with this record.
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

  const dynamicQuestions = useMemo(() => buildDynamicQuestions(alters, customFields), [alters, customFields]);
  const dominantFeeling = useMemo(() => buildDominantFeelingQuestion(emotionCheckIns), [emotionCheckIns]);
  const userQuestions = useMemo(
    () => userRecords.map((rec) => ({
      rec,
      runtime: instantiateUserQuestion(rec, { alters, customFields }),
    })),
    [userRecords, alters, customFields]
  );

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
            See everything that can show up in Help me unblend's queue. Add your own here, delete the ones you don't want.
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
          "Created by you. Tap the trash to remove."
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
          dynamicQuestions.length + (dominantFeeling ? 1 : 0),
          `Built from your ${terms.alters || "alters"}' data and emotion history — appears automatically once there's enough to compare.`
        )}
        {dynamicQuestions.length + (dominantFeeling ? 1 : 0) === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">
            None yet — fill in custom fields, pronouns, or role on a few {terms.alters || "alters"}, or log some emotion check-ins.
          </p>
        ) : (
          <div className="space-y-2">
            {dynamicQuestions.map((q) =>
              renderQuestionRow({
                key: q.id,
                prompt: q.prompt,
                kindLabel: "Auto-generated",
                hint: `${(q.options || []).length} options from data`,
              })
            )}
            {dominantFeeling && renderQuestionRow({
              key: dominantFeeling.id,
              prompt: dominantFeeling.prompt,
              kindLabel: "Auto-generated",
              hint: `${dominantFeeling.options.length} emotions from your check-ins`,
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        {sectionHeader(
          <Sparkles className="w-4 h-4 text-muted-foreground" />,
          "Built-in presets",
          PRESET_QUESTIONS.length,
          "Ship with the app. Always available."
        )}
        <div className="space-y-2">
          {PRESET_QUESTIONS.map((q) =>
            renderQuestionRow({
              key: q.id,
              prompt: q.prompt,
              kindLabel: q.kind === "color" ? "Color picker" : "Multiple choice",
            })
          )}
        </div>
      </section>

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
