import { Pause, Play, Square } from "lucide-react";
import { stopSoundscape } from "@/lib/soundscape/engine";
import { natureSoundById } from "@/lib/natureSounds/catalog";
import { toggleNature, stopNature } from "@/lib/natureSounds/naturePlayer";
import { useNatureState } from "@/components/grounding/nature/natureHooks";
import { useSoundscapeState, useRemaining, fmtClock } from "./soundscapeHooks";

// Shown at the top of the other Quick Support screens while anything in
// the Soundscape is on (a sound made from math, a recording, or both), so
// it can be found, paused or stopped.
export default function SoundscapeMiniBar({ onOpen }) {
  const state = useSoundscapeState();
  const remaining = useRemaining(state.endsAt);
  const nature = useNatureState();
  const recording = natureSoundById(nature.id);
  if (!state.playing && !recording) return null;
  const parts = [
    state.playing && `Soundscape${remaining != null ? ` · ${fmtClock(remaining)} left` : ""}`,
    recording && recording.title,
  ].filter(Boolean);
  return (
    <div className="max-w-lg mx-auto px-4 pt-3">
      <div className="flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/5 pl-3 pr-1 py-1">
        <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left text-xs text-foreground truncate py-1.5">
          🎧 {parts.join(" + ")}
          <span className="text-primary ml-1">Open</span>
        </button>
        {recording && (
          <button type="button" onClick={() => toggleNature()} aria-label={nature.playing ? `Pause ${recording.title}` : `Play ${recording.title}`}
            className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
            {nature.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
        )}
        <button type="button" onClick={() => { stopSoundscape(); stopNature(); }} aria-label="Stop everything"
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
          <Square className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
