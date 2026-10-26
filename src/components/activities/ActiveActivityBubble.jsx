import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Square, Timer } from "lucide-react";
import { getActiveActivities, ACTIVE_ACTIVITY_EVENT } from "@/lib/activitySession";
import { ActivityActionMenu } from "@/components/activities/CurrentActivities";
import { ActiveNowPopover } from "@/components/v2/ActiveNow";
import { useSoundscapeState } from "@/components/grounding/soundscape/soundscapeHooks";

const fmtElapsed = (start) => {
  const t = new Date(start).getTime();
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

// A small pill above the bottom nav while an activity timer is running, so
// a started activity can't be forgotten (owner ask: "like when sounds are
// playing"). One running → its name, time and a stop button that opens the
// end menu (End & log, or set the real end time). More than one → tap for
// the Active-now list. Sits above the Soundscape bar when both show.
export default function ActiveActivityBubble({ hidden = false }) {
  const [activities, setActivities] = useState(() => getActiveActivities());
  const [menu, setMenu] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  const sound = useSoundscapeState();

  useEffect(() => {
    const sync = () => setActivities(getActiveActivities());
    window.addEventListener(ACTIVE_ACTIVITY_EVENT, sync);
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    // Keeps the elapsed time fresh.
    const tick = setInterval(sync, 30000);
    return () => {
      window.removeEventListener(ACTIVE_ACTIVITY_EVENT, sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
      clearInterval(tick);
    };
  }, []);

  const soundBarShown = sound.playing && location.pathname.toLowerCase() !== "/grounding";
  const first = activities[0];
  const more = activities.length - 1;
  const elapsed = first ? fmtElapsed(first.startTime) : null;
  const open = () => {
    if (more > 0) { setListOpen((v) => !v); return; }
    const fresh = getActiveActivities().find((a) => a.id === first.id);
    if (fresh) setMenu(fresh);
  };

  return (
    <>
      {first && !hidden && (
        <div ref={ref}
          className="fixed left-1/2 -translate-x-1/2 z-40 w-max flex items-center gap-1 rounded-full border bg-card/95 backdrop-blur pl-3 pr-1 py-1 shadow-lg max-w-[calc(100vw-32px)]"
          style={{
            borderColor: first.color || "hsl(var(--primary) / 0.3)",
            bottom: `calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + ${soundBarShown ? 54 : 10}px)`,
          }}>
          <button type="button" onClick={open}
            aria-label={more > 0 ? `${activities.length} activities running` : `${first.name || "Activity"} running — open`}
            className="flex items-center gap-1.5 min-w-0 text-xs text-foreground">
            <Timer className="w-3.5 h-3.5 flex-shrink-0 animate-pulse" style={{ color: first.color || undefined }} />
            <span className="truncate">{first.name || "Activity"}</span>
            {more > 0 && <span className="text-muted-foreground flex-shrink-0">+{more}</span>}
            {elapsed && <span className="text-muted-foreground tabular-nums flex-shrink-0">· {elapsed}</span>}
          </button>
          <button type="button" onClick={open}
            aria-label={more > 0 ? "End an activity" : `End ${first.name || "activity"}`}
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted flex-shrink-0">
            <Square className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <ActiveNowPopover anchorRef={ref} open={listOpen && !hidden} onClose={() => setListOpen(false)} />
      {menu && <ActivityActionMenu activity={menu} onClose={() => setMenu(null)} />}
    </>
  );
}
