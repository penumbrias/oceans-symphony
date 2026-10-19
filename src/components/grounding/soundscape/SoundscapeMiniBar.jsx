import { Square } from "lucide-react";
import { stopSoundscape } from "@/lib/soundscape/engine";
import { useSoundscapeState, useRemaining, fmtClock } from "./soundscapeHooks";

// Shown at the top of the other Quick Support screens while a Soundscape
// is playing, so it can be found and stopped from anywhere on the page.
export default function SoundscapeMiniBar({ onOpen }) {
  const state = useSoundscapeState();
  const remaining = useRemaining(state.endsAt);
  if (!state.playing) return null;
  return (
    <div className="max-w-lg mx-auto px-4 pt-3">
      <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
        <button type="button" onClick={onOpen} className="flex-1 text-left text-xs text-foreground">
          🎧 Soundscape playing{remaining != null ? ` · ${fmtClock(remaining)} left` : ""}
          <span className="text-primary ml-1">Open</span>
        </button>
        <button type="button" onClick={() => stopSoundscape()} aria-label="Stop soundscape"
          className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
          <Square className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
