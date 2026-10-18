import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, Pause, Repeat, Volume2, VolumeX, Maximize, Minimize } from "lucide-react";
import { registerMedia } from "@/lib/mediaExclusive";

// Shared audio / video player with our own controls (replaces the browser's).
// Why not the native ones: the native fullscreen on Android drew under the
// system Back / Home / Recents bar, the seek bar couldn't be tapped to jump to a
// time, and there was no loop. Playing is exclusive app-wide (mediaExclusive.js)
// and the seek / tempo sliders opt out of the home board's page-swipe.
//
// Fullscreen is a fixed overlay with safe-area padding — not the browser
// Fullscreen API, which is what put the controls under the system bar. The
// overlay renders the video through a portal, so the element is rebuilt; its
// time / paused state is carried across.

const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

const SAFE_B = "max(env(safe-area-inset-bottom, 0px), var(--os-sab, 0px))";
const SAFE_T = "max(env(safe-area-inset-top, 0px), 24px)";

export default function MediaPlayer({ mediaRef, src, kind = "audio", tuning, className = "", videoClassName = "" }) {
  const isVideo = kind === "video";
  const [fs, setFs] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [scrub, setScrub] = useState(null); // seconds while the thumb is held
  const carry = useRef(null); // state kept across the fullscreen rebuild
  const loopRef = useRef(false);
  const elRef = useRef(null);
  const unregRef = useRef(null);

  // Ref callback: keeps the caller's mediaRef pointing at the live element and
  // wires registration + listeners to whichever element is current.
  const setEl = useCallback((el) => {
    if (unregRef.current) { unregRef.current(); unregRef.current = null; }
    elRef.current = el;
    if (mediaRef) mediaRef.current = el;
    if (!el) return;
    unregRef.current = registerMedia(el);
    tuning?.rebind?.();
    el.loop = loopRef.current;
    el.muted = muted;
    const c = carry.current;
    const restore = () => {
      if (!c) return;
      carry.current = null;
      try { if (Number.isFinite(c.t)) el.currentTime = c.t; } catch { /* not seekable yet */ }
      if (c.playing) el.play().catch(() => {});
    };
    if (c) {
      if (el.readyState >= 1) restore(); else el.addEventListener("loadedmetadata", restore, { once: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaRef, tuning?.rebind]);

  useEffect(() => () => { if (unregRef.current) unregRef.current(); }, []);

  const bind = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onTimeUpdate: (e) => setTime(e.currentTarget.currentTime),
    onDurationChange: (e) => setDur(e.currentTarget.duration),
    onLoadedMetadata: (e) => { setDur(e.currentTarget.duration); setTime(e.currentTarget.currentTime); },
    onRateChange: tuning?.onNativeRateChange,
  };

  const toggle = () => {
    const el = elRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {}); else el.pause();
  };
  const seekTo = (v) => {
    const el = elRef.current;
    if (!el || !Number.isFinite(v)) return;
    try { el.currentTime = v; } catch { /* not seekable yet */ }
    setTime(v);
  };
  const toggleLoop = () => {
    const next = !loop;
    loopRef.current = next;
    setLoop(next);
    if (elRef.current) elRef.current.loop = next;
  };
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (elRef.current) elRef.current.muted = next;
  };
  const toggleFs = () => {
    const el = elRef.current;
    carry.current = el ? { t: el.currentTime, playing: !el.paused } : null;
    setFs((v) => !v);
  };

  // Android Back closes fullscreen first.
  useEffect(() => {
    if (!fs) return undefined;
    const onKey = (e) => { if (e.key === "Escape") toggleFs(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fs]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = scrub ?? time;
  const seekable = Number.isFinite(dur) && dur > 0;

  const controls = (
    <div data-no-page-swipe className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        type="range" min={0} max={seekable ? dur : 0} step={0.1}
        value={Math.min(shown, seekable ? dur : 0)}
        disabled={!seekable}
        aria-label="Seek"
        onChange={(e) => { const v = Number(e.target.value); setScrub(v); seekTo(v); }}
        onPointerUp={() => setScrub(null)}
        onTouchEnd={() => setScrub(null)}
        onBlur={() => setScrub(null)}
        className="w-full h-6 accent-primary touch-none"
      />
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"}
          className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/15 text-primary flex-shrink-0">
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <span className="text-[0.6875rem] tabular-nums min-w-0 flex-1 truncate">{fmt(shown)} / {fmt(dur)}</span>
        <button type="button" onClick={toggleLoop} aria-label="Loop" aria-pressed={loop} title={loop ? "Loop on" : "Loop off"}
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${loop ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Repeat className="w-4 h-4" />
        </button>
        <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0">
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        {isVideo && (
          <button type="button" onClick={toggleFs} aria-label={fs ? "Exit full screen" : "Full screen"}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0">
            {fs ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );

  if (!isVideo) {
    return (
      <div className={className}>
        <audio ref={setEl} src={src} preload="metadata" {...bind} />
        {controls}
      </div>
    );
  }

  if (fs) {
    return createPortal(
      <div
        className="fixed inset-0 z-[400] flex flex-col bg-black text-white"
        style={{ paddingTop: SAFE_T, paddingBottom: `calc(${SAFE_B} + 12px)`, pointerEvents: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <video ref={setEl} src={src} playsInline preload="metadata" onClick={toggle}
          className="flex-1 min-h-0 w-full object-contain bg-black" {...bind} />
        <div className="px-3 pt-2 text-white [&_button]:text-white">{controls}</div>
      </div>,
      document.body,
    );
  }

  return (
    <div className={className}>
      <video ref={setEl} src={src} playsInline preload="metadata" onClick={toggle}
        className={videoClassName || "w-full max-h-[60vh] rounded-lg bg-black"} {...bind} />
      {controls}
    </div>
  );
}
