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
import { formatInTimeZone } from "date-fns-tz";

function nowLocalIso() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
}

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

  const activeFronterPrimaryId = useMemo(() => {
    const p = activeFront.find((s) => s.is_primary && s.alter_id);
    if (p) return p.alter_id;
    const legacy = activeFront.find((s) => s.primary_alter_id);
    return legacy?.primary_alter_id || "";
  }, [activeFront]);

  const allQuestions = useMemo(() => {
    const out = [...PRESET_QUESTIONS, ...buildDynamicQuestions(alters, customFields)];
    const feelQ = buildDominantFeelingQuestion(emotionCheckIns);
    if (feelQ) out.push(feelQ);
    // Cycle through every custom field even if no alters have filled
    // it in yet — that's the whole point of Get to know me. Suppress
    // duplicates with dyn_field_<id> (which only appears when 2+
    // alters have it filled with 2+ distinct values).
    const fieldQs = buildAllFieldQuestions(alters, customFields);
    const haveDynForField = new Set(out.filter((q) => q.id?.startsWith("dyn_field_")).map((q) => q.id.slice("dyn_field_".length)));
    for (const fq of fieldQs) {
      if (haveDynForField.has(fq.fieldId)) continue;
      out.push(fq);
    }
    for (const rec of userRecords) {
      const q = instantiateUserQuestion(rec, { alters, customFields });
      if (q) out.push(q);
    }
    return out;
  }, [alters, customFields, emotionCheckIns, userRecords]);

  const [questionSearch, setQuestionSearch] = useState("");
  const filteredQuestions = useMemo(() => {
    const q = questionSearch.trim().toLowerCase();
    if (!q) return allQuestions;
    return allQuestions.filter((x) => (x.prompt || "").toLowerCase().includes(q));
  }, [allQuestions, questionSearch]);

  const [questionId, setQuestionId] = useState(null);
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
  const [choiceDraft, setChoiceDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleShuffle = () => {
    const pool = filteredQuestions.length > 0 ? filteredQuestions : allQuestions;
    if (pool.length < 2) {
      if (pool.length === 1) setQuestionId(pool[0].id);
      return;
    }
    const others = pool.filter((q) => q.id !== questionId);
    const pick = others[Math.floor(Math.random() * others.length)];
    setQuestionId(pick.id);
    setColorDraft("#8b5cf6");
    setTextDraft("");
    setChoiceDraft(null);
  };

  // Pre-fill the draft with the selected alters' existing value(s)
  // when the question or selection changes — so the user can see
  // what's already there and edit rather than re-typing from blank.
  // If selected alters disagree, fall back to the first one's value.
  useEffect(() => {
    setChoiceDraft(null);
    if (!currentQuestion) {
      setColorDraft("#8b5cf6");
      setTextDraft("");
      return;
    }
    const picked = selectedAlterIds
      .map((id) => alters.find((a) => a.id === id))
      .filter(Boolean);
    if (currentQuestion.kind === "color") {
      const colors = picked.map((a) => a.color).filter(Boolean);
      setColorDraft(colors[0] || "#8b5cf6");
    } else if (currentQuestion.kind === "field_input") {
      const fid = currentQuestion.fieldId;
      const values = picked
        .map((a) => (a.alter_custom_fields && typeof a.alter_custom_fields[fid] === "string" ? a.alter_custom_fields[fid] : ""))
        .filter(Boolean);
      setTextDraft(values[0] || "");
    } else {
      setTextDraft("");
    }
  }, [questionId, selectedAlterIds, currentQuestion, alters]);

  // Sync-to-front variants: mutate FrontingSession on every toggle.
  // Mirrors SetFrontModal's save semantics — end existing sessions
  // that no longer match desired state, create new ones for added
  // alters or changed primary status. Refetch active sessions every
  // time so we never operate on stale state.
  const applyFrontMutation = useCallback(
    async (nextPrimary, nextCoIds) => {
      const now = nowLocalIso();
      const desiredMap = {};
      const all = [nextPrimary, ...nextCoIds].filter(Boolean);
      for (const id of all) desiredMap[id] = id === nextPrimary;

      const active = await base44.entities.FrontingSession.filter({ is_active: true });
      const sessionsByAlter = {};
      for (const s of active.filter((s) => s.alter_id)) {
        (sessionsByAlter[s.alter_id] ||= []).push(s);
      }
      // End legacy sessions (no alter_id)
      for (const s of active.filter((s) => !s.alter_id && s.primary_alter_id)) {
        await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
      }
      for (const [alterId, sessions] of Object.entries(sessionsByAlter)) {
        const desiredPrimary = desiredMap[alterId];
        const isPresent = alterId in desiredMap;
        const hasDuplicates = sessions.length > 1;
        if (!isPresent) {
          for (const s of sessions) await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
        } else if (hasDuplicates) {
          for (const s of sessions) await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
        } else if (sessions[0].is_primary !== desiredPrimary) {
          await base44.entities.FrontingSession.update(sessions[0].id, { is_active: false, end_time: now });
        }
      }
      for (const id of all) {
        const sessions = sessionsByAlter[id] || [];
        const hasDuplicates = sessions.length > 1;
        const single = sessions.length === 1 ? sessions[0] : null;
        const statusUnchanged = single && single.is_primary === desiredMap[id];
        if (hasDuplicates || !statusUnchanged) {
          await base44.entities.FrontingSession.create({
            alter_id: id,
            is_primary: desiredMap[id],
            start_time: now,
            is_active: true,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontingSessions"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    },
    [queryClient]
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

          {currentQuestion.kind === "color" && (
            <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
              <div className="w-full sm:w-auto">
                <HexColorPicker color={colorDraft} onChange={setColorDraft} style={{ width: "100%", maxWidth: 280, height: 200 }} />
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
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {currentQuestion.options.map((opt) => {
                  const selected = choiceDraft?.id === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setChoiceDraft(opt)}
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
              <Button
                onClick={() => submitAnswer(choiceDraft)}
                disabled={!choiceDraft || saving || selectedAlterIds.length === 0}
                className="w-full"
              >
                Save &amp; next
              </Button>
            </div>
          )}

          {currentQuestion.kind === "field_input" && (
            <div className="space-y-3">
              {currentQuestion.options.length > 0 && (
                <div className="flex flex-wrap gap-2">
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
              <div className="flex gap-2">
                <Input
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  placeholder={
                    currentQuestion.options.length > 0
                      ? "…or type a different answer"
                      : "Type your answer"
                  }
                  className="flex-1"
                />
                <Button
                  onClick={() => submitAnswer(textDraft)}
                  disabled={!textDraft.trim() || saving || selectedAlterIds.length === 0}
                >
                  Save &amp; next
                </Button>
              </div>
            </div>
          )}
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
