import { useLocation, useNavigate } from "react-router-dom";
import { Square } from "lucide-react";
import { stopSoundscape } from "@/lib/soundscape/engine";
import { useSoundscapeState, useRemaining, fmtClock } from "./soundscapeHooks";

// A small pill above the bottom nav while a Soundscape keeps playing
// outside Quick Support: tap to go back to it, or stop it right there.
export default function SoundscapeGlobalBar() {
  const state = useSoundscapeState();
  const remaining = useRemaining(state.endsAt);
  const location = useLocation();
  const navigate = useNavigate();
  if (!state.playing || location.pathname.toLowerCase() === "/grounding") return null;
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-full border border-primary/30 bg-card/95 backdrop-blur pl-3 pr-1 py-1 shadow-lg"
      style={{ bottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 10px)" }}
    >
      <button type="button" onClick={() => navigate("/grounding?view=soundscape")} className="text-xs text-foreground whitespace-nowrap">
        🎧 Soundscape{remaining != null ? ` · ${fmtClock(remaining)}` : ""}
      </button>
      <button type="button" onClick={() => stopSoundscape()} aria-label="Stop soundscape"
        className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
        <Square className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
