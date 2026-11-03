// "Study now" for a flash-card deck (v0.346.0): starts the normal activity
// timer ("Study: <deck>", see startDeckStudy) and opens the deck; tapping it
// again stops and logs the time, which deck-study goal points count.
import React from "react";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { notesPath } from "@/lib/noteLists";
import { useActiveSessions } from "@/components/goals/workspace/ActivityStrip";
import { runningStudyFor, startDeckStudy, stopPageActivity } from "@/lib/goalActivities";
import { formatMinutes } from "@/lib/goalTree";

export default function StudyDeckButton({ deck, goalId = null, busy = false, run = null, className = "mt-1" }) {
  const navigate = useNavigate();
  const sessions = useActiveSessions();
  const running = runningStudyFor(deck?.id, sessions);
  if (!deck) return null;
  const mins = running ? Math.max(0, Math.round((Date.now() - new Date(running.startTime)) / 60000)) : 0;
  const act = async () => {
    if (running) {
      const res = await stopPageActivity(running);
      if (res) toast.success(`■ ${formatMinutes(res.minutes)} of study logged`);
    } else {
      await startDeckStudy(deck, { goalId });
      navigate(notesPath(deck.id));
    }
  };
  const go = () => (run ? run(act) : act().catch((e) => toast.error(e?.message || "Couldn't start the timer.")));
  return (
    <button type="button" disabled={busy} aria-pressed={!!running} onClick={go}
      className={`${className} text-xs px-2.5 py-1 rounded-full border inline-flex items-center gap-1 disabled:opacity-50`}
      style={running
        ? { background: "var(--v2-accent, hsl(var(--primary)))", borderColor: "var(--v2-accent, hsl(var(--primary)))", color: "hsl(var(--primary-foreground))" }
        : { borderColor: "var(--v2-accent, hsl(var(--primary)))", color: "var(--v2-accent, hsl(var(--primary)))" }}>
      {running ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      {running ? `Stop studying · ${formatMinutes(mins)}` : "Study now"}
    </button>
  );
}
