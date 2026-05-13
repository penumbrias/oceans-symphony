import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import MedicalDisclaimer from "@/components/shared/MedicalDisclaimer";
import { Shield } from "lucide-react";

export const DISCLAIMER_ACK_KEY = "disclaimer_acknowledged_v1";

// First-run modal — non-dismissable. Renders the full medical / scope
// disclaimer with a required "I understand" checkbox before the "Continue"
// button activates. Acknowledgement is timestamped in localStorage under
// DISCLAIMER_ACK_KEY so the modal is shown exactly once. Re-opening the
// disclaimer text later is via Settings → Disclaimer.
//
// The modal renders as a plain fixed overlay rather than via the shared
// Dialog component so we can fully block dismissal (no Esc, no outside-click,
// no swipe-down) — this is a legal acknowledgement, not a regular dialog.
export default function DisclaimerModal({ onAcknowledge }) {
  const [checked, setChecked] = useState(false);

  const handleConfirm = () => {
    if (!checked) return;
    try {
      localStorage.setItem(DISCLAIMER_ACK_KEY, new Date().toISOString());
    } catch { /* ignore */ }
    onAcknowledge?.();
  };

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/80 flex items-stretch justify-center p-2 sm:p-4 sm:items-center"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 0.5rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)",
      }}
      aria-modal="true"
      role="dialog"
    >
      {/* The whole card scrolls as one unit. At large OS text sizes the
          checkbox label and Continue button would otherwise get pushed off
          the bottom of the viewport because the inner footer was a fixed
          flex row — the tester literally could not scroll to the button.
          With one scroll container the footer always becomes reachable. */}
      <div className="bg-background text-foreground border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-full overflow-y-auto flex flex-col">
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
      </div>
    </div>
  );
}
