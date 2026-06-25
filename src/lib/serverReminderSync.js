// Server-scheduled reminder push.
//
// The problem: timed reminders were handed to Android's AlarmManager
// (nativeReminderScheduler.js), which Android CANCELS when the app is
// force-stopped / swiped away — so reminders silently didn't fire. The web
// build couldn't fire closed-tab reminders at all.
//
// The fix (this file): mirror each reminder's upcoming fire-times to the
// relay (POST /api/reminders/sync). A per-minute Vercel Cron
// (/api/reminders/dispatch) then pushes them at their time via the SAME
// FCM / Web Push pipe as friend-front changes — which DOES survive the app
// being closed. The server holds the clock; the device just receives.
//
// Coordination with the local schedulers (no double-buzz):
//   - When this sync succeeds AND push is enabled, we set a localStorage
//     flag. nativeReminderScheduler.reconcileNativeSchedule reads it and
//     SKIPS the OS pre-schedule, so the same reminder isn't delivered twice
//     (once by the OS alarm, once by FCM). If push isn't ready / sync fails,
//     the flag is cleared and the OS pre-schedule resumes as the fallback.
//   - The in-app polling scheduler (remindersScheduler.js) still shows the
//     inbox banner while the app is open; it already skips its own push send
//     for pre-scheduleable types on native.

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { isNative } from "@/lib/platform";
import { base44 } from "@/api/base44Client";
import { getLocalIdentity, ensurePushIdentity, FRIENDS_API_BASE } from "@/lib/friendsApi";
import { isPushEnabled } from "@/lib/pushRegistration";
import { computePrescheduledFires, isPrescheduleableType, isRollingFrontReminder } from "@/lib/nativeReminderScheduler";

// Same host rule as friendsApi: native WebView can't use a relative /api
// path (private hostname → 404), so point at the production deploy.
const NATIVE_API_HOST = "https://oceans-symphony.app";
const REMINDERS_API_BASE = isNative() ? `${NATIVE_API_HOST}/api/reminders` : "/api/reminders";

// Whether this device should use the cloud relay for closed-app reminder
// delivery. The relay (FCM / Web Push) is the only path that survives a
// force-stop, but it sends reminder times (and optionally text) to the server —
// so it's an explicit opt-in. The app stays 100% local-only and contacts no
// server unless this is on.
//   - explicit true/false  → honour the user's choice
//   - unset                → on for users who already have a server identity
//                            (Friends users have always had server reminder
//                            push); off — fully local — for everyone else.
export function cloudReminderDeliveryEnabled(settings, hasIdentity) {
  const v = settings?.reminders_cloud_delivery;
  if (v === true) return true;
  if (v === false) return false;
  return !!hasIdentity;
}

// Read by nativeReminderScheduler (directly, to avoid an import cycle) to
// decide whether to suppress the OS pre-schedule. Keep the literal in sync.
const ACTIVE_FLAG_KEY = "symphony_server_reminder_push_active_v1";

function setServerPushActive(active) {
  try { localStorage.setItem(ACTIVE_FLAG_KEY, active ? "1" : "0"); } catch { /* private mode */ }
}

export function isServerReminderPushActive() {
  try { return localStorage.getItem(ACTIVE_FLAG_KEY) === "1"; } catch { return false; }
}

