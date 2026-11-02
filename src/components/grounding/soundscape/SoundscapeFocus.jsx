import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, BellOff, SlidersHorizontal, Sparkles, Leaf, Square, Play, Eraser } from "lucide-react";
import BreathingExercise from "@/components/grounding/BreathingExercise";
import { startSoundscape, stopSoundscape, getSoundscapeState } from "@/lib/soundscape/engine";
import { startDistractionFree, stopDistractionFree } from "@/lib/soundscape/focusMode";
import SoundscapeVisualizer from "./SoundscapeVisualizer";
import { getNatureState, stopNature } from "@/lib/natureSounds/naturePlayer";
import { natureSoundById } from "@/lib/natureSounds/catalog";
import { useNatureState } from "@/components/grounding/nature/natureHooks";
import NatureFocusPanel from "@/components/grounding/nature/NatureFocusPanel";
import RecordingShaper from "@/components/grounding/nature/RecordingShaper";
import { ParticleSettings } from "@/components/grounding/scratchpad/ScratchPadView";
import { LinkRow } from "@/components/shared/SettingRows";
import ScratchPadCanvas from "@/components/grounding/scratchpad/ScratchPadCanvas";
import { useSoundscapeState, useRemaining, fmtClock } from "./soundscapeHooks";
import { FocusSettingsSheet, SheetSection } from "@/components/grounding/focusControls";
import { VisualPicker, VolumeRow, SoundPresetGrid, SoundShaperPanel, TimerRow, BreathingControls } from "./soundscapeControls";

// Full-screen focused mode: the visualiser, the guided breathing
// animation, or both, and nothing else. Tap to show the controls; they
// fade away again on their own. Keeps the screen awake while open. When
// a timed session ends, focus closes by itself and anything
// distraction-free switched on is switched back off. Settings opens a
// sheet over the running focus with the sound, the visual, the breathing
// guide and the timer, changed live.

const SHEET_TITLES = {
  main: "Focus settings",
  math: "Made from math",
  recording: "A recording",
  shape: "Shape the sound",
  particles: "Particle settings",
};

