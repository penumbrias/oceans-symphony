// Shared visual shell for onboarding modals — reuses TourModal's styling
// (progress bar + gradient header + scrollable body + fixed footer with dot
// nav) so the setup flow feels like the Guide the user sees on first launch.
//
// Steps are declared as objects, but the shell lets each step render either
// STATIC card content (icon/subtitle/body/features/tip like TourModal) OR
// a live interactive React node (bundle picker, emotions manager…). Pages
// with `render` swap into the body wholesale.

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

// One page schema:
//   { title, subtitle?, body?, icon, color, tip?, features?,
//     render?({goNext,goBack,busy,setBusy}) → ReactNode,
//     nextLabel?, nextDisabled?, onNext?() → Promise|void, skipHidden?,
//     phaseBreak?: boolean — when true, marks THIS step as the LAST of
//       an initial "setup" phase; dots after it are visually separated
//       and labelled "About the app" instead of "Setup".
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

  // Setup ends AT (and including) the step flagged with phaseBreak. Anything
  // beyond is the "about the app" phase — surfacing this in the dot nav +
  // a phase label so users see the setup is only the first few pages, not
  // all 19 (tester report: "it looks intimidating as if the setup is all
  // of those pages").
  const phaseBreakIndex = steps.findIndex((s) => s.phaseBreak);
  const hasPhaseBreak = phaseBreakIndex >= 0;
  const inSetupPhase = !hasPhaseBreak || step <= phaseBreakIndex;
  const setupCount = hasPhaseBreak ? phaseBreakIndex + 1 : steps.length;
  const infoCount = hasPhaseBreak ? steps.length - setupCount : 0;
  const phaseLabel = inSetupPhase
    ? `Setup · ${step + 1}/${setupCount}`
    : `About the app · ${step - setupCount + 1}/${infoCount}`;

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
        {/* Progress bar — with a small notch marking where setup ends, so
            users can see at a glance how short the setup portion is. */}
        <div className="h-1 bg-muted flex-shrink-0 relative">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
          {hasPhaseBreak && (
            <div
              className="absolute top-0 h-1 w-px bg-background/70"
              style={{ left: `${((phaseBreakIndex + 1) / steps.length) * 100}%` }}
              aria-hidden
            />
          )}
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
          {/* Phase label — makes it obvious the setup is only the first
              handful of pages, not all 19. */}
          {hasPhaseBreak && (
            <p
              className={`text-[0.6875rem] uppercase tracking-wide text-center ${
                inSetupPhase ? "text-primary/80 font-medium" : "text-muted-foreground/70"
              }`}
              aria-live="polite"
            >
              {phaseLabel}
            </p>
          )}
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {steps.map((_, i) => {
              const inSetup = !hasPhaseBreak || i <= phaseBreakIndex;
              // A slim divider AFTER the last setup dot creates a visual
              // gap between the two phases without adding real whitespace.
              const showDivider = hasPhaseBreak && i === phaseBreakIndex + 1;
              return (
                <React.Fragment key={i}>
                  {showDivider && (
                    <span
                      className="w-px h-3 bg-border/70 mx-1 flex-shrink-0"
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => !busy && !animating && setStep(i)}
                    aria-label={`Go to step ${i + 1}${inSetup ? " (setup)" : " (about the app)"}`}
                    className={`rounded-full transition-all ${
                      i === step
                        ? "w-4 h-2 bg-primary"
                        : inSetup
                          ? "w-2 h-2 bg-primary/30 hover:bg-primary/50"
                          : "w-2 h-2 bg-muted hover:bg-muted-foreground/30"
                    }`}
                  />
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goBack} disabled={isFirst || busy || animating} className="flex-shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
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