async function postSync(identity, reminders, includeText) {
  const res = await fetch(`${REMINDERS_API_BASE}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: identity.userId, secret: identity.secret, reminders, includeText }),
  });
  return res.ok;
}

// Push the user's upcoming reminder fire-times to the relay. No-op (and clears
// the active flag, so the local schedulers stay the fallback) when cloud
// delivery is off, there's no usable identity, or push isn't enabled.
export async function syncRemindersToServer() {
  const existing = await getLocalIdentity().catch(() => null);

  let settings = null;
  try {
    settings = (await base44.entities.SystemSettings.list())?.[0] || null;
  } catch { setServerPushActive(false); return; }

  // Off by default — a fully-local user never reaches the server here.
  if (!cloudReminderDeliveryEnabled(settings, !!existing)) { setServerPushActive(false); return; }

  // Provision a push-only identity if the user explicitly enabled cloud delivery
  // but hasn't set up Friends. No-op (returns the existing one) otherwise.
  const identity = existing || await ensurePushIdentity().catch(() => null);
  if (!identity?.userId || !identity?.secret) { setServerPushActive(false); return; }

  // Only meaningful if a push can actually be delivered to this device.
  let pushReady = false;
  try { pushReady = await isPushEnabled(); } catch { pushReady = false; }
  if (!pushReady) { setServerPushActive(false); return; }

  let reminders = [];
  try {
    reminders = (await base44.entities.Reminder.list("-created_date", 500)) || [];
  } catch { setServerPushActive(false); return; }

  // Paused → clear the server schedule and stand down.
  if (settings?.reminders_paused) {
    try { await postSync(identity, [], true); } catch { /* non-fatal */ }
    setServerPushActive(false);
    return;
  }

  const includeText = settings?.reminder_push_include_text !== false; // default: include text
  const now = new Date();
  const payload = [];
  for (const r of reminders) {
    if (!r.is_active) continue;
    if (r.end_date && new Date(r.end_date) <= now) continue;
    if (!isPrescheduleableType(r)) continue; // contextual reminders need live data → stay local
    // The rolling "no front update for N minutes" reminder resets on every
    // front change, which a static server schedule can't follow — the local
    // OS pre-schedule owns it instead (it re-reconciles on front change).
    if (isRollingFrontReminder(r)) continue;
    const channels = r.delivery_channels?.length ? r.delivery_channels : ["in_app"];
    if (!channels.includes("push")) continue; // in-app-only reminders never leave the device
    const fires = computePrescheduledFires(r, settings, now);
    if (!fires.length) continue;
    payload.push({
      reminderId: r.id,
      title: r.title || "Reminder",
      body: r.body || "",
      vibrate: true, // timed reminders use the high-importance vibrating channel
      fires,
    });
  }

  try {
    const ok = await postSync(identity, payload, includeText);
    setServerPushActive(ok);
  } catch {
    setServerPushActive(false);
  }
}

// Turn ON the cloud relay for this device: provision a push identity if needed,
// register the platform's push transport under it (FCM on native, Web Push on
// web — saving the subscription so the dispatch cron can reach the browser),
// then sync the schedule. Returns true if a server push can now be delivered.
// Call this right after persisting reminders_cloud_delivery: true.
export async function enableCloudReminderDelivery() {
  const identity = await ensurePushIdentity().catch(() => null);
  if (!identity?.userId || !identity?.secret) return false;

  if (isNative()) {
    // prompt:true — this is an explicit, user-initiated opt-in, so asking for
    // notification permission here is expected.
    try {
      const { registerFcmPush } = await import("@/lib/fcmPush");
      await registerFcmPush({ prompt: true });
    } catch { /* non-fatal — sync still records the schedule */ }
  } else {
    try {
      const { registerPush, getActivePushSubscription } = await import("@/lib/pushRegistration");
      await registerPush();
      const sub = await getActivePushSubscription();
      if (sub) {
        await fetch(`${FRIENDS_API_BASE}/save-push-sub`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: identity.userId, secret: identity.secret, subscription: sub }),
        }).catch(() => {});
      }
    } catch { /* non-fatal */ }
  }

  await syncRemindersToServer();
  return isServerReminderPushActive();
}

// Turn OFF the cloud relay: wipe this user's server-side reminder schedule so
// nothing fires from the server and no reminder data lingers on it. Local OS
// alarms resume as the only delivery path. For a PUSH-ONLY identity (one that
// exists solely for reminders, no Friends profile) we also drop the FCM token so
// the device is fully detached from server push; a social identity keeps its
// token so friend-front pushes still work. Call this after persisting
// reminders_cloud_delivery: false.
export async function disableCloudReminderDelivery() {
  const identity = await getLocalIdentity().catch(() => null);
  if (identity?.userId && identity?.secret) {
    try { await postSync(identity, [], true); } catch { /* non-fatal */ }
    if (identity.push_only) {
      try {
        const { unregisterFcmPush } = await import("@/lib/fcmPush");
        await unregisterFcmPush();
      } catch { /* non-fatal */ }
    }
  }
  setServerPushActive(false);
}

// Hook: re-sync whenever the reminder set or relevant settings change, plus
// on mount. Runs on every platform (web + native) — server push helps web
// users (who can't get closed-tab reminders otherwise) too.
export function useServerReminderSync() {
  const lastSigRef = useRef(null);
  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders"],
    queryFn: () => base44.entities.Reminder.list("-created_date", 500),
  });
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = settingsList[0] || null;

  useEffect(() => {
    const sig = JSON.stringify({
      r: (reminders || []).map((r) => [
        r.id, r.is_active, r.trigger_type, r.trigger_config,
        r.last_fired_at, r.end_date, r.delivery_channels, r.title, r.body,
      ]),
      s: settings ? {
        paused: settings.reminders_paused,
        quiet: settings.quiet_hours,
        tz: settings.timezone,
        inc: settings.reminder_push_include_text,
        cloud: settings.reminders_cloud_delivery,
      } : null,
    });
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    syncRemindersToServer().catch(() => {});
  }, [reminders, settings]);
}
