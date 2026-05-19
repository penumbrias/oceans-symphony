import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Shuffle, HelpCircle, Wind, RotateCcw, Heart } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { PRESET_QUESTIONS } from "@/lib/unblendQuestions";
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

const COLOR_SWATCHES = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#78716c", "#a8a29e", "#fafaf9",
];

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

  // Tracks the current question, the order/queue of remaining
  // questions, accumulated scores, and a tally of "idk" answers for
  // the grounding nudge.
  const [scores, setScores] = useState({});
  const [questionIdx, setQuestionIdx] = useState(0);
  const [questionOrder, setQuestionOrder] = useState(() => PRESET_QUESTIONS.map((q) => q.id));
  const [idkCount, setIdkCount] = useState(0);
  const [groundingNudgeShown, setGroundingNudgeShown] = useState(false);

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

  const currentQuestion = useMemo(() => {
    const id = questionOrder[questionIdx % questionOrder.length];
    return PRESET_QUESTIONS.find((q) => q.id === id) || PRESET_QUESTIONS[0];
  }, [questionOrder, questionIdx]);

  const ranked = useMemo(() => rankAlters(scores, activeAlters), [scores, activeAlters]);

  const recordAnswer = (deltasByAlter) => {
    setScores((prev) => applyAnswer(prev, deltasByAlter));
    setIdkCount(0);
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
    setQuestionOrder(PRESET_QUESTIONS.map((q) => q.id));
    if (activeAlters.length > 0) {
      setScores(timeOfDayBaseline(sessions, activeAlters, new Date()));
    } else {
      setScores({});
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 pb-32 space-y-5">
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

      {/* Current question card */}
      <section className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold text-foreground leading-snug">
            {currentQuestion.prompt}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShuffle}
            aria-label="Different question"
            className="gap-1.5 text-xs flex-shrink-0"
          >
            <Shuffle className="w-3.5 h-3.5" /> Different
          </Button>
        </div>

        {currentQuestion.kind === "color" && (
          <div className="grid grid-cols-10 gap-1.5">
            {COLOR_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => handleColorPick(hex)}
                aria-label={`Pick color ${hex}`}
                className="aspect-square rounded-full border border-border/40 hover:scale-110 transition-transform"
                style={{ backgroundColor: hex }}
              />
            ))}
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

      {/* Likely fronters strip — always visible. Sticks to the
          bottom on mobile so the user can keep eyes on the
          narrowing list while answering. */}
      <div className="fixed left-0 right-0 bottom-0 z-30 bg-background/95 backdrop-blur border-t border-border/50 p-3 sm:relative sm:bg-transparent sm:backdrop-blur-none sm:border-t-0 sm:p-0 sm:mt-6">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">
            Likely {terms.fronters || "fronters"} right now
          </p>
          {activeAlters.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-1">
              No {terms.alters || "alters"} yet — add some to start using this.
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {ranked.slice(0, 8).map(({ alter, score }) => (
                <button
                  key={alter.id}
                  type="button"
                  onClick={() => navigate(`/alter/${alter.id}`)}
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/40 bg-card hover:bg-muted/40 transition-colors"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: alter.color || "#94a3b8" }}
                  />
                  <span className="text-sm">{alter.name}</span>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {score > 0 ? `+${score.toFixed(1)}` : score.toFixed(1)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
