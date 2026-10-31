import { Pause, Play, Square } from "lucide-react";
import { natureSoundById } from "@/lib/natureSounds/catalog";
import { toggleNature, stopNature } from "@/lib/natureSounds/naturePlayer";
import { useNatureState } from "./natureHooks";

// Shown at the top of the other Quick Support screens while a nature sound
// is on (playing or paused), so it can be found, paused or stopped.
export default function NatureMiniBar({ onOpen }) {
  const state = useNatureState();
  const sound = natureSoundById(state.id);
  if (!sound) return null;
  return (
    <div className="max-w-lg mx-auto px-4 pt-3">
      <div className="flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/5 pl-3 pr-1 py-1">
        <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left text-xs text-foreground truncate py-1.5">
          🌿 {sound.title}
          <span className="text-primary ml-1">Open</span>
        </button>
        <button type="button" onClick={() => toggleNature()} aria-label={state.playing ? "Pause nature sound" : "Play nature sound"}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
          {state.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={stopNature} aria-label="Stop nature sound"
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
          <Square className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
