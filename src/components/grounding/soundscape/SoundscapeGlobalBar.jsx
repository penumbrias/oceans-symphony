import { useLocation, useNavigate } from "react-router-dom";
import { Pause, Play, Square } from "lucide-react";
import { stopSoundscape } from "@/lib/soundscape/engine";
import { natureSoundById } from "@/lib/natureSounds/catalog";
import { toggleNature, stopNature } from "@/lib/natureSounds/naturePlayer";
import { useNatureState } from "@/components/grounding/nature/natureHooks";
import { useSoundscapeState, useRemaining, fmtClock, useSoundscapeWidgetsOnScreen } from "./soundscapeHooks";

const PILL = "flex items-center gap-1 rounded-full border border-primary/30 bg-card/95 backdrop-blur pl-3 pr-1 py-1 shadow-lg min-w-0";
const ICON_BTN = "p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted flex-shrink-0";

// Small pills above the bottom nav while a Soundscape or a nature sound
// keeps playing outside Quick Support: tap to go back to it, or stop it
// right there.
export default function SoundscapeGlobalBar() {
  const state = useSoundscapeState();
  const nature = useNatureState();
  const remaining = useRemaining(state.endsAt);
  const location = useLocation();
  const navigate = useNavigate();
  const widgetsHere = useSoundscapeWidgetsOnScreen();
  if (location.pathname.toLowerCase() === "/grounding") return null;
  // A Soundscape widget on this page already shows the countdown and a
  // stop button, so the pill would only cover it.
  const showSoundscape = state.playing && widgetsHere === 0;
  const sound = natureSoundById(nature.id);
  if (!showSoundscape && !sound) return null;
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 max-w-[calc(100vw-32px)]"
      style={{ bottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 10px)" }}
    >
      {showSoundscape && (
        <div className={PILL}>
          <button type="button" onClick={() => navigate("/grounding?view=soundscape")} className="text-xs text-foreground whitespace-nowrap">
            🎧 Soundscape{remaining != null ? ` · ${fmtClock(remaining)}` : ""}
          </button>
          <button type="button" onClick={() => stopSoundscape()} aria-label="Stop soundscape" className={ICON_BTN}>
            <Square className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {sound && (
        <div className={PILL}>
          <button type="button" onClick={() => navigate("/grounding?view=nature")} className="text-xs text-foreground truncate max-w-[10rem]">
            🌿 {sound.title}
          </button>
          <button type="button" onClick={() => toggleNature()} aria-label={nature.playing ? "Pause nature sound" : "Play nature sound"} className={ICON_BTN}>
            {nature.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={stopNature} aria-label="Stop nature sound" className={ICON_BTN}>
            <Square className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
