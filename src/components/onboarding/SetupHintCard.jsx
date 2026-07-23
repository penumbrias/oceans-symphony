// Small floating card on the Dashboard offering the optional guided setup.
// Shown when terms are set (blocking modal complete) but the guided flow
// hasn't been run or dismissed. Two paths: "Dive right in" (dismiss) or
// "Guided setup >" (launches GuidedSetupModal).
//
// Non-modal by design — the user can already see and use the dashboard
// behind it. Owner-specified structure (v0.84.5):
//   "a popup (that doesn't cover the entire screen) 'Welcome! Dive right
//   in, or run a guided setup >' … 'dive right in' is the 'skip' and the
//   'guided setup' runs the customize check-in setup."

import React from "react";
import { Sparkles, X } from "lucide-react";
import { useTerms } from "@/lib/useTerms";

export default function SetupHintCard({ onDiveIn, onGuidedSetup }) {
  const t = useTerms();
  return (
    <div
      className="fixed z-[85] bottom-[calc(var(--bottom-nav-height,56px)+16px+env(safe-area-inset-bottom,0px))] left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm"
      role="dialog"
      aria-label="Guided setup offer"
    >
      <div className="bg-card border border-primary/40 rounded-xl shadow-2xl p-3 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className="text-sm font-semibold">Welcome to your {t.system}!</p>
            <p className="text-xs text-muted-foreground">Dive right in, or run a guided setup — customize the check-in, emotions, backups, and more.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onGuidedSetup}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Guided setup ›
            </button>
            <button
              type="button"
              onClick={onDiveIn}
              className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Dive right in
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDiveIn}
          aria-label="Dismiss"
          className="p-1 rounded-lg text-muted-foreground hover:bg-muted/50 flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
