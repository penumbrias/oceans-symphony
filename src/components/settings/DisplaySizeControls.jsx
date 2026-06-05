import React, { useState } from "react";
import {
  getAccessibilitySettings,
  setAccessibilityFontSize,
  setAccessibilityLargeTouch,
  setAccessibilityNavHeight,
} from "@/lib/useAccessibility";

// Display-size controls extracted so they can live under Appearance (their new
// home per the redesign) while still writing to the same accessibility storage.
// Each control reads/writes independently — there's no longer a duplicate copy
// elsewhere, so no cross-sync is needed.

const FONT_OPTIONS = [
  { value: "xs3", label: "Tiny", desc: "50%" },
  { value: "xs2", label: "XS", desc: "62.5%" },
  { value: "xs", label: "S−", desc: "75%" },
  { value: "sm", label: "Small", desc: "87.5%" },
  { value: "default", label: "Default", desc: "100%" },
  { value: "lg", label: "Large", desc: "112.5%" },
  { value: "xl", label: "XL", desc: "125%" },
  { value: "xl2", label: "XXL", desc: "137.5%" },
  { value: "xl3", label: "XXXL", desc: "150%" },
  { value: "xl4", label: "XXXXL", desc: "175%" },
  { value: "xl5", label: "Huge", desc: "200%" },
];

const TOUCH_OPTIONS = [
  { value: "default", label: "Default", desc: "Standard button sizes" },
  { value: "comfortable", label: "Comfortable", desc: "44px minimum tap target" },
  { value: "large", label: "Large", desc: "52px minimum tap target" },
];

const NAV_HEIGHT_OPTIONS = [
  { value: "compact", label: "Compact", desc: "44px — more screen space" },
  { value: "default", label: "Default", desc: "56px — standard size" },
  { value: "tall", label: "Tall", desc: "68px — easier to reach" },
  { value: "extra-tall", label: "Extra Tall", desc: "80px — maximum height" },
];

// ── UI size — a slider across the discrete font-size steps. ──
export function UiSizeControl() {
  const [value, setValue] = useState(() => getAccessibilitySettings().fontSize || "default");
  const idx = Math.max(0, FONT_OPTIONS.findIndex((o) => o.value === value));
  const current = FONT_OPTIONS[idx] || FONT_OPTIONS[4];
  const apply = (i) => {
    const opt = FONT_OPTIONS[i];
    if (!opt) return;
    setValue(opt.value);
    setAccessibilityFontSize(opt.value);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">UI size</p>
        <span className="text-xs text-muted-foreground">{current.label} · {current.desc}</span>
      </div>
      <div className="relative py-1">
        {/* A demarcation tick for every discrete step. The current step's tick
            is highlighted. Sits behind the range thumb. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-between">
          {FONT_OPTIONS.map((o, i) => (
            <span key={o.value} className={`w-px h-2.5 rounded-full ${i === idx ? "bg-primary" : "bg-muted-foreground/40"}`} />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={FONT_OPTIONS.length - 1}
          step={1}
          value={idx}
          onChange={(e) => apply(parseInt(e.target.value, 10))}
          className="relative w-full h-1.5 accent-primary bg-transparent"
          aria-label="UI size"
        />
      </div>
      {/* Steps are non-linear, so only the true ends carry a % label. The
          current value's exact % is shown top-right. */}
      <div className="flex justify-between text-[0.625rem] text-muted-foreground px-0.5">
        <span>50%</span><span>200%</span>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground leading-snug">
        Scales the base font size — text, spacing, and buttons grow together.
      </p>
    </div>
  );
}

// ── Touch target size — a slider across the discrete options. ──
export function TouchTargetControl() {
  const [value, setValue] = useState(() => getAccessibilitySettings().largeTouch || "default");
  const idx = Math.max(0, TOUCH_OPTIONS.findIndex((o) => o.value === value));
  const current = TOUCH_OPTIONS[idx] || TOUCH_OPTIONS[0];
  const apply = (i) => {
    const opt = TOUCH_OPTIONS[i];
    if (!opt) return;
    setValue(opt.value);
    setAccessibilityLargeTouch(opt.value);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Touch target size</p>
        <span className="text-xs text-muted-foreground">{current.label}</span>
      </div>
      <input
        type="range"
        min={0}
        max={TOUCH_OPTIONS.length - 1}
        step={1}
        value={idx}
        onChange={(e) => apply(parseInt(e.target.value, 10))}
        className="w-full h-1.5 accent-primary"
        aria-label="Touch target size"
      />
      <p className="text-[0.6875rem] text-muted-foreground leading-snug">{current.desc}.</p>
    </div>
  );
}

// ── Nav bar height — a slider across the discrete options. ──
export function NavHeightControl() {
  const [value, setValue] = useState(() => getAccessibilitySettings().navHeight || "default");
  const idx = Math.max(0, NAV_HEIGHT_OPTIONS.findIndex((o) => o.value === value));
  const current = NAV_HEIGHT_OPTIONS[idx] || NAV_HEIGHT_OPTIONS[1];
  const apply = (i) => {
    const opt = NAV_HEIGHT_OPTIONS[i];
    if (!opt) return;
    setValue(opt.value);
    setAccessibilityNavHeight(opt.value);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Navigation bar height</p>
        <span className="text-xs text-muted-foreground">{current.label}</span>
      </div>
      <input
        type="range"
        min={0}
        max={NAV_HEIGHT_OPTIONS.length - 1}
        step={1}
        value={idx}
        onChange={(e) => apply(parseInt(e.target.value, 10))}
        className="w-full h-1.5 accent-primary"
        aria-label="Navigation bar height"
      />
      <p className="text-[0.6875rem] text-muted-foreground leading-snug">{current.desc} — height of the bottom tab bar on mobile.</p>
    </div>
  );
}
