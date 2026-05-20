import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HexColorPicker } from "react-colorful";
import { base44, localEntities } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Shuffle, HelpCircle, Wind, RotateCcw, Heart, Zap, Trash2, Sparkles, Cog } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { PRESET_QUESTIONS, buildDynamicQuestions, buildDominantFeelingQuestion, instantiateUserQuestion } from "@/lib/unblendQuestions";
import { toast } from "sonner";
import {
  timeOfDayBaseline,
  applyAnswer,
  rankAlters,
} from "@/lib/unblendScoring";

// "Help me unblend" — a gentle, customisable identification helper
// for figuring out which alter is fronting. Built around the spec
// from the testers chat:
//
//   - Questions go broad → specific. Color question is usually
//     first since it's the easiest signal to identify.
//   - Always-visible "Likely fronters" strip at the bottom,
//     populated initially from time-of-day fronting history and
//     narrowed by each answer.
//   - Shuffle button picks a random different unanswered question.
//   - "I don't know" advances without scoring.
//   - After 3 IDKs the page suggests a grounding break (route to
//     /grounding) to help unblend instead of pushing harder.
//   - Tone throughout: reconnecting with the body, not interrogation.
//
// This is the barebones v1. Custom user-added questions and a
// "save this state as <alter>" affordance are deliberately deferred
// to a follow-up — the engine in unblendScoring.js + unblendQuestions.js
// is structured so adding both later is a small change.
const IDK_THRESHOLD_FOR_GROUNDING = 3;

// Returns true if a question can actually discriminate between
// alters given current data. Used to keep useless questions (color
// when no alters have a color set, energy when no roles/tags exist,
// etc.) out of the Help me unblend queue — the user goes to Get to
// know me to seed the data, then they re-appear.
function questionHasUsefulData(q, activeAlters) {
  if (!q || !Array.isArray(activeAlters) || activeAlters.length < 2) return false;
  if (q.kind === "color") {
    // Only need ≥1 alter with a colour set — picking a colour still
    // narrows toward that alter even if it's the only one with a
    // defined colour. Stricter ≥2 made the queue dry up too fast.
    return activeAlters.filter((a) => a.color).length >= 1;
  }
  if (q.kind === "choice" && Array.isArray(q.options) && typeof q.score === "function") {
    for (const opt of q.options) {
      for (const a of activeAlters) {
        if ((q.score(a, opt) || 0) !== 0) return true;
      }
    }
    return false;
  }
  return false;
}

