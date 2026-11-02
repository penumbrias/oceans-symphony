import { useEffect, useRef, useState } from "react";
import { Play, Pause, Square, Maximize2, ShieldCheck, Plus, Sparkles, Leaf, Music, Eraser, SlidersHorizontal, ChevronRight } from "lucide-react";
import { startSoundscape, stopSoundscape } from "@/lib/soundscape/engine";
import { canBlockSystemNotifications, getDndStatus, openDndAccessSettings } from "@/lib/soundscape/focusMode";
import { PREVIEW_HEIGHT } from "@/lib/soundscape/soundscapePrefs";
import SoundscapeVisualizer from "./SoundscapeVisualizer";
import SoundscapeFocus from "./SoundscapeFocus";
import { Group, LinkRow, SwitchRow } from "@/components/shared/SettingRows";
import NatureSoundsView from "@/components/grounding/nature/NatureSoundsView";
import { useNatureState, useMySounds } from "@/components/grounding/nature/natureHooks";
import { natureSoundById } from "@/lib/natureSounds/catalog";
import { toggleNature, stopNature } from "@/lib/natureSounds/naturePlayer";
import { writeNaturePrefs } from "@/lib/natureSounds/naturePrefs";
import ScratchPadCanvas from "@/components/grounding/scratchpad/ScratchPadCanvas";
import { useScratchpad, ParticleSettings, ScratchPadFocus } from "@/components/grounding/scratchpad/ScratchPadView";
import { requestTiltPermission } from "@/lib/scratchpad/tilt";
import { useSoundscapeState, useRemaining, fmtClock } from "./soundscapeHooks";
import {
  useSoundscapeControls, VisualPicker, VolumeRow, SoundPresetGrid, SoundShaperPanel, TimerRow, BreathingControls,
} from "./soundscapeControls";

// Quick Support → Soundscape: one place for everything that sounds or
// moves. Two layers play together, each with its own page:
//   • Made from math — noise and tones generated here, shaped like a synth
//     (presets, Shape the sound, volume, timer).
//   • A recording — a nature sound or one of your own (NatureSoundsView),
//     with its own Shape the sound (low/high cut, movement, space, speed).
// Both go through the one sound bus, so the visuals above react to
// whatever is on. Particles (the old Scratch pad) is one of the visuals.
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

