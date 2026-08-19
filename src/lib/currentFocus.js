// "Current Focus" aggregation — one glanceable answer to "what's going on
// right now?" for the experimental homescreen. Pulls together, in priority
// order: who's fronting, running activity timers (incl. in-progress sleep),
// active symptom sessions, and today's latest status note.
//
// Read-only: reuses the same react-query keys the dashboard widgets already
// populate (["activeFront"], ["alters"], ["symptomSessions"], ["symptoms"],
// ["sleep"], ["statusNotes"]) so no extra fetch pressure, plus the
// localStorage-backed activity-session store.

import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useTerms } from "@/lib/useTerms";
import { getActiveActivities } from "@/lib/activitySession";

// Items: [{ type: "fronting"|"activity"|"sleep"|"symptom"|"status", label, path }]
export function useCurrentFocus() {
  const terms = useTerms();
  const formatAlter = useAlterLabel();

  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: symptomSessions = [] } = useQuery({
    queryKey: ["symptomSessions", "active"],
    queryFn: () => base44.entities.SymptomSession.filter({ is_active: true }),
    refetchInterval: 60000,
  });
  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });
  const { data: sleeps = [] } = useQuery({
    queryKey: ["sleep"],
    queryFn: () => base44.entities.Sleep.list(),
  });
  const { data: statusNotes = [] } = useQuery({
    queryKey: ["statusNotes"],
    queryFn: () => base44.entities.StatusNote.list(),
  });

  const items = [];

  // Who's fronting (primary first — mirrors CurrentFronters ordering).
  const altersById = Object.fromEntries(alters.map((a) => [a.id, a]));
  const fronters = activeSessions
    .map((s) => ({ s, alter: altersById[s.alter_id || s.primary_alter_id] }))
    .filter((x) => x.alter)
    .sort((a, b) => (b.s.is_primary === true) - (a.s.is_primary === true));
  if (fronters.length > 0) {
    items.push({
      type: "fronting",
      label: `${fronters.map((f) => formatAlter(f.alter)).join(", ")} ${terms.fronting}`,
      path: "/",
    });
  }

  // Running activity timers (localStorage store, same as CurrentActivities).
  for (const act of getActiveActivities()) {
    items.push({ type: "activity", id: act.id, label: act.name || act.activity_name || "Activity in progress", path: "/activities" });
  }

  // In-progress sleep (bedtime set, not woken).
  const activeSleep = sleeps.find((s) => s.bedtime && !s.wake_time);
  if (activeSleep) items.push({ type: "sleep", label: "Sleeping", path: "/sleep" });

  // Active symptom sessions.
  const symptomsById = Object.fromEntries(symptoms.map((s) => [s.id, s]));
  for (const sess of symptomSessions) {
    const sym = symptomsById[sess.symptom_id];
    if (sym && !sym.is_archived) {
      items.push({ type: "symptom", label: sym.name, path: "/system-checkin" });
    }
  }

  // Today's latest status note.
  const today = new Date().toDateString();
  const latestToday = statusNotes
    .filter((n) => n.timestamp && new Date(n.timestamp).toDateString() === today)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  if (latestToday?.note) {
    items.push({ type: "status", label: `“${latestToday.note}”`, path: "/" });
  }

  return { items };
}
