import { useState } from "react";
import { Accessibility, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  getAccessibilitySettings,
  setAccessibilityMode,
  setAccessibilityFontSize,
  setAccessibilityHighContrast,
  setAccessibilityReduceMotion,
} from "@/lib/useAccessibility";

// Compact, self-contained accessibility quick-access used during onboarding
// and the feature tour — before Settings is reachable. A floating ♿ button
// opens a popup with the highest-impact controls (accessibility mode, text
// size, high contrast, reduce motion). Everything writes the same localStorage-
// backed preferences as Settings → Accessibility and applies instantly, so it
// works even before the database / settings record exists.

const FONT_OPTIONS = [
  { value: "xs3",     label: "Tiny",    desc: "50%" },
  { value: "xs2",     label: "XS",      desc: "62.5%" },
  { value: "xs",      label: "S−",      desc: "75%" },
  { value: "sm",      label: "Small",   desc: "87.5%" },
  { value: "default", label: "Default", desc: "100%" },
  { value: "lg",      label: "Large",   desc: "112.5%" },
  { value: "xl",      label: "XL",      desc: "125%" },
  { value: "xl2",     label: "XXL",     desc: "137.5%" },
  { value: "xl3",     label: "XXXL",    desc: "150%" },
  { value: "xl4",     label: "XXXXL",   desc: "175%" },
  { value: "xl5",     label: "Huge",    desc: "200%" },
];

export default function AccessibilityFab({ position = "bottom-left", zIndex = 60 }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(getAccessibilitySettings);

  const update = (key, value, setter) => {
    setter(value);
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const fontIdx = FONT_OPTIONS.findIndex((o) => o.value === settings.fontSize);
  const safeIdx = fontIdx < 0 ? 4 : fontIdx;

  const [vert, horiz] = position.split("-");
  const horizCls = horiz === "right" ? "right-4" : "left-4";
  const vertCls = vert === "top" ? "top-4" : "bottom-4";
  const vertStyle = vert === "top"
    ? { marginTop: "env(safe-area-inset-top)" }
    : { marginBottom: "env(safe-area-inset-bottom)" };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Accessibility options"
        className={`fixed ${vertCls} ${horizCls} flex items-center gap-1.5 h-11 px-3.5 rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/20 border border-white/10 text-sm font-medium active:scale-95 transition-transform`}
        style={{ ...vertStyle, zIndex }}
      >
        <Accessibility className="w-5 h-5" />
        <span>Accessibility</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/50 p-4"
          style={{ zIndex: zIndex + 10 }}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl w-full sm:max-w-sm p-4 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-base flex items-center gap-1.5">
                <Accessibility className="w-4 h-4" /> Accessibility
              </p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Accessibility (low-vision layout) mode */}
            <label className="flex items-start justify-between gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 px-3 py-2.5 cursor-pointer">
              <div className="min-w-0">
                <span className="text-sm font-semibold flex items-center gap-1.5 flex-wrap">
                  ♿ Accessibility mode
                  <span className="text-[0.5625rem] font-medium uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Low vision</span>
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">Reflows the layout into a single column with bigger tap targets. Fully reversible.</p>
              </div>
              <Switch checked={settings.a11yMode} onCheckedChange={(v) => update("a11yMode", v, setAccessibilityMode)} />
            </label>

            {/* Text size */}
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-sm font-semibold">Text &amp; interface size</p>
                <span className="text-xs font-mono text-muted-foreground">{FONT_OPTIONS[safeIdx].desc}</span>
              </div>
              <input
                type="range"
                min={0}
                max={FONT_OPTIONS.length - 1}
                step={1}
                value={safeIdx}
                onChange={(e) => update("fontSize", FONT_OPTIONS[Number(e.target.value)].value, setAccessibilityFontSize)}
                className="w-full accent-primary"
                aria-label="Text size"
              />
              <div className="flex justify-between text-[0.625rem] text-muted-foreground mt-0.5">
                <span>Smaller</span><span>Larger</span>
              </div>
            </div>

            {/* High contrast */}
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div className="min-w-0">
                <p className="text-sm font-semibold">High contrast</p>
                <p className="text-xs text-muted-foreground">Black-and-white scheme for maximum legibility.</p>
              </div>
              <Switch checked={settings.highContrast} onCheckedChange={(v) => update("highContrast", v, setAccessibilityHighContrast)} />
            </label>

            {/* Reduce motion */}
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Reduce motion</p>
                <p className="text-xs text-muted-foreground">Turns off animations and transitions.</p>
              </div>
              <Switch checked={settings.reduceMotion} onCheckedChange={(v) => update("reduceMotion", v, setAccessibilityReduceMotion)} />
            </label>

            <p className="text-[0.6875rem] text-muted-foreground/80 text-center pt-1">
              More options later in Settings → Accessibility.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
