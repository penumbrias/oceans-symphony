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
import { isPreviewActive } from "@/lib/previewMode";
import {
  isNativeNotificationsEnabled,
  ensureRemindersChannel,
  REMINDERS_CHANNEL_ID,
  SWITCH_CHANNEL_ID,
} from "@/lib/nativeNotifications";

// "Switch" notifications are reminders fired when an alter takes
// front — contextual reminders with on: "alter_fronts". They tend to
// fire often during the day and the user typically wants ambient
// awareness rather than a heads-up interruption, so they go to the
// quieter SWITCH_CHANNEL_ID. Everything else uses the default
// reminders channel.
function channelForReminder(reminder) {
  if (
    reminder?.trigger_type === "contextual" &&
    reminder?.trigger_config?.on === "alter_fronts"
  ) {
    return SWITCH_CHANNEL_ID;
  }
  return REMINDERS_CHANNEL_ID;
}
import {
  zonedFireInstant,
  getUserLocalDate,
  getCurrentMinutesInZone,
} from "@/lib/timezoneHelpers";
import { base44 } from "@/api/base44Client";
import { checkAutoResolveClient } from "@/lib/remindersScheduler";
import { snoozeUntilDate } from "@/components/reminders/snoozeHelpers";

// Action-type id we attach to every pre-scheduled notification so
// Android renders the inline Snooze buttons in the tray. Registered
// once in nativeBootstrap.js.
export const REMINDER_ACTION_TYPE_ID = "REMINDER_ACTIONS";

const LOG_KEY = "symphony_native_reminder_log_v1";
// Mirror of ACTIVE_FLAG_KEY in serverReminderSync.js. When "1", server-
// scheduled push (FCM) owns reminder delivery — it fires even when the app
// is swiped away, which OS alarms can't — so we SUPPRESS the OS pre-schedule
// to avoid double notifications. Read directly (not imported) to avoid an
// import cycle with serverReminderSync.js.
const SERVER_PUSH_ACTIVE_KEY = "symphony_server_reminder_push_active_v1";

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
  // Force positive id in a band DISJOINT from planReminderScheduler's
  // [1.5e9, 2.1e9) range so the two schedulers can't cancel/overwrite each
  // other's OS notification slots. Reminder scheduler owns [1, 1e9).
  const positive = Math.abs(h) % 1_000_000_000;
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
// `context` carries live data some triggers need (currently the last
// fronting-change timestamp for "no front update for N minutes").
export function computePrescheduledFires(reminder, settings, now = new Date(), context = {}) {
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

  // "No front update for N minutes" IS deterministically pre-schedulable:
  // the fire time is (last front change) + N. We pre-schedule a SERIES at
  // baseline + k·N so the closed app keeps nudging every N minutes, matching
  // what the in-app scheduler does while the app is open. Each front change
  // bumps the baseline; useNativeReminderSync re-reconciles on front change,
  // cancelling this whole series and rescheduling from the new baseline —
  // i.e. the N-minute timer "resets" exactly as the user described.
  if (reminder.trigger_type === "contextual" && cfg.on === "no_front_update") {
    const lastFront = context?.lastFrontActivityMs;
    if (!lastFront) return []; // no fronting data → nothing to anchor to
    const everyMs = (cfg.threshold_minutes || 120) * 60 * 1000;
    if (everyMs < 60 * 1000) return []; // sub-minute thresholds are nonsense
    // Jump straight to the first slot at or after `now` instead of scanning
    // every past slot.
    let k = Math.max(1, Math.floor((now.getTime() - lastFront) / everyMs) + 1);
    while (out.length < MAX_FIRES_PER_REMINDER) {
      const fireMs = lastFront + k * everyMs;
      k++;
      if (fireMs > horizonEnd) break;
      if (fireMs > endDateMs) break;
      if (fireMs <= now.getTime()) continue; // overdue slot — in-app/backfill owns it
      const fireDate = new Date(fireMs);
      if (violatesQuietHours(fireDate, reminder, settings)) continue;
      out.push(fireDate.toISOString());
    }
    return out;
  }

  // other contextual / unknown — never pre-schedulable.
  return [];
}

export function isPrescheduleableType(reminder) {
  const t = reminder?.trigger_type;
  if (t === "scheduled" || t === "event") return true;
  if (t === "interval" && reminder?.trigger_config?.after_last !== "check_in") return true;
  // "No front update for N minutes" anchors off the latest front change, so
  // its fire times are computable ahead of time (see computePrescheduledFires).
  if (isRollingFrontReminder(reminder)) return true;
  return false;
}

// The "no front update for N minutes" reminder is special: it RESETS every
// time the front changes, so it can't be expressed as a static server-side
// schedule (the relay only learns about it at sync time, not on each front
// change). It therefore stays on the local OS pre-schedule — which DOES
// re-reconcile on front change — even when server push otherwise owns
// closed-app delivery.
export function isRollingFrontReminder(reminder) {
  return (
    reminder?.trigger_type === "contextual" &&
    reminder?.trigger_config?.on === "no_front_update"
  );
}

