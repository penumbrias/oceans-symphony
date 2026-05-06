import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  getAccessibilitySettings,
  setAccessibilityFontSize,
  setAccessibilityReduceMotion,
  setAccessibilityHighContrast,
  setAccessibilityLargeTouch,
  setAccessibilityNavHeight,
  setAccessibilityFontFamily,
} from "@/lib/useAccessibility";

const FONT_FAMILY_OPTIONS = [
  { value: "inter",    label: "Inter",                 desc: "App default — clean, modern",          fontFamily: "'Inter', sans-serif" },
  { value: "system",   label: "System font",           desc: "Uses your device's built-in font",     fontFamily: "system-ui, sans-serif" },
  { value: "atkinson", label: "Atkinson Hyperlegible", desc: "Designed for low vision & dyslexia",   fontFamily: "'Atkinson Hyperlegible', sans-serif" },
  { value: "nunito",   label: "Nunito",                desc: "Rounded, friendly — easier to read",   fontFamily: "'Nunito', sans-serif" },
];

const NAV_HEIGHT_OPTIONS = [
  { value: "compact",    label: "Compact",    desc: "44px — more screen space" },
  { value: "default",    label: "Default",    desc: "56px — standard size" },
  { value: "tall",       label: "Tall",       desc: "68px — easier to reach" },
  { value: "extra-tall", label: "Extra Tall", desc: "80px — maximum height" },
];

const FONT_OPTIONS = [
  { value: "sm",      label: "Small",       desc: "87.5% of default" },
  { value: "default", label: "Default",     desc: "100%" },
  { value: "lg",      label: "Large",       desc: "112.5% — easier to read" },
  { value: "xl",      label: "Extra Large", desc: "125% — maximum readability" },
];

const TOUCH_OPTIONS = [
  { value: "default",     label: "Default",     desc: "Standard button sizes" },
  { value: "comfortable", label: "Comfortable",  desc: "44px minimum tap target" },
  { value: "large",       label: "Large",        desc: "52px minimum tap target" },
];

export default function AccessibilitySettings() {
  const [settings, setSettings] = useState(getAccessibilitySettings);

  const update = (key, value, setter) => {
    setter(value);
    setSettings(s => ({ ...s, [key]: value }));
  };

  return (
    <div className="space-y-6">

      {/* Font family */}
      <div>
        <p className="text-sm font-semibold mb-1">Font family</p>
        <p className="text-xs text-muted-foreground mb-3">
          Switch to your device's system font for a more native feel.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FONT_FAMILY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => update("fontFamily", opt.value, setAccessibilityFontFamily)}
              className={`rounded-xl border p-3 text-left transition-all overflow-hidden ${
                settings.fontFamily === opt.value
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/50 bg-card hover:bg-muted/30"
              }`}
            >
              <p className={`text-sm font-semibold break-words ${settings.fontFamily === opt.value ? "text-primary" : ""}`}
                style={{ fontFamily: opt.fontFamily }}>
                {opt.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 break-words">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Font / UI scale */}
      <div>
        <p className="text-sm font-semibold mb-1">Text & UI size</p>
        <p className="text-xs text-muted-foreground mb-3">
          Scales the base font size — affects text, spacing, and button sizes proportionally.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FONT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => update("fontSize", opt.value, setAccessibilityFontSize)}
              className={`rounded-xl border p-3 text-left transition-all overflow-hidden ${
                settings.fontSize === opt.value
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/50 bg-card hover:bg-muted/30"
              }`}
            >
              <p className={`text-sm font-semibold break-words ${settings.fontSize === opt.value ? "text-primary" : ""}`}>
                {opt.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 break-words">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Touch target size */}
      <div>
        <p className="text-sm font-semibold mb-1">Touch target size</p>
        <p className="text-xs text-muted-foreground mb-3">
          Increases the minimum height of buttons and links — helps if buttons feel hard to press.
        </p>
        <div className="flex flex-col gap-2">
          {TOUCH_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => update("largeTouch", opt.value, setAccessibilityLargeTouch)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-all flex items-center justify-between gap-3 ${
                settings.largeTouch === opt.value
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/50 bg-card hover:bg-muted/30"
              }`}
            >
              <p className={`text-sm font-semibold ${settings.largeTouch === opt.value ? "text-primary" : ""}`}>
                {opt.label}
              </p>
              <p className="text-xs text-muted-foreground text-right">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Nav bar height */}
      <div>
        <p className="text-sm font-semibold mb-1">Navigation bar height</p>
        <p className="text-xs text-muted-foreground mb-3">
          Adjusts the height of the bottom tab bar on mobile — taller bars are easier to reach.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {NAV_HEIGHT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => update("navHeight", opt.value, setAccessibilityNavHeight)}
              className={`rounded-xl border p-3 text-left transition-all overflow-hidden ${
                settings.navHeight === opt.value
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/50 bg-card hover:bg-muted/30"
              }`}
            >
              <p className={`text-sm font-semibold break-words ${settings.navHeight === opt.value ? "text-primary" : ""}`}>
                {opt.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 break-words">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Reduce motion</p>
            <p className="text-xs text-muted-foreground">Disables animations and transitions throughout the app</p>
          </div>
          <Switch
            checked={settings.reduceMotion}
            onCheckedChange={v => update("reduceMotion", v, setAccessibilityReduceMotion)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">High contrast</p>
            <p className="text-xs text-muted-foreground">Slightly boosts contrast and colour saturation</p>
          </div>
          <Switch
            checked={settings.highContrast}
            onCheckedChange={v => update("highContrast", v, setAccessibilityHighContrast)}
          />
        </div>
      </div>

      {/* Screen reader note */}
      <div className="rounded-xl bg-muted/30 border border-border/40 px-4 py-3 space-y-1.5 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground text-sm">Screen reader support</p>
        <p>
          Oceans Symphony works with your device's built-in screen reader (VoiceOver on iOS/macOS,
          TalkBack on Android, or NVDA/JAWS on Windows). Enable it from your device's accessibility settings.
        </p>
        <p>
          Interactive elements have labels and roles. If you find an unlabelled control,
          please report it so we can fix it.
        </p>
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-border/50 bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground mb-2 font-medium">Preview</p>
        <div className="space-y-2">
          <p className="text-sm font-semibold">This is how text looks at your current size</p>
          <p className="text-xs text-muted-foreground">Supporting text at the muted style — used for descriptions and hints.</p>
          <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
            Sample button
          </button>
        </div>
      </div>
    </div>
  );
}
