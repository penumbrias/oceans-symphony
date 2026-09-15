// The widget board is standard now — a swipe away from the classic home —
// but a gesture nobody tells you about doesn't exist. This says it exists
// once, on the classic dashboard, and gets out of the way permanently when
// dismissed. Never shown under the full new UI (the board IS home there).

import React, { useState } from "react";
import { Grid2x2, X } from "lucide-react";
import { UI_V2_ENABLED } from "@/lib/featureFlags";

const DISMISS_KEY = "symphony_widget_board_banner_dismissed_v1";

export default function NewUiBanner({ onOpenBoard = null }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  if (!UI_V2_ENABLED || dismissed || !onOpenBoard) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage off */ }
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2.5 flex items-center gap-2.5">
      <Grid2x2 className="w-4 h-4 text-primary flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Check out the widget board</p>
        <p className="text-xs text-muted-foreground">
          Swipe left on your home screen — extra pages you build from widgets.
        </p>
      </div>
      <button type="button" onClick={onOpenBoard}
        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground flex-shrink-0">
        Open it
      </button>
      <button type="button" onClick={dismiss} aria-label="Dismiss"
        className="p-1 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