// pad: the Particles visual's settings (useScratchpad), shared with the page.
export default function SoundscapeFocus({ ctl, pad, onExit }) {
  const { prefs } = ctl;
  const { params, timer, focus, visual, starSpeed, fractal } = prefs;
  const state = useSoundscapeState();
  const remaining = useRemaining(state.endsAt);
  const [showControls, setShowControls] = useState(true);
  const [notice, setNotice] = useState(null);
  const [size, setSize] = useState(() => Math.min(window.innerWidth, window.innerHeight));
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The sheet's drill-in pages: main | math | recording | shape | particles.
  const [sheetPage, setSheetPage] = useState("main");
  const closeSheet = () => { setSettingsOpen(false); setSheetPage("main"); };
  const nature = useNatureState();
  const recording = natureSoundById(nature.id);
  const padRef = useRef(null);
  const toggleMath = () => (state.playing
    ? stopSoundscape()
    : startSoundscape(params, { minutes: timer }).catch((e) => setNotice(e?.message || "Sound couldn't start on this device.")));
  const hideTimer = useRef(null);
  const wasPlaying = useRef(false);
  const fractalClock = useRef(0);
  // Distraction-free is decided when focus opens; it isn't in the sheet.
  const distractionFree = useRef(focus.distractionFree).current;

  const poke = () => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 4000);
  };
  // Controls stay up while the settings sheet is open.
  useEffect(() => {
    if (settingsOpen) { clearTimeout(hideTimer.current); setShowControls(true); } else poke();
  }, [settingsOpen]);
  const shown = showControls || settingsOpen;

  useEffect(() => {
    let wakeLock = null;
    let cancelled = false;
    poke();
    // Starts the generated sound only when nothing is playing yet: a
    // recording on its own is left to play as it is.
    if (!getSoundscapeState().playing && !getNatureState().playing) {
      startSoundscape(params, { minutes: timer }).catch((e) => setNotice(e?.message || "Sound couldn't start on this device."));
    }
    if (distractionFree) {
      startDistractionFree().then(({ systemBlocked }) => {
        if (cancelled) return;
        setNotice(systemBlocked
          ? "Do Not Disturb is on (alarms only) until you leave focus."
          : "This app's pop-ups will wait until you leave focus.");
      });
    }
    (async () => {
      try {
        const lock = await navigator.wakeLock?.request?.("screen");
        if (cancelled) lock?.release?.(); else wakeLock = lock;
      } catch { /* not supported or refused: screen may sleep */ }
    })();
    const onResize = () => setSize(Math.min(window.innerWidth, window.innerHeight));
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      clearTimeout(hideTimer.current);
      window.removeEventListener("resize", onResize);
      try { wakeLock?.release?.(); } catch { /* released */ }
      if (distractionFree) stopDistractionFree();
    };
    // Runs once per focus session; later setting changes don't restart it.
  }, []);

  // The timer ran out (or the sound was stopped): leave focus.
  useEffect(() => {
    if (state.playing) wasPlaying.current = true;
    else if (wasPlaying.current) onExit();
  }, [state.playing]);

  // Alone, the breathing guide gets the whole stage; over the visual it
  // sits inside the shape.
  const breathSize = Math.round(focus.mode === "breathing"
    ? Math.max(160, Math.min(360, size * 0.7))
    : Math.max(120, Math.min(280, size * 0.42)));

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] bg-background select-none"
      style={{ background: "radial-gradient(circle at center, hsl(var(--primary) / 0.10) 0%, transparent 70%), hsl(var(--background))" }}
      onClick={poke}
      role="dialog"
      aria-label="Soundscape focused mode"
    >
      {focus.mode !== "breathing" && (
        <div className="absolute inset-0">
          {visual === "particles" && pad ? (
            <ParticlesStage pad={pad} padRef={padRef} />
          ) : (
            <SoundscapeVisualizer params={params} variant="radial" detail={visual} starSpeed={starSpeed} fractal={fractal} clockRef={fractalClock} />
          )}
        </div>
      )}
      {focus.mode !== "visuals" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-none">
            <BreathingExercise key={`${focus.pattern}|${focus.pace}`} embedded autoStart loop maxSize={breathSize} patternName={focus.pattern} pace={parseFloat(focus.pace) || 1} />
          </div>
        </div>
      )}

      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between px-4 transition-opacity duration-700"
        style={{ paddingTop: "calc(var(--os-sat, 0px) + 12px)", opacity: shown ? 1 : 0 }}
      >
        <span className="text-sm text-muted-foreground tabular-nums">
          {remaining != null ? `${fmtClock(remaining)} left` : state.playing ? "Playing" : ""}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onExit(); }}
          className="flex items-center gap-1.5 rounded-full bg-card/80 border border-border/60 px-3 py-1.5 text-sm text-foreground"
          style={{ pointerEvents: shown ? "auto" : "none" }}
        >
          <X className="w-4 h-4" /> Leave focus
        </button>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 transition-opacity duration-700"
        style={{ paddingBottom: "calc(var(--os-sab, 0px) + 24px)", opacity: shown && !settingsOpen ? 1 : 0 }}
      >
        {notice && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground text-center">
            {distractionFree && <BellOff className="w-3.5 h-3.5" />}{notice}
          </p>
        )}
        <div className="flex gap-2" style={{ pointerEvents: shown && !settingsOpen ? "auto" : "none" }}>
          {visual === "particles" && pad && focus.mode !== "breathing" && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); padRef.current?.clear(); }}
              className="flex items-center gap-1.5 rounded-full bg-card/80 border border-border/60 px-4 py-1.5 text-sm text-foreground"
            >
              <Eraser className="w-4 h-4" /> Clear
            </button>
          )}
          {(state.playing || nature.playing) && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); stopSoundscape(); stopNature(); }}
              className="rounded-full bg-card/80 border border-border/60 px-4 py-1.5 text-sm text-foreground"
            >
              Stop sound
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSettingsOpen(true); }}
            className="flex items-center gap-1.5 rounded-full bg-card/80 border border-border/60 px-4 py-1.5 text-sm text-foreground"
          >
            <SlidersHorizontal className="w-4 h-4" /> Settings
          </button>
        </div>
      </div>

      {settingsOpen && (
        <FocusSettingsSheet title={SHEET_TITLES[sheetPage] || "Focus settings"} onClose={closeSheet}
          onBack={sheetPage !== "main" ? () => setSheetPage(sheetPage === "shape" ? "recording" : "main") : undefined}>
          {sheetPage === "math" && (
            <SheetSection>
              <VolumeRow ctl={ctl} />
              <SoundPresetGrid ctl={ctl} canEdit={false} />
              <SoundShaperPanel ctl={ctl} canEdit={false} />
            </SheetSection>
          )}
          {sheetPage === "recording" && (
            <SheetSection><NatureFocusPanel onShape={() => setSheetPage("shape")} /></SheetSection>
          )}
          {sheetPage === "shape" && <SheetSection><RecordingShaper /></SheetSection>}
          {sheetPage === "particles" && pad && <SheetSection><ParticleSettings pad={pad} /></SheetSection>}
          {sheetPage === "main" && (
            <>
              <SheetSection title="Guided breathing"><BreathingControls ctl={ctl} /></SheetSection>
              <SheetSection title="Sounds">
                <div>
                  <LinkRow label="Made from math" icon={Sparkles}
                    hint={`${ctl.basePreset.emoji} ${ctl.basePreset.name}`}
                    value={state.playing ? "Playing" : undefined} onClick={() => setSheetPage("math")} />
                  <LinkRow label="A recording" icon={Leaf}
                    hint={recording ? recording.title : "Nature sounds or your own"}
                    value={nature.playing ? "Playing" : recording ? "Paused" : undefined} onClick={() => setSheetPage("recording")} />
                </div>
                <button type="button" onClick={toggleMath}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-border/60 py-2 text-sm font-medium text-foreground hover:bg-muted/40">
                  {state.playing ? <><Square className="w-3.5 h-3.5" /> Stop the math sound</> : <><Play className="w-3.5 h-3.5" /> Play {ctl.basePreset.name}</>}
                </button>
              </SheetSection>
              {focus.mode !== "breathing" && (
                <SheetSection title="Visual">
                  <VisualPicker ctl={ctl} fractalClock={fractalClock} />
                  {visual === "particles" && pad && (
                    <LinkRow label="Particle settings" hint="Ruleset, tilt, colour and the rules themselves" icon={SlidersHorizontal}
                      onClick={() => setSheetPage("particles")} />
                  )}
                </SheetSection>
              )}
              <SheetSection title="Timer"><TimerRow ctl={ctl} /></SheetSection>
            </>
          )}
        </FocusSettingsSheet>
      )}
    </div>,
    document.body,
  );
}

// The Particles visual in focus, drawn with the page's live settings.
function ParticlesStage({ pad, padRef }) {
  const p = pad.prefs;
  return (
    <div className="absolute inset-0 bg-black">
      <ScratchPadCanvas ref={padRef} rules={p.rules} color={p.color} trails={p.trails} tilt={p.tilt} tiltStrength={p.tiltStrength} />
    </div>
  );
}
