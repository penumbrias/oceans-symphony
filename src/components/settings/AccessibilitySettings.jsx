import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  getAccessibilitySettings,
  setAccessibilityReduceMotion,
  setAccessibilityHighContrast,
  setAccessibilityMode,
  setAccessibilityPlayInsideOnly,
} from "@/lib/useAccessibility";
import { DisplayOptionsButton } from "@/components/settings/AppearanceSection";
import {
  isGroundingButtonEnabled,
  setGroundingButtonEnabled,
  subscribeGroundingButton,
} from "@/lib/groundingButtonPrefs";

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

      {/* Master Accessibility Mode — the low-vision LAYOUT reconfiguration. */}
      <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-1.5 flex-wrap">
            ♿ Accessibility mode
            <span className="text-[0.625rem] font-medium uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Low vision</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Reconfigures the layout for low vision — stacks content into a single column, enlarges tap targets, and stops cutting text off — instead of only enlarging content (which can overlap). Best paired with a larger text size (Display options → Text). Fully reversible.
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            💡 On a phone, try <strong>landscape</strong> — in this mode the header and tab bar stay slim so the extra width goes to your content.
          </p>
        </div>
        <Switch
          checked={settings.a11yMode}
          onCheckedChange={v => update("a11yMode", v, setAccessibilityMode)}
        />
      </div>

      {/* Text size, tap targets and bar height are edited in Display
          options (one editor for every size — Text, Shape and Bars); this
          links there so low-vision users still find them here. */}
      <div data-tour="settings-a11y-display-options">
        <DisplayOptionsButton label="Text size, tap targets and bar height"
          hint="These live in Display options → Text, Shape and Bars. Tap to open it." />
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
            <p className="text-xs text-muted-foreground">Switches to a black-and-white colour scheme for maximum legibility. Overrides your theme colours while it's on.</p>
          </div>
          <Switch
            checked={settings.highContrast}
            onCheckedChange={v => update("highContrast", v, setAccessibilityHighContrast)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-3">
            <p className="text-sm font-semibold">Floating Grounding bubble</p>
            <p className="text-xs text-muted-foreground">The persistent quick-support button in the corner. Turn off if it gets in the way — Support is still one tap away from the quick actions and the apps drawer.</p>
          </div>
          <Switch
            checked={groundingBubble}
            onCheckedChange={(v) => {
              setGroundingButtonEnabled(v);
              setGroundingBubble(v);
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-3">
            <p className="text-sm font-semibold">Play inside the app only</p>
            <p className="text-xs text-muted-foreground">Songs, audio and videos stop as soon as you leave the app (Home or Recents), instead of carrying on in the background like a music player. Nothing starts on its own while you're away. Off by default.</p>
          </div>
          <Switch
            checked={!!settings.playInsideOnly}
            onCheckedChange={v => update("playInsideOnly", v, setAccessibilityPlayInsideOnly)}
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

    </div>
  );
}
