import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HexColorPicker } from "react-colorful";
import { base44, localEntities } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, Shuffle, Sparkles, Heart, Cog } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import {
  PRESET_QUESTIONS,
  buildDynamicQuestions,
  buildDominantFeelingQuestion,
  instantiateUserQuestion,
} from "@/lib/unblendQuestions";
import { applyGetToKnowMeAnswer } from "@/lib/getToKnowMeWriteback";
import AlterMultiSelectGrid from "@/components/unblend/AlterMultiSelectGrid";

// "Get to know me" — the inverse of Help me unblend. When the user
// already knows who's here (or is feeling grounded enough to
// articulate it), they can proactively answer unblend questions so
// the data builds up over time. Each answer writes back to the
// selected alters' fields / custom fields / chosen multiple-choice
// option, so future unblend sessions narrow toward those alters.
//
// "Sync to current front" toggle:
//   - OFF (default): the alter chips are a free-form multi-select.
//     Saving the answer ONLY writes data to those alters. Fronting
//     state is untouched.
//   - ON: the chips show the live current fronters and stay in
//     sync as the user changes them — toggling a chip both updates
//     the answer attribution AND starts/ends that alter's
//     fronting session, just like the SetFrontModal would.
//
// Save logic lives in src/lib/getToKnowMeWriteback.js.
export default function GetToKnowMe() {
  const navigate = useNavigate();
  const terms = useTerms();
  const queryClient = useQueryClient();

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
  const { data: activeFront = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const activeFronterIds = useMemo(() => {
    const set = new Set();
    for (const s of activeFront) {
      const id = s.alter_id || s.primary_alter_id;
      if (id) set.add(id);
      for (const co of s.co_fronter_ids || []) set.add(co);
    }
    return [...set];
  }, [activeFront]);

  const allQuestions = useMemo(() => {
    const out = [...PRESET_QUESTIONS, ...buildDynamicQuestions(alters, customFields)];
    const feelQ = buildDominantFeelingQuestion(emotionCheckIns);
    if (feelQ) out.push(feelQ);
    for (const rec of userRecords) {
      const q = instantiateUserQuestion(rec, { alters, customFields });
      if (q) out.push(q);
    }
    return out;
  }, [alters, customFields, emotionCheckIns, userRecords]);

  const [questionId, setQuestionId] = useState(null);
  // Seed once questions are available; reshuffle returns a different one.
  useEffect(() => {
    if (!questionId && allQuestions.length > 0) {
      setQuestionId(allQuestions[Math.floor(Math.random() * allQuestions.length)].id);
    }
  }, [allQuestions, questionId]);
  const currentQuestion = useMemo(
    () => allQuestions.find((q) => q.id === questionId) || allQuestions[0] || null,
    [allQuestions, questionId]
  );

  const [syncFront, setSyncFront] = useState(false);
  const [selectedAlterIds, setSelectedAlterIds] = useState([]);
  // Mirror live fronters into the selection when sync is on so the
  // chips reflect the actual fronting state.
  useEffect(() => {
    if (syncFront) setSelectedAlterIds(activeFronterIds);
  }, [syncFront, activeFronterIds]);

  const [colorDraft, setColorDraft] = useState("#8b5cf6");
  const [saving, setSaving] = useState(false);

  const handleShuffle = () => {
    if (allQuestions.length < 2) return;
    const others = allQuestions.filter((q) => q.id !== questionId);
    const pick = others[Math.floor(Math.random() * others.length)];
    setQuestionId(pick.id);
    setColorDraft("#8b5cf6");
  };

  const toggleAlter = async (alterId) => {
    if (!syncFront) {
      setSelectedAlterIds((prev) =>
        prev.includes(alterId) ? prev.filter((id) => id !== alterId) : [...prev, alterId]
      );
      return;
    }
    // Sync-to-front mode: also mutate fronting state. Fresh
    // refetch + close every active session for this alter; or
    // open a new one. Mirrors SetFrontModal's add/remove flow but
    // simplified to single-alter toggle.
    try {
      const fresh = await base44.entities.FrontingSession.filter({ is_active: true });
      const matches = fresh.filter((s) => s.alter_id === alterId || s.primary_alter_id === alterId);
      if (matches.length > 0) {
        for (const s of matches) {
          await base44.entities.FrontingSession.update(s.id, {
            is_active: false,
            end_time: new Date().toISOString(),
          });
        }
        toast.success(`${alters.find((a) => a.id === alterId)?.name || "Alter"} ended`);
      } else {
        const wasEmpty = fresh.length === 0;
        await base44.entities.FrontingSession.create({
          alter_id: alterId,
          start_time: new Date().toISOString(),
          is_active: true,
          is_primary: wasEmpty, // first active = primary
        });
        toast.success(`${alters.find((a) => a.id === alterId)?.name || "Alter"} now fronting`);
      }
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontingSessions"] });
    } catch (err) {
      toast.error(err.message || "Failed to update fronting");
    }
  };

  const submitAnswer = async (answer) => {
    if (selectedAlterIds.length === 0) {
      toast.error(`Pick which ${terms.alters || "alters"} this answer is for.`);
      return;
    }
    setSaving(true);
    try {
      const result = await applyGetToKnowMeAnswer({
        question: currentQuestion,
        answer,
        alterIds: selectedAlterIds,
        customFields,
      });
      if (result.saved) {
        toast.success(`Saved to ${result.count} ${terms.alter || "alter"}${result.count === 1 ? "" : "s"}'s ${result.field}`);
        queryClient.invalidateQueries({ queryKey: ["alters"] });
        queryClient.invalidateQueries({ queryKey: ["unblendQuestions"] });
        handleShuffle();
      } else {
        toast.message(result.reason || "Couldn't save this answer.");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const active = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Get to know me
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Answer questions to build up the data Help me unblend uses. Pick which {terms.alters || "alters"} the answer is for, then submit.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/unblend/questions")} className="gap-1.5">
          <Cog className="w-4 h-4" /> <span className="hidden sm:inline">Manage</span>
        </Button>
      </div>

      {/* Question card — comes FIRST so the user reads the
          question before picking who it's for. */}
      {!currentQuestion ? (
        <section className="rounded-2xl border border-border/50 bg-card p-5">
          <p className="text-sm text-muted-foreground text-center">
            No questions available yet — add some custom fields, alters, or your own questions in <button onClick={() => navigate("/unblend/questions")} className="text-primary underline">Manage questions</button>.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-semibold text-foreground leading-snug">{currentQuestion.prompt}</p>
            <Button variant="ghost" size="sm" onClick={handleShuffle} className="gap-1.5 text-xs flex-shrink-0">
              <Shuffle className="w-3.5 h-3.5" /> Shuffle
            </Button>
          </div>

          {currentQuestion.kind === "color" && (
            <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
              <div className="w-full sm:w-auto">
                <HexColorPicker
                  color={colorDraft}
                  onChange={setColorDraft}
                  style={{ width: "100%", maxWidth: 280, height: 200 }}
                />
              </div>
              <div className="flex-1 w-full space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl border border-border/60 flex-shrink-0 shadow-sm" style={{ backgroundColor: colorDraft }} />
                  <input
                    type="text"
                    value={colorDraft}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColorDraft(v);
                    }}
                    className="flex-1 h-10 px-3 rounded-md border border-border bg-background text-sm font-mono"
                    maxLength={7}
                  />
                </div>
                <Button
                  onClick={() => submitAnswer(colorDraft)}
                  disabled={!/^#[0-9a-fA-F]{6}$/.test(colorDraft) || saving || selectedAlterIds.length === 0}
                  className="w-full"
                >
                  Save colour to {selectedAlterIds.length || "?"} {selectedAlterIds.length === 1 ? terms.alter || "alter" : terms.alters || "alters"}
                </Button>
              </div>
            </div>
          )}

          {currentQuestion.kind === "choice" && (
            <div className="flex flex-wrap gap-2">
              {currentQuestion.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => submitAnswer(opt)}
                  disabled={saving || selectedAlterIds.length === 0}
                  className="px-3 py-1.5 rounded-full border border-border/60 hover:border-primary hover:bg-primary/5 text-sm transition-colors disabled:opacity-50"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Associated alters — uses the same SetFrontModal-style
          avatar grid the rest of the app uses, not the old pill
          list. */}
      <section className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            Associated {terms.alters || "alters"}
            {selectedAlterIds.length > 0 && (
              <span className="ml-2 text-[0.6875rem] text-muted-foreground font-normal">
                {selectedAlterIds.length} selected
              </span>
            )}
          </p>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            Sync to current front
            <Switch checked={syncFront} onCheckedChange={setSyncFront} />
          </label>
        </div>
        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No {terms.alters || "alters"} yet — add some to start.
          </p>
        ) : (
          <AlterMultiSelectGrid
            alters={active}
            selectedIds={selectedAlterIds}
            onToggle={toggleAlter}
            pinnedIds={syncFront ? activeFronterIds : []}
            pinnedLabel={syncFront ? `Currently ${terms.fronting || "fronting"}` : ""}
            searchPlaceholder={`Search ${terms.alters || "alters"}…`}
          />
        )}
        <p className="text-[0.6875rem] text-muted-foreground leading-snug">
          {syncFront
            ? `Tapping a ${terms.alter || "alter"} also starts/ends their fronting session — exactly like the Set front modal.`
            : `Tapping a ${terms.alter || "alter"} only attributes this answer to them. Fronting state isn't changed.`}
        </p>
      </section>
    </div>
  );
}
