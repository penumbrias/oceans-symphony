import React, { useEffect, useState } from "react";
import { RotateCw, X } from "lucide-react";
import { getAccessibilitySettings } from "@/lib/useAccessibility";

// A thin, dismissible tip that nudges phone users toward landscape when their
// Text size (or Accessibility mode) is large — portrait gets cramped at those
// sizes, and landscape gives the content more width (the header/tab-bar stay
// slim in Accessibility mode). Shows only on phones, only in portrait, and only
// once until dismissed.
const DISMISS_KEY = "symphony_landscape_hint_dismissed_v1";
// Text-size values (from FONT_OPTIONS) large enough that portrait gets tight.
const LARGE_SIZES = new Set(["xl3", "xl4", "xl5"]);

export default function LandscapeHintBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "true") return;
    const portraitMq = window.matchMedia("(orientation: portrait)");
    const phoneMq = window.matchMedia("(max-width: 1023px)");
    const evaluate = () => {
      if (localStorage.getItem(DISMISS_KEY) === "true") { setShow(false); return; }
      const { fontSize, a11yMode } = getAccessibilitySettings();
      const large = LARGE_SIZES.has(fontSize) || a11yMode;
      setShow(large && portraitMq.matches && phoneMq.matches);
    };
    evaluate();
    portraitMq.addEventListener?.("change", evaluate);
    phoneMq.addEventListener?.("change", evaluate);
    window.addEventListener("a11y-fontsize-changed", evaluate);
    window.addEventListener("focus", evaluate);
    return () => {
      portraitMq.removeEventListener?.("change", evaluate);
      phoneMq.removeEventListener?.("change", evaluate);
      window.removeEventListener("a11y-fontsize-changed", evaluate);
      window.removeEventListener("focus", evaluate);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, "true"); setShow(false); };

  return (
    <div role="status" className="lg:hidden landscape:hidden flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-primary/20 text-xs text-foreground">
      <RotateCw className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
      <span className="flex-1">Tip: rotate your phone to <strong>landscape</strong> — text this large is easier to read with the extra width.</span>
      <button onClick={dismiss} aria-label="Dismiss tip" className="p-1 -m-1 text-muted-foreground hover:text-foreground flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
