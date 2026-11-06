// Refill reminders for medications (v0.367.0).
//
// A medication with "Remind me before it runs out" on gets one notification
// a few days before its supply runs out (supplyOf().remindAt, 10:00). On the
// installed apps the OS holds it (it fires with the app closed); on the web
// it's a best-effort timer while the app is open. It is worked out again on
// every app open and whenever a medication, a dose or a refill changes, so a
// refill moves it and a marked dose keeps it honest.
//
// Privacy: a notification can show on a lock screen, so it never names the
// medicine — "A medication is running low".
//
// Native ids live in [2.10e9, 2.14e9): disjoint from the user-reminder
// scheduler's [1, 1e9), the activity-end timers' [1.0e9, 1.4e9), the event
// scheduler's [1.4e9, 1.5e9) and the plan scheduler's [1.5e9, 2.1e9), and
// under int32 max.
//
// Device-bound: the log of scheduled ids (LOG_KEY) means nothing on another
// device, so it is NOT in BACKUP_LS_KEYS. The Capacitor plugin is imported
// dynamically behind isNative() (CLAUDE.md).

import { useEffect, useRef } from "react";
import { isNative } from "@/lib/platform";
import { isPreviewActive } from "@/lib/previewMode";
import { isNativeNotificationsEnabled, ensureRemindersChannel, REMINDERS_CHANNEL_ID } from "@/lib/nativeNotifications";
import { useMedications, useMedicationDoses, supplyOf, isActiveMed, MEDICATIONS_PATH } from "@/lib/medications";

const LOG_KEY = "symphony_medication_reminder_log_v1";
const HORIZON_MS = 60 * 86_400_000;

const readLog = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch { return []; } };
const writeLog = (v) => { try { localStorage.setItem(LOG_KEY, JSON.stringify(v)); } catch { /* non-fatal */ } };

function nativeIdFor(medId, fireMs) {
  const seed = `med|${medId}|${fireMs}`;
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return 2_100_000_000 + (Math.abs(h) % 40_000_000);
}

export const REFILL_TITLE = "Refill reminder";
export function refillBody(daysLeft) {
  if (daysLeft == null) return "A medication is running low.";
  if (daysLeft <= 0) return "A medication has run out.";
  return `A medication runs out in about ${daysLeft === 1 ? "1 day" : `${daysLeft} days`}.`;
}

// The refill reminders still to come: [{ medId, fireMs, daysLeft }].
export function refillFires(meds = [], doses = [], now = new Date()) {
  const out = [];
  for (const med of meds) {
    if (!isActiveMed(med) || !med.refill_reminder) continue;
    const s = supplyOf(med, doses, now);
    if (!s?.remindAt) continue;
    const fireMs = s.remindAt.getTime();
    if (fireMs <= now.getTime() || fireMs - now.getTime() > HORIZON_MS) continue;
    out.push({ medId: med.id, fireMs, daysLeft: Math.round((s.runOut - s.remindAt) / 86_400_000) });
  }
  return out;
}

const webTimers = new Set();
function clearWebTimers() {
  for (const t of webTimers) clearTimeout(t);
  webTimers.clear();
}
function scheduleWeb(fire) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  const delay = fire.fireMs - Date.now();
  if (delay <= 0 || delay > 0x7fffffff) return;
  const t = setTimeout(() => {
    webTimers.delete(t);
    try {
      const n = new Notification(REFILL_TITLE, { body: refillBody(fire.daysLeft), tag: `med-refill-${fire.medId}` });
      n.onclick = () => { try { window.focus(); window.location.href = `${MEDICATIONS_PATH}?tab=refills`; } catch { /* non-fatal */ } n.close(); };
    } catch { /* non-fatal */ }
  }, delay);
  webTimers.add(t);
}

export async function reconcileMedicationReminders(meds, doses) {
  if (isPreviewActive()) return { scheduled: 0, skipped: "preview_active" };
  const old = readLog();
  clearWebTimers();
  if (isNative() && old.length) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.cancel({ notifications: old.map((e) => ({ id: e.nativeId })) });
    } catch { /* non-fatal */ }
  }
  writeLog([]);

  const fires = refillFires(meds, doses);
  if (!fires.length) return { scheduled: 0 };
  if (!isNative()) {
    fires.forEach(scheduleWeb);
    return { scheduled: fires.length };
  }
  if (!(await isNativeNotificationsEnabled())) return { scheduled: 0, skipped: "no_permission" };
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await ensureRemindersChannel();
    const log = [];
    const notifications = fires.map((f) => {
      const nativeId = nativeIdFor(f.medId, f.fireMs);
      log.push({ medId: f.medId, nativeId, fireAt: new Date(f.fireMs).toISOString() });
      return {
        id: nativeId,
        title: REFILL_TITLE,
        body: refillBody(f.daysLeft),
        channelId: REMINDERS_CHANNEL_ID,
        largeIcon: "ic_notif_large",
        schedule: { at: new Date(f.fireMs), allowWhileIdle: true },
        extra: { kind: "medication_refill", route: `${MEDICATIONS_PATH}?tab=refills` },
      };
    });
    await LocalNotifications.schedule({ notifications });
    writeLog(log);
    return { scheduled: notifications.length };
  } catch (e) {
    return { scheduled: 0, error: e?.message || "schedule_failed" };
  }
}

// Ask for notification permission the first time someone turns a refill
// reminder on (no prompt otherwise). Best-effort.
export async function ensureMedicationReminderPermission() {
  try {
    if (isNative()) {
      const { requestNativePermission } = await import("@/lib/nativeNotifications");
      await requestNativePermission();
    } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch { /* permission stays whatever it is */ }
}

// Mounted once in App: keeps the OS queue in step with the medications.
export function useMedicationReminderSync() {
  const { medications } = useMedications();
  const { doses } = useMedicationDoses();
  const lastSig = useRef(null);
  useEffect(() => {
    const fires = refillFires(medications, doses);
    const sig = `${JSON.stringify(fires.map((f) => [f.medId, f.fireMs]))}|${new Date().toDateString()}`;
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    reconcileMedicationReminders(medications, doses).catch(() => {});
  }, [medications, doses]);
}
