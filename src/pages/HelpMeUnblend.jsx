import React, { useMemo, useState } from "react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { useNavigate } from "react-router-dom";
import { HexColorPicker } from "react-colorful";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Shuffle, HelpCircle, Wind, RotateCcw, Heart, Zap, Trash2, Sparkles, Cog } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { toast } from "sonner";
import { normalizeHexInput } from "@/lib/colorUtils";
import { useUiLook } from "@/lib/uiLook";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { changeFront } from "@/lib/setFront";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import "@/styles/pixel/care.css";
import { useUnblendSession, likelyShares, FALLBACK_SWATCHES } from "@/lib/useUnblendSession";

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

// Resolves local-image:// avatars (raw <img src> renders them broken).
function RankedAlterAvatar({ alter }) {
  const resolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);
  return resolvedUrl ? (
    <img src={resolvedUrl} alt="" className="w-full h-full object-cover" />
  ) : (
    <span className="text-xs font-bold text-white">
      {(alter.name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

export default function HelpMeUnblend() {
  const navigate = useNavigate();
  const terms = useTerms();
  const pixel = useUiLook() === "pixel";

  // The question engine (shared with the new house's Support room).
  const {
    activeAlters, queryClient, deleteUserQuestion, activeFronterIds, answeredIds, setQuestionIdx, idkCount,
    groundingNudgeShown, setGroundingNudgeShown, colorDraft, setColorDraft, isExhausted, hasNoQuestions,
    currentQuestion, ranked, handleColorPick, handleChoicePick, handleIdk, handleShuffle, handleRestart,
  } = useUnblendSession();

  if (pixel) {
    return (
      <UnblendPixel {...{ terms, navigate, ranked, activeAlters, activeFronterIds, answeredIds, currentQuestion,
        isExhausted, hasNoQuestions, colorDraft, setColorDraft, handleColorPick, handleChoicePick, handleIdk,
        handleShuffle, handleRestart, idkCount, groundingNudgeShown, setGroundingNudgeShown, deleteUserQuestion,
        setQuestionIdx, queryClient }} />
    );
  }

  return (
    <div className="os-page-shell p-4 sm:p-6 space-y-5" data-tour="unblend-page">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} aria-label="Back" title="Back">
          <ChevronLeft className="w-4 h-4" />
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
        <Button variant="ghost" size="sm" onClick={() => navigate("/unblend/questions")} className="gap-1.5" title="Manage questions" data-tour="unblend-manage-btn">
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
                onClick={async () => {
                  if ((await confirm("Delete this question?"))) {
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
                    // Free typing (the old filter swallowed keystrokes once
                    // the field was full, and rejected codes without a "#");
                    // validity gates the button below via normalizeHexInput.
                    onChange={(e) => setColorDraft(e.target.value)}
                    onFocus={(e) => { try { e.target.select(); } catch { /* non-fatal */ } }}
                    className="flex-1 h-10 px-3 rounded-md border border-border bg-background text-sm font-mono"
                    maxLength={9}
                  />
                </div>
                <Button
                  onClick={() => handleColorPick(normalizeHexInput(colorDraft) || colorDraft)}
                  disabled={!normalizeHexInput(colorDraft)}
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
                    <RankedAlterAvatar alter={alter} />
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

// The pixel look (UnblendPhone mockup): "Likely in front" as bars with a
// one-tap set front for the top one, the question in its own panel with
// Skip / Different question / Restart along the bottom, and the colour
// question as swatches (the alters' own colours) plus the app's colour
// picker — never the browser's. Same state and handlers as the page.
function UnblendAvatar({ alter }) {
  const url = useResolvedAvatarUrl(alter?.avatar_url);
  return (
    <span className="px-ub-av" style={{ background: alter.color || "var(--px-hi)" }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : null}
    </span>
  );
}

function UnblendPixel({
  terms, navigate, ranked, activeAlters, activeFronterIds, answeredIds, currentQuestion, isExhausted, hasNoQuestions,
  colorDraft, setColorDraft, handleColorPick, handleChoicePick, handleIdk, handleShuffle, handleRestart, idkCount,
  groundingNudgeShown, setGroundingNudgeShown, deleteUserQuestion, setQuestionIdx, queryClient,
}) {
  const formatAlter = useAlterLabel();
  const [showAll, setShowAll] = useState(false);
  const [picking, setPicking] = useState(false);
  const [setting, setSetting] = useState(false);
  const shares = useMemo(() => likelyShares(ranked), [ranked]);
  const shown = showAll ? ranked : ranked.slice(0, 4);
  const top = ranked[0]?.alter || null;
  const topIsSoleFront = top && activeFronterIds.has(top.id);
  const swatches = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const a of activeAlters) {
      const c = normalizeHexInput(a.color || "");
      if (c && !seen.has(c.toLowerCase())) { seen.add(c.toLowerCase()); out.push(c); }
      if (out.length >= 8) break;
    }
    for (const c of FALLBACK_SWATCHES) {
      if (out.length >= 8) break;
      if (!seen.has(c)) { seen.add(c); out.push(c); }
    }
    return out;
  }, [activeAlters]);
  const draft = normalizeHexInput(colorDraft);
  const setFrontToTop = async () => {
    if (!top) return;
    setSetting(true);
    try {
      // The one front write path, like the "set front" quick action.
      // Adds them to who's in front; everyone already there stays (no silent replace).
      await changeFront((cur) => (cur.some((x) => x.alterId === top.id) ? cur : [...cur, { alterId: top.id }]),
        { queryClient, terms, alters: activeAlters });
      toast.success(`${formatAlter(top)} added to ${terms.front}`);
    } catch (e) {
      toast.error(e?.message || "Couldn't change that.");
    } finally {
      setSetting(false);
    }
  };
  const asking = currentQuestion && !isExhausted && !hasNoQuestions;

  return (
    <div className="px-cr" data-tour="unblend-page">
      <div className="px-cr-head">
        <h1 className="px-cr-title">Help me unblend</h1>
        <button type="button" className="px-cr-btn" onClick={() => navigate("/unblend/questions")} data-tour="unblend-manage-btn">Manage questions</button>
      </div>
      <p className="px-cr-mut" style={{ margin: 0, fontSize: 13 }}>
        A gentle series of questions to reconnect with whoever's here now. Skip anything you don't want to answer.
      </p>
      {groundingNudgeShown && (
        <section className="px-cr-pn px-ub-nudge">
          <p className="px-cr-pf" style={{ margin: 0 }}>Want to take a grounding break?</p>
          <p className="px-cr-mut" style={{ margin: 0, fontSize: 13 }}>
            When it's hard to tell who's here, sometimes the answer is "we need a moment first". A short breathing or grounding exercise can help things settle before coming back to this.
          </p>
          <div className="px-cr-row">
            <button type="button" className="px-cr-btn on" onClick={() => navigate("/grounding")}>Open grounding</button>
            <button type="button" className="px-cr-btn" onClick={() => setGroundingNudgeShown(false)}>Not right now</button>
          </div>
        </section>
      )}
      <div className="px-cr-grid">
        <section className="px-cr-pn">
          <h2 className="px-cr-ttl">
            <span>Likely in front</span>
            <span className="px-cr-mut">{answeredIds.size ? `after ${answeredIds.size} answer${answeredIds.size === 1 ? "" : "s"}` : "from the time of day"}</span>
          </h2>
          {activeAlters.length === 0 ? (
            <p className="px-cr-empty">No {terms.alters} yet. Add some to start using this.</p>
          ) : (
            <>
              <div style={{ paddingTop: 4 }}>
                {shown.map(({ alter }) => {
                  const p = shares.get(alter.id) || 0;
                  const fronting = activeFronterIds.has(alter.id);
                  return (
                    <button key={alter.id} type="button" className="px-ub-row" onClick={() => navigate(`/alter/${alter.id}`)}
                      aria-label={`${formatAlter(alter)}, ${p}%${fronting ? `, ${terms.fronting}` : ""}`}>
                      <UnblendAvatar alter={alter} />
                      <span className="px-ub-name" style={alter.color ? { color: alter.color } : undefined}>{formatAlter(alter)}</span>
                      <span className="px-ub-bar px-cr-ins"><span style={{ width: `${p}%`, background: alter.color || "var(--color-primary)" }} /></span>
                      <span className="px-ub-pc">{fronting ? <span className="px-ub-on">{terms.front}</span> : `${p}%`}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                {ranked.length > 4 && (
                  <button type="button" className="px-cr-link" style={{ alignSelf: "flex-start" }} onClick={() => setShowAll((v) => !v)}>
                    {showAll ? "Show the top four" : `Show all ${ranked.length} ${terms.alters}`}
                  </button>
                )}
                {top && (
                  <button type="button" className="px-cr-btn on" style={{ width: "100%", minHeight: 52 }}
                    disabled={setting || topIsSoleFront} onClick={setFrontToTop}>
                    {topIsSoleFront ? `${formatAlter(top)} is ${terms.fronting}` : `Add ${formatAlter(top)} to ${terms.front}`}
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        <div className="px-cr-col">
          {(hasNoQuestions || isExhausted) && (
            <section className="px-cr-pn">
              <h2 className="px-cr-ttl"><span>{hasNoQuestions ? "Nothing to ask yet" : "That's every question"}</span></h2>
              <div className="px-ub-q">
                <p style={{ margin: 0 }}>
                  {hasNoQuestions
                    ? `Not enough ${terms.alter} data to ask anything useful yet.`
                    : "You've worked through every question we can ask right now."}
                </p>
                <p className="px-cr-mut" style={{ margin: 0, fontSize: 13 }}>
                  Help me unblend only asks questions whose answer would actually narrow the list. To unlock more, fill in {terms.alter} colours, pronouns, roles, ages, or custom fields, or use Get to know me to seed answers when you're grounded enough to.
                </p>
                <div className="px-ub-opts">
                  <button type="button" className="px-cr-btn on" onClick={() => navigate("/get-to-know-me")}>Get to know me</button>
                  <button type="button" className="px-cr-btn" onClick={() => navigate("/Home")}>Open {terms.alters}</button>
                  {isExhausted && <button type="button" className="px-cr-btn" onClick={handleRestart}>Start over</button>}
                </div>
              </div>
            </section>
          )}

          {asking && (
            <section className="px-cr-pn">
              <h2 className="px-cr-ttl">
                <span>Question {answeredIds.size + 1}</span>
                <span className="px-cr-mut">{idkCount > 0 ? `${idkCount} skipped` : "skipping is fine"}</span>
              </h2>
              <div className="px-ub-q">
                <p className="px-ub-prompt">{currentQuestion.prompt}</p>
                {currentQuestion.kind === "color" && (
                  <>
                    <div className="px-ub-sw">
                      {swatches.map((c) => (
                        <button key={c} type="button" style={{ background: c }} aria-label={`Colour ${c}`}
                          aria-pressed={draft?.toLowerCase() === c.toLowerCase()} onClick={() => setColorDraft(c)} />
                      ))}
                    </div>
                    <div className="px-cr-row">
                      <button type="button" className="px-cr-btn" onClick={() => setPicking(true)}>
                        <span className="px-cr-sq" style={{ background: draft || "transparent" }} aria-hidden="true" /> Another colour…
                      </button>
                    </div>
                    <button type="button" className="px-cr-btn" disabled={!draft} onClick={() => handleColorPick(draft || colorDraft)}>Use this colour</button>
                    <p className="px-cr-mut" style={{ margin: 0, fontSize: 12 }}>The list re-ranks toward {terms.alters} with similar colours.</p>
                  </>
                )}
                {currentQuestion.kind === "choice" && (
                  <div className="px-ub-opts">
                    {currentQuestion.options.map((opt) => (
                      <button key={opt.id} type="button" className="px-cr-btn" onClick={() => handleChoicePick(opt)}>{opt.label}</button>
                    ))}
                  </div>
                )}
                {currentQuestion.userId && (
                  <button type="button" className="px-cr-link" style={{ alignSelf: "flex-start" }}
                    onClick={async () => {
                      if (await confirm("Delete this question?")) {
                        deleteUserQuestion(currentQuestion.userId);
                        setQuestionIdx((i) => i + 1);
                      }
                    }}>Delete this question</button>
                )}
              </div>
              <div className="px-ub-foot">
                <button type="button" className="px-cr-btn" onClick={handleIdk}>Skip</button>
                <button type="button" className="px-cr-btn" onClick={handleShuffle}>Different question</button>
                <button type="button" className="px-cr-btn" onClick={handleRestart}>Restart</button>
              </div>
            </section>
          )}

          <div className="px-cr-row">
            <span className="px-cr-mut" style={{ fontSize: 12, flex: 1 }}>Build up data by answering when grounded.</span>
            <button type="button" className="px-cr-btn" onClick={() => navigate("/get-to-know-me")}>Get to know me</button>
          </div>
        </div>
      </div>
      {picking && (
        <ColorPickerModal color={draft || "#8b5cf6"} label="Which colour feels right?"
          onSave={(hex) => { setColorDraft(hex); setPicking(false); }} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}
