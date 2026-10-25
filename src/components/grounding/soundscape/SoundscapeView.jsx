import { useEffect, useRef, useState } from "react";
import { Play, Square, Maximize2, ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { startSoundscape, stopSoundscape } from "@/lib/soundscape/engine";
import { canBlockSystemNotifications, getDndStatus, openDndAccessSettings } from "@/lib/soundscape/focusMode";
import { PREVIEW_HEIGHT } from "@/lib/soundscape/soundscapePrefs";
import SoundscapeVisualizer from "./SoundscapeVisualizer";
import SoundscapeFocus from "./SoundscapeFocus";
import { useSoundscapeState, useRemaining, fmtClock } from "./soundscapeHooks";
import {
  useSoundscapeControls, VisualPicker, VolumeRow, SoundPresetGrid, SoundShaperPanel, TimerRow, BreathingControls,
} from "./soundscapeControls";

// Quick Support → Soundscape: noise and tones generated from math, shaped
// like a synth, drawn as they sound, with a timer and a focused mode.
// Safety lives in the engine (clampParams, capped gain, limiter, ramps);
// this screen only ever offers values inside LIMITS.

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

export default function SoundscapeView({ onBack }) {
  const ctl = useSoundscapeControls();
  const { prefs, p, save, changed, basePreset, setFocus } = ctl;
  const [focusOpen, setFocusOpen] = useState(false);
  const [dnd, setDnd] = useState({ supported: false, accessGranted: false });
  const [error, setError] = useState(null);
  const [shapeOpen, setShapeOpen] = useState(false);
  const fractalClock = useRef(0);
  const playing = useSoundscapeState();
  const remaining = useRemaining(playing.endsAt);

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

  if (focusOpen) {
    return (
      <SoundscapeFocus
        ctl={ctl}
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
        <div className="px-3 py-2 border-t border-border/40">
          <VisualPicker ctl={ctl} fractalClock={fractalClock} />
        </div>
      </div>

      <details className="rounded-xl border border-border/60 bg-card p-3" open={shapeOpen} onToggle={(e) => setShapeOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-medium text-foreground select-none">
          Shape the sound{changed ? " · changed" : ""}
        </summary>
        <div className="mt-3">
          <SoundShaperPanel ctl={ctl} />
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

      <VolumeRow ctl={ctl} />

      <details className="rounded-xl border border-border/60 bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground select-none">
          Sounds · <span className="text-primary">{basePreset.emoji} {basePreset.name}</span>
        </summary>
        <div className="mt-3">
          <SoundPresetGrid ctl={ctl} />
        </div>
      </details>

      <TimerRow ctl={ctl} />

      <label className="flex items-center justify-between gap-3">
        <span className="text-xs">
          <span className="font-medium text-foreground block">Keep playing around the app</span>
          <span className="text-muted-foreground">Leave Quick Support and the sound carries on, with a small bar to stop it.</span>
        </span>
        <Switch checked={prefs.keepPlaying} onCheckedChange={(v) => save({ ...prefs, keepPlaying: v })} aria-label="Keep playing around the app" />
      </label>

      <div className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
        <p className="text-sm font-medium text-foreground">Focused mode</p>
        <BreathingControls ctl={ctl} />
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
