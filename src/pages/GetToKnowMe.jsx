import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HexColorPicker } from "react-colorful";
import { base44, localEntities } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, Shuffle, Sparkles, Cog, Search } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import {
  PRESET_QUESTIONS,
  buildDynamicQuestions,
  buildDominantFeelingQuestion,
  buildAllFieldQuestions,
  instantiateUserQuestion,
} from "@/lib/unblendQuestions";
import { applyGetToKnowMeAnswer } from "@/lib/getToKnowMeWriteback";
import FronterPicker from "@/components/fronting/FronterPicker";
import { normalizeHexInput } from "@/lib/colorUtils";
import { changeFront } from "@/lib/setFront";
import { sharedList } from "@/lib/sharedLists";
import { useUiLook, usePixelDesk } from "@/lib/uiLook";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { an } from "@/lib/articles";
import "@/styles/pixel/meeting.css";


// "Get to know me" — the inverse of Help me unblend. The user
// proactively answers questions so the data builds up over time.
// Each answer writes back to the selected alters' fields / custom
// fields / chosen multiple-choice option.
//
// "Sync to current front":
//   - OFF (default): alter picker is free-form multi-select. Saving
//     the answer only writes data to those alters; fronting state
//     untouched.
//   - ON: picker reflects + mutates the live FrontingSession state
//     in real time, exactly like the Set Fronters modal would.
export default function GetToKnowMe() {
  const navigate = useNavigate();
  const terms = useTerms();
  const queryClient = useQueryClient();

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: customFields = [] } = useQuery({
    ...sharedList("customFields"),
  });
  const { data: emotionCheckIns = [] } = useQuery({
    ...sharedList("emotionCheckIns"),
  });
  const { data: userRecords = [] } = useQuery({
    queryKey: ["unblendQuestions"],
    queryFn: () => localEntities.UnblendQuestion.list(),
  });
  const { data: hiddenUnblendRecords = [] } = useQuery({
    queryKey: ["hiddenUnblendQuestions"],
    queryFn: () => localEntities.HiddenUnblendQuestion.list(),
  });
  const hiddenUnblendIds = useMemo(
    () => new Set((hiddenUnblendRecords || []).map((r) => r.originalId)),
    [hiddenUnblendRecords]
  );
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

  const activeFronterPrimaryId = useMemo(() => {
    const p = activeFront.find((s) => s.is_primary && s.alter_id);
    if (p) return p.alter_id;
    const legacy = activeFront.find((s) => s.primary_alter_id);
    return legacy?.primary_alter_id || "";
  }, [activeFront]);

  const allQuestions = useMemo(() => {
    // Drop dyn_field_* (custom-field choice-only) questions — the
    // field_input version added below covers the same fields with a
    // richer UI that includes both quick-fill pills for existing
    // values AND a text input for typing a new value. The choice-only
    // version is still produced by buildDynamicQuestions for Help me
    // unblend's matcher; here in Get to know me we want the seeding
    // UI instead, so the user can actually contribute new answers.
    const dyn = buildDynamicQuestions(alters, customFields)
      .filter((q) => !(typeof q.id === "string" && q.id.startsWith("dyn_field_")));
    const out = [...PRESET_QUESTIONS, ...dyn];
    const feelQ = buildDominantFeelingQuestion(emotionCheckIns);
    if (feelQ) out.push(feelQ);
    // field_input for every custom field — surfaces existing values as
    // pills and a "type a different answer" input so the user can add
    // new ones.
    for (const fq of buildAllFieldQuestions(alters, customFields)) {
      out.push(fq);
    }
    for (const rec of userRecords) {
      const q = instantiateUserQuestion(rec, { alters, customFields });
      if (q) out.push(q);
    }
    // The Unblend Manager hides custom-field questions under the id
    // dyn_field_<fieldId>. The field_input version we surface here uses
    // field_<fieldId>, so map that case too — otherwise hiding a
    // custom field in the Manager would silently re-appear here.
    return out.filter((q) => {
      if (hiddenUnblendIds.has(q.id)) return false;
      if (q.kind === "field_input" && q.fieldId && hiddenUnblendIds.has(`dyn_field_${q.fieldId}`)) return false;
      return true;
    });
  }, [alters, customFields, emotionCheckIns, userRecords, hiddenUnblendIds]);

  // Toggle to hide custom-field questions from the Get to know me
  // queue when the user wants to focus on presets / dynamic ones.
  // Persisted to localStorage so the choice carries across sessions.
  const [hideCustomFields, setHideCustomFields] = useState(() => {
    try { return localStorage.getItem("getknow_hide_custom_fields_v1") === "1"; }
    catch { return false; }
  });
  const setHideCustomFieldsPersist = (next) => {
    setHideCustomFields(next);
    try { localStorage.setItem("getknow_hide_custom_fields_v1", next ? "1" : "0"); } catch { /* non-fatal */ }
  };

  const [questionSearch, setQuestionSearch] = useState("");
  const filteredQuestions = useMemo(() => {
    let pool = allQuestions;
    if (hideCustomFields) {
      pool = pool.filter((q) =>
        !(typeof q.id === "string" && (q.id.startsWith("dyn_field_") || q.id.startsWith("field_")))
        && q.kind !== "field_input"
      );
    }
    const q = questionSearch.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((x) => (x.prompt || "").toLowerCase().includes(q));
  }, [allQuestions, questionSearch, hideCustomFields]);

  const [questionId, setQuestionId] = useState(null);
  // Track which question ids have been shown this round. Shuffle
  // picks from the unseen pool first; once everything's been seen
  // we reset and start over so the user isn't seeing the same
  // question back-to-back forever.
  const [seenIds, setSeenIds] = useState(() => new Set());
  useEffect(() => {
    if (!questionId && allQuestions.length > 0) {
      const first = allQuestions[Math.floor(Math.random() * allQuestions.length)];
      setQuestionId(first.id);
      setSeenIds(new Set([first.id]));
    }
  }, [allQuestions, questionId]);
  const currentQuestion = useMemo(
    () => allQuestions.find((q) => q.id === questionId) || allQuestions[0] || null,
    [allQuestions, questionId]
  );

  const [syncFront, setSyncFront] = useState(false);
  const [primaryAlterId, setPrimaryAlterId] = useState("");
  const [coFronterIds, setCoFronterIds] = useState([]);

  // When sync turns on, mirror current fronters into the picker.
  // When it turns off, leave the picker selection as-is so the user
  // can keep it as their answer attribution.
  useEffect(() => {
    if (syncFront) {
      setPrimaryAlterId(activeFronterPrimaryId);
      setCoFronterIds(activeFronterIds.filter((id) => id !== activeFronterPrimaryId));
    }
  }, [syncFront, activeFronterPrimaryId, activeFronterIds]);

  const selectedAlterIds = useMemo(() => {
    const ids = new Set(coFronterIds);
    if (primaryAlterId) ids.add(primaryAlterId);
    return [...ids];
  }, [primaryAlterId, coFronterIds]);

  const [colorDraft, setColorDraft] = useState("#8b5cf6");
  const [textDraft, setTextDraft] = useState("");
  // Choice questions are multi-select — a check-in might have several
  // matching tags (e.g. high-energy AND playful), so the user picks
  // every option that applies before saving.
  const [choiceDraft, setChoiceDraft] = useState([]);
  const [saving, setSaving] = useState(false);

  const handleShuffle = () => {
    const pool = filteredQuestions.length > 0 ? filteredQuestions : allQuestions;
    if (pool.length === 0) return;
    if (pool.length === 1) {
      setQuestionId(pool[0].id);
      setSeenIds(new Set([pool[0].id]));
      return;
    }
    // Prefer questions the user hasn't been shown yet this round.
    // Once we've exhausted the pool, reset seen and start over.
    let unseen = pool.filter((q) => !seenIds.has(q.id));
    let nextSeen;
    if (unseen.length === 0) {
      // Round complete — reset, but exclude the current question
      // so we don't immediately repeat.
      unseen = pool.filter((q) => q.id !== questionId);
      nextSeen = new Set();
    } else {
      nextSeen = new Set(seenIds);
    }
    const pick = unseen[Math.floor(Math.random() * unseen.length)];
    setQuestionId(pick.id);
    nextSeen.add(pick.id);
    setSeenIds(nextSeen);
    setColorDraft("#8b5cf6");
    setTextDraft("");
    setChoiceDraft([]);
  };

  // Pre-fill the draft with the selected alters' existing value(s)
  // when the question or selection changes — so the user can see
  // what's already there and edit rather than re-typing from blank.
  // If selected alters disagree, fall back to the first one's value.
  useEffect(() => {
    setChoiceDraft([]);
    setTextDraft("");
    if (!currentQuestion) {
      setColorDraft("#8b5cf6");
      return;
    }
    // For color questions, pre-fill the picker with the first
    // selected alter's existing colour as a starting visual — that's
    // about a colour-picker affordance, not text. For field_input
    // questions we DO NOT pre-fill the text box (clearing what the
    // user typed when they pick an alter is a frustrating overwrite);
    // existing values are surfaced as labels under the input so the
    // user can see what's already there without losing what they
    // typed.
    if (currentQuestion.kind === "color") {
      const picked = selectedAlterIds
        .map((id) => alters.find((a) => a.id === id))
        .filter(Boolean);
      const colors = picked.map((a) => a.color).filter(Boolean);
      setColorDraft(colors[0] || "#8b5cf6");
    }
     
  }, [questionId, currentQuestion]);

  // Surface existing values for the selected alters next to the
  // field_input — read-only labels so the user can see prior answers
  // without their typed draft being overwritten.
  const existingFieldValues = useMemo(() => {
    if (!currentQuestion || currentQuestion.kind !== "field_input") return [];
    const fid = currentQuestion.fieldId;
    return selectedAlterIds
      .map((id) => {
        const a = alters.find((x) => x.id === id);
        const v = a?.alter_custom_fields && typeof a.alter_custom_fields[fid] === "string"
          ? a.alter_custom_fields[fid].trim()
          : "";
        return v ? { id, name: a.alias || a.name, color: a.color, value: v } : null;
      })
      .filter(Boolean);
  }, [currentQuestion, selectedAlterIds, alters]);

  // Sync-to-front variants: every toggle writes the front through the one
  // set-front path (setFront.js). It reads the front fresh, keeps each
  // still-present alter's session — a primary change no longer resets
  // their "fronting since" — keeps their level, and tells friends.
  const applyFrontMutation = useCallback(
    async (nextPrimary, nextCoIds) => {
      const all = [...new Set([nextPrimary, ...nextCoIds].filter(Boolean))];
      await changeFront((cur) => all.map((id) => ({
        alterId: id,
        isPrimary: id === nextPrimary,
        level: cur.find((x) => x.alterId === id)?.level,
      })), { queryClient, terms, alters });
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontingSessions"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    },
    [queryClient, terms, alters]
  );

  const handleToggle = useCallback(
    async (id) => {
      let nextPrimary = primaryAlterId;
      let nextCo = coFronterIds;
      if (primaryAlterId === id) {
        nextPrimary = "";
      } else if (coFronterIds.includes(id)) {
        nextCo = coFronterIds.filter((x) => x !== id);
      } else {
        nextCo = [...coFronterIds, id];
        if (!primaryAlterId) nextPrimary = id;
      }
      setPrimaryAlterId(nextPrimary);
      setCoFronterIds(nextCo.filter((x) => x !== nextPrimary));
      if (syncFront) {
        try {
          await applyFrontMutation(nextPrimary, nextCo.filter((x) => x !== nextPrimary));
        } catch (err) {
          toast.error(err.message || "Failed to update front");
        }
      }
    },
    [primaryAlterId, coFronterIds, syncFront, applyFrontMutation]
  );

  const handleSetPrimary = useCallback(
    async (id) => {
      let nextPrimary;
      let nextCo;
      if (primaryAlterId === id) {
        nextPrimary = "";
        nextCo = [...coFronterIds, id];
      } else {
        nextPrimary = id;
        const co = coFronterIds.filter((x) => x !== id);
        if (primaryAlterId) co.push(primaryAlterId);
        nextCo = co;
      }
      setPrimaryAlterId(nextPrimary);
      setCoFronterIds(nextCo.filter((x) => x !== nextPrimary));
      if (syncFront) {
        try {
          await applyFrontMutation(nextPrimary, nextCo.filter((x) => x !== nextPrimary));
        } catch (err) {
          toast.error(err.message || "Failed to update front");
        }
      }
    },
    [primaryAlterId, coFronterIds, syncFront, applyFrontMutation]
  );

  const handleClearAll = useCallback(async () => {
    setPrimaryAlterId("");
    setCoFronterIds([]);
    if (syncFront) {
      try {
        await applyFrontMutation("", []);
      } catch (err) {
        toast.error(err.message || "Failed to clear front");
      }
    }
  }, [syncFront, applyFrontMutation]);

  // Apply every picked option to the same alter set, then advance.
  // Used by multi-select choice questions where multiple tags can
  // apply to one moment (e.g. high-energy AND playful).
  const submitChoiceAnswers = async (options) => {
    if (!Array.isArray(options) || options.length === 0) return;
    if (selectedAlterIds.length === 0) {
      toast.error(`Pick which ${terms.alters || "alters"} this answer is for.`);
      return;
    }
    setSaving(true);
    try {
      let savedCount = 0;
      const reasons = new Set();
      for (const opt of options) {
        const result = await applyGetToKnowMeAnswer({
          question: currentQuestion,
          answer: opt,
          alterIds: selectedAlterIds,
          customFields,
        });
        if (result.saved) savedCount += 1;
        else if (result.reason) reasons.add(result.reason);
      }
      if (savedCount > 0) {
        toast.success(`Saved ${savedCount} option${savedCount === 1 ? "" : "s"} to ${selectedAlterIds.length} ${terms.alter || "alter"}${selectedAlterIds.length === 1 ? "" : "s"}`);
        queryClient.invalidateQueries({ queryKey: ["alters"] });
        queryClient.invalidateQueries({ queryKey: ["unblendQuestions"] });
        handleShuffle();
      } else {
        toast.message([...reasons][0] || "Couldn't save those answers.");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
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

  const pixel = useUiLook() === "pixel";
  const desk = usePixelDesk();
  const formatAlter = useAlterLabel();
  const [pxPickerOpen, setPxPickerOpen] = useState(false);

  const questionBody = currentQuestion ? (
        <>
          {currentQuestion.kind === "color" && (
            <div className="space-y-4">
              {/* Existing alter colours rendered as swatches so the
                  user can pick "the colour that already belongs to
                  one of my alters" instead of fiddling with a free-
                  form gradient. Each swatch's hex feeds the regular
                  colorDraft / submitAnswer flow underneath. */}
              {(() => {
                const seen = new Set();
                const swatchAlters = (alters || [])
                  .filter((a) => !a.is_archived && typeof a.color === "string" && /^#[0-9a-fA-F]{6}$/.test(a.color))
                  .filter((a) => {
                    const key = a.color.toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                  });
                if (swatchAlters.length === 0) return null;
                return (
                  <div>
                    <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground mb-2">
                      Pick from your {terms.alters || "alters"}' colours
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {swatchAlters.map((a) => {
                        const selected = colorDraft.toLowerCase() === a.color.toLowerCase();
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setColorDraft(a.color.toLowerCase())}
                            title={`${a.name} (${a.color})`}
                            className={`relative w-10 h-10 rounded-full border-2 transition-transform ${selected ? "scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border/60 hover:scale-105"}`}
                            style={{ backgroundColor: a.color }}
                            aria-label={`Pick ${a.name}'s colour ${a.color}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                <div className="w-full sm:w-auto">
                  <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground mb-2">
                    Or pick a new colour
                  </p>
                  <HexColorPicker color={colorDraft} onChange={setColorDraft} style={{ width: "100%", maxWidth: 280, height: 200 }} />
                </div>
                <div className="flex-1 w-full space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl border border-border/60 flex-shrink-0 shadow-sm" style={{ backgroundColor: colorDraft }} />
                    <input
                      type="text"
                      value={colorDraft}
                      // Free typing (the old filter swallowed keystrokes once
                      // the field was full, and rejected codes without a "#");
                      // validity gates the button below via normalizeHexInput.
                      onChange={(e) => setColorDraft(e.target.value)}
                      onFocus={(e) => { try { e.target.select(); } catch { /* non-fatal */ } }}
                      className="flex-1 h-10 px-3 rounded-md border border-border bg-background text-sm font-mono"
                      maxLength={9}
                    />
                  </div>
                  {!pixel && <Button
                    onClick={() => submitAnswer(normalizeHexInput(colorDraft) || colorDraft)}
                    disabled={!normalizeHexInput(colorDraft) || saving || selectedAlterIds.length === 0}
                    className="w-full"
                  >
                    Save colour to {selectedAlterIds.length || "?"} {selectedAlterIds.length === 1 ? terms.alter || "alter" : terms.alters || "alters"}
                  </Button>}
                </div>
              </div>
            </div>
          )}

          {currentQuestion.kind === "choice" && (
            <div className="space-y-3">
              <p className="text-[0.6875rem] text-muted-foreground">
                Pick every option that applies — saving stores each one.
              </p>
              <div className="flex flex-wrap gap-2">
                {currentQuestion.options.map((opt) => {
                  const selected = choiceDraft.some((d) => d.id === opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setChoiceDraft((prev) => (
                        prev.some((d) => d.id === opt.id)
                          ? prev.filter((d) => d.id !== opt.id)
                          : [...prev, opt]
                      ))}
                      disabled={saving}
                      className={`px-3 py-1.5 rounded-full border text-sm transition-colors disabled:opacity-50 ${
                        selected
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border/60 text-foreground hover:border-primary hover:bg-primary/5"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {!pixel && <Button
                onClick={() => {
                  if (choiceDraft.length === 0) {
                    handleShuffle();
                  } else {
                    submitChoiceAnswers(choiceDraft);
                  }
                }}
                disabled={saving || (choiceDraft.length > 0 && selectedAlterIds.length === 0)}
                className="w-full"
              >
                {choiceDraft.length === 0
                  ? "Skip & next"
                  : `Save & next${choiceDraft.length > 1 ? ` (${choiceDraft.length})` : ""}`}
              </Button>}
            </div>
          )}

          {currentQuestion.kind === "field_input" && (() => {
            // Match the custom field's defined type so the input
            // control feels like a continuation of the Info tab,
            // not a generic text box for every field.
            const fieldType = currentQuestion.fieldType || "text";
            return (
            <div className="space-y-3">
              {existingFieldValues.length > 0 && pixel && (
                <div className="pxm-ins pxm-file">
                  <div className="pxm-pf" style={{ fontSize: 12 }}>Already on file</div>
                  {existingFieldValues.map((ev) => (
                    <div key={ev.id} className="pxm-row" style={{ gap: 8 }}>
                      <span className="pxm-sq" style={{ background: ev.color || undefined }} />
                      <span>{ev.name}: {ev.value}</span>
                    </div>
                  ))}
                </div>
              )}
              {existingFieldValues.length > 0 && !pixel && (
                <div className="rounded-lg border border-border/40 bg-muted/20 p-2 space-y-1">
                  <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Already on file</p>
                  <div className="max-h-20 overflow-y-auto space-y-1 pr-1">
                    {existingFieldValues.map((ev) => (
                      <p key={ev.id} className="text-xs">
                        <span className="font-semibold" style={{ color: ev.color || undefined }}>{ev.name}:</span>{" "}
                        <span className="text-foreground/80">{ev.value}</span>
                      </p>
                    ))}
                  </div>
                  <p className="text-[0.625rem] text-muted-foreground italic">
                    Saving below adds your answer alongside what's already here — nothing gets overwritten.
                  </p>
                </div>
              )}
              {fieldType !== "boolean" && currentQuestion.options.length > 0 && (
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
                  {currentQuestion.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTextDraft(opt.label)}
                      disabled={saving}
                      className={`px-3 py-1.5 rounded-full border text-sm transition-colors disabled:opacity-50 ${
                        textDraft === opt.label
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border/60 text-foreground hover:border-primary hover:bg-primary/5"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Boolean: two big buttons, no text input. Stored as
                  the string "true" / "false" to match what InfoTab
                  reads when rendering Yes/No. */}
              {fieldType === "boolean" ? (
                <div className="flex gap-2">
                  <Button
                    onClick={() => submitAnswer("true")}
                    disabled={saving || selectedAlterIds.length === 0}
                    className="flex-1"
                  >
                    Yes &amp; next
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => submitAnswer("false")}
                    disabled={saving || selectedAlterIds.length === 0}
                    className="flex-1"
                  >
                    No &amp; next
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    type={fieldType === "number" ? "number" : "text"}
                    inputMode={fieldType === "number" ? "decimal" : undefined}
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && textDraft.trim() && selectedAlterIds.length > 0 && !saving) {
                        e.preventDefault();
                        submitAnswer(textDraft);
                      }
                    }}
                    placeholder={
                      fieldType === "list"
                        ? "Comma-separate items — each is matched individually"
                        : fieldType === "number"
                          ? "Type a number"
                          : currentQuestion.options.length > 0
                            ? "…or type a different answer"
                            : "Type your answer"
                    }
                    className="flex-1"
                  />
                  {!pixel && <Button
                    onClick={() => submitAnswer(textDraft)}
                    disabled={!textDraft.trim() || saving || selectedAlterIds.length === 0}
                  >
                    Save &amp; next
                  </Button>}
                </div>
              )}
            </div>
            );
          })()}
        </>
  ) : null;

  if (pixel) {
    // Pixel look (GetToKnowPhone board): "Who's answering" panel, the
    // question panel with Skip & next / Save & next on its foot, then
    // search + Manage. Same state and save path as the classic page.
    const kind = currentQuestion?.kind;
    const fieldType = currentQuestion?.fieldType || "text";
    let primary = null; // the foot's main action for this kind of question
    if (kind === "color") {
      primary = { label: "Save & next", disabled: !normalizeHexInput(colorDraft) || saving || selectedAlterIds.length === 0,
        run: () => submitAnswer(normalizeHexInput(colorDraft) || colorDraft) };
    } else if (kind === "choice") {
      primary = { label: `Save & next${choiceDraft.length > 1 ? ` (${choiceDraft.length})` : ""}`,
        disabled: saving || choiceDraft.length === 0 || selectedAlterIds.length === 0,
        run: () => submitChoiceAnswers(choiceDraft) };
    } else if (kind === "field_input" && fieldType !== "boolean") {
      primary = { label: "Save & next", disabled: !textDraft.trim() || saving || selectedAlterIds.length === 0,
        run: () => submitAnswer(textDraft) };
    }
    const qIndex = currentQuestion ? Math.max(0, allQuestions.findIndex((q) => q.id === currentQuestion.id)) + 1 : 0;
    const qTag = kind === "color" ? "Colour" : (currentQuestion?.fieldName || (kind === "choice" ? "Pick any" : ""));
    const selectedAlters = selectedAlterIds.map((id) => alters.find((a) => a.id === id)).filter(Boolean);
    const who = (
      <div className="pxm-pn">
        <div className="pxm-ttl">
          <span>Who's answering</span>
          <label className="pxm-switch" style={{ paddingRight: 6 }}>
            <input type="checkbox" checked={syncFront} onChange={(e) => setSyncFront(e.target.checked)} />
            Sync to current {terms.front || "front"}
          </label>
        </div>
        <div className="pxm-row pxm-wrap" style={{ padding: "8px 12px" }}>
          {selectedAlters.map((a) => (
            <button key={a.id} type="button" className="pxm-chip sel" onClick={() => handleToggle(a.id)}
              title={`Remove ${formatAlter(a)}`} aria-label={`Remove ${formatAlter(a)}`}>
              <span className="pxm-sq" style={{ background: a.color || undefined }} />{formatAlter(a)}{a.id === primaryAlterId ? " ★" : ""}
            </button>
          ))}
          {selectedAlters.length === 0 && <span className="pxm-mut" style={{ fontSize: 13 }}>Pick which {terms.alters || "alters"} this answer is for.</span>}
          <button type="button" className={`pxm-chip${pxPickerOpen ? " sel" : ""}`} aria-expanded={pxPickerOpen}
            onClick={() => setPxPickerOpen((v) => !v)} aria-label={`Choose ${terms.alters || "alters"}`}>{pxPickerOpen ? "Done" : "+"}</button>
        </div>
        {pxPickerOpen && (
          <div style={{ padding: "0 12px 10px" }}>
            <FronterPicker alters={alters} primaryId={primaryAlterId} coFronterIds={coFronterIds}
              onToggle={handleToggle} onSetPrimary={handleSetPrimary} onClearAll={handleClearAll} />
            <p className="pxm-mut" style={{ fontSize: 12, marginTop: 6 }}>
              {syncFront
                ? `Mirrors the live ${terms.fronting || "fronting"} state — toggling here also starts/ends ${terms.alter || "alter"} sessions.`
                : `Tapping ${an(terms.alter || "alter")} only attributes this answer to them. ${terms.Fronting || "Fronting"} state isn't changed.`}
            </p>
          </div>
        )}
      </div>
    );
    const question = (
      <div className="pxm-pn pxm-qpanel">
        <div className="pxm-ttl">
          <span>{currentQuestion ? `Question ${qIndex} of ${allQuestions.length}` : "Questions"}</span>
          <span className="pxm-mut" style={{ paddingRight: 6 }}>{qTag}</span>
        </div>
        {!currentQuestion ? (
          <div className="pxm-empty">
            No questions yet. Add custom fields, {terms.alters || "alters"} or your own questions in{" "}
            <button type="button" onClick={() => navigate("/unblend/questions")} className="underline">Manage questions</button>.
          </div>
        ) : (
          <div className="pxm-body">
            <div className="pxm-q">{currentQuestion.prompt}</div>
            {kind === "field_input" && fieldType === "list" && (
              <div className="pxm-mut" style={{ fontSize: 13 }}>Comma-separate items, each is matched on its own.</div>
            )}
            {questionBody}
            {kind === "field_input" && currentQuestion.fieldName && (
              <div className="pxm-mut" style={{ fontSize: 12 }}>
                Saves to each picked {terms.alter || "alter"}'s “{currentQuestion.fieldName}” field.
              </div>
            )}
          </div>
        )}
        {currentQuestion && (
          <div className="pxm-foot">
            <button type="button" className="pxm-btn" onClick={handleShuffle} disabled={saving}>Skip &amp; next</button>
            {primary && (
              <button type="button" className="pxm-btn on" onClick={primary.run} disabled={primary.disabled}>{primary.label}</button>
            )}
          </div>
        )}
      </div>
    );
    const search = (
      <div className="pxm-row" style={{ position: "relative" }}>
        <input className="pxm-input pxm-grow" placeholder="Search questions…" aria-label="Search questions"
          value={questionSearch} onChange={(e) => setQuestionSearch(e.target.value)} />
        <button type="button" className="pxm-btn" onClick={() => navigate("/unblend/questions")}>Manage</button>
        {!desk && questionSearch && (
          <div className="pxm-pn pxm-search-pop">
            {filteredQuestions.length === 0 && <div className="pxm-empty">No matching questions.</div>}
            {filteredQuestions.map((q) => (
              <button key={q.id} type="button" className="pxm-side-row" style={{ minHeight: 40 }}
                onClick={() => { setQuestionId(q.id); setQuestionSearch(""); }}>
                <span className="pxm-side-name" style={{ whiteSpace: "normal" }}>{q.prompt}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
    const customToggle = (
      <label className="pxm-switch">
        <input type="checkbox" checked={!hideCustomFields} onChange={(e) => setHideCustomFieldsPersist(!e.target.checked)} />
        Include custom fields
      </label>
    );
    if (desk) {
      return (
        <div className="pxm pxm-desk os-page-shell" data-tour="get-to-know-me-page">
          <h1 className="sr-only">Get to know me</h1>
          <div className="pxm-pn pxm-side">
            <div className="pxm-ttl"><span>Questions</span><span className="pxm-mut" style={{ paddingRight: 6 }}>{filteredQuestions.length}</span></div>
            <div style={{ padding: "8px 8px 4px" }}>
              <input className="pxm-input" style={{ width: "100%" }} placeholder="Search questions…" aria-label="Search questions"
                value={questionSearch} onChange={(e) => setQuestionSearch(e.target.value)} />
            </div>
            <div className="pxm-side-scroll">
              {filteredQuestions.map((q) => (
                <button key={q.id} type="button" className={`pxm-side-row${currentQuestion?.id === q.id ? " sel" : ""}`}
                  aria-pressed={currentQuestion?.id === q.id} onClick={() => setQuestionId(q.id)}>
                  <span className="pxm-side-name">{q.prompt}</span>
                </button>
              ))}
              {filteredQuestions.length === 0 && <div className="pxm-empty">No matching questions.</div>}
            </div>
            <div className="pxm-side-foot pxm-row" style={{ justifyContent: "space-between" }}>
              {customToggle}
              <button type="button" className="pxm-btn xs" onClick={() => navigate("/unblend/questions")}>Manage</button>
            </div>
          </div>
          <div className="pxm" style={{ minWidth: 0 }}>
            <div className="pxm-intro">Answer questions to build up what Help me unblend knows. Pick who the answer is for, then save.</div>
            {who}
            {question}
          </div>
        </div>
      );
    }
    return (
      <div className="pxm os-page-shell" data-tour="get-to-know-me-page">
        <h1 className="sr-only">Get to know me</h1>
        {who}
        {question}
        {search}
        <div>{customToggle}</div>
      </div>
    );
  }

  return (
    <div className="os-page-shell p-4 sm:p-6 space-y-5" data-tour="get-to-know-me-page">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} aria-label="Back" title="Back">
          <ChevronLeft className="w-4 h-4" />
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

      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Switch checked={!hideCustomFields} onCheckedChange={(on) => setHideCustomFieldsPersist(!on)} />
          Include custom fields
        </label>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search questions…"
          value={questionSearch}
          onChange={(e) => setQuestionSearch(e.target.value)}
          className="pl-9"
        />
        {questionSearch && filteredQuestions.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
            {filteredQuestions.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setQuestionId(q.id);
                  setQuestionSearch("");
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b border-border/30 last:border-b-0"
              >
                {q.prompt}
              </button>
            ))}
          </div>
        )}
        {questionSearch && filteredQuestions.length === 0 && (
          <p className="absolute z-10 left-0 right-0 mt-1 px-3 py-2 text-xs text-muted-foreground bg-popover border border-border rounded-lg shadow-lg">
            No matching questions.
          </p>
        )}
      </div>

      {!currentQuestion ? (
        <section className="rounded-2xl border border-border/50 bg-card p-5">
          <p className="text-sm text-muted-foreground text-center">
            No questions available yet — add some custom fields, {terms.alters || "alters"}, or your own questions in{" "}
            <button onClick={() => navigate("/unblend/questions")} className="text-primary underline">
              Manage questions
            </button>
            .
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

          {questionBody}
        </section>
      )}

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
            Sync to current {terms.front || "front"}
            <Switch checked={syncFront} onCheckedChange={setSyncFront} />
          </label>
        </div>
        <FronterPicker
          alters={alters}
          primaryId={primaryAlterId}
          coFronterIds={coFronterIds}
          onToggle={handleToggle}
          onSetPrimary={handleSetPrimary}
          onClearAll={handleClearAll}
        />
        <p className="text-[0.6875rem] text-muted-foreground leading-snug">
          {syncFront
            ? `Picker mirrors the live ${terms.fronting || "fronting"} state — toggling here also starts/ends ${terms.alter || "alter"} sessions, exactly like Set ${terms.Front || "Front"}ers.`
            : `Tapping a ${terms.alter || "alter"} only attributes this answer to them. ${terms.Fronting || "Fronting"} state isn't changed.`}
        </p>
      </section>
    </div>
  );
}
