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

const selectClass =
  "w-full text-sm rounded-lg border border-input bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring";

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
      <input
        type="range"
        min={0}
        max={FONT_OPTIONS.length - 1}
        step={1}
        value={idx}
        onChange={(e) => apply(parseInt(e.target.value, 10))}
        className="w-full h-1.5 accent-primary"
        aria-label="UI size"
      />
      <div className="flex justify-between text-[0.625rem] text-muted-foreground px-0.5">
        <span>50%</span><span>100%</span><span>150%</span><span>200%</span>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground leading-snug">
        Scales the base font size — text, spacing, and buttons grow together.
      </p>
    </div>
  );
}

// ── Touch target size — dropdown. ──
export function TouchTargetControl() {
  const [value, setValue] = useState(() => getAccessibilitySettings().largeTouch || "default");
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Touch target size</p>
      <select
        value={value}
        onChange={(e) => { setValue(e.target.value); setAccessibilityLargeTouch(e.target.value); }}
        className={selectClass}
        aria-label="Touch target size"
      >
        {TOUCH_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
        ))}
      </select>
    </div>
  );
}

// ── Nav bar height — dropdown. ──
export function NavHeightControl() {
  const [value, setValue] = useState(() => getAccessibilitySettings().navHeight || "default");
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Navigation bar height</p>
      <select
        value={value}
        onChange={(e) => { setValue(e.target.value); setAccessibilityNavHeight(e.target.value); }}
        className={selectClass}
        aria-label="Navigation bar height"
      >
        {NAV_HEIGHT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
        ))}
      </select>
      <p className="text-[0.6875rem] text-muted-foreground leading-snug">Height of the bottom tab bar on mobile.</p>
    </div>
  );
}
