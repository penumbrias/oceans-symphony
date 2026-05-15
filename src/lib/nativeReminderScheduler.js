// Pre-schedules reminders with the OS so they fire when the app is fully
// closed. Web/PWA can't do this — Web Push requires the browser to wake
// the SW, which never happens for a Capacitor WebView. On the native
// Android target we delegate to @capacitor/local-notifications, which
// hands the schedule off to AlarmManager / WorkManager and survives app
// kill, swipe-away, and reboot (RECEIVE_BOOT_COMPLETED is declared by
// the plugin's manifest).
//
// Per CLAUDE.md: native-only deps live behind isNative() with dynamic
// imports so the web bundle still tree-shakes.
//
// Architecture
// ────────────
// The in-app polling scheduler (remindersScheduler.js) continues to run
// while the app is open. This file ADDS a parallel pre-schedule that
// covers the window where the in-app scheduler is dead (app fully
// closed). To avoid double delivery on native, the in-app scheduler
// skips the *push* delivery channel for any reminder type we
// pre-schedule here — the OS notification IS that delivery.
//
// Tracking log
// ────────────
// LocalNotifications IDs are 32-bit ints; we map (reminderId, fireTime)
// → a stable positive int31 via a SHA-1 prefix. We persist the full
// queue we've handed to the OS in a localStorage log so we can:
//   1. Cancel exactly what we scheduled when reconciling.
//   2. On boot, walk past-due entries that the OS should have fired
//      and back-fill ReminderInstance records (so the inbox shows them
//      even if the user dismissed the tray notification without
//      tapping).
//
// Reconciliation triggers
// ───────────────────────
// `reconcileNativeSchedule` is called from useNativeReminderSync (in
// App.jsx) whenever the reminders or systemSettings query data changes,
// plus on boot. Idempotent — it cancels and re-schedules the whole
// queue every call.

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { isNative } from "@/lib/platform";
import {
  isNativeNotificationsEnabled,
  ensureRemindersChannel,
  REMINDERS_CHANNEL_ID,
} from "@/lib/nativeNotifications";
import {
  zonedFireInstant,
  getUserLocalDate,
  getCurrentMinutesInZone,
} from "@/lib/timezoneHelpers";
import { base44 } from "@/api/base44Client";

const LOG_KEY = "symphony_native_reminder_log_v1";

// Cap to keep AlarmManager pressure low and avoid surprise OEM throttling.
const MAX_TOTAL_SCHEDULED = 64;
const HORIZON_DAYS = 14;
const MAX_FIRES_PER_REMINDER = 10;

function readLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLog(entries) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries));
  } catch {
    /* quota / private mode — non-fatal, reconcile next boot will overwrite */
  }
}

// LocalNotifications requires a positive int32. Hash (reminderId +
// fireTimeISO) deterministically so re-scheduling the same fire produces
// the same id (lets us cancel it cleanly on reconcile).
function nativeIdFor(reminderId, fireTimeISO) {
  const seed = `${reminderId}|${fireTimeISO}`;
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  // Force positive int31 (OS scheduler rejects 0 and negatives).
  const positive = Math.abs(h) % 2_000_000_000;
  return positive === 0 ? 1 : positive;
}

