// "Current Focus" aggregation — one glanceable answer to "what's going on
// right now?" for the experimental homescreen. Pulls together, in priority
// order: who's fronting, running activity timers (incl. in-progress sleep),
// active symptom sessions, and today's latest status note.
//
// Read-only: reuses the same react-query keys the dashboard widgets already
// populate (["activeFront"], ["alters"], ["symptomSessions"], ["symptoms"],
// ["sleep"], ["statusNotes"]) so no extra fetch pressure, plus the
// localStorage-backed activity-session store.

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useTerms } from "@/lib/useTerms";
import { getActiveActivities } from "@/lib/activitySession";
import { contactDisplayName } from "@/lib/contacts";

// Items: [{ type: "fronting"|"activity"|"sleep"|"symptom"|"company"|"status", label, path }]
export function useCurrentFocus() {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  // ~company commands write encounters outside react-query — they announce
  // themselves so the "active now" surfaces refresh immediately.
  useEffect(() => {
    const onEnc = () => qc.invalidateQueries({ queryKey: ["contactEncounters", "active"] });
    const onSym = () => qc.invalidateQueries({ queryKey: ["symptomSessions", "active"] });
    window.addEventListener("symphony-encounters-changed", onEnc);
    window.addEventListener("symphony-symptoms-changed", onSym);
    return () => {
      window.removeEventListener("symphony-encounters-changed", onEnc);
      window.removeEventListener("symphony-symptoms-changed", onSym);
    };
  }, [qc]);

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
  const { data: activeEncounters = [] } = useQuery({
    queryKey: ["contactEncounters", "active"],
    queryFn: () => base44.entities.ContactEncounter.filter({ is_active: true }),
    refetchInterval: 60000,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list(),
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
    items.push({ type: "activity", id: act.id, label: act.name || act.activity_name || "Activity in progress", path: "/activities", since: act.startTime || null });
  }

  // Active company — "I'm with X" sessions (~company:X:active or the
  // contact page's own button). Ends from the Active-now popup.
  const contactById = Object.fromEntries(contacts.map((ct) => [ct.id, ct]));
  for (const enc of activeEncounters) {
    const ct = contactById[enc.contact_id];
    items.push({
      type: "company", id: enc.id, contactId: enc.contact_id,
      label: `with ${ct ? contactDisplayName(ct) : "someone"}`,
      path: `/contacts/${enc.contact_id}`,
      since: enc.start_time || null,
    });
  }

  // In-progress sleep (bedtime set, not woken).
  const activeSleep = sleeps.find((s) => s.bedtime && !s.wake_time);
  if (activeSleep) items.push({ type: "sleep", label: "Sleeping", path: "/sleep", since: activeSleep.bedtime || null });

  // Active symptom sessions.
  const symptomsById = Object.fromEntries(symptoms.map((s) => [s.id, s]));
  for (const sess of symptomSessions) {
    const sym = symptomsById[sess.symptom_id];
    if (sym && !sym.is_archived) {
      // Latest set severity rides in the label (owner ask) — snapshots are
      // appended on every adjustment, so the last one is current.
      const snaps = sess.severity_snapshots || [];
      const sev = snaps.length ? snaps[snaps.length - 1]?.severity : null;
      // Symptom entities carry `label` (defaults catalogue); `name` was a
      // ghost field — rows rendered blank and read as misdetections.
      // The session + symptom ride along so the Active-now popup can open
      // the SAME action menu the classic pills use (adjust / end) instead
      // of dumping the user on a page.
      items.push({ type: "symptom", id: sess.id, label: `${sym.label || sym.name || "Symptom"}${sev != null ? ` · ${sev}` : ""}`, path: "/system-checkin", session: sess, symptom: sym, since: sess.start_time || null });
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
