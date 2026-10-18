import React, { useState } from "react";
import { SlidersHorizontal, Link2, Unlink2, RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { formatTempo, formatSemitones,
  TEMPO_MIN, TEMPO_MAX, TEMPO_STEP, PITCH_MIN, PITCH_MAX, PITCH_STEP,
} from "@/lib/mediaTuning";

// Tempo & pitch controls under an audio / video player. Playback only — the
// stored file is never changed. Collapsed to one small button until opened so a
// chat full of attachments stays tidy. (The player's own speed menu already
// covers plain speed changes; this adds tempo and pitch SEPARATELY, a link, and
// a reset.)
//
// Usage:
//   const tuning = useMediaTuning(mediaRef, id);
//   <video ref={mediaRef} onRateChange={tuning.onNativeRateChange} … />
//   <MediaTuningPanel tuning={tuning} />

export default function MediaTuningPanel({ tuning, defaultOpen = false, className = "" }) {
  const [open, setOpen] = useState(defaultOpen);
  const {
    tempo, semitones, linked, pitchSupported, isDefault,
    setTempo, setSemitones, setLinked, reset,
  } = tuning;

  return (
    <div className={className} data-no-page-swipe onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[0.6875rem] transition-colors ${
          !isDefault ? "border-primary/60 bg-primary/10 text-primary font-medium" : "border-border/50 text-muted-foreground hover:text-foreground"}`}
      >
        <SlidersHorizontal className="w-3 h-3" />
        Tempo &amp; pitch
        {!isDefault && <span className="tabular-nums">· {formatTempo(tempo)} · {formatSemitones(semitones)}</span>}
      </button>

      {open && (
        <div className="mt-1.5 space-y-2.5 rounded-lg border border-border/50 bg-background/60 p-2.5">
          <div>
            <div className="flex items-center justify-between text-[0.6875rem] mb-1.5">
              <label className="text-muted-foreground" id="tuning-tempo-label">Tempo (speed, same pitch)</label>
              <span className="tabular-nums font-medium">{formatTempo(tempo)}</span>
            </div>
            <Slider
              aria-labelledby="tuning-tempo-label"
              min={TEMPO_MIN} max={TEMPO_MAX} step={TEMPO_STEP}
              value={[tempo]}
              onValueChange={([v]) => setTempo(v)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-[0.6875rem] mb-1.5">
              <label className="text-muted-foreground" id="tuning-pitch-label">Pitch (same speed)</label>
              <span className="tabular-nums font-medium">{formatSemitones(semitones)}</span>
            </div>
            <Slider
              aria-labelledby="tuning-pitch-label"
              min={PITCH_MIN} max={PITCH_MAX} step={PITCH_STEP}
              value={[semitones]}
              disabled={!pitchSupported && !linked}
              onValueChange={([v]) => setSemitones(v)}
            />
            {!pitchSupported && (
              <p className="mt-1 text-[0.625rem] text-muted-foreground">
                This device can't shift pitch on its own. Linking tempo and pitch still works.
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setLinked(!linked)}
              aria-pressed={linked}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.6875rem] transition-colors ${
                linked ? "border-primary bg-primary/10 text-primary font-medium" : "border-border/50 text-muted-foreground hover:text-foreground"}`}
            >
              {linked ? <Link2 className="w-3 h-3" /> : <Unlink2 className="w-3 h-3" />}
              {linked ? "Linked" : "Link"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={isDefault}
              className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 text-[0.6875rem] text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <span className="ml-auto text-[0.625rem] text-muted-foreground">
              {linked ? "Moving one moves the other" : "Moved separately"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
