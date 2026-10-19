import { useEffect, useMemo, useState } from "react";
import { Play, Square, Maximize2, RotateCcw, Save, X, Volume1, Volume2, ShieldCheck } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { confirm, promptText } from "@/components/shared/ConfirmDialog";
import { BREATHING_PATTERNS, BREATHING_PACE_OPTIONS } from "@/utils/groundingDefaults";
import {
  PRESETS, clampParams, LIMITS, fmtHz,
} from "@/lib/soundscape/soundMath";
import {
  startSoundscape, stopSoundscape, setParams as engineSetParams, setTimer as engineSetTimer,
  } from "@/lib/soundscape/engine";
import { readSoundscapePrefs, writeSoundscapePrefs, TIMER_OPTIONS } from "@/lib/soundscape/soundscapePrefs";
import { canBlockSystemNotifications, getDndStatus, openDndAccessSettings } from "@/lib/soundscape/focusMode";
import SoundscapeVisualizer from "./SoundscapeVisualizer";
import SoundscapeFocus from "./SoundscapeFocus";
import { useSoundscapeState, useRemaining, fmtClock } from "./soundscapeHooks";

// Quick Support → Soundscape: noise and tones generated from math, shaped
// like a synth, drawn as they sound, with a timer and a focused mode.
// Safety lives in the engine (clampParams, capped gain, limiter, ramps);
// this screen only ever offers values inside LIMITS.

// Log-scale slider for frequencies: position 0..1000 ↔ lo..hi Hz.
const toPos = (v, [lo, hi]) => Math.round((Math.log(v / lo) / Math.log(hi / lo)) * 1000);
const fromPos = (pos, [lo, hi]) => lo * Math.pow(hi / lo, pos / 1000);

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

const NOISE_OPTIONS = [
  { value: "brown", label: "Brown" },
  { value: "pink", label: "Pink" },
  { value: "white", label: "White" },
  { value: "rain", label: "Rain" },
  { value: "none", label: "None" },
];
const MOTION_OPTIONS = [
  { value: "constant", label: "Constant" },
  { value: "drift", label: "Drift" },
  { value: "waves", label: "Waves" },
  { value: "gusts", label: "Gusts" },
];
const timerLabel = (m) => (m ? `${m} min` : "Until I stop");

