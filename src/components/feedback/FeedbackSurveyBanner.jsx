// The feedback survey invitation on the home screen (v0.366.4). A large
// card from the app's creator; one tap opens the survey, the × or "No thanks" hides
// it for good (the survey stays in Settings → About → Share feedback). It
// also goes away once they've sent their answers. Waits its turn in the
// attention slot behind reminders (it can share the screen with the notice stack), and never shows until
// a system has used the app for a few days after setup (Dashboard passes
// `ready`, see settledInForSurvey in setupModel.js).

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquareHeart, X } from "lucide-react";
import { useAttentionSlot, ATTENTION } from "@/lib/attentionSlot";
import FeedbackSurveyModal from "./FeedbackSurveyModal";

export const SURVEY_DISMISS_KEY = "symphony_feedback_survey_2026_11_dismissed_v1";

export default function FeedbackSurveyBanner({ ready = true }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(SURVEY_DISMISS_KEY) === "1"; } catch { return false; }
  });
  const [open, setOpen] = useState(false);

  const wanted = ready && !dismissed;
  const mine = useAttentionSlot("feedback-survey", {
    priority: ATTENTION.SURVEY, active: wanted,
    // The notice stack sits at the top of home and never goes fully quiet
    // for many people (backups off…); this floats at the bottom, so it
    // shows beside it and waits only for reminders.
    besides: ["home-notices"],
  });

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(SURVEY_DISMISS_KEY, "1"); } catch { /* storage off */ }
  };

  return (
    <>
      {/* Portaled and fixed above the tab bar (where "Continue setup"
          sits — the attention slot keeps them from meeting), so it shows
          on every home screen, above any board wallpaper. */}
      {wanted && mine && !open && createPortal(
        <div role="region" aria-label="Feedback invitation"
          className="fixed z-[85] bottom-[calc(var(--bottom-nav-height,56px)_+_16px_+_var(--os-sab))] left-3 right-3 sm:left-auto sm:right-4 sm:max-w-md lg:bottom-4 rounded-2xl border border-primary/40 bg-card shadow-xl p-4 pr-10 space-y-3">
          <button type="button" onClick={dismiss} aria-label="Hide the feedback invitation"
            className="absolute top-2 right-2 p-2 rounded-lg text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3">
            <MessageSquareHeart className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-1 min-w-0">
              <p className="text-base font-semibold leading-snug">Optional user feedback survey! super quick</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                From Penumbrial Ecosystem, the app's creator 😃
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-9">
            <button type="button" onClick={() => setOpen(true)}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground">
              Share feedback
            </button>
            <button type="button" onClick={dismiss}
              className="text-sm px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground">
              No thanks
            </button>
          </div>
        </div>,
        document.body,
      )}
      <FeedbackSurveyModal open={open} onClose={() => setOpen(false)} onSent={dismiss} />
    </>
  );
}
