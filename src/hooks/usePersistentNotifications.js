// Watches the live state that backs the persistent (ongoing) status
// notifications and rewrites each notification whenever it changes.
//
// Mounted once, high in the tree (AppLayout). On web it's an inert no-op —
// every query is gated on isNative() && the matching pref, so a web user
// pays nothing. The notification slots themselves are managed by
// persistentNotifications.js; this hook only decides what text they show.
//
// Data sources (deliberately reusing existing query keys so a switch / a
// symptom start-stop / an activity start-end updates the notification
// instantly via the shared react-query cache):
//   fronters → ["activeFront"] + ["alters"]
//   symptoms → ["symptomSessions"] (active) + ["symptoms"]
//   activity → the localStorage running-activity session (activitySession.js)

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isNative } from "@/lib/platform";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getActiveActivity, ACTIVE_ACTIVITY_EVENT } from "@/lib/activitySession";
import { getAllPersistNotifPrefs, PERSIST_NOTIF_EVENT } from "@/lib/persistentNotifPrefs";
import { syncPersistentNotification } from "@/lib/persistentNotifications";

const native = isNative();

export default function usePersistentNotifications() {
  const t = useTerms();
  // useAlterLabel() returns the formatAlter(alter) function directly.
  const formatAlter = useAlterLabel();
  const [prefs, setPrefs] = useState(() => getAllPersistNotifPrefs());
  const [activeActivity, setActiveActivityState] = useState(() => getActiveActivity());

  // React to toggle changes (settings) + running-activity changes (start/end).
  useEffect(() => {
    const onPrefs = () => setPrefs(getAllPersistNotifPrefs());
    const onActivity = () => setActiveActivityState(getActiveActivity());
    window.addEventListener(PERSIST_NOTIF_EVENT, onPrefs);
    window.addEventListener(ACTIVE_ACTIVITY_EVENT, onActivity);
    window.addEventListener("focus", onActivity);
    return () => {
      window.removeEventListener(PERSIST_NOTIF_EVENT, onPrefs);
      window.removeEventListener(ACTIVE_ACTIVITY_EVENT, onActivity);
      window.removeEventListener("focus", onActivity);
    };
  }, []);

  const wantFronters = native && prefs.fronters;
  const wantSymptoms = native && prefs.symptoms;

  const { data: sessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
    enabled: wantFronters,
    refetchInterval: wantFronters ? 30000 : false,
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
    enabled: wantFronters,
  });
  const { data: activeSymptomSessions = [] } = useQuery({
    queryKey: ["symptomSessions"],
    queryFn: () => base44.entities.SymptomSession.filter({ is_active: true }),
    enabled: wantSymptoms,
    refetchInterval: wantSymptoms ? 60000 : false,
  });
  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
    enabled: wantSymptoms,
  });

  // --- Current fronters notification ---
  useEffect(() => {
    if (!native) return;
    if (!prefs.fronters) {
      syncPersistentNotification("fronters", { enabled: false });
      return;
    }
    const altersById = Object.fromEntries(alters.map((a) => [a.id, a]));
    const active = sessions.filter((s) => s.is_active !== false);
    const primary = active.find((s) => s.is_primary);
    const ordered = [primary, ...active.filter((s) => s !== primary)].filter(Boolean);
    const names = ordered
      .map((s) => altersById[s.alter_id || s.primary_alter_id])
      .filter(Boolean)
      .map((a) => formatAlter(a));
    const body = names.length ? names.join(", ") : `No one is ${t.fronting}`;
    syncPersistentNotification("fronters", {
      enabled: true,
      title: `Currently ${t.fronting}`,
      body,
    });
  }, [prefs.fronters, sessions, alters, t.fronting, formatAlter]);

  // --- Active symptoms notification ---
  useEffect(() => {
    if (!native) return;
    if (!prefs.symptoms) {
      syncPersistentNotification("symptoms", { enabled: false });
      return;
    }
    const symptomsById = Object.fromEntries(symptoms.map((s) => [s.id, s]));
    const names = activeSymptomSessions
      .map((sess) => symptomsById[sess.symptom_id])
      .filter((sym) => sym && !sym.is_archived)
      .map((sym) => sym.name)
      .filter(Boolean);
    const unique = [...new Set(names)];
    const shown = unique.slice(0, 6);
    const body = unique.length
      ? shown.join(", ") + (unique.length > 6 ? `, +${unique.length - 6} more` : "")
      : "No active symptoms";
    syncPersistentNotification("symptoms", {
      enabled: true,
      title: "Active symptoms",
      body,
    });
  }, [prefs.symptoms, activeSymptomSessions, symptoms]);

  // --- Activity timer notification ---
  useEffect(() => {
    if (!native) return;
    if (!prefs.activity) {
      syncPersistentNotification("activity", { enabled: false });
      return;
    }
    if (!activeActivity) {
      syncPersistentNotification("activity", {
        enabled: true,
        title: "Activity timer",
        body: "Nothing running — open the app to start one",
      });
      return;
    }
    let started = "";
    try {
      started = new Date(activeActivity.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
      /* leave blank */
    }
    syncPersistentNotification("activity", {
      enabled: true,
      title: "Activity in progress",
      body: `${activeActivity.name}${started ? ` · since ${started}` : ""} — open to end & log`,
    });
  }, [prefs.activity, activeActivity]);

  return null;
}
