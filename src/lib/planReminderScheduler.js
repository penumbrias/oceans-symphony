// Pre-schedules OS notifications for upcoming Activity-Planner plans.
//
// Distinct from `nativeReminderScheduler.js`, which handles the user's
// Reminder entity. Plans live on Activity records and have their own
// lifecycle (Phase 1) — they need their own pre-schedule + reconcile
// path because the trigger semantics differ:
//   - Plan reminders fire at `timestamp - offset` (where offset is per-
//     plan or the global default).
//   - The notification cancels the moment the plan is resolved
//     (done / partial / skipped / cancelled), deleted, or rescheduled.
//   - There is no recurring-schedule logic here — each future
//     occurrence in a recurring series is its own Activity record with
//     its own timestamp, so we just iterate the active set.
//
// Per CLAUDE.md the native bridge stays dynamically imported inside an
// isNative() guard so the web bundle tree-shakes the @capacitor/*
// package away. On web/PWA we fall back to a best-effort setTimeout
// while the app is open — documented in the in-page banner /
// AnnouncementBanner.
//
// Device-bound storage: the activityId → nativeNotificationId map lives
// in localStorage like the existing reminder log. It is INTENTIONALLY
// NOT backed up — same rationale as PushSubscription / FriendIdentity.

import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isNative } from "@/lib/platform";
import {
  isNativeNotificationsEnabled,
  ensureRemindersChannel,
  REMINDERS_CHANNEL_ID,
} from "@/lib/nativeNotifications";
import { base44 } from "@/api/base44Client";
import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";

const LOG_KEY = "symphony_plan_reminder_log_v1";
const SETTINGS_ENABLED_KEY = "symphony_plan_reminders_enabled";
const SETTINGS_OFFSET_KEY = "symphony_plan_reminders_default_offset";

// Same horizon + cap discipline as nativeReminderScheduler — AlarmManager
// is a finite resource on Android and we share it with the Reminder
// scheduler. Plans are typically rarer than user reminders so we cap a
// bit lower.
const MAX_TOTAL_SCHEDULED = 32;
const HORIZON_DAYS = 30;
const DEFAULT_OFFSET_MINUTES = 30;

export const PLAN_REMINDER_OFFSETS = Object.freeze([
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
]);

export function readPlanRemindersEnabled() {
  try {
    return localStorage.getItem(SETTINGS_ENABLED_KEY) === "1";
  } catch { return false; }
}

export function writePlanRemindersEnabled(on) {
  try {
    localStorage.setItem(SETTINGS_ENABLED_KEY, on ? "1" : "0");
  } catch { /* non-fatal */ }
  try { window.dispatchEvent(new Event("plan-reminders-settings-changed")); } catch {}
}

export function readPlanRemindersDefaultOffset() {
  try {
    const raw = localStorage.getItem(SETTINGS_OFFSET_KEY);
    if (raw == null) return DEFAULT_OFFSET_MINUTES;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_OFFSET_MINUTES;
  } catch { return DEFAULT_OFFSET_MINUTES; }
}

export function writePlanRemindersDefaultOffset(minutes) {
  try {
    localStorage.setItem(SETTINGS_OFFSET_KEY, String(Math.max(1, parseInt(minutes, 10) || DEFAULT_OFFSET_MINUTES)));
  } catch { /* non-fatal */ }
  try { window.dispatchEvent(new Event("plan-reminders-settings-changed")); } catch {}
}

function readLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeLog(entries) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries));
  } catch { /* non-fatal */ }
}

function nativeIdFor(activityId, fireMs) {
  const seed = `plan|${activityId}|${fireMs}`;
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  // Offset by a fixed prefix so our ids never collide with the user-
  // reminder scheduler's. (Both schedulers hash into int31, and a
  // collision would let one cancel the other.)
  // Plan scheduler owns [1.5e9, 2.1e9): disjoint from the reminder
  // scheduler's [1, 1e9), and capped under int32 max (2,147,483,647) so the
  // OS scheduler never receives an overflowed/negative id.
  const positive = Math.abs(h) % 600_000_000;
  return 1_500_000_000 + positive;
}

function offsetForPlan(plan, defaultOffsetMinutes) {
  const v = plan?.reminder_offset_minutes;
  if (v == null) return defaultOffsetMinutes;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return defaultOffsetMinutes;
  return n;
}

// Return the ms timestamp at which we'd want to fire a reminder for
// this plan. Returns null when there's no schedulable fire — past, no
// timestamp, or status is not "scheduled" any more.
export function computePlanReminderFire(plan, defaultOffsetMinutes) {
  if (!plan?.timestamp) return null;
  if (statusFor(plan) !== ACTIVITY_STATUSES.SCHEDULED) return null;
  const planMs = new Date(plan.timestamp).getTime();
  if (!Number.isFinite(planMs)) return null;
  const offsetMs = offsetForPlan(plan, defaultOffsetMinutes) * 60_000;
  const fireMs = planMs - offsetMs;
  if (fireMs <= Date.now()) return null;
  const horizonMs = Date.now() + HORIZON_DAYS * 24 * 60 * 60 * 1000;
  if (fireMs > horizonMs) return null;
  return fireMs;
}