// Top-level: re-sync the OS schedule against the current set of active
// reminders. Idempotent. Caller passes the already-fetched reminders
// and settings (avoids a second API round-trip).
export async function reconcileNativeSchedule(reminders, settings, context = {}) {
  if (!isNative()) return { scheduled: 0, cancelled: 0, skipped: "not_native" };

  // Preview Mode swaps every entity read (including Reminder) for in-memory
  // example data (see previewMode.js) — but LocalNotifications.schedule()
  // talks straight to the OS, outside that sandbox. Scheduling a preview
  // system's fake reminders as real Android notifications would leave them
  // firing forever after the user exits preview, since there's no real
  // Reminder record left to reconcile against. Skip entirely while preview
  // is on; whatever was already scheduled from the user's real data stays
  // untouched and gets re-reconciled the moment preview exits.
  if (isPreviewActive()) return { scheduled: 0, cancelled: 0, skipped: "preview_active" };

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

  // Server-scheduled push takes over closed-app delivery when active (the
  // relay fires reminders via FCM regardless of force-stop). Suppress the OS
  // pre-schedule so reminders aren't delivered twice. Self-correcting: if
  // push isn't ready, serverReminderSync clears the flag and we resume.
  // EXCEPTION: the rolling "no front update for N minutes" reminder can't be
  // expressed as a static server schedule, so it stays on the OS pre-schedule
  // even while server push owns everything else (no overlap → no double-buzz).
  let serverPushActive = false;
  try { serverPushActive = localStorage.getItem(SERVER_PUSH_ACTIVE_KEY) === "1"; } catch { /* ignore */ }

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
    // When server push owns delivery, the relay covers every static schedule
    // type. Only the rolling front reminder stays local.
    if (serverPushActive && !isRollingFrontReminder(r)) return false;
    return true;
  });

  // Compute candidate fires per reminder, then merge + cap globally.
  const candidates = [];
  for (const reminder of active) {
    const fires = computePrescheduledFires(reminder, settings, now, context);
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
      channelId: channelForReminder(c.reminder),
      actionTypeId: REMINDER_ACTION_TYPE_ID,
      largeIcon: "ic_notif_large", // colour app art inside the notification (small icon stays the glyph)
      // allowWhileIdle pierces Doze so the exact alarm fires AT the
      // scheduled minute even when the phone has been idle — without it
      // Android batches the alarm to the next maintenance window, which
      // is the "fires a while after" lag. Paired with the USE_EXACT_ALARM
      // permission this is the precise, fully-offline delivery path.
      schedule: { at: new Date(c.fireMs), allowWhileIdle: true },
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
  if (!isNative()) return { backfilled: 0, autoResolved: 0 };
  const log = readLog();
  if (!log.length) return { backfilled: 0, autoResolved: 0 };

  const nowMs = Date.now();
  const past = log.filter(e => new Date(e.scheduledFor).getTime() <= nowMs);
  const future = log.filter(e => new Date(e.scheduledFor).getTime() > nowMs);
  if (!past.length) {
    // No-op trim — log unchanged but make sure future-only is persisted.
    writeLog(future);
    return { backfilled: 0, autoResolved: 0 };
  }

  // Pull supporting data once for auto-resolve evaluation + dedupe.
  let recentInstances = [];
  let reminders = [];
  let cachedData = { emotionCheckIns: [], sessions: [], activities: [], symptomCheckIns: [] };
  try {
    const [insts, rems, emoCI, sess, acts, symCI] = await Promise.all([
      base44.entities.ReminderInstance.list("-created_date", 200),
      base44.entities.Reminder.list("-created_date", 500),
      base44.entities.EmotionCheckIn.list("-created_date", 50),
      base44.entities.FrontingSession.list("-start_time", 20),
      base44.entities.Activity.list("-created_date", 50),
      base44.entities.SymptomCheckIn.list("-created_date", 50),
    ]);
    recentInstances = insts || [];
    reminders = rems || [];
    cachedData = {
      emotionCheckIns: emoCI || [],
      sessions: sess || [],
      activities: acts || [],
      symptomCheckIns: symCI || [],
    };
  } catch { /* offline — skip dedupe + auto-resolve, accept potential noise */ }

  const reminderById = Object.fromEntries(reminders.map(r => [r.id, r]));

  let created = 0;
  let autoResolved = 0;
  for (const entry of past) {
    const fireMs = new Date(entry.scheduledFor).getTime();
    const dupe = recentInstances.some(i =>
      i.reminder_id === entry.reminderId &&
      Math.abs(new Date(i.scheduled_for || 0).getTime() - fireMs) < 90 * 1000
    );
    if (dupe) continue;
    const reminder = reminderById[entry.reminderId];
    // Evaluate auto-resolve as of the fire time — if the rule would
    // have suppressed this fire (e.g. a check-in happened within the
    // lookback), record an auto_resolved instance instead of a fired
    // one so the inbox doesn't show stale alerts after the user
    // already did the thing the reminder was nudging them toward.
    const autoOk = reminder ? checkAutoResolveClient(reminder, cachedData, entry.scheduledFor) : false;
    try {
      await base44.entities.ReminderInstance.create({
        reminder_id: entry.reminderId,
        scheduled_for: entry.scheduledFor,
        fired_at: entry.scheduledFor,
        status: autoOk ? "auto_resolved" : "fired",
        skipped_reason: autoOk ? "auto_resolved_rule" : undefined,
        delivery_attempted: ["push"],
      });
      if (autoOk) autoResolved++; else created++;
    } catch {
      /* keep going — best-effort */
    }
  }

  writeLog(future);
  return { backfilled: created, autoResolved };
}

