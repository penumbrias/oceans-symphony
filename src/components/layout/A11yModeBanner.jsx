import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Accessibility, X } from "lucide-react";
import { getAccessibilitySettings } from "@/lib/useAccessibility";

// Accessibility mode reshapes the whole app (single-column layout, no
// drag/resize on the home board) — which reads as "everything is broken"
// to someone who toggled it without realising. A mode that changes this
// much must NAME itself: a thin strip that says it's on and links to the
// switch. Dismissible forever, so people who chose the mode on purpose
// see it exactly once.
const DISMISS_KEY = "symphony_a11y_mode_banner_dismissed_v1";

export default function A11yModeBanner() {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const evaluate = () => {
      if (localStorage.getItem(DISMISS_KEY) === "true") { setShow(false); return; }
      setShow(getAccessibilitySettings().a11yMode);
    };
    evaluate();
    // Re-check when the tab regains focus (toggle flipped in Settings, or
    // in another tab) — the banner must track the LIVE state.
    window.addEventListener("focus", evaluate);
    window.addEventListener("storage", evaluate);
    window.addEventListener("a11y-fontsize-changed", evaluate);
    return () => {
      window.removeEventListener("focus", evaluate);
      window.removeEventListener("storage", evaluate);
      window.removeEventListener("a11y-fontsize-changed", evaluate);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, "true"); setShow(false); };

  return (
    <div role="status" className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-primary/20 text-xs text-foreground">
      <Accessibility className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
      <span className="flex-1">
        Accessibility mode is on — pages show one column and home widgets can&apos;t be dragged.{" "}
        <button type="button" onClick={() => navigate("/Settings?section=accessibility")}
          className="underline underline-offset-2 font-medium">
          Turn it off in Settings
        </button>
      </span>
      <button onClick={dismiss} aria-label="Dismiss — keep accessibility mode on" className="p-1 -m-1 text-muted-foreground hover:text-foreground flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
