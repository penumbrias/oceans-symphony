import React from "react";

// Progress-toward-unlock framing for below-threshold insights.
// Research rule: never a dead "not enough data" — show how close the
// insight is to appearing ("4 of 7 days") so sparse logging is met with
// an invitation, not a wall.
export default function UnlockGate({ have = 0, need = 1, className = "" }) {
  const pct = Math.max(4, Math.min(100, (have / Math.max(1, need)) * 100));
  return (
    <div className={className}>
      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
        <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[0.625rem] text-muted-foreground tabular-nums">{have} of {need}</p>
    </div>
  );
}
