import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, Maximize2, X, Volume1, Volume2, ShieldCheck } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { confirm, promptText } from "@/components/shared/ConfirmDialog";
import { BREATHING_PATTERNS, BREATHING_PACE_OPTIONS } from "@/utils/groundingDefaults";
import {
  PRESETS, clampParams,
} from "@/lib/soundscape/soundMath";
import {
  startSoundscape, stopSoundscape, setParams as engineSetParams, setTimer as engineSetTimer,
  } from "@/lib/soundscape/engine";
import { readSoundscapePrefs, writeSoundscapePrefs, TIMER_OPTIONS } from "@/lib/soundscape/soundscapePrefs";
import { canBlockSystemNotifications, getDndStatus, openDndAccessSettings } from "@/lib/soundscape/focusMode";
import SoundscapeVisualizer from "./SoundscapeVisualizer";
import SoundscapeFocus from "./SoundscapeFocus";
import { useSoundscapeState, useRemaining, fmtClock } from "./soundscapeHooks";
import SoundShaper from "./SoundShaper";
import FractalPanel from "./FractalPanel";
import { FRACTAL_PRESETS } from "@/lib/soundscape/fractals";
import { PREVIEW_HEIGHT } from "@/lib/soundscape/soundscapePrefs";

// Quick Support → Soundscape: noise and tones generated from math, shaped
// like a synth, drawn as they sound, with a timer and a focused mode.
// Safety lives in the engine (clampParams, capped gain, limiter, ramps);
// this screen only ever offers values inside LIMITS.

