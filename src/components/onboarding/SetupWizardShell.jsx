// Shared visual shell for onboarding modals — reuses TourModal's styling
// (progress bar + gradient header + scrollable body + fixed footer with dot
// nav) so the setup flow feels like the Guide the user sees on first launch.
//
// Steps are declared as objects, but the shell lets each step render either
// STATIC card content (icon/subtitle/body/features/tip like TourModal) OR
// a live interactive React node (bundle picker, emotions manager…). Pages
// with `render` swap into the body wholesale.

import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

// One page schema:
//   { title, subtitle?, body?, icon, color, tip?, features?,
//     render?({goNext,goBack,busy,setBusy}) → ReactNode,
//     nextLabel?, nextDisabled?, onNext?() → Promise|void, skipHidden?,
//     phase?: string — groups pages into named phases (e.g. "Welcome",
//       "Setup", "About the app"). Consecutive pages with the same
//       phase form a block; the dot nav visually separates blocks and
//       the label below the dots reads "{phase} · {n}/{total-in-phase}".
//       Steps without a phase inherit from the previous step.
//     extraAction?: { label, onClick } — a secondary footer button next
//       to Next (e.g. "Dive in" on the transition page). No busy/next
//       side effects; just a plain callback.
//     extraActionPrimary?: bool — swap emphasis: extraAction gets the
//       filled/primary variant and Next drops to outline. Use when the
//       extra action is the recommended path (e.g. "Dive in" on the
//       "You're all set" page, where the guide is over and reading more
//       is optional).
//   }
export default function SetupWizardShell({
  open, onClose, onFinish, steps, ariaLabel = "Setup",
  finishLabel = "Done 💜", skipLabel = "Skip setup",
  initialStep = 0,
}) {
  const [step, setStep] = useState(initialStep);
  const [animating, setAnimating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setStep(initialStep); }, [open, initialStep]);

  const current = steps[step] || null;
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;
  const progress = steps.length ? ((step + 1) / steps.length) * 100 : 0;

  // Resolve each step's phase (inherit from previous when omitted) — used
  // to group dots visually and to build the "{phase} · {n}/{total}" label.
  // Multi-phase support means the wizard can honestly call the first few
  // pages "Welcome" and only start counting "Setup" at the actual setup
  // pages, instead of inflating a 3-page setup into a 7-page one (tester
  // report v0.84.7: "Setup doesn't start until page 5/7, which makes it
  // seem much longer than it actually is").
  const phaseInfo = useMemo(() => {
    let last = null;
    const perStep = steps.map((s) => {
      if (s.phase) last = s.phase;
      return last;
    });
    const orderedPhases = [];
    for (const p of perStep) if (p && !orderedPhases.includes(p)) orderedPhases.push(p);
    return { perStep, orderedPhases };
  }, [steps]);
  const currentPhase = phaseInfo.perStep[step] || null;
  const phaseTotal = currentPhase ? phaseInfo.perStep.filter((p) => p === currentPhase).length : 0;
  const phasePosition = currentPhase
    ? phaseInfo.perStep.slice(0, step + 1).filter((p) => p === currentPhase).length
    : 0;
  const phaseLabel = currentPhase && phaseTotal > 0
    ? `${currentPhase} · ${phasePosition}/${phaseTotal}`
    : null;
  const phaseColorClass = (phase) => {
    if (phase === "Setup") return "bg-primary/40 hover:bg-primary/60";
    if (phase === "Welcome") return "bg-primary/20 hover:bg-primary/40";
    return "bg-muted hover:bg-muted-foreground/30";
  };

  const go = (dir) => {
    if (animating || busy) return;
    setAnimating(true);
    setTimeout(() => {
      setStep((s) => Math.max(0, Math.min(steps.length - 1, s + dir)));
      setAnimating(false);
    }, 120);
  };

  const goNext = () => go(1);
  const goBack = () => go(-1);

  const handleNext = async () => {
    if (!current) return;
    if (current.onNext) {
      setBusy(true);
      try { await current.onNext(); } finally { setBusy(false); }
    }
    if (isLast) onFinish?.(); else goNext();
  };

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent
        className="max-w-md p-0 gap-0 border-border/50 flex flex-col max-h-[90vh] sm:max-h-[85vh]"
        aria-label={ariaLabel}
      >
        {/* Progress bar — with small notches marking where each phase
            ends so users can see at a glance how short each part is. */}
        <div className="h-1 bg-muted flex-shrink-0 relative">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
          {phaseInfo.perStep.map((phase, i) => {
            if (i >= steps.length - 1) return null;
            if (phase && phase === phaseInfo.perStep[i + 1]) return null;
            return (
              <div
                key={i}
                className="absolute top-0 h-1 w-px bg-background/70"
                style={{ left: `${((i + 1) / steps.length) * 100}%` }}
                aria-hidden
              />
            );
          })}
        </div>

        {/* Scrollable region: gradient header + body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className={`bg-gradient-to-br ${current.color || "from-violet-500/20 to-purple-500/20"} px-6 pt-6 pb-4`}>
            <div className="text-4xl mb-3">{current.icon || "💜"}</div>
            <h2 className="text-xl font-bold text-foreground leading-tight pr-10">{current.title}</h2>
            {current.subtitle && (
              <p className="text-sm text-primary font-medium mt-0.5">{current.subtitle}</p>
            )}
          </div>

          <div className="px-6 py-4 space-y-4">
            {current.body && (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{current.body}</p>
            )}

            {current.features && (
              <div className="space-y-1.5">
                {current.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    <span className="text-foreground">{f}</span>
                  </div>
                ))}
              </div>
            )}

            {current.render && (
              <div>{current.render({ goNext, goBack, busy, setBusy })}</div>
            )}

            {current.tip && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5">
                <p className="text-xs text-primary font-medium">💡 Tip</p>
                <p className="text-xs text-muted-foreground mt-0.5">{current.tip}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 space-y-3 flex-shrink-0 border-t border-border/40 bg-background">
          {/* Phase label — flips per phase (Welcome / Setup / About the
              app) so the setup portion doesn't feel like the whole guide. */}
          {phaseLabel && (
            <p
              className={`text-[0.6875rem] uppercase tracking-wide text-center ${
                currentPhase === "Setup" ? "text-primary font-semibold" : "text-muted-foreground/80"
              }`}
              aria-live="polite"
            >
              {phaseLabel}
            </p>
          )}
          {/* Dots show only CURRENT-phase steps. Displaying all 20 in
              one row was visually confusing (tester report: "the little
              circles at the bottom … don't make sense. You can see all
              the dots for the written guide, but none of the dots for
              the section before"). Per-phase dots keep each phase feeling
              bounded and honest with its count. */}
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {steps.map((_, i) => {
              const phase = phaseInfo.perStep[i];
              if (phase !== currentPhase) return null;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => !busy && !animating && setStep(i)}
                  aria-label={`Go to step ${i + 1}${phase ? ` (${phase})` : ""}`}
                  className={`rounded-full transition-all ${
                    i === step
                      ? "w-4 h-2 bg-primary"
                      : `w-2 h-2 ${phaseColorClass(phase)}`
                  }`}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goBack} disabled={isFirst || busy || animating} className="flex-shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {current.extraAction && (
              <Button
                size="sm"
                variant={current.extraActionPrimary ? "default" : "outline"}
                onClick={current.extraAction.onClick}
                disabled={busy}
                className="flex-1"
              >
                {current.extraAction.label}
              </Button>
            )}
            <Button
              size="sm"
              variant={current.extraAction && current.extraActionPrimary ? "outline" : "default"}
              onClick={handleNext}
              disabled={busy || current.nextDisabled}
              className="flex-1"
            >
              {isLast ? (current.nextLabel || finishLabel) : (
                <span className="flex items-center gap-1">
                  {current.nextLabel || "Next"} <ChevronRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </div>

          {!isLast && !current.skipHidden && (
            <button
              type="button"
              onClick={() => !busy && onClose?.()}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              {skipLabel}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