function bodyFor(plan) {
  const when = plan.timestamp ? new Date(plan.timestamp) : null;
  if (!when) return plan.activity_name || "";
  const offset = plan.reminder_offset_minutes ?? readPlanRemindersDefaultOffset();
  if (offset >= 1440) return `Tomorrow at ${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  if (offset >= 60) return `Starts in ${Math.round(offset / 60)} hour${offset >= 120 ? "s" : ""} (${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`;
  return `Starts in ${offset} minutes (${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`;
}

// Web-only setTimeout map. Best-effort: only fires while the app is open.
// Keyed by activity id so we can clear and replace cleanly.
const webTimers = new Map();

function clearAllWebTimers() {
  for (const id of webTimers.values()) clearTimeout(id);
  webTimers.clear();
}

function scheduleWebFallback(plan, fireMs) {
  // Skip web fallback unless the user explicitly granted Notification
  // permission. We deliberately do NOT prompt here — registration is
  // surfaced in Settings → Reminders alongside the toggle, so this
  // path only fires once the user actively opted in.
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  const delay = fireMs - Date.now();
  if (delay <= 0) return;
  const id = setTimeout(() => {
    try {
      const n = new Notification(plan.activity_name || "Upcoming plan", {
        body: bodyFor(plan),
        tag: `plan-${plan.id}`,
      });
      n.onclick = () => {
        try {
          window.focus();
          window.location.href = `/activities?activityId=${plan.id}`;
        } catch { /* non-fatal */ }
        n.close();
      };
    } catch { /* non-fatal */ }
    webTimers.delete(plan.id);
  }, Math.min(delay, 0x7fffffff));
  webTimers.set(plan.id, id);
}

// Cancel everything in our log. Used when the user toggles plan
// reminders off entirely, or before reconciling a fresh schedule.
export async function cancelAllPlanReminders() {
  clearAllWebTimers();
  if (!isNative()) {
    writeLog([]);
    return;
  }
  const log = readLog();
  if (log.length === 0) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: log.map(e => ({ id: e.nativeId })) });
  } catch { /* non-fatal */ }
  writeLog([]);
}

// Cancel any pending reminder we previously scheduled for this plan.
// Idempotent — safe to call when no reminder existed. Caller invokes
// from the lifecycle popover after mark-done/skip/cancel, from the
// delete handler, from the edit-save path (just before re-scheduling),
// and from the rescheduler.
export async function cancelPlanReminder(activityId) {
  if (!activityId) return;
  // Web timer (if any).
  if (webTimers.has(activityId)) {
    clearTimeout(webTimers.get(activityId));
    webTimers.delete(activityId);
  }
  const log = readLog();
  const keep = log.filter(e => e.activityId !== activityId);
  if (keep.length === log.length) return; // nothing to cancel
  const toCancel = log.filter(e => e.activityId === activityId);
  writeLog(keep);
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: toCancel.map(e => ({ id: e.nativeId })) });
  } catch { /* non-fatal */ }
}

// Schedule (or re-schedule) a single plan's reminder. Cancels any
// previously-scheduled reminder for the same activity first.
//
// Returns the chosen fire time (ms) or null if nothing was scheduled
// (past plan, resolved, plan-reminders disabled, etc.).
export async function schedulePlanReminder(plan, { defaultOffsetMinutes = null } = {}) {
  if (!plan?.id) return null;
  if (!readPlanRemindersEnabled()) return null;
  await cancelPlanReminder(plan.id);
  const offsetDefault = defaultOffsetMinutes ?? readPlanRemindersDefaultOffset();
  const fireMs = computePlanReminderFire(plan, offsetDefault);
  if (!fireMs) return null;

  if (!isNative()) {
    scheduleWebFallback(plan, fireMs);
    return fireMs;
  }

  const granted = await isNativeNotificationsEnabled();
  if (!granted) return null;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await ensureRemindersChannel();
    const nativeId = nativeIdFor(plan.id, fireMs);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: nativeId,
          title: plan.activity_name || "Upcoming plan",
          body: bodyFor(plan),
          channelId: REMINDERS_CHANNEL_ID,
          largeIcon: "ic_notif_large", // colour app art inside; small icon is the glyph
          // allowWhileIdle: fire exactly at the scheduled minute even in Doze.
          schedule: { at: new Date(fireMs), allowWhileIdle: true },
          extra: {
            kind: "plan_reminder",
            activityId: plan.id,
            planTimestamp: plan.timestamp,
          },
        },
      ],
    });
    const log = readLog();
    log.push({
      activityId: plan.id,
      nativeId,
      fireAt: new Date(fireMs).toISOString(),
      planTimestamp: plan.timestamp,
    });
    writeLog(log);
    return fireMs;
  } catch {
    return null;
  }
}

// Sugar around schedulePlanReminder for callers that want the same
// "cancel then re-schedule" semantics but cosmetic clarity. The plan's
// CURRENT state (timestamp, status, offset) is what gets scheduled.
export async function reschedulePlanReminder(plan, opts) {
  return schedulePlanReminder(plan, opts);
}

// Full reconcile: cancel everything we previously scheduled, then re-
// schedule reminders for every still-scheduled future plan. Called on
// app boot (via the hook below) and whenever the activities list
// changes meaningfully.
export async function reconcilePlanReminders(activities) {
  if (!readPlanRemindersEnabled()) {
    await cancelAllPlanReminders();
    return { scheduled: 0, cancelled: 0, skipped: "disabled" };
  }

  const oldLog = readLog();
  // Cancel everything we previously held, both native and web.
  if (isNative() && oldLog.length > 0) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.cancel({ notifications: oldLog.map(e => ({ id: e.nativeId })) });
    } catch { /* non-fatal */ }
  }
  clearAllWebTimers();
  writeLog([]);

  const defaultOffset = readPlanRemindersDefaultOffset();

  // Build candidate list of plans with valid future fire times.
  const candidates = [];
  for (const plan of (activities || [])) {
    const fireMs = computePlanReminderFire(plan, defaultOffset);
    if (fireMs) candidates.push({ plan, fireMs });
  }
  candidates.sort((a, b) => a.fireMs - b.fireMs);
  const toSchedule = candidates.slice(0, MAX_TOTAL_SCHEDULED);

  let scheduled = 0;
  if (isNative()) {
    const granted = await isNativeNotificationsEnabled();
    if (!granted) {
      return { scheduled: 0, cancelled: oldLog.length, skipped: "no_permission" };
    }
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await ensureRemindersChannel();
      const notifications = [];
      const newLog = [];
      for (const c of toSchedule) {
        const nativeId = nativeIdFor(c.plan.id, c.fireMs);
        notifications.push({
          id: nativeId,
          title: c.plan.activity_name || "Upcoming plan",
          body: bodyFor(c.plan),
          channelId: REMINDERS_CHANNEL_ID,
          schedule: { at: new Date(c.fireMs) },
          extra: {
            kind: "plan_reminder",
            activityId: c.plan.id,
            planTimestamp: c.plan.timestamp,
          },
        });
        newLog.push({
          activityId: c.plan.id,
          nativeId,
          fireAt: new Date(c.fireMs).toISOString(),
          planTimestamp: c.plan.timestamp,
        });
      }
      if (notifications.length > 0) {
        await LocalNotifications.schedule({ notifications });
      }
      writeLog(newLog);
      scheduled = notifications.length;
    } catch (e) {
      writeLog([]);
      return { scheduled: 0, cancelled: oldLog.length, error: e?.message || "schedule_failed" };
    }
  } else {
    // Web fallback — best-effort setTimeout queue. Doesn't survive
    // refreshes; documented in the Settings copy.
    for (const c of toSchedule) {
      scheduleWebFallback(c.plan, c.fireMs);
    }
    scheduled = toSchedule.length;
  }

  return { scheduled, cancelled: oldLog.length };
}

// React hook: re-run reconciliation whenever the Activity list or the
// plan-reminder settings change. Safe to mount everywhere — the
// isNative()-gated branch handles native scheduling, the web fallback
// handles browser/PWA.
export function usePlanReminderSync() {
  const lastSigRef = useRef(null);

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });

  // Re-run when settings change too — we listen for the custom event
  // dispatched by the writers above. (React Query has no reactive
  // dependency on localStorage, hence the manual event.)
  const [settingsTick, setSettingsTick] = useState(0);
  useEffect(() => {
    const handler = () => setSettingsTick(t => t + 1);
    try { window.addEventListener("plan-reminders-settings-changed", handler); } catch {}
    return () => {
      try { window.removeEventListener("plan-reminders-settings-changed", handler); } catch {}
    };
  }, []);

  useEffect(() => {
    // Cheap signature so we only reconcile on meaningful change. We key
    // off the (id, timestamp, status, reminder_offset_minutes) tuple
    // because any of those changing invalidates the schedule.
    const sig = JSON.stringify({
      enabled: readPlanRemindersEnabled(),
      offset: readPlanRemindersDefaultOffset(),
      tick: settingsTick,
      plans: (activities || [])
        .filter(a => statusFor(a) === ACTIVITY_STATUSES.SCHEDULED)
        .map(a => [a.id, a.timestamp, a.status || null, a.reminder_offset_minutes ?? null]),
    });
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    reconcilePlanReminders(activities).catch(() => {});
  }, [activities, settingsTick]);
}