function Row({ label, value, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        {value != null && <span className="text-muted-foreground tabular-nums">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// The visual's window: drag the grip under it (or focus it and use the
// arrow keys) to make it taller or shorter. Saved when the drag ends.
function ResizablePreview({ height, onCommit, children }) {
  const [h, setH] = useState(height);
  const drag = useRef(null);
  useEffect(() => { setH(height); }, [height]);
  const clampH = (v) => Math.round(Math.min(PREVIEW_HEIGHT.max, Math.max(PREVIEW_HEIGHT.min, v)));
  const onDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { y: e.clientY, start: h };
  };
  const onMove = (e) => { if (drag.current) setH(clampH(drag.current.start + e.clientY - drag.current.y)); };
  const onUp = () => { if (drag.current) { drag.current = null; onCommit(h); } };
  const onKey = (e) => {
    const d = { ArrowDown: 24, ArrowUp: -24, PageDown: 96, PageUp: -96 }[e.key];
    if (d) { e.preventDefault(); const v = clampH(h + d); setH(v); onCommit(v); }
  };
  return (
    <div>
      <div style={{ height: h }}>{children}</div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the visual"
        aria-valuemin={PREVIEW_HEIGHT.min}
        aria-valuemax={PREVIEW_HEIGHT.max}
        aria-valuenow={h}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="flex items-center justify-center h-5 cursor-row-resize border-t border-border/40 bg-muted/20 outline-none focus-visible:bg-muted/50"
        style={{ touchAction: "none" }}
      >
        <span className="w-10 h-1 rounded-full bg-muted-foreground/40" />
      </div>
    </div>
  );
}

function Chips({ options, value, onChange, disabled }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-full text-xs transition-colors disabled:opacity-50 ${
            value === o.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const VISUAL_OPTIONS = [
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
const timerLabel = (m) => (m ? `${m} min` : "Until I stop");

export default function SoundscapeView({ onBack }) {
  const [prefs, setPrefs] = useState(readSoundscapePrefs);
  const [focusOpen, setFocusOpen] = useState(false);
  const [dnd, setDnd] = useState({ supported: false, accessGranted: false });
  const [error, setError] = useState(null);
  const [shapeOpen, setShapeOpen] = useState(false);
  const fractalClock = useRef(0);
  const playing = useSoundscapeState();
  const remaining = useRemaining(playing.endsAt);
  const p = prefs.params;

  const allPresets = useMemo(
    () => [...PRESETS, ...prefs.saved.map((s) => ({ ...s, emoji: "⭐", custom: true }))],
    [prefs.saved],
  );
  const basePreset = allPresets.find((x) => x.id === prefs.presetId) || PRESETS[0];
  const changed = JSON.stringify(basePreset.params) !== JSON.stringify(p);

  const save = (next) => {
    setPrefs(next);
    writeSoundscapePrefs(next);
  };
  const setP = (patch) => {
    const params = clampParams({ ...p, ...patch });
    engineSetParams(params);
    save({ ...prefs, params });
  };

  // Open at the top, not wherever the previous screen was scrolled to.
  useEffect(() => {
    document.querySelector('[data-tour="grounding-soundscape-view"]')?.scrollIntoView({ block: "start" });
  }, [focusOpen]);

  useEffect(() => {
    if (!canBlockSystemNotifications()) return undefined;
    const refresh = () => getDndStatus().then(setDnd);
    refresh();
    // Coming back from the phone's settings page after allowing access.
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  const play = async () => {
    setError(null);
    try {
      await startSoundscape(p, { minutes: prefs.timer });
    } catch (e) {
      setError(e?.message || "Sound couldn't start on this device.");
    }
  };

  const pickPreset = (preset) => {
    const params = clampParams(preset.params);
    engineSetParams(params);
    save({ ...prefs, presetId: preset.id, params });
  };

  const pickTimer = (m) => {
    save({ ...prefs, timer: m });
    if (playing.playing) engineSetTimer(m);
  };

  const saveMine = async () => {
    const name = await promptText({ title: "Save this sound", placeholder: "Name", confirmLabel: "Save" });
    if (!name) return;
    const id = `mine_${Date.now().toString(36)}`;
    save({ ...prefs, presetId: id, saved: [...prefs.saved, { id, name: name.slice(0, 60), params: p }] });
  };

  const deleteMine = async (preset) => {
    const ok = await confirm({ title: `Delete "${preset.name}"?`, body: "This saved sound will be removed.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    save({
      ...prefs,
      presetId: prefs.presetId === preset.id ? PRESETS[0].id : prefs.presetId,
      saved: prefs.saved.filter((s) => s.id !== preset.id),
    });
  };

  const setFocus = (patch) => save({ ...prefs, focus: { ...prefs.focus, ...patch } });

  if (focusOpen) {
    return (
      <SoundscapeFocus
        params={p}
        timer={prefs.timer}
        focus={prefs.focus}
        visual={prefs.visual}
        starSpeed={prefs.starSpeed}
        fractal={prefs.fractal}
        onExit={() => setFocusOpen(false)}
      />
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-5" data-tour="grounding-soundscape-view">
      <div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 transition-colors">
          ← Back to Quick Support
        </button>
        <h2 className="text-lg font-semibold text-foreground">Soundscape</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Sound made from math. Shape it, watch it, rest with it.</p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <ResizablePreview height={prefs.previewHeight} onCommit={(h) => save({ ...prefs, previewHeight: h })}>
          <SoundscapeVisualizer params={p} detail={prefs.visual} starSpeed={prefs.starSpeed} fractal={prefs.fractal} clockRef={fractalClock} />
        </ResizablePreview>
        <div className="px-3 py-2 border-t border-border/40 space-y-2">
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
      </div>

      <details className="rounded-xl border border-border/60 bg-card p-3" open={shapeOpen} onToggle={(e) => setShapeOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-medium text-foreground select-none">
          Shape the sound{changed ? " · changed" : ""}
        </summary>
        <div className="mt-3">
          <SoundShaper p={p} setP={setP} changed={changed} basePreset={basePreset} onReset={() => pickPreset(basePreset)} onSave={saveMine} />
        </div>
      </details>

      <div className="flex items-center gap-2">
        {playing.playing ? (
          <button type="button" onClick={() => stopSoundscape()} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 font-medium">
            <Square className="w-4 h-4" /> Stop{remaining != null ? ` · ${fmtClock(remaining)} left` : ""}
          </button>
        ) : (
          <button type="button" onClick={play} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 font-medium">
            <Play className="w-4 h-4" /> Play
          </button>
        )}
        <button
          type="button"
          onClick={() => setFocusOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-primary/40 text-primary px-4 py-3 text-sm font-medium hover:bg-primary/10"
        >
          <Maximize2 className="w-4 h-4" /> Focus
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <Row label="Volume" value={`${Math.round(p.volume * 100)}%`}>
        <div className="flex items-center gap-2">
          <Volume1 className="w-4 h-4 text-muted-foreground" />
          <Slider min={0} max={100} step={1} value={[Math.round(p.volume * 100)]} onValueChange={([v]) => setP({ volume: v / 100 })} aria-label="Volume" />
          <Volume2 className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-[0.6875rem] text-muted-foreground">Start low, especially with headphones. It fades in and out gently.</p>
      </Row>

      <details className="rounded-xl border border-border/60 bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground select-none">
          Sounds · <span className="text-primary">{basePreset.emoji} {basePreset.name}</span>
        </summary>
        <div className="grid grid-cols-2 gap-2 mt-3">
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
              {preset.custom && (
                <button type="button" onClick={() => deleteMine(preset)} aria-label={`Delete ${preset.name}`}
                  className="absolute top-1 right-1 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </details>

      <Row label="Timer">
        <Chips options={TIMER_OPTIONS.map((m) => ({ value: m, label: timerLabel(m) }))} value={prefs.timer} onChange={pickTimer} />
      </Row>

      <div className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
        <p className="text-sm font-medium text-foreground">Focused mode</p>
        <Chips
          options={[{ value: "visuals", label: "Visuals" }, { value: "both", label: "Visuals + breathing" }, { value: "breathing", label: "Breathing only" }]}
          value={prefs.focus.mode}
          onChange={(v) => setFocus({ mode: v })}
        />
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
        <label className="flex items-center justify-between gap-3">
          <span className="text-xs">
            <span className="font-medium text-foreground block">Distraction-free</span>
            <span className="text-muted-foreground">
              {canBlockSystemNotifications()
                ? "Turns on Do Not Disturb (alarms only) while you're in focus, and back off after."
                : "Holds this app's pop-ups until you're done. Other apps' notifications can't be blocked from here, so use your device's own Do Not Disturb or Focus for those."}
            </span>
          </span>
          <Switch checked={prefs.focus.distractionFree} onCheckedChange={(v) => setFocus({ distractionFree: v })} aria-label="Distraction-free" />
        </label>
        {prefs.focus.distractionFree && dnd.supported && !dnd.accessGranted && (
          <div className="rounded-lg bg-muted/50 p-2.5 space-y-2">
            <p className="text-[0.6875rem] text-muted-foreground">
              To silence other notifications, allow Do Not Disturb access for Oceans Symphony once. Without it, only this app's pop-ups are held.
            </p>
            <button type="button" onClick={openDndAccessSettings} className="text-xs font-medium text-primary">Allow Do Not Disturb access →</button>
          </div>
        )}
        <button type="button" onClick={() => setFocusOpen(true)}
          className="w-full rounded-xl bg-primary/10 border border-primary/30 text-primary py-2.5 text-sm font-medium hover:bg-primary/15">
          Start focused mode
        </button>
      </div>

      <p className="flex gap-2 text-[0.6875rem] text-muted-foreground">
        <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          Volume, pitch and movement are capped so nothing can turn harsh, piercing or flickery, and a limiter catches any peaks.
          The tone presets use frequencies people often find calming; they aren't a treatment.
        </span>
      </p>
    </div>
  );
}
