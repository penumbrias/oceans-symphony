import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, BellOff } from "lucide-react";
import BreathingExercise from "@/components/grounding/BreathingExercise";
import { startSoundscape, stopSoundscape, getSoundscapeState } from "@/lib/soundscape/engine";
import { startDistractionFree, stopDistractionFree } from "@/lib/soundscape/focusMode";
import SoundscapeVisualizer from "./SoundscapeVisualizer";
import { useSoundscapeState, useRemaining, fmtClock } from "./soundscapeHooks";

// Full-screen focused mode: the visualiser (and optionally the guided
// breathing animation) and nothing else. Tap to show the controls; they
// fade away again on their own. Keeps the screen awake while open. When
// a timed session ends, focus closes by itself and anything
// distraction-free switched on is switched back off.

export default function SoundscapeFocus({ params, timer, focus, onExit }) {
  const state = useSoundscapeState();
  const remaining = useRemaining(state.endsAt);
  const [showControls, setShowControls] = useState(true);
  const [notice, setNotice] = useState(null);
  const [size, setSize] = useState(() => Math.min(window.innerWidth, window.innerHeight));
  const hideTimer = useRef(null);
  const wasPlaying = useRef(false);

  const poke = () => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 4000);
  };

  useEffect(() => {
    let wakeLock = null;
    let cancelled = false;
    poke();
    if (!getSoundscapeState().playing) {
      startSoundscape(params, { minutes: timer }).catch((e) => setNotice(e?.message || "Sound couldn't start on this device."));
    }
    if (focus.distractionFree) {
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
      if (focus.distractionFree) stopDistractionFree();
    };
    // Runs once per focus session; later setting changes don't restart it.
  }, []);

  // The timer ran out (or the sound was stopped): leave focus.
  useEffect(() => {
    if (state.playing) wasPlaying.current = true;
    else if (wasPlaying.current) onExit();
  }, [state.playing]);

  const breathSize = Math.round(Math.max(120, Math.min(280, size * 0.42)));

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] bg-background select-none"
      style={{ background: "radial-gradient(circle at center, hsl(var(--primary) / 0.10) 0%, hsl(var(--background)) 70%)" }}
      onClick={poke}
      role="dialog"
      aria-label="Soundscape focused mode"
    >
      <div className="absolute inset-0">
        <SoundscapeVisualizer params={params} variant="radial" />
      </div>
      {focus.breathing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-none">
            <BreathingExercise embedded autoStart loop maxSize={breathSize} patternName={focus.pattern} pace={parseFloat(focus.pace) || 1} />
          </div>
        </div>
      )}

      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between px-4 transition-opacity duration-700"
        style={{ paddingTop: "calc(var(--os-sat, 0px) + 16px)", opacity: showControls ? 1 : 0 }}
      >
        <span className="text-sm text-muted-foreground tabular-nums">
          {remaining != null ? `${fmtClock(remaining)} left` : state.playing ? "Playing" : ""}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onExit(); }}
          className="flex items-center gap-1.5 rounded-full bg-card/80 border border-border/60 px-3 py-1.5 text-sm text-foreground"
          style={{ pointerEvents: showControls ? "auto" : "none" }}
        >
          <X className="w-4 h-4" /> Leave focus
        </button>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 transition-opacity duration-700"
        style={{ paddingBottom: "calc(var(--os-sab, 0px) + 24px)", opacity: showControls ? 1 : 0 }}
      >
        {notice && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground text-center">
            {focus.distractionFree && <BellOff className="w-3.5 h-3.5" />}{notice}
          </p>
        )}
        {state.playing && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); stopSoundscape(); }}
            className="rounded-full bg-card/80 border border-border/60 px-4 py-1.5 text-sm text-foreground"
            style={{ pointerEvents: showControls ? "auto" : "none" }}
          >
            Stop sound
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