export default function HelpMeUnblend() {
  const navigate = useNavigate();
  const terms = useTerms();

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontingSessions"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 500),
  });

  // EmotionCheckIn history powers the "dominant feeling" question.
  // We pull the user's most-frequently-logged emotions as the
  // options and score by per-alter frequency, so picking "anxious"
  // rewards alters who've logged "anxious" most often.
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list("-timestamp", 1000),
  });

  // Custom field definitions — needed so the dynamic-question
  // builder knows which fields are list-type (and should split on
  // commas) vs plain text (treated as one opaque value).
  const { data: customFields = [] } = useQuery({
    queryKey: ["customFields"],
    queryFn: () => base44.entities.CustomField.list("order"),
  });

  // User-defined questions live in a local entity so they survive
  // restarts without needing server sync. Each record is just the
  // user's saved spec; instantiateUserQuestion turns it into a
  // runtime question object with a score() function.
  const queryClient = useQueryClient();
  const { data: userQuestionRecords = [] } = useQuery({
    queryKey: ["unblendQuestions"],
    queryFn: () => localEntities.UnblendQuestion.list(),
  });
  // Built-in / auto-generated questions the user has hidden via the
  // Manage Unblend Questions page. We filter them out of the queue
  // entirely so they don't reappear.
  const { data: hiddenUnblendRecords = [] } = useQuery({
    queryKey: ["hiddenUnblendQuestions"],
    queryFn: () => localEntities.HiddenUnblendQuestion.list(),
  });
  const hiddenUnblendIds = useMemo(
    () => new Set((hiddenUnblendRecords || []).map((r) => r.originalId)),
    [hiddenUnblendRecords]
  );

  // Add-question lives in /unblend/questions now — this page only
  // surfaces existing questions and reads them. Delete affordance
  // stays here so a user can quickly drop a question they're tired
  // of seeing without leaving the flow.
  const deleteUserQuestion = async (id) => {
    await localEntities.UnblendQuestion.delete(id);
    queryClient.invalidateQueries({ queryKey: ["unblendQuestions"] });
    toast.success("Question removed");
  };

  // Currently-fronting alters — pinned to the top of the likely
  // list like the Alters grid does, regardless of question score.
  // Refetched live so a switch the user does mid-session immediately
  // reorders the list.
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
    return set;
  }, [activeFront]);

  // Tracks the current question, the order/queue of remaining
  // questions, accumulated scores, and a tally of "idk" answers for
  // the grounding nudge.
  const [scores, setScores] = useState({});
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answeredIds, setAnsweredIds] = useState(() => new Set());
  // Question pool = presets + alter-data dynamic questions
  // (pronouns, role, custom fields) + dynamic emotion question
  // (top logged emotions) + user-defined questions instantiated
  // against the live alter set. Then filter to only questions that
  // would actually discriminate between alters — otherwise the user
  // burns through prompts that can't move the ranker.
  const allQuestions = useMemo(() => {
    const out = [...PRESET_QUESTIONS, ...buildDynamicQuestions(alters, customFields)];
    const feelQ = buildDominantFeelingQuestion(emotionCheckIns);
    if (feelQ) out.push(feelQ);
    for (const rec of userQuestionRecords) {
      const q = instantiateUserQuestion(rec, { alters, customFields });
      if (q) out.push(q);
    }
    const active = (alters || []).filter((a) => !a.is_archived);
    return out
      .filter((q) => !hiddenUnblendIds.has(q.id))
      .filter((q) => questionHasUsefulData(q, active));
  }, [alters, customFields, emotionCheckIns, userQuestionRecords, hiddenUnblendIds]);
  const [questionOrder, setQuestionOrder] = useState([]);
  // Keep questionOrder in sync once alters resolve — append dynamic
  // ids the user hasn't seen yet to the end of the queue so the
  // existing presets still front-load.
  useEffect(() => {
    const liveIds = allQuestions.map((q) => q.id);
    setQuestionOrder((prev) => {
      const kept = prev.filter((id) => liveIds.includes(id));
      const known = new Set(kept);
      const additions = liveIds.filter((id) => !known.has(id));
      const next = [...kept, ...additions];
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      return next;
    });
  }, [allQuestions]);
  const [idkCount, setIdkCount] = useState(0);
  const [groundingNudgeShown, setGroundingNudgeShown] = useState(false);
  // Working color value for the color-question. The user can drag
  // around the picker before committing — only "Use this colour"
  // submits the answer. Reset to a neutral default when the
  // question is re-shown so a previous selection doesn't leak.
  const [colorDraft, setColorDraft] = useState("#8b5cf6");

  // Seed the baseline once alters + sessions resolve.
  const activeAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  useEffect(() => {
    if (activeAlters.length === 0) return;
    const baseline = timeOfDayBaseline(sessions, activeAlters, new Date());
    setScores(baseline);
    // Re-seeding when alters or sessions change is fine — the user
    // hasn't answered anything yet at first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alters.length, sessions.length]);

  const isExhausted = allQuestions.length > 0 && answeredIds.size >= allQuestions.length;
  const hasNoQuestions = allQuestions.length === 0;
  const currentQuestion = useMemo(() => {
    if (questionOrder.length === 0) return null;
    const id = questionOrder[questionIdx % questionOrder.length];
    return allQuestions.find((q) => q.id === id) || allQuestions[0] || null;
  }, [questionOrder, questionIdx, allQuestions]);

  // Final ranking: current fronters pinned to the top (just like the
  // Alters grid does), then everyone else by score descending. Ties
  // resolved alphabetically so the list is deterministic.
  const ranked = useMemo(() => {
    const scored = rankAlters(scores, activeAlters);
    const isActive = (a) => activeFronterIds.has(a.id);
    return scored.sort((a, b) => {
      const aActive = isActive(a.alter);
      const bActive = isActive(b.alter);
      if (aActive !== bActive) return aActive ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return (a.alter.name || "").localeCompare(b.alter.name || "");
    });
  }, [scores, activeAlters, activeFronterIds]);

  const recordAnswer = (deltasByAlter) => {
    setScores((prev) => applyAnswer(prev, deltasByAlter));
    setIdkCount(0);
    if (currentQuestion?.id) {
      setAnsweredIds((prev) => {
        const next = new Set(prev);
        next.add(currentQuestion.id);
        return next;
      });
    }
    setQuestionIdx((i) => i + 1);
  };

  const handleColorPick = (hex) => {
    const deltas = {};
    for (const a of activeAlters) {
      deltas[a.id] = currentQuestion.score?.(a, hex) ?? 0;
    }
    recordAnswer(deltas);
  };

  const handleChoicePick = (opt) => {
    const deltas = {};
    for (const a of activeAlters) {
      deltas[a.id] = currentQuestion.score?.(a, opt) ?? 0;
    }
    recordAnswer(deltas);
  };

  const handleIdk = () => {
    setIdkCount((n) => {
      const next = n + 1;
      if (next >= IDK_THRESHOLD_FOR_GROUNDING && !groundingNudgeShown) {
        setGroundingNudgeShown(true);
      }
      return next;
    });
    setQuestionIdx((i) => i + 1);
  };

  const handleShuffle = () => {
    // Pick a different question id at random (any question, even
    // already-shown — repeats are fine, they just refine the score).
    const others = questionOrder.filter((_, i) => i !== (questionIdx % questionOrder.length));
    if (others.length === 0) return;
    const pickId = others[Math.floor(Math.random() * others.length)];
    // Swap into the current slot.
    const next = questionOrder.slice();
    next[questionIdx % questionOrder.length] = pickId;
    setQuestionOrder(next);
  };

  const handleRestart = () => {
    setQuestionIdx(0);
    setIdkCount(0);
    setGroundingNudgeShown(false);
    setAnsweredIds(new Set());
    setQuestionOrder(allQuestions.map((q) => q.id));
    if (activeAlters.length > 0) {
      setScores(timeOfDayBaseline(sessions, activeAlters, new Date()));
    } else {
      setScores({});
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
            <Heart className="w-5 h-5 text-primary" />
            Help me unblend
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            A gentle series of questions to reconnect with whoever's here now.
            Skip anything you don't want to answer — the goal is grounding, not interrogation.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/get-to-know-me")} className="gap-1.5" title="Build up data by answering when grounded">
          <Sparkles className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate("/unblend/questions")} className="gap-1.5" title="Manage questions">
          <Cog className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleRestart} aria-label="Restart">
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      {/* Grounding nudge — appears after 3 "I don't know"s. The user
          can dismiss or jump to the Grounding page. */}
      {groundingNudgeShown && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Wind className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              Want to take a grounding break?
            </p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            When it's hard to tell who's here, sometimes the answer is "we need
            a moment first". A short breathing or grounding exercise can help
            things settle before coming back to this.
          </p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => navigate("/grounding")} className="gap-1.5">
              <Wind className="w-3.5 h-3.5" /> Open grounding
            </Button>
            <Button size="sm" variant="outline" onClick={() => setGroundingNudgeShown(false)}>
              Not right now
            </Button>
          </div>
        </div>
      )}

      {(hasNoQuestions || isExhausted) && (
        <section className="rounded-2xl border border-primary/40 bg-primary/5 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-primary">
              {hasNoQuestions
                ? `Not enough ${terms.alter || "alter"} data to ask anything useful yet`
                : "You've worked through every question we can ask right now"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Help me unblend only asks questions whose answer would actually narrow the list. To unlock more, fill in {terms.alter || "alter"} colours, pronouns, roles, ages, or custom fields — or use Get to know me to seed answers when you're grounded enough to.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => navigate("/get-to-know-me")} className="gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Get to know me
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/Home")} className="gap-1.5">
              Open {terms.alters || "alters"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/unblend/questions")} className="gap-1.5">
              <Cog className="w-3.5 h-3.5" /> Manage questions
            </Button>
            {isExhausted && (
              <Button size="sm" variant="ghost" onClick={handleRestart} className="gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Start over
              </Button>
            )}
          </div>
        </section>
      )}

      {/* Current question card */}
      {currentQuestion && !isExhausted && !hasNoQuestions && (
      <section className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold text-foreground leading-snug">
            {currentQuestion.prompt}
          </p>
          <div className="flex items-center gap-1 flex-shrink-0">
            {currentQuestion?.userId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm("Delete this question?")) {
                    deleteUserQuestion(currentQuestion.userId);
                    setQuestionIdx((i) => i + 1);
                  }
                }}
                aria-label="Delete this question"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShuffle}
              aria-label="Different question"
              className="gap-1.5 text-xs"
            >
              <Shuffle className="w-3.5 h-3.5" /> Shuffle
            </Button>
          </div>
        </div>

        {currentQuestion.kind === "color" && (
          <div className="space-y-3">
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
                  <div
                    className="w-12 h-12 rounded-xl border border-border/60 flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: colorDraft }}
                  />
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
                  onClick={() => handleColorPick(colorDraft)}
                  disabled={!/^#[0-9a-fA-F]{6}$/.test(colorDraft)}
                  className="w-full"
                >
                  Use this colour
                </Button>
                <p className="text-[0.6875rem] text-muted-foreground text-center">
                  Drag the picker or type a hex value — the list re-ranks toward {terms.alters || "alters"} with similar colours.
                </p>
              </div>
            </div>
          </div>
        )}

        {currentQuestion.kind === "choice" && (
          <div className="flex flex-wrap gap-2">
            {currentQuestion.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleChoicePick(opt)}
                className="px-3 py-1.5 rounded-full border border-border/60 hover:border-primary hover:bg-primary/5 text-sm transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-border/30">
          <Button variant="ghost" size="sm" onClick={handleIdk} className="gap-1.5 text-xs">
            <HelpCircle className="w-3.5 h-3.5" /> I don't know
          </Button>
          <p className="text-[0.6875rem] text-muted-foreground">
            {idkCount > 0 ? `${idkCount} skipped` : "Skipping is fine"}
          </p>
        </div>
      </section>
      )}

      {/* Likely fronters — full scrollable list of every active
          alter, sorted by likeliness. Current fronters are pinned to
          the top (just like the Alters grid). Below them, alters
          ranked by question-score (which already includes the
          time-of-day baseline). Inline on the page so the bottom
          nav bar can't obscure it. */}
      <section className="rounded-2xl border border-border/50 bg-card p-4 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">
            Likely {terms.fronters || "fronters"} right now
          </p>
          <p className="text-[0.6875rem] text-muted-foreground">
            {activeFronterIds.size > 0
              ? `${activeFronterIds.size} ${terms.fronting || "fronting"} · ${ranked.length} total`
              : `${ranked.length} ${terms.alters || "alters"}`}
          </p>
        </div>
        {activeAlters.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No {terms.alters || "alters"} yet — add some to start using this.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {ranked.map(({ alter, score }) => {
              const isActive = activeFronterIds.has(alter.id);
              const scoreLabel = score > 0 ? `+${score.toFixed(1)}` : score.toFixed(1);
              return (
                <button
                  key={alter.id}
                  type="button"
                  onClick={() => navigate(`/alter/${alter.id}`)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-colors ${
                    isActive
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-border/40 bg-card hover:bg-muted/40"
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30"
                    style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}
                  >
                    {alter.avatar_url ? (
                      <img src={alter.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-white">
                        {(alter.name || "?").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{alter.name}</p>
                      {isActive && (
                        <span className="inline-flex items-center gap-0.5 text-[0.625rem] font-semibold text-amber-600 dark:text-amber-400">
                          <Zap className="w-2.5 h-2.5 fill-current" /> {terms.fronting || "fronting"}
                        </span>
                      )}
                    </div>
                    {alter.role && (
                      <p className="text-[0.6875rem] text-muted-foreground truncate">{alter.role}</p>
                    )}
                  </div>
                  <span className="text-[0.6875rem] text-muted-foreground flex-shrink-0 tabular-nums">
                    {scoreLabel}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
