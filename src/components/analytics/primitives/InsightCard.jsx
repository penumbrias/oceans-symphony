import React, { useState } from "react";
import { X, ChevronRight, Info, BellOff } from "lucide-react";
import UnlockGate from "./UnlockGate";

// One narrative insight card for the Overview feed (and the dashboard
// spotlight). Carries the trauma-informed transparency contract:
//   - confidence chip (low/medium/high) when the insight is statistical
//   - "based on N …" always visible
//   - an expandable "how is this computed?" note (insight.method)
//   - dismiss (X) hides THIS insight; mute hides the whole kind
// Tap-through (chevron / body) drills into the evidence tab.
const CONF_STYLES = {
  high:   "bg-primary/15 text-primary",
  medium: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  low:    "bg-muted text-muted-foreground",
};

export default function InsightCard({ insight, onDismiss = null, onMute = null, onDrill = null }) {
  const [showMethod, setShowMethod] = useState(false);
  if (!insight) return null;
  const { emoji, headline, detail, confidence, basedOn, method, unlock } = insight;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="text-xl leading-none mt-0.5" aria-hidden="true">{emoji}</span>
        <button
          type="button"
          onClick={onDrill ? () => onDrill(insight) : undefined}
          className={`flex-1 min-w-0 text-left ${onDrill ? "cursor-pointer" : "cursor-default"}`}
        >
          <p className="text-sm font-semibold text-foreground leading-snug">{headline}</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{detail}</p>
        </button>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {onDismiss && (
            <button type="button" onClick={() => onDismiss(insight)} aria-label="Dismiss this insight" title="Dismiss"
              className="p-1 -m-1 rounded-md text-muted-foreground/70 hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {onDrill && <ChevronRight className="w-4 h-4 text-muted-foreground/50" aria-hidden="true" />}
        </div>
      </div>

      {unlock && <UnlockGate have={unlock.have} need={unlock.need} className="mt-2 ml-8" />}

      <div className="mt-2 ml-8 flex items-center gap-2 flex-wrap">
        {confidence && (
          <span className={`px-1.5 py-0.5 rounded text-[0.5625rem] font-semibold uppercase tracking-wide ${CONF_STYLES[confidence] || CONF_STYLES.low}`}>
            {confidence} confidence
          </span>
        )}
        {basedOn && <span className="text-[0.625rem] text-muted-foreground">Based on {basedOn}</span>}
        {method && (
          <button type="button" onClick={() => setShowMethod((v) => !v)} aria-expanded={showMethod}
            className="inline-flex items-center gap-0.5 text-[0.625rem] text-muted-foreground hover:text-foreground underline decoration-dotted">
            <Info className="w-3 h-3" aria-hidden="true" /> how this is computed
          </button>
        )}
        {onMute && (
          <button type="button" onClick={() => onMute(insight)} aria-label="Mute insights like this" title="Mute this kind of insight"
            className="inline-flex items-center gap-0.5 text-[0.625rem] text-muted-foreground/70 hover:text-foreground ml-auto">
            <BellOff className="w-3 h-3" aria-hidden="true" /> mute
          </button>
        )}
      </div>

      {showMethod && method && (
        <p className="mt-2 ml-8 text-[0.6875rem] text-muted-foreground leading-relaxed rounded-lg bg-muted/30 p-2">
          {method} Patterns like this describe what was logged — they can't say what caused what.
        </p>
      )}
    </div>
  );
}
