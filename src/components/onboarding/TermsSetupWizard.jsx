// The required first-run modal: terminology + medical-disclaimer
// acknowledgement, in one TourModal-styled page. Closes to the dashboard,
// which then shows the small SetupHintCard offering the optional guided
// setup. Owner-specified structure (v0.84.5):
//   "The first page should be the terminology, not about the quick check-in."
//
// The heavier welcome and Quick Check-In intro screens were removed; the
// dashboard hint carries the "Dive in or run guided setup" choice. Legal
// disclaimer stays but is inline as a required checkbox — quicker than a
// separate blocking page while still meeting the not-a-medical-product bar.

import React, { useState } from "react";
import SetupWizardShell from "@/components/onboarding/SetupWizardShell";
import { TermsSetupContent } from "@/components/onboarding/TermsSetupModal";
import { DISCLAIMER_ACK_KEY } from "@/components/onboarding/DisclaimerModal";
import MedicalDisclaimer from "@/components/shared/MedicalDisclaimer";

export default function TermsSetupWizard({ open, onFinish, existingSettingsId }) {
  const [ackChecked, setAckChecked] = useState(() => {
    try { return !!localStorage.getItem(DISCLAIMER_ACK_KEY); } catch { return false; }
  });
  // Fires when TermsSetupContent finishes saving.
  const [termsSaved, setTermsSaved] = useState(false);

  const steps = [
    {
      title: "Welcome to Oceans Symphony 💜",
      subtitle: "Let's set your language first",
      icon: "🗣️",
      color: "from-violet-500/20 to-purple-500/20",
      // TermsSetupContent renders its own Save & Continue button, so we
      // hide the shell's Next button and let the content trigger onFinish.
      // The disclaimer sits under it — one page, two required things.
      skipHidden: true,
      nextLabel: "Continue",
      nextDisabled: !ackChecked || !termsSaved,
      onNext: () => {
        try {
          if (ackChecked && !localStorage.getItem(DISCLAIMER_ACK_KEY)) {
            localStorage.setItem(DISCLAIMER_ACK_KEY, new Date().toISOString());
          }
        } catch { /* storage off */ }
      },
      render: () => (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Oceans Symphony adapts to the words your system prefers — pick a
            preset or define your own. You can change everything later in
            Settings → Profile → Terminology.
          </p>
          <TermsSetupContent
            existingSettingsId={existingSettingsId}
            onSaved={() => setTermsSaved(true)}
            saveLabel={termsSaved ? "✓ Terms saved" : "Save terms"}
          />
          <div className="pt-2 border-t border-border/40">
            <MedicalDisclaimer compact />
            <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-border/60 p-3 mt-2">
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 accent-[var(--color-primary)]"
                checked={ackChecked}
                onChange={(e) => setAckChecked(e.target.checked)}
              />
              <span>
                I understand Oceans Symphony is <strong>not a medical product</strong> — it doesn't
                diagnose, treat, or replace care from a professional.
              </span>
            </label>
          </div>
        </div>
      ),
    },
  ];

  return (
    <SetupWizardShell
      open={open}
      onClose={() => { /* required — no dismiss */ }}
      onFinish={onFinish}
      steps={steps}
      ariaLabel="Welcome — set up terminology"
      finishLabel="Continue"
    />
  );
}
