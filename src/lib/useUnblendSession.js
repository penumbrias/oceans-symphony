// Help me unblend's question engine, as one hook (new house step 3.1).
// The old page (src/pages/HelpMeUnblend.jsx) and the new house's Support
// room (src/house/support/HouseUnblend.jsx) both run it, so the two doors
// ask the same questions, rank the same way and save the same things: the
// only write is deleting one of the person's own questions, as before.
// Answers are never stored; a session lives as long as the page.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44, localEntities } from "@/api/base44Client";
import { PRESET_QUESTIONS, buildDynamicQuestions, buildDominantFeelingQuestion, instantiateUserQuestion } from "@/lib/unblendQuestions";
import { timeOfDayBaseline, applyAnswer, rankAlters } from "@/lib/unblendScoring";
import { sharedList } from "@/lib/sharedLists";

export const IDK_THRESHOLD_FOR_GROUNDING = 3;

// Pixel look: scores → a share of 100 (softmax), for the "Likely in
// front" bars. Display only; the ranking itself is unchanged.
export function likelyShares(ranked) {
  if (!ranked.length) return new Map();
  const max = Math.max(...ranked.map((r) => r.score));
  const w = ranked.map((r) => Math.exp(r.score - max));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return new Map(ranked.map((r, i) => [r.alter.id, Math.round((w[i] / sum) * 100)]));
}
export const FALLBACK_SWATCHES = ["#7fb3a6", "#c98bb9", "#e3c16f", "#86b88f", "#8fb8e0", "#d98f5b", "#9aa0b4", "#ef8a6a"];

// Returns true if a question can actually discriminate between
// alters given current data. Used to keep useless questions (color
// when no alters have a color set, energy when no roles/tags exist,
// etc.) out of the Help me unblend queue — the user goes to Get to
// know me to seed the data, then they re-appear.
export function questionHasUsefulData(q, activeAlters) {
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

export function useUnblendSession() {
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: sessions = [] } = useQuery({
    ...sharedList("frontingSessions"),
  });

  // EmotionCheckIn history powers the "dominant feeling" question.
  // We pull the user's most-frequently-logged emotions as the
  // options and score by per-alter frequency, so picking "anxious"
  // rewards alters who've logged "anxious" most often.
  const { data: emotionCheckIns = [] } = useQuery({
    ...sharedList("emotionCheckIns"),
  });

  // Custom field definitions — needed so the dynamic-question
  // builder knows which fields are list-type (and should split on
  // commas) vs plain text (treated as one opaque value).
  const { data: customFields = [] } = useQuery({
    ...sharedList("customFields"),
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

  return {
    alters, activeAlters, sessions, queryClient, deleteUserQuestion, activeFronterIds, allQuestions,
    scores, answeredIds, questionIdx, setQuestionIdx, idkCount, groundingNudgeShown, setGroundingNudgeShown,
    colorDraft, setColorDraft, isExhausted, hasNoQuestions, currentQuestion, ranked,
    handleColorPick, handleChoicePick, handleIdk, handleShuffle, handleRestart,
  };
}
