import { useMemo, useState } from "react";
import { X, Volume1, Volume2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { confirm, promptText } from "@/components/shared/ConfirmDialog";
import { BREATHING_PATTERNS, BREATHING_PACE_OPTIONS } from "@/utils/groundingDefaults";
import { PRESETS, clampParams } from "@/lib/soundscape/soundMath";
import { setParams as engineSetParams, setTimer as engineSetTimer, getSoundscapeState } from "@/lib/soundscape/engine";
import { readSoundscapePrefs, writeSoundscapePrefs, TIMER_OPTIONS } from "@/lib/soundscape/soundscapePrefs";
import { FRACTAL_PRESETS } from "@/lib/soundscape/fractals";
import { Chips, Row } from "@/components/grounding/focusControls";
import SoundShaper from "./SoundShaper";
import FractalPanel from "./FractalPanel";

// The Soundscape's settings and their controls, shared by the Soundscape
// screen and the settings sheet in focused mode, so both change the same
// saved settings the same way (and the sound changes as you go).

export const VISUAL_OPTIONS = [
  { value: "calm", label: "Calm" },
  { value: "layers", label: "Layers" },
  { value: "stars", label: "Stars" },
  { value: "fractal", label: "Fractal" },
  { value: "detailed", label: "Detailed" },
];
const VISUAL_HELP = {
  calm: "The shape of the sound, breathing slowly with it.",
  layers: "Each part of the sound as its own ripple: noise, tone, and each ear's wave for a binaural beat.",
  stars: "Flying through a starfield.",
  fractal: "Shapes drawn from repeating one equation. Choose the algorithm, the numbers or write your own under Fractal settings.",
  detailed: "The live sound, frequency by frequency. Busier than the others.",
};
const STAR_SPEED_OPTIONS = [
  { value: "drift", label: "Drift" },
  { value: "cruise", label: "Cruise" },
  { value: "warp", label: "Warp" },
];
export const FOCUS_MODE_OPTIONS = [
  { value: "visuals", label: "Visuals" },
  { value: "both", label: "Visuals + breathing" },
  { value: "breathing", label: "Breathing only" },
];
const timerLabel = (m) => (m ? `${m} min` : "Until I stop");

export function useSoundscapeControls() {
  const [prefs, setPrefs] = useState(readSoundscapePrefs);
  const p = prefs.params;
  const allPresets = useMemo(
    () => [...PRESETS, ...prefs.saved.map((s) => ({ ...s, emoji: "⭐", custom: true }))],
    [prefs.saved],
  );
  const basePreset = allPresets.find((x) => x.id === prefs.presetId) || PRESETS[0];
  const changed = JSON.stringify(basePreset.params) !== JSON.stringify(p);

  // Functional updates: two quick changes (a slider drag, say) never undo
  // each other.
  const update = (fn) => setPrefs((prev) => {
    const next = fn(prev);
    writeSoundscapePrefs(next);
    return next;
  });
  const save = (next) => update(() => next);
  const setP = (patch) => update((prev) => {
    const params = clampParams({ ...prev.params, ...patch });
    engineSetParams(params);
    return { ...prev, params };
  });
  const pickPreset = (preset) => {
    const params = clampParams(preset.params);
    engineSetParams(params);
    update((prev) => ({ ...prev, presetId: preset.id, params }));
  };
  const pickTimer = (m) => {
    update((prev) => ({ ...prev, timer: m }));
    if (getSoundscapeState().playing) engineSetTimer(m);
  };
  const setFocus = (patch) => update((prev) => ({ ...prev, focus: { ...prev.focus, ...patch } }));
  const saveMine = async () => {
    const name = await promptText({ title: "Save this sound", placeholder: "Name", confirmLabel: "Save" });
    if (!name) return;
    const id = `mine_${Date.now().toString(36)}`;
    update((prev) => ({ ...prev, presetId: id, saved: [...prev.saved, { id, name: name.slice(0, 60), params: prev.params }] }));
  };
  const deleteMine = async (preset) => {
    const ok = await confirm({ title: `Delete "${preset.name}"?`, body: "This saved sound will be removed.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    update((prev) => ({
      ...prev,
      presetId: prev.presetId === preset.id ? PRESETS[0].id : prev.presetId,
      saved: prev.saved.filter((s) => s.id !== preset.id),
    }));
  };

  return { prefs, p, save, setP, pickPreset, pickTimer, setFocus, saveMine, deleteMine, allPresets, basePreset, changed };
}

