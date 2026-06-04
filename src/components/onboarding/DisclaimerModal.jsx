import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import MedicalDisclaimer from "@/components/shared/MedicalDisclaimer";
import { Shield, Heart, ArrowRight } from "lucide-react";
import { useTerms } from "@/lib/useTerms";

export const DISCLAIMER_ACK_KEY = "disclaimer_acknowledged_v1";

// First-run modal — non-dismissable. Two steps:
//   1. A short "Welcome to Oceans Symphony" intro that explains what the app
//      is for (so first-run no longer drops straight into setup with no
//      context).
//   2. The full medical / scope disclaimer with a required "I understand"
//      checkbox before "Continue" activates.
// Acknowledgement is timestamped in localStorage under DISCLAIMER_ACK_KEY so
// the modal is shown exactly once. Re-opening the disclaimer text later is via
// Settings → Disclaimer.
//
// The modal renders as a plain fixed overlay (not the shared Dialog) so we can
// fully block dismissal (no Esc, no outside-click, no swipe-down) — this is a
// legal acknowledgement, not a regular dialog. It's PORTALED to document.body
// so it escapes the AppLayout header / bottom-nav containing block (which has
// backdrop-blur/transform ancestors that were clipping a plain fixed overlay
// top and bottom).
export default function DisclaimerModal({ onAcknowledge }) {
  const t = useTerms();
  // The welcome/intro now shows BEFORE storage setup (see WelcomeScreen), so
  // this modal opens straight to the medical disclaimer instead of repeating
  // the welcome.
  const [step, setStep] = useState("disclaimer"); // "welcome" → "disclaimer"
  const [checked, setChecked] = useState(false);

  const handleConfirm = () => {
    if (!checked) return;
    try {
      localStorage.setItem(DISCLAIMER_ACK_KEY, new Date().toISOString());
    } catch { /* ignore */ }
    onAcknowledge?.();
  };

  const overlay = (
    <div
      className="fixed inset-0 z-[10000] bg-black/80 flex items-stretch justify-center p-2 sm:p-4 sm:items-center"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 0.5rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)",
      }}
      aria-modal="true"
      role="dialog"
    >
      {/* The whole card scrolls as one unit so the footer button is always
          reachable, even at large OS text sizes. */}
      <div className="bg-background text-foreground border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-full overflow-y-auto flex flex-col">
        {step === "welcome" ? (
          <>
            <div className="flex items-start gap-3 px-5 py-4 border-b border-border/50 sticky top-0 bg-background z-10">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                <Heart className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">Welcome to Oceans Symphony 💜</h2>
                <p className="text-xs text-muted-foreground">A quick hello before you get set up.</p>
              </div>
            </div>

            <div className="px-5 py-5 space-y-4 text-sm leading-relaxed">
              <p>
                More than just a tracker — Oceans Symphony is a companion app built
                for dissociative {t.systems}.
              </p>
              <p>
                Track {t.alters}, activities, symptoms, emotions, and more — to build
                communication and bridges across amnesia gaps.
              </p>
              <p className="text-muted-foreground">
                Everything is yours and stays on your device. Next, a short note on
                what this app is and isn't.
              </p>
            </div>

            <div className="px-5 py-4 border-t border-border/50 bg-muted/20">
              <Button onClick={() => setStep("disclaimer")} className="w-full min-h-[48px]" size="lg">
                Get started <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 px-5 py-4 border-b border-border/50 sticky top-0 bg-background z-10">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-amber-500" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">Before you continue</h2>
                <p className="text-xs text-muted-foreground">
                  Please read this carefully — it explains what Oceans Symphony is and isn't.
                </p>
              </div>
            </div>

            <div className="px-5 py-4">
              <MedicalDisclaimer />
            </div>

            <div className="px-5 py-4 border-t border-border/50 space-y-3 bg-muted/20">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => setChecked(!!v)}
                  className="mt-0.5 flex-shrink-0"
                />
                <span className="text-sm leading-relaxed">
                  I understand that Oceans Symphony is not a medical product, the
                  developers are not licensed mental-health professionals, and the
                  app does not provide medical or clinical advice.
                </span>
              </label>
              <Button
                onClick={handleConfirm}
                disabled={!checked}
                className="w-full min-h-[48px]"
                size="lg"
              >
                Continue
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