// Called from the action listener in nativeBootstrap.js when the user
// taps a snooze button on a tray notification. opt is either a number
// of minutes or the strings "tomorrow" / "next_week" (matching
// snoozeHelpers).
export async function snoozePrescheduledFire({ reminderId, scheduledFor, opt }) {
  if (!isNative() || !reminderId) return false;
  const untilISO = snoozeUntilDate(opt);
  const untilMs = new Date(untilISO).getTime();
  if (untilMs <= Date.now()) return false;

  // Record the snooze in the inbox so the user can see what they did.
  try {
    await base44.entities.ReminderInstance.create({
      reminder_id: reminderId,
      scheduled_for: scheduledFor || new Date().toISOString(),
      fired_at: new Date().toISOString(),
      status: "snoozed",
      snoozed_until: untilISO,
      delivery_attempted: ["push"],
    });
  } catch { /* non-fatal */ }

  // Schedule a fresh OS notification at the snooze time. Re-fetch the
  // reminder for its title/body so the new tray entry is recognisable.
  let reminder = null;
  try {
    const all = await base44.entities.Reminder.list("-created_date", 500);
    reminder = (all || []).find(r => r.id === reminderId);
  } catch { /* non-fatal */ }
  if (!reminder) return true; // instance recorded; rescheduling can wait for next reconcile

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await ensureRemindersChannel();
    const nativeId = nativeIdFor(reminderId, untilISO);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: nativeId,
          title: reminder.title || "Reminder",
          body: reminder.body || "",
          channelId: channelForReminder(reminder),
          actionTypeId: REMINDER_ACTION_TYPE_ID,
          largeIcon: "ic_notif_large",
          schedule: { at: new Date(untilMs), allowWhileIdle: true },
          extra: { reminderId, scheduledFor: untilISO },
        },
      ],
    });
    // Append to the log so backfill knows about it next boot.
    const log = readLog();
    log.push({ nativeId, reminderId, scheduledFor: untilISO });
    writeLog(log);
  } catch { /* non-fatal */ }

  // Drop the original entry from the log so backfill doesn't
  // resurrect it as "fired" later.
  if (scheduledFor) {
    const log = readLog();
    writeLog(log.filter(e => !(e.reminderId === reminderId && e.scheduledFor === scheduledFor)));
  }
  return true;
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

  // "No front update for N minutes" reminders anchor their fire times off
  // the most recent fronting change, so we watch the front history and
  // re-reconcile whenever it moves (which resets the N-minute timer).
  const { data: frontSessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 50),
  });

  useEffect(() => {
    if (!isNative()) return;

    // Only follow front changes if a no_front_update reminder is actually
    // armed for closed-app (push) delivery — otherwise every switch would
    // needlessly churn the whole OS schedule.
    const hasNoFrontUpdate = (reminders || []).some(r => {
      if (!r.is_active) return false;
      if (r.trigger_type !== "contextual" || r.trigger_config?.on !== "no_front_update") return false;
      const channels = r.delivery_channels?.length ? r.delivery_channels : ["in_app"];
      return channels.includes("push");
    });

    // Last fronting "update" = the most recent of start/end/created on the
    // latest session, mirroring the in-app no_front_update evaluator so the
    // two delivery paths agree on the baseline.
    let lastFrontActivityMs = 0;
    if (hasNoFrontUpdate && frontSessions.length) {
      const s = frontSessions[0];
      lastFrontActivityMs = Math.max(
        new Date(s.start_time || 0).getTime(),
        new Date(s.end_time || 0).getTime(),
        new Date(s.created_date || 0).getTime()
      );
    }

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
      // Only let the front baseline into the signature when something
      // actually depends on it, so unrelated switches don't trigger churn.
      f: hasNoFrontUpdate ? lastFrontActivityMs : null,
    });
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    reconcileNativeSchedule(reminders, settings, { lastFrontActivityMs }).catch(() => {});
  }, [reminders, settings, frontSessions]);
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
