// Profile song — the MySpace/Gaia touch: opening an alter's page plays
// their song (owner feature request, v0.119.0).
//
// • Source: `alter.profile_song` = { ref, title, loop } where ref is a
//   /local-image/<id> (uploaded audio in the local blob store — the store
//   is MIME-generic and its backup export walks every blob, so songs ride
//   backups exactly like avatars) or a plain https:// audio URL.
// • Autoplay honours the global toggle (SystemSettings.profile_songs_enabled,
//   default ON). When the platform's autoplay policy blocks sound (web
//   before first interaction), a ▶ chip appears instead — one tap starts it.
// • While playing, a floating mini-player (title · pause/stop) sits above
//   the bottom nav. Navigation away unmounts and stops the audio.

import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, Pause, X, Music } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// `song` lets any surface drive this (group/location profiles, the v2 home
// board); `alter` stays supported so existing callers are untouched.
// `inline` renders the controls in normal flow (for the home-screen song
// WIDGET, which supplies its own box) instead of the floating chip a
// profile page gets.
export default function ProfileSongPlayer({ alter, song: songProp, inline = false }) {
  const song = songProp || alter?.profile_song;
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const enabled = settingsList[0]?.profile_songs_enabled !== false;

  // Local uploads resolve through the same hook avatars use (the blob's
  // own MIME type makes the object URL an audio URL); http(s) passes through.
  const resolved = useResolvedAvatarUrl(song?.ref || null);

  const audioRef = useRef(null);
  const [state, setState] = useState("idle"); // idle | blocked | playing | paused | dismissed | error
  // Bumping this rebuilds the <audio> element from scratch. A load that
  // failed once (revoked blob URL, transient read error) is not forever —
  // a tester's song widget looked permanently broken (play button hidden,
  // volume slider still showing) when a retry would have fixed it.
  const [loadNonce, setLoadNonce] = useState(0);
  // Volume rides WITH the song, so a quiet track and a loud one can sit on
  // two different pages without the user re-adjusting their device each time.
  const volume = Number.isFinite(Number(song?.volume)) ? Math.max(0, Math.min(100, Number(song.volume))) : 100;
  const autoplay = song?.autoplay !== false;
  const [liveVolume, setLiveVolume] = useState(volume);
  useEffect(() => { setLiveVolume(volume); }, [volume]);

  useEffect(() => {
    if (!enabled || !song?.ref || !resolved) return undefined;
    const el = new Audio(resolved);
    el.loop = song.loop !== false;
    el.volume = volume / 100;
    audioRef.current = el;
    let cancelled = false;
    // A link that isn't a playable audio file (a YouTube/Spotify page, a
    // dead link) used to fail silently: play() rejected, we fell into the
    // "autoplay blocked" state, and the user got a play button that did
    // nothing forever. Say what happened instead.
    const onError = () => { if (!cancelled) setState("error"); };
    el.addEventListener("error", onError);
    // "Don't start on its own" is a real choice, not a failure to start — it
    // shows the same play control the blocked case does, without trying.
    if (!autoplay) {
      setState("paused");
    } else {
      el.play().then(() => {
        if (!cancelled) setState("playing");
      }).catch(() => {
        // Autoplay refused (browser policy) — offer the chip instead.
        // A rejection with el.error set is a LOAD failure, not policy;
        // the race between this catch and the error event used to let
        // "blocked" overwrite "error".
        if (!cancelled) setState(el.error ? "error" : "blocked");
      });
    }
    return () => {
      cancelled = true;
      el.removeEventListener("error", onError);
      el.pause();
      el.src = "";
      audioRef.current = null;
    };
  }, [enabled, song?.ref, song?.loop, resolved, volume, autoplay, loadNonce]);

  if (!enabled || !song?.ref || state === "dismissed") return null;

  const title = song.title || alter?.name ? (song.title || `${alter?.name}'s song`) : "Song";
  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (state === "playing") { el.pause(); setState("paused"); }
    else {
      el.play()
        .then(() => setState("playing"))
        // An element that already failed to load can't be "unblocked" by a
        // tap — distinguish the two so the message stays truthful.
        .catch(() => setState(el.error ? "error" : "blocked"));
    }
  };
  const stop = () => {
    audioRef.current?.pause();
    setState("dismissed");
  };
  const changeVolume = (v) => {
    setLiveVolume(v);
    if (audioRef.current) audioRef.current.volume = v / 100;
  };

  return (
    <div
      className={inline
        ? "flex items-center gap-1.5 w-full min-w-0"
        : "fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full border border-border/60 bg-background/95 shadow-lg backdrop-blur-sm max-w-[85vw]"}
      style={inline ? undefined : { bottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)" }}
    >
      <Music className={`w-3.5 h-3.5 flex-shrink-0 ${
        state === "error" ? "text-destructive" : state === "playing" ? "text-primary animate-pulse" : "text-muted-foreground"
      }`} />
      <span className="text-xs font-medium truncate min-w-0">
        {state === "error" ? "Couldn't play this song" : title}
      </span>
      {state === "error" ? (
        // Failed-load state used to HIDE the play button but keep the
        // volume slider — which read as "the pause button is broken and
        // the slider does nothing". Say it failed and offer a retry.
        <button
          type="button"
          onClick={() => { setState("idle"); setLoadNonce((n) => n + 1); }}
          aria-label="Try loading the song again"
          className="text-xs px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          Retry
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label={state === "playing" ? "Pause song" : "Play song"}
          className="w-7 h-7 rounded-full flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/20 flex-shrink-0"
        >
          {state === "playing" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
      )}
      {inline && state !== "error" && (
        <input
          type="range" min={0} max={100} step={5}
          value={liveVolume}
          onChange={(e) => changeVolume(Number(e.target.value))}
          aria-label="Volume"
          title={`Volume ${liveVolume}%`}
          className="w-16 flex-shrink-0 accent-primary"
        />
      )}
      <button
        type="button"
        onClick={stop}
        aria-label="Stop song"
        className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