// A sound that's part of the mix: tap the row to open its page.
function LayerRow({ icon: Icon, title, detail, active, playing, onOpen, onToggle, onStop }) {
  return (
    <div className="flex items-center gap-1 border-b border-border/30">
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-2.5 text-left min-h-[56px] py-1.5 rounded-md hover:bg-muted/30 -ml-1 pl-1">
        <Icon className={`w-4 h-4 flex-shrink-0 ${playing ? "text-primary" : "text-muted-foreground"}`} />
        <span className="flex-1 min-w-0">
          <span className={`text-sm block truncate ${playing ? "text-primary font-medium" : "text-foreground"}`}>{title}</span>
          <span className="text-[0.6875rem] text-muted-foreground block truncate">{detail}</span>
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
      </button>
      {onToggle && (
        <button type="button" onClick={onToggle} aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          className="h-11 w-11 flex-shrink-0 inline-flex items-center justify-center rounded-full text-foreground hover:bg-muted">
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
      )}
      {active && onStop && (
        <button type="button" onClick={onStop} aria-label={`Stop ${title}`}
          className="h-11 w-11 flex-shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
          <Square className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function PageHeader({ onBack, back = "Back to Soundscape", title, subtitle }) {
  return (
    <div>
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 transition-colors">
        ← {back}
      </button>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

// initialPage: "main" | "math" | "nature" | "add" | "particles" — the
// older Quick Support doors (?view=nature, ?view=scratchpad) land here.
export default function SoundscapeView({ onBack, initialPage = "main" }) {
  const ctl = useSoundscapeControls();
  const { prefs, p, save, basePreset, setFocus } = ctl;
  const [page, setPage] = useState(initialPage);
  const [focusOpen, setFocusOpen] = useState(false);
  const [dnd, setDnd] = useState({ supported: false, accessGranted: false });
  const [error, setError] = useState(null);
  const fractalClock = useRef(0);
  const playing = useSoundscapeState();
  const remaining = useRemaining(playing.endsAt);
  const nature = useNatureState();
  useMySounds(); // so a last-played sound of your own has its name
  const pad = useScratchpad();
  const padRef = useRef(null);
  const particles = prefs.visual === "particles";

  // Open at the top, not wherever the previous screen was scrolled to.
  useEffect(() => {
    document.querySelector('[data-tour="grounding-soundscape-view"]')?.scrollIntoView({ block: "start" });
  }, [focusOpen, page]);

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
  const toggleMath = () => (playing.playing ? stopSoundscape() : play());
  const stopAll = () => { stopSoundscape(); stopNature(); };
  const openFocus = () => {
    if (particles && pad.prefs.tilt !== "off") requestTiltPermission();
    setFocusOpen(true);
  };

  if (focusOpen) {
    // Particles have their own full screen (with their settings sheet).
    if (particles) return <ScratchPadFocus pad={pad} onExit={() => setFocusOpen(false)} />;
    return <SoundscapeFocus ctl={ctl} onExit={() => setFocusOpen(false)} />;
  }

  if (page === "nature" || page === "yours") {
    return <NatureSoundsView key={page} initialPage={page === "yours" ? "yours" : "main"} onBack={() => setPage("main")} />;
  }

  if (page === "math") {
    return (
      <div className="max-w-lg mx-auto p-4 pb-24 space-y-5" data-tour="grounding-soundscape-view">
        <PageHeader onBack={() => setPage("main")} title="Made from math" subtitle="Noise and tones generated on this device. Shape them like a synth." />
        <button type="button" onClick={toggleMath}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 font-medium">
          {playing.playing
            ? <><Square className="w-4 h-4" /> Stop{remaining != null ? ` · ${fmtClock(remaining)} left` : ""}</>
            : <><Play className="w-4 h-4" /> Play</>}
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <VolumeRow ctl={ctl} />
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Sounds · <span className="text-primary">{basePreset.emoji} {basePreset.name}</span></p>
          <SoundPresetGrid ctl={ctl} />
        </div>
        <div className="space-y-2" data-tour="grounding-soundscape-shape">
          <p className="text-sm font-medium text-foreground">Shape the sound</p>
          <SoundShaperPanel ctl={ctl} />
        </div>
        <TimerRow ctl={ctl} />
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

  if (page === "add") {
    return (
      <div className="max-w-lg mx-auto p-4 pb-24 space-y-4" data-tour="grounding-soundscape-view">
        <PageHeader onBack={() => setPage("main")} title="Add a sound"
          subtitle="One sound made from math and one recording can play together, and the visuals follow both." />
        <div className="px-1">
          <Group title="Sources" first>
            <LinkRow label="Made from math" hint="Brown noise, rain, wind and tones you can shape" icon={Sparkles}
              value={playing.playing ? "Playing" : undefined} onClick={() => setPage("math")} />
            <LinkRow label="Nature recordings" hint="Rain, storms, waves, birds and forests recorded around the world" icon={Leaf}
              onClick={() => setPage("nature")} />
            <LinkRow label="Your sounds" hint="Recordings from your device or Assets" icon={Music}
              onClick={() => setPage("yours")} />
          </Group>
        </div>
      </div>
    );
  }

  if (page === "particles") {
    return (
      <div className="max-w-lg mx-auto p-4 pb-24 space-y-5" data-tour="grounding-soundscape-view">
        <PageHeader onBack={() => setPage("main")} title="Particles" subtitle="Draw a line, let go, and watch a few simple rules move it." />
        <ParticleSettings pad={pad} />
      </div>
    );
  }

  const recording = natureSoundById(nature.id);
  const anyPlaying = playing.playing || nature.playing;

  return (
    <div className="max-w-lg mx-auto p-4 pb-24 space-y-5" data-tour="grounding-soundscape-view">
      <PageHeader onBack={onBack} back="Back to Quick Support" title="Soundscape"
        subtitle="Sound made from math, recorded outdoors or your own. Layer it, shape it, watch it." />

      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <ResizablePreview height={prefs.previewHeight} onCommit={(h) => save({ ...prefs, previewHeight: h })}>
          {particles ? (
            <div className="w-full h-full bg-black">
              <ScratchPadCanvas ref={padRef} rules={pad.prefs.rules} color={pad.prefs.color} trails={pad.prefs.trails}
                tilt={pad.prefs.tilt} tiltStrength={pad.prefs.tiltStrength} />
            </div>
          ) : (
            <SoundscapeVisualizer params={p} detail={prefs.visual} starSpeed={prefs.starSpeed} fractal={prefs.fractal} clockRef={fractalClock} />
          )}
        </ResizablePreview>
        <div className="px-3 py-2 border-t border-border/40 space-y-1">
          <VisualPicker ctl={ctl} fractalClock={fractalClock} />
          {particles && (
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => padRef.current?.clear()}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border/60 py-2 text-xs font-medium text-foreground hover:bg-muted/40">
                <Eraser className="w-3.5 h-3.5" /> Clear
              </button>
              <button type="button" onClick={() => setPage("particles")}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border/60 py-2 text-xs font-medium text-foreground hover:bg-muted/40">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Particle settings
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-1" data-tour="grounding-soundscape-layers">
        <Group title="Playing" first>
          <div data-tour="grounding-soundscape-math">
          <LayerRow icon={Sparkles} title="Made from math"
            detail={`${basePreset.emoji} ${basePreset.name}${playing.playing && remaining != null ? ` · ${fmtClock(remaining)} left` : ""}`}
            active={playing.playing} playing={playing.playing}
            onOpen={() => setPage("math")} onToggle={toggleMath} />
          </div>
          <div data-tour="grounding-soundscape-recording">
          <LayerRow icon={Leaf} title="A recording"
            detail={recording ? `${recording.title} · ${nature.loading ? "Loading…" : nature.playing ? "Playing" : "Paused"}` : "Nature sounds or your own"}
            active={!!recording} playing={nature.playing}
            onOpen={() => setPage("nature")} onToggle={recording ? () => toggleNature() : undefined} onStop={stopNature} />
          </div>
          <div data-tour="grounding-soundscape-add">
            <LinkRow label="Add a sound" icon={Plus} onClick={() => setPage("add")} />
          </div>
        </Group>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {nature.error && <p className="text-xs text-destructive">{nature.error}</p>}

      <button type="button" onClick={anyPlaying ? stopAll : play}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 font-medium">
        {anyPlaying ? <><Square className="w-4 h-4" /> Stop everything</> : <><Play className="w-4 h-4" /> Play {basePreset.name}</>}
      </button>

      <div className="px-1">
        <SwitchRow label="Keep playing around the app" hint="Leave Quick Support and the sound carries on, with a small bar to stop it."
          checked={prefs.keepPlaying} onChange={(v) => { save({ ...prefs, keepPlaying: v }); writeNaturePrefs({ keepPlaying: v }); }} />
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
        <p className="text-sm font-medium text-foreground">Focused mode</p>
        <BreathingControls ctl={ctl} />
        <SwitchRow label="Distraction-free"
          hint={canBlockSystemNotifications()
            ? "Turns on Do Not Disturb (alarms only) while you're in focus, and back off after."
            : "Holds this app's pop-ups until you're done. Other apps' notifications can't be blocked from here, so use your device's own Do Not Disturb or Focus for those."}
          checked={prefs.focus.distractionFree} onChange={(v) => setFocus({ distractionFree: v })} />
        {prefs.focus.distractionFree && dnd.supported && !dnd.accessGranted && (
          <div className="rounded-lg bg-muted/50 p-2.5 space-y-2">
            <p className="text-[0.6875rem] text-muted-foreground">
              To silence other notifications, allow Do Not Disturb access for Oceans Symphony once. Without it, only this app's pop-ups are held.
            </p>
            <button type="button" onClick={openDndAccessSettings} className="text-xs font-medium text-primary">Allow Do Not Disturb access →</button>
          </div>
        )}
        <button type="button" onClick={openFocus}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 border border-primary/30 text-primary py-2.5 text-sm font-medium hover:bg-primary/15">
          <Maximize2 className="w-4 h-4" /> Start focused mode
        </button>
      </div>

    </div>
  );
}
