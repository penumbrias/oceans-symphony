// Watches the live state that backs the persistent (ongoing) status
// notifications and rewrites each notification whenever it changes.
//
// Mounted once, high in the tree (AppLayout). On web it's an inert no-op —
// every query is gated on isNative() && the matching pref, so a web user
// pays nothing. The notification slots themselves are managed by
// persistentNotifications.js; this hook only decides what text they show,
// wires the "End & log" / "End" action buttons, and revives a swiped
// notification when the app resumes.
//
// Data sources (reusing existing query keys so a switch / a symptom
// start-stop / an activity start-end updates the notification instantly via
// the shared react-query cache):
//   fronters → ["activeFront"] + ["alters"]
//   symptoms → ["symptomSessions"] (active) + ["symptoms"]   (Symptom.label!)
//   activity → the localStorage running-activity session (activitySession.js)
//
// Notifications are only shown when there's something to show — an empty
// state cancels the notification rather than displaying "nothing active".

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isNative } from "@/lib/platform";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getActiveActivity, endAndLogActiveActivity, ACTIVE_ACTIVITY_EVENT } from "@/lib/activitySession";
import { getAllPersistNotifPrefs, PERSIST_NOTIF_EVENT } from "@/lib/persistentNotifPrefs";
import { syncPersistentNotification, registerPersistentActionTypes } from "@/lib/persistentNotifications";

const native = isNative();

export default function usePersistentNotifications() {
  const t = useTerms();
  // useAlterLabel() returns the formatAlter(alter) function directly.
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState(() => getAllPersistNotifPrefs());
  const [activeActivity, setActiveActivityState] = useState(() => getActiveActivity());
  // Bumped on app resume / window focus so the effects re-run and re-create a
  // notification the user may have swiped away while the app was backgrounded.
  const [resyncTick, setResyncTick] = useState(0);

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

  // Revive swiped notifications when the app comes back to the foreground.
  useEffect(() => {
    const bump = () => setResyncTick((n) => n + 1);
    window.addEventListener("focus", bump);
    let appRemove;
    if (native) {
      import("@capacitor/app")
        .then(({ App }) => App.addListener("resume", bump).then((h) => { appRemove = () => h.remove(); }))
        .catch(() => {});
    }
    return () => { window.removeEventListener("focus", bump); try { appRemove?.(); } catch { /* */ } };
  }, []);

  // Register action types once + handle taps on the inline action buttons.
  useEffect(() => {
    if (!native) return;
    let remove;
    (async () => {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        await registerPersistentActionTypes();
        const handle = await LocalNotifications.addListener("localNotificationActionPerformed", async (ev) => {
          const actionId = ev?.actionId;
          const extra = ev?.notification?.extra || {};
          try {
            if (actionId === "end_activity") {
              await endAndLogActiveActivity();
              qc.invalidateQueries({ queryKey: ["activities"] });
            } else if (actionId === "end_symptom" && extra.sessionId) {
              await base44.entities.SymptomSession.update(extra.sessionId, { is_active: false, end_time: new Date().toISOString() });
              qc.invalidateQueries({ queryKey: ["symptomSessions"] });
            }
          } catch { /* end action failed — leave state as-is */ }
        });
        remove = () => handle.remove();
      } catch { /* listener unavailable */ }
    })();
    return () => { try { remove?.(); } catch { /* */ } };
  }, [qc]);

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

  // --- Current fronters notification (only when someone is fronting) ---
  useEffect(() => {
    if (!native) return;
    if (!prefs.fronters) { syncPersistentNotification("fronters", { enabled: false }); return; }
    const altersById = Object.fromEntries(alters.map((a) => [a.id, a]));
    const active = sessions.filter((s) => s.is_active !== false);
    const primary = active.find((s) => s.is_primary);
    const ordered = [primary, ...active.filter((s) => s !== primary)].filter(Boolean);
    const names = ordered
      .map((s) => altersById[s.alter_id || s.primary_alter_id])
      .filter(Boolean)
      .map((a) => formatAlter(a));
    syncPersistentNotification("fronters", {
      enabled: names.length > 0,
      title: `Currently ${t.fronting}`,
      body: names.join(", "),
    });
  }, [prefs.fronters, sessions, alters, t.fronting, formatAlter, resyncTick]);

  // --- Active symptoms / habits notification (only when something is active) ---
  useEffect(() => {
    if (!native) return;
    if (!prefs.symptoms) { syncPersistentNotification("symptoms", { enabled: false }); return; }
    const symptomsById = Object.fromEntries(symptoms.map((s) => [s.id, s]));
    // Symptom records use `label`, not `name`. Habits are just symptoms with
    // category "habit" / is_positive — they ride the same SymptomSession.
    const activeDefs = activeSymptomSessions
      .map((sess) => ({ sess, def: symptomsById[sess.symptom_id] }))
      .filter((x) => x.def && !x.def.is_archived);
    const labels = [...new Set(activeDefs.map((x) => x.def.label).filter(Boolean))];
    const hasHabit = activeDefs.some((x) => x.def.category === "habit" || x.def.is_positive);
    const hasSymptom = activeDefs.some((x) => x.def.category !== "habit" && !x.def.is_positive);
    const title = hasHabit && !hasSymptom ? "Active habits" : hasHabit && hasSymptom ? "Active symptoms & habits" : "Active symptoms";
    const shown = labels.slice(0, 6);
    const body = shown.join(", ") + (labels.length > 6 ? `, +${labels.length - 6} more` : "");
    // Offer an "End" button only when exactly one session is active (otherwise
    // which one to end is ambiguous).
    const single = activeDefs.length === 1 ? activeDefs[0].sess : null;
    syncPersistentNotification("symptoms", {
      enabled: labels.length > 0,
      title,
      body,
      ...(single ? { actionTypeId: "SYMPTOM_ACTIONS", extra: { sessionId: single.id } } : {}),
    });
  }, [prefs.symptoms, activeSymptomSessions, symptoms, resyncTick]);

  // --- Activity timer notification (only when something is running) ---
  useEffect(() => {
    if (!native) return;
    if (!prefs.activity || !activeActivity) { syncPersistentNotification("activity", { enabled: false }); return; }
    let started = "";
    try {
      started = new Date(activeActivity.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch { /* leave blank */ }
    syncPersistentNotification("activity", {
      enabled: true,
      title: "Activity in progress",
      body: `${activeActivity.name}${started ? ` · since ${started}` : ""}`,
      actionTypeId: "ACTIVITY_ACTIONS",
      extra: { kind: "activity" },
    });
  }, [prefs.activity, activeActivity, resyncTick]);

  return null;
}
