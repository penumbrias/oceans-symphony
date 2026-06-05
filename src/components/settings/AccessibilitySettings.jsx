import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  getAccessibilitySettings,
  setAccessibilityFontSize,
  setAccessibilityReduceMotion,
  setAccessibilityHighContrast,
  setAccessibilityLargeTouch,
  setAccessibilityNavHeight,
} from "@/lib/useAccessibility";
import {
  isGroundingButtonEnabled,
  setGroundingButtonEnabled,
  subscribeGroundingButton,
} from "@/lib/groundingButtonPrefs";

const NAV_HEIGHT_OPTIONS = [
  { value: "compact",    label: "Compact",    desc: "44px — more screen space" },
  { value: "default",    label: "Default",    desc: "56px — standard size" },
  { value: "tall",       label: "Tall",       desc: "68px — easier to reach" },
  { value: "extra-tall", label: "Extra Tall", desc: "80px — maximum height" },
];

const FONT_OPTIONS = [
  { value: "xs3",     label: "Tiny",        desc: "50%" },
  { value: "xs2",     label: "XS",          desc: "62.5%" },
  { value: "xs",      label: "S−",          desc: "75%" },
  { value: "sm",      label: "Small",       desc: "87.5%" },
  { value: "default", label: "Default",     desc: "100%" },
  { value: "lg",      label: "Large",       desc: "112.5% — easier to read" },
  { value: "xl",      label: "XL",          desc: "125%" },
  { value: "xl2",     label: "XXL",         desc: "137.5%" },
  { value: "xl3",     label: "XXXL",        desc: "150%" },
  { value: "xl4",     label: "XXXXL",       desc: "175%" },
  { value: "xl5",     label: "Huge",        desc: "200% — maximum readability" },
];

const TOUCH_OPTIONS = [
  { value: "default",     label: "Default",     desc: "Standard button sizes" },
  { value: "comfortable", label: "Comfortable",  desc: "44px minimum tap target" },
  { value: "large",       label: "Large",        desc: "52px minimum tap target" },
];

export default function AccessibilitySettings() {
  const [settings, setSettings] = useState(getAccessibilitySettings);
  const [groundingBubble, setGroundingBubble] = useState(() => isGroundingButtonEnabled());

  useEffect(() => subscribeGroundingButton(() => setGroundingBubble(isGroundingButtonEnabled())), []);

  const update = (key, value, setter) => {
    setter(value);
    setSettings(s => ({ ...s, [key]: value }));
  };

  return (
    <div className="space-y-6">

      {/* UI size, Touch target size, and Nav bar height moved to
          Settings → Appearance (top of the section + "Advanced"). */}
      <div className="rounded-xl bg-muted/20 border border-border/40 px-4 py-3 text-xs text-muted-foreground">
        Looking for <strong>UI size</strong>, <strong>touch target size</strong>, or <strong>navigation bar height</strong>? They now live under <strong>Settings → Appearance</strong>.
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

        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-3">
            <p className="text-sm font-semibold">Floating Grounding bubble</p>
            <p className="text-xs text-muted-foreground">The persistent quick-support button in the corner. Turn off if it gets in the way — Grounding is still reachable from the sidebar.</p>
          </div>
          <Switch
            checked={groundingBubble}
            onCheckedChange={(v) => {
              setGroundingButtonEnabled(v);
              setGroundingBubble(v);
            }}
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