export default function SoundscapeView({ onBack }) {
  const [prefs, setPrefs] = useState(readSoundscapePrefs);
  const [focusOpen, setFocusOpen] = useState(false);
  const [dnd, setDnd] = useState({ supported: false, accessGranted: false });
  const [error, setError] = useState(null);
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
        <div className="h-36">
          <SoundscapeVisualizer params={p} />
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 text-[0.6875rem] text-muted-foreground border-t border-border/40">
          <span>{fmtHz(30)}</span>
          <span>{playing.playing ? "Live sound (shape dashed)" : "The shape of this sound"}</span>
          <span>{fmtHz(9000)}</span>
        </div>
      </div>

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

      <Row label="Timer">
        <Chips options={TIMER_OPTIONS.map((m) => ({ value: m, label: timerLabel(m) }))} value={prefs.timer} onChange={pickTimer} />
      </Row>

      <Row label="Volume" value={`${Math.round(p.volume * 100)}%`}>
        <div className="flex items-center gap-2">
          <Volume1 className="w-4 h-4 text-muted-foreground" />
          <Slider min={0} max={100} step={1} value={[Math.round(p.volume * 100)]} onValueChange={([v]) => setP({ volume: v / 100 })} aria-label="Volume" />
          <Volume2 className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-[0.6875rem] text-muted-foreground">Start low, especially with headphones. It fades in and out gently.</p>
      </Row>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sounds</p>
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
              {preset.custom && (
                <button type="button" onClick={() => deleteMine(preset)} aria-label={`Delete ${preset.name}`}
                  className="absolute top-1 right-1 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <details className="rounded-xl border border-border/60 bg-card p-3 group">
        <summary className="cursor-pointer text-sm font-medium text-foreground select-none">
          Shape the sound{changed ? " · changed" : ""}
        </summary>
        <div className="space-y-4 mt-4">
          <Row label="Noise">
            <Chips options={NOISE_OPTIONS} value={p.noise} onChange={(v) => setP({ noise: v })} />
          </Row>
          {p.noise !== "none" && (
            <Row label="Noise level" value={`${Math.round(p.noiseLevel * 100)}%`}>
              <Slider min={0} max={100} step={1} value={[Math.round(p.noiseLevel * 100)]} onValueChange={([v]) => setP({ noiseLevel: v / 100 })} aria-label="Noise level" />
            </Row>
          )}
          <Row label="Warmth" value={`cuts above ${fmtHz(p.lowpass)}`}>
            <Slider min={0} max={1000} step={1} value={[toPos(p.lowpass, LIMITS.lowpass)]} onValueChange={([v]) => setP({ lowpass: fromPos(v, LIMITS.lowpass) })} aria-label="Warmth" />
            <div className="flex justify-between text-[0.625rem] text-muted-foreground"><span>Darker</span><span>Brighter</span></div>
          </Row>
          <Row label="Thin out the lows" value={`cuts below ${fmtHz(p.highpass)}`}>
            <Slider min={0} max={1000} step={1} value={[toPos(p.highpass, LIMITS.highpass)]} onValueChange={([v]) => setP({ highpass: fromPos(v, LIMITS.highpass) })} aria-label="Thin out the lows" />
          </Row>

          <div className="border-t border-border/40 pt-3 space-y-3">
            <label className="flex items-center justify-between text-sm text-foreground">
              <span className="font-medium text-xs">Tone</span>
              <Switch checked={p.toneOn} onCheckedChange={(v) => setP({ toneOn: v })} aria-label="Tone" />
            </label>
            {p.toneOn && (
              <>
                <Row label="Pitch" value={fmtHz(p.toneFreq)}>
                  <Slider min={0} max={1000} step={1} value={[toPos(p.toneFreq, LIMITS.toneFreq)]} onValueChange={([v]) => setP({ toneFreq: Math.round(fromPos(v, LIMITS.toneFreq) * 10) / 10 })} aria-label="Pitch" />
                </Row>
                <Row label="Wave">
                  <Chips options={[{ value: "sine", label: "Smooth" }, { value: "triangle", label: "Soft buzz" }]} value={p.toneWave} onChange={(v) => setP({ toneWave: v })} />
                </Row>
                <Row label="Tone level" value={`${Math.round(p.toneLevel * 100)}%`}>
                  <Slider min={0} max={100} step={1} value={[Math.round(p.toneLevel * 100)]} onValueChange={([v]) => setP({ toneLevel: v / 100 })} aria-label="Tone level" />
                </Row>
                <Row label="Binaural beat" value={p.beat > 0 ? `${p.beat.toFixed(1)} Hz` : "Off"}>
                  <Slider min={0} max={LIMITS.beat[1] * 10} step={5} value={[Math.round(p.beat * 10)]} onValueChange={([v]) => setP({ beat: v / 10 })} aria-label="Binaural beat" />
                  <p className="text-[0.6875rem] text-muted-foreground">Each ear gets a slightly different pitch. Needs headphones.</p>
                </Row>
              </>
            )}
          </div>

          <div className="border-t border-border/40 pt-3 space-y-3">
            <Row label="Change over time">
              <Chips options={MOTION_OPTIONS} value={p.motion} onChange={(v) => setP({ motion: v })} />
            </Row>
            {p.motion !== "constant" && (
              <>
                <Row label="How much" value={`${Math.round(p.motionAmount * 100)}%`}>
                  <Slider min={0} max={100} step={1} value={[Math.round(p.motionAmount * 100)]} onValueChange={([v]) => setP({ motionAmount: v / 100 })} aria-label="How much it changes" />
                </Row>
                <Row label="How slowly" value={`about ${Math.round(1 / p.motionSpeed)}s per swell`}>
                  <Slider
                    min={0} max={1000} step={1}
                    value={[1000 - toPos(p.motionSpeed, LIMITS.motionSpeed)]}
                    onValueChange={([v]) => setP({ motionSpeed: fromPos(1000 - v, LIMITS.motionSpeed) })}
                    aria-label="How slowly it changes"
                  />
                  <div className="flex justify-between text-[0.625rem] text-muted-foreground"><span>Quicker</span><span>Slower</span></div>
                </Row>
              </>
            )}
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs">
                <span className="font-medium text-foreground block">Wind down</span>
                <span className="text-muted-foreground">With a timer, slowly gets quieter and darker towards the end.</span>
              </span>
              <Switch checked={p.windDown} onCheckedChange={(v) => setP({ windDown: v })} aria-label="Wind down" />
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => pickPreset(basePreset)} disabled={!changed}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border/60 py-2 text-xs font-medium text-foreground disabled:opacity-50 hover:bg-muted/40">
              <RotateCcw className="w-3.5 h-3.5" /> Reset to {basePreset.name}
            </button>
            <button type="button" onClick={saveMine}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-primary/40 py-2 text-xs font-medium text-primary hover:bg-primary/10">
              <Save className="w-3.5 h-3.5" /> Save as my sound
            </button>
          </div>
        </div>
      </details>

      <div className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
        <p className="text-sm font-medium text-foreground">Focused mode</p>
        <Chips
          options={[{ value: false, label: "Visuals only" }, { value: true, label: "Visuals + breathing" }]}
          value={prefs.focus.breathing}
          onChange={(v) => setFocus({ breathing: v })}
        />
        {prefs.focus.breathing && (
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