function parseHHMM(str) {
  const [h, m] = (str || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function inQuietWindow(minute, start, end) {
  if (start <= end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

// True if fire time falls inside quiet hours and the reminder respects
// them. Caller decides whether to skip or shift.
function violatesQuietHours(fireDate, reminder, settings) {
  if (!reminder.quiet_hours_respect) return false;
  const qh = settings?.quiet_hours || {};
  if (!qh.enabled) return false;
  const tz = settings?.timezone || "UTC";
  const minute = getCurrentMinutesInZone(fireDate, tz);
  const start = parseHHMM(qh.start || "22:00");
  const end = parseHHMM(qh.end || "08:00");
  return inQuietWindow(minute, start, end);
}

// Compute upcoming fire times for a single reminder. Returns an array of
// ISO strings, soonest first. Pure — no side effects, no plugin calls.
export function computePrescheduledFires(reminder, settings, now = new Date()) {
  const out = [];
  const cfg = reminder.trigger_config || {};
  const tz = settings?.timezone || "UTC";
  const horizonMs = HORIZON_DAYS * 24 * 60 * 60 * 1000;
  const horizonEnd = now.getTime() + horizonMs;

  const endDateMs = reminder.end_date ? new Date(reminder.end_date).getTime() : Infinity;

  if (reminder.trigger_type === "scheduled") {
    const times = cfg.times || [];
    const days = cfg.days; // optional
    if (!times.length) return [];

    for (let dayOffset = 0; dayOffset < HORIZON_DAYS; dayOffset++) {
      const probeDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const localDateStr = getUserLocalDate(probeDate, tz);
      const [y, m, d] = localDateStr.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      if (days && !days.includes(dow)) continue;

      for (const timeStr of times) {
        const fireInstant = zonedFireInstant(localDateStr, timeStr, tz);
        const fireMs = fireInstant.getTime();
        if (fireMs <= now.getTime()) continue;
        if (fireMs > horizonEnd) continue;
        if (fireMs > endDateMs) continue;
        if (violatesQuietHours(fireInstant, reminder, settings)) continue;
        out.push(fireInstant.toISOString());
        if (out.length >= MAX_FIRES_PER_REMINDER) return out;
      }
    }
    return out;
  }

  if (reminder.trigger_type === "interval") {
    // after_last: "check_in" needs live data to compute baseline — leave
    // it on the polling path.
    if (cfg.after_last === "check_in") return [];

    const everyMs = (cfg.every_minutes || 60) * 60 * 1000;
    if (everyMs < 60 * 1000) return []; // sub-minute intervals are nonsense
    let baseline = reminder.last_fired_at ? new Date(reminder.last_fired_at).getTime() : now.getTime();
    let next = baseline + everyMs;

    // active_window: HH:MM range in user's tz. Skip fires outside it.
    const aw = cfg.active_window;
    const awStart = aw ? parseHHMM(aw.start) : null;
    const awEnd = aw ? parseHHMM(aw.end) : null;

    while (next <= horizonEnd && next <= endDateMs && out.length < MAX_FIRES_PER_REMINDER) {
      if (next > now.getTime()) {
        const fireDate = new Date(next);
        let skip = false;
        if (aw) {
          const minute = getCurrentMinutesInZone(fireDate, tz);
          if (!inQuietWindow(minute, awStart, awEnd)) skip = true;
        }
        if (!skip && violatesQuietHours(fireDate, reminder, settings)) skip = true;
        if (!skip) out.push(fireDate.toISOString());
      }
      next += everyMs;
    }
    return out;
  }

  if (reminder.trigger_type === "event") {
    const when = cfg.when ? new Date(cfg.when).getTime() : null;
    if (!when) return [];
    if (when > endDateMs) return [];
    const offsets = [0, ...(cfg.pre_alerts || [])];
    for (const offsetMins of offsets) {
      const fireMs = when - offsetMins * 60 * 1000;
      if (fireMs <= now.getTime()) continue;
      if (fireMs > horizonEnd) continue;
      const fireDate = new Date(fireMs);
      if (violatesQuietHours(fireDate, reminder, settings)) continue;
      out.push(fireDate.toISOString());
      if (out.length >= MAX_FIRES_PER_REMINDER) break;
    }
    return out;
  }

  // contextual or unknown — never pre-schedulable.
  return [];
}

export function isPrescheduleableType(reminder) {
  const t = reminder?.trigger_type;
  if (t === "scheduled" || t === "event") return true;
  if (t === "interval" && reminder?.trigger_config?.after_last !== "check_in") return true;
  return false;
}

// Top-level: re-sync the OS schedule against the current set of active
// reminders. Idempotent. Caller passes the already-fetched reminders
// and settings (avoids a second API round-trip).
export async function reconcileNativeSchedule(reminders, settings) {
  if (!isNative()) return { scheduled: 0, cancelled: 0, skipped: "not_native" };

  const granted = await isNativeNotificationsEnabled();
  if (!granted) {
    // Best-effort: cancel anything we left scheduled previously.
    await cancelAllNativeScheduled().catch(() => {});
    return { scheduled: 0, cancelled: 0, skipped: "no_permission" };
  }

  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await ensureRemindersChannel();

  // Cancel everything we previously scheduled. Reading from our log
  // (rather than `getPending`) means we only touch ids we own — won't
  // step on notifications scheduled by other plugin code.
  const oldLog = readLog();
  if (oldLog.length) {
    try {
      await LocalNotifications.cancel({ notifications: oldLog.map(e => ({ id: e.nativeId })) });
    } catch {
      /* ignore — re-schedule will overwrite */
    }
  }

  // Settings kill switch: if reminders are paused, leave nothing
  // scheduled. The polling loop already exits early on this flag — we
  // mirror that here.
  if (settings?.reminders_paused) {
    writeLog([]);
    return { scheduled: 0, cancelled: oldLog.length, skipped: "paused" };
  }

  const now = new Date();
  const active = (reminders || []).filter(r => {
    if (!r.is_active) return false;
    if (r.end_date && new Date(r.end_date) <= now) return false;
    if (!isPrescheduleableType(r)) return false;
    // Push channel must be explicitly enabled. Reminders that are
    // in-app only stay on the polling path — pre-scheduling them as
    // OS notifications would be a privacy / UX regression for users
    // who deliberately picked in-app delivery.
    const channels = r.delivery_channels?.length ? r.delivery_channels : ["in_app"];
    if (!channels.includes("push")) return false;
    return true;
  });

  // Compute candidate fires per reminder, then merge + cap globally.
  const candidates = [];
  for (const reminder of active) {
    const fires = computePrescheduledFires(reminder, settings, now);
    for (const fireISO of fires) {
      candidates.push({ reminder, fireISO, fireMs: new Date(fireISO).getTime() });
    }
  }
  candidates.sort((a, b) => a.fireMs - b.fireMs);
  const toSchedule = candidates.slice(0, MAX_TOTAL_SCHEDULED);

  if (!toSchedule.length) {
    writeLog([]);
    return { scheduled: 0, cancelled: oldLog.length };
  }

  const notifications = [];
  const newLog = [];
  for (const c of toSchedule) {
    const nativeId = nativeIdFor(c.reminder.id, c.fireISO);
    notifications.push({
      id: nativeId,
      title: c.reminder.title || "Reminder",
      body: c.reminder.body || "",
      channelId: REMINDERS_CHANNEL_ID,
      schedule: { at: new Date(c.fireMs) },
      extra: {
        reminderId: c.reminder.id,
        scheduledFor: c.fireISO,
      },
    });
    newLog.push({
      nativeId,
      reminderId: c.reminder.id,
      scheduledFor: c.fireISO,
    });
  }

  try {
    await LocalNotifications.schedule({ notifications });
    writeLog(newLog);
    return { scheduled: notifications.length, cancelled: oldLog.length };
  } catch (e) {
    // Schedule failed — leave the log empty so next reconcile starts clean.
    writeLog([]);
    return { scheduled: 0, cancelled: oldLog.length, error: e?.message || "schedule_failed" };
  }
}

// Cancel everything in our log without rescheduling. Used when permission
// is revoked or the user toggles off native notifications.
export async function cancelAllNativeScheduled() {
  if (!isNative()) return;
  const log = readLog();
  if (!log.length) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: log.map(e => ({ id: e.nativeId })) });
  } catch {
    /* non-fatal */
  }
  writeLog([]);
}

// Boot reconciliation: any log entry whose scheduledFor is in the past
// means the OS *should* have fired that notification while the app was
// closed. If we don't have a matching ReminderInstance for it, create
// one so the in-app inbox shows what fired. Removes the entry from the
// log either way.
//
// Conservative — assumes the OS fired on time. If battery optimisation
// or DnD prevented it, we'd record a fire that the user never saw. That
// false-positive is a smaller harm than a silent no-show, since the
// user can dismiss from the inbox.
export async function backfillFiredWhileClosed() {
  if (!isNative()) return { backfilled: 0 };
  const log = readLog();
  if (!log.length) return { backfilled: 0 };

  const nowMs = Date.now();
  const past = log.filter(e => new Date(e.scheduledFor).getTime() <= nowMs);
  const future = log.filter(e => new Date(e.scheduledFor).getTime() > nowMs);
  if (!past.length) return { backfilled: 0 };

  let created = 0;
  // Pull recent instances once to dedupe against existing rows.
  let recentInstances = [];
  try {
    recentInstances = await base44.entities.ReminderInstance.list("-created_date", 200);
  } catch { /* offline — skip dedupe, accept potential dupes */ }

  for (const entry of past) {
    const fireMs = new Date(entry.scheduledFor).getTime();
    const dupe = (recentInstances || []).some(i =>
      i.reminder_id === entry.reminderId &&
      Math.abs(new Date(i.scheduled_for || 0).getTime() - fireMs) < 90 * 1000
    );
    if (dupe) continue;
    try {
      await base44.entities.ReminderInstance.create({
        reminder_id: entry.reminderId,
        scheduled_for: entry.scheduledFor,
        fired_at: entry.scheduledFor,
        status: "fired",
        delivery_attempted: ["push"],
      });
      created++;
    } catch {
      /* keep going — best-effort */
    }
  }

  // Trim the log to entries still in the future.
  writeLog(future);
  return { backfilled: created };
}

// React hook: re-run reconciliation whenever the reminder list or
// system settings change. No-op on web/TWA — the isNative() guard
// inside reconcileNativeSchedule shortcuts immediately. The hook
// itself runs everywhere though (no conditional hook calls).
export function useNativeReminderSync() {
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
    if (!isNative()) return;
    // Cheap signature so we only re-schedule on meaningful change.
    // Includes fields that affect fire times: title/body don't change
    // schedule, but trigger config + last_fired_at + active flag do.
    const sig = JSON.stringify({
      r: (reminders || []).map(r => [
        r.id,
        r.is_active,
        r.trigger_type,
        r.trigger_config,
        r.last_fired_at,
        r.end_date,
        r.delivery_channels,
        r.quiet_hours_respect,
      ]),
      s: settings ? {
        paused: settings.reminders_paused,
        quiet: settings.quiet_hours,
        tz: settings.timezone,
      } : null,
    });
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    reconcileNativeSchedule(reminders, settings).catch(() => {});
  }, [reminders, settings]);
}