export function VisualPicker({ ctl, fractalClock }) {
  const { prefs, save } = ctl;
  return (
    <div className="space-y-2">
      <Chips options={VISUAL_OPTIONS} value={prefs.visual} onChange={(v) => save({ ...prefs, visual: v })} />
      {prefs.visual === "stars" && (
        <Chips options={STAR_SPEED_OPTIONS} value={prefs.starSpeed} onChange={(v) => save({ ...prefs, starSpeed: v })} />
      )}
      <p className="text-[0.6875rem] text-muted-foreground">{VISUAL_HELP[prefs.visual]}</p>
      {prefs.visual === "fractal" && (
        <details className="pt-1">
          <summary className="cursor-pointer text-xs font-medium text-foreground select-none">
            Fractal settings · <span className="text-primary">{FRACTAL_PRESETS.find((x) => x.id === prefs.fractalPresetId)?.name || "your settings"}</span>
          </summary>
          <div className="mt-2">
            <FractalPanel
              fractal={prefs.fractal}
              presetId={prefs.fractalPresetId}
              clockRef={fractalClock}
              onChange={(fractal, presetId) => save({ ...prefs, fractal, fractalPresetId: presetId })}
            />
          </div>
        </details>
      )}
    </div>
  );
}

// `compact`: the slider alone, for the Soundscape widget's one line.
export function VolumeRow({ ctl, compact = false }) {
  const { p, setP } = ctl;
  const slider = (
    <div className="flex items-center gap-2">
      <Volume1 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <Slider min={0} max={100} step={1} value={[Math.round(p.volume * 100)]} onValueChange={([v]) => setP({ volume: v / 100 })} aria-label="Volume" />
      <Volume2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </div>
  );
  if (compact) return slider;
  return (
    <Row label="Volume" value={`${Math.round(p.volume * 100)}%`}>
      {slider}
      <p className="text-[0.6875rem] text-muted-foreground">Start low, especially with headphones. It fades in and out gently.</p>
    </Row>
  );
}

// canEdit: false in focused mode, whose overlay sits above the app's
// confirm and name dialogs.
export function SoundPresetGrid({ ctl, canEdit = true }) {
  const { prefs, allPresets, pickPreset, deleteMine } = ctl;
  return (
    <div className="grid grid-cols-2 gap-2">
      {allPresets.map((preset) => (
        <div key={preset.id} className="relative">
          <button
            type="button"
            onClick={() => pickPreset(preset)}
            className={`w-full text-left rounded-xl border px-3 py-2 text-sm transition-colors ${
              prefs.presetId === preset.id ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-card hover:bg-muted/40 text-foreground"
            }`}
          >
            <span className="mr-1.5">{preset.emoji}</span>{preset.name}
          </button>
          {preset.custom && canEdit && (
            <button type="button" onClick={() => deleteMine(preset)} aria-label={`Delete ${preset.name}`}
              className="absolute top-1 right-1 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function SoundShaperPanel({ ctl, canEdit = true }) {
  const { p, setP, changed, basePreset, pickPreset, saveMine } = ctl;
  return <SoundShaper p={p} setP={setP} changed={changed} basePreset={basePreset} onReset={() => pickPreset(basePreset)} onSave={canEdit ? saveMine : undefined} />;
}

export function TimerRow({ ctl }) {
  const { prefs, pickTimer } = ctl;
  return (
    <Row label="Timer">
      <Chips options={TIMER_OPTIONS.map((m) => ({ value: m, label: timerLabel(m) }))} value={prefs.timer} onChange={pickTimer} />
    </Row>
  );
}

// What focused mode shows, and the breathing guide's pattern and pace.
export function BreathingControls({ ctl }) {
  const { prefs, setFocus } = ctl;
  return (
    <div className="space-y-2">
      <Chips options={FOCUS_MODE_OPTIONS} value={prefs.focus.mode} onChange={(v) => setFocus({ mode: v })} />
      {prefs.focus.mode !== "visuals" && (
        <div className="space-y-2">
          <select
            value={prefs.focus.pattern}
            onChange={(e) => setFocus({ pattern: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            aria-label="Breathing pattern"
          >
            {Object.keys(BREATHING_PATTERNS).map((name) => (
              <option key={name} value={name}>{name} ({BREATHING_PATTERNS[name].pattern})</option>
            ))}
          </select>
          <Chips options={BREATHING_PACE_OPTIONS} value={prefs.focus.pace} onChange={(v) => setFocus({ pace: v })} />
        </div>
      )}
    </div>
  );
}
