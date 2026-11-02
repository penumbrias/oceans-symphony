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
// • No pop-up player: a song on a page just plays in the background (only the
//   Song widget, `inline`, shows controls). Navigation away unmounts and stops
//   the audio.

import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, Pause, X, Music, Repeat } from "lucide-react";
import { registerMedia, isOtherPlaying, subscribeIdle } from "@/lib/mediaExclusive";
import { base44 } from "@/api/base44Client";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { isOtherAudioPlaying } from "@/lib/otherAudio";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { registerPageSong, saveSongTime, takeSongTime, songAutomatic, setLastAutoSong } from "@/lib/songPresence";

// `song` lets any surface drive this (group/location profiles, the v2 home
// board); `alter` stays supported so existing callers are untouched.
// `inline` renders the controls in normal flow (for the home-screen song
// WIDGET, which supplies its own box) instead of the floating chip a
// profile page gets.
const fmtTime = (s) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

export default function ProfileSongPlayer({ alter, song: songProp, inline = false, everywhere = false }) {
  const song = songProp || alter?.profile_song;
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const enabled = pickPrimarySystemSettings(settingsList)?.profile_songs_enabled !== false;

  // Local uploads resolve through the same hook avatars use (the blob's
  // own MIME type makes the object URL an audio URL); http(s) passes through.
  const resolved = useResolvedAvatarUrl(song?.ref || null);

  const audioRef = useRef(null);
  // Where the song was (and whether it was going) when its <audio> was last
  // rebuilt, so a rebuild — a changed setting, the file's address being
  // re-resolved — picks up in the same spot instead of dropping out and
  // starting over from 0:00.
  const carryRef = useRef(null);
  const volRef = useRef(null);
  // A song on a page (widget, profile, background) tells the app-wide song to
  // step aside while it's on screen. The app-wide copy itself doesn't.
  const hasRef = !!song?.ref;
  useEffect(() => (everywhere || !hasRef ? undefined : registerPageSong()), [everywhere, hasRef]);
  // "Automatic. Play when no music is playing." — starts on its own, gives way
  // to other sound and picks back up when it stops. A song set to play on
  // every page behaves the same, so it's already going when you arrive.
  // (Declared before first use below.)
  const automatic = songAutomatic(song);
  // Songs set to play everywhere keep their place when moving between the
  // widget page and the rest of the app.
  const keepPlace = everywhere || song?.everywhere === true || (inline && automatic);
  // The automatic widget song on the page you opened last is the one that
  // carries on when you leave the widget pages.
  useEffect(() => { if (inline && !everywhere && song?.automatic === true && song?.everywhere !== true && song?.ref) setLastAutoSong(song); }, [inline, everywhere, automatic, song]);
  const [state, setState] = useState("idle"); // idle | blocked | playing | paused | dismissed | error
  // Bumping this rebuilds the <audio> element from scratch. A load that
  // failed once (revoked blob URL, transient read error) is not forever —
  // a tester's song widget looked permanently broken (play button hidden,
  // volume slider still showing) when a retry would have fixed it.
  const [loadNonce, setLoadNonce] = useState(0);
  // Volume rides WITH the song, so a quiet track and a loud one can sit on
  // two different pages without the user re-adjusting their device each time.
  const volume = Number.isFinite(Number(song?.volume)) ? Math.max(0, Math.min(100, Number(song.volume))) : 100;
  const autoplay = automatic || song?.everywhere === true;
  // "Play when there's no sound playing": the song gives way to any other
  // audio / video (one sound at a time) and picks back up once that stops —
  // unless the person paused the song themselves.
  const playWhenIdle = autoplay;
  const userPaused = useRef(false);
  const endedRef = useRef(false);
  const [looping, setLooping] = useState(song?.loop !== false);
  useEffect(() => { setLooping(song?.loop !== false); }, [song?.loop]);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [liveVolume, setLiveVolume] = useState(volume);
  useEffect(() => { setLiveVolume(volume); }, [volume]);

  useEffect(() => {
    if (!enabled || !song?.ref || !resolved) return undefined;
    const el = new Audio();
    el.preload = "auto";
    el.src = resolved;
    el.loop = looping;
    el.volume = (volRef.current ?? volume) / 100;
    audioRef.current = el;
    let cancelled = false;
    const carried = carryRef.current && carryRef.current.ref === song.ref ? carryRef.current : null;
    carryRef.current = null;
    setTime(carried ? carried.t : 0); setDur(0);
    if (carried || keepPlace) {
      const resumeAt = carried ? carried.t : takeSongTime(song.ref);
      if (resumeAt > 0) {
        el.addEventListener("loadedmetadata", () => {
          try { if (Number.isFinite(el.duration) && resumeAt < el.duration - 1) el.currentTime = resumeAt; } catch { /* not seekable yet */ }
        }, { once: true });
      }
    }
    const unregister = registerMedia(el);
    const onPlayEv = () => { if (!cancelled) { endedRef.current = false; setState("playing"); } };
    const onPauseEv = () => { if (!cancelled && !el.ended) setState((st) => (st === "dismissed" || st === "error" ? st : "paused")); };
    const onEndedEv = () => { endedRef.current = true; if (!cancelled) setState("paused"); };
    const onTime = () => setTime(el.currentTime);
    const onDur = () => setDur(el.duration);
    el.addEventListener("play", onPlayEv);
    el.addEventListener("pause", onPauseEv);
    el.addEventListener("ended", onEndedEv);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("durationchange", onDur);
    el.addEventListener("loadedmetadata", onDur);
    const unsubIdle = playWhenIdle ? subscribeIdle(() => {
      if (cancelled || userPaused.current || endedRef.current || !el.paused || isOtherPlaying(el)) return;
      el.play().catch(() => {});
    }) : () => {};
    // A link that isn't a playable audio file (a YouTube/Spotify page, a
    // dead link) used to fail silently: play() rejected, we fell into the
    // "autoplay blocked" state, and the user got a play button that did
    // nothing forever. Say what happened instead.
    const onError = () => { if (!cancelled) setState("error"); };
    el.addEventListener("error", onError);
    // "Don't start on its own" is a real choice, not a failure to start — it
    // shows the same play control the blocked case does, without trying.
    // Someone's music is already playing: starting would stop it (Android
    // hands the audio to whoever played last), so wait for a tap.
    if (carried?.playing) {
      // It was sounding when it was rebuilt — carry straight on, no waiting.
      el.play().then(() => { if (!cancelled) setState("playing"); }).catch(() => { if (!cancelled) setState(el.error ? "error" : "blocked"); });
    } else if (!autoplay) {
      setState("paused");
    } else if (playWhenIdle && isOtherPlaying(el)) {
      // Something else is already playing — wait for quiet instead of talking over it.
      setState("paused");
    } else {
      isOtherAudioPlaying().then((busy) => {
        if (cancelled) return undefined;
        if (busy) { setState("paused"); return undefined; }
        return el.play().then(() => {
          if (!cancelled) setState("playing");
        });
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
      unsubIdle(); unregister();
      el.removeEventListener("play", onPlayEv);
      el.removeEventListener("pause", onPauseEv);
      el.removeEventListener("ended", onEndedEv);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("durationchange", onDur);
      el.removeEventListener("loadedmetadata", onDur);
      el.removeEventListener("error", onError);
      if (keepPlace) saveSongTime(song.ref, el.currentTime);
      carryRef.current = el.error ? null : { ref: song.ref, t: el.currentTime, playing: !el.paused && !el.ended && !userPaused.current };
      el.pause();
      el.src = "";
      audioRef.current = null;
    };
    // Volume is NOT a dependency: changing it must never rebuild the song
    // (that cut the sound off and sent it back to 0:00). It's applied live below.
  }, [enabled, song?.ref, resolved, autoplay, playWhenIdle, keepPlace, loadNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    volRef.current = volume;
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  useEffect(() => { if (audioRef.current) audioRef.current.loop = looping; }, [looping]);

  // Songs on pages, profiles and backgrounds have no pop-up player any more —
  // they just play. If the platform refuses to start sound until you touch the
  // screen (web autoplay policy), the first touch starts it instead.
  useEffect(() => {
    if (inline || state !== "blocked") return undefined;
    const go = () => {
      const el = audioRef.current;
      if (!el || userPaused.current) return;
      el.play().then(() => setState("playing")).catch(() => { /* still blocked — wait for the next touch */ });
    };
    window.addEventListener("pointerdown", go, { once: true });
    return () => window.removeEventListener("pointerdown", go);
  }, [inline, state]);

  // No pop-up player anywhere: only the Song widget (inline) shows controls.
  // Every other song just plays quietly in the background.
  if (!inline || !enabled || !song?.ref || state === "dismissed") return null;

  const title = song.title || alter?.name ? (song.title || `${alter?.name}'s song`) : "Song";
  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (state === "playing") { userPaused.current = true; el.pause(); setState("paused"); }
    else {
      userPaused.current = false; endedRef.current = false;
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
  const seek = (v) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(v)) return;
    try { el.currentTime = v; } catch { /* not seekable yet */ }
    setTime(v);
  };
  const changeVolume = (v) => {
    setLiveVolume(v);
    volRef.current = v;
    if (audioRef.current) audioRef.current.volume = v / 100;
  };

  return (
    <div
      className={inline
        ? "flex items-center gap-1.5 w-full min-w-0"
        : "fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full border border-border/60 bg-background/95 shadow-lg backdrop-blur-sm max-w-[85vw]"}
      style={inline ? undefined : { bottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab) + 12px)" }}
    >
      <Music className={`w-3.5 h-3.5 flex-shrink-0 ${
        state === "error" ? "text-destructive" : state === "playing" ? "text-primary animate-pulse" : "text-muted-foreground"
      }`} />
      {(!inline || state === "error") && (
        <span className="text-xs font-medium truncate min-w-0">
          {state === "error" ? "Couldn't play this song" : title}
        </span>
      )}
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
        <div className="flex items-center gap-1.5 flex-1 min-w-0" data-no-page-swipe>
          <span className="text-[0.6875em] tabular-nums flex-shrink-0">{fmtTime(time)}</span>
          <input
            type="range" min={0} max={Number.isFinite(dur) && dur > 0 ? dur : 0} step={0.1}
            value={Math.min(time, Number.isFinite(dur) && dur > 0 ? dur : 0)}
            disabled={!(Number.isFinite(dur) && dur > 0)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label={`Seek — ${title}`}
            title={title}
            className="flex-1 min-w-[40px] accent-primary touch-none"
          />
          <span className="text-[0.6875em] tabular-nums flex-shrink-0">{fmtTime(dur)}</span>
        </div>
      )}
      {state !== "error" && (
        <button
          type="button"
          onClick={() => setLooping((v) => !v)}
          aria-label="Loop" aria-pressed={looping} title={looping ? "Loop on" : "Loop off"}
          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${looping ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Repeat className="w-3.5 h-3.5" />
        </button>
      )}
      {inline && state !== "error" && (
        <input
          type="range" min={0} max={100} step={5}
          data-no-page-swipe
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