// Tap handler — called from nativeBootstrap.js when the user taps a
// scheduled OS notification. Records the fire as a ReminderInstance
// (deduped against any backfill) and returns the reminderId so the
// caller can route the user to the right screen.
export async function recordPrescheduledFire({ reminderId, scheduledFor }) {
  if (!reminderId || !scheduledFor) return null;

  // Dedup: backfill may already have written it, OR the user may have
  // been in-app and the polling caught it.
  try {
    const recent = await base44.entities.ReminderInstance.list("-created_date", 100);
    const fireMs = new Date(scheduledFor).getTime();
    const existing = (recent || []).find(i =>
      i.reminder_id === reminderId &&
      Math.abs(new Date(i.scheduled_for || 0).getTime() - fireMs) < 90 * 1000
    );
    if (existing) return reminderId;
    await base44.entities.ReminderInstance.create({
      reminder_id: reminderId,
      scheduled_for: scheduledFor,
      fired_at: new Date().toISOString(),
      status: "fired",
      delivery_attempted: ["push"],
    });
  } catch {
    /* non-fatal */
  }
  // Drop the entry from the log so backfill doesn't re-create it next boot.
  const log = readLog();
  writeLog(log.filter(e => !(e.reminderId === reminderId && e.scheduledFor === scheduledFor)));
  return reminderId;
}
