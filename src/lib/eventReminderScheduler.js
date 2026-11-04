// Reminders for planner events (v0.350.0): payday, birthdays, anniversaries.
//
// Each event says when to remind (on the day / the day before / a week
// before, at a time of day — plannerEventDates.eventReminderFires). This
// mirrors planReminderScheduler: on the installed apps the OS holds the
// notifications (they fire with the app closed); on the web they're
// best-effort timers while the app is open.
//
// Native ids live in [1.4e9, 1.5e9): disjoint from the user-reminder
// scheduler's [1, 1e9), the activity-end timers' [1.0e9, 1.4e9) and the
// plan scheduler's [1.5e9, 2.1e9), so no scheduler can cancel another's.
//
// Device-bound: the log of scheduled ids (LOG_KEY) means nothing on another
// device, so it is NOT in BACKUP_LS_KEYS (same rule as the plan log).
// Per CLAUDE.md the Capacitor plugin is imported dynamically behind isNative().

import { useEffect, useRef } from "react";
import { isNative } from "@/lib/platform";
import { isPreviewActive } from "@/lib/previewMode";
import { isNativeNotificationsEnabled, ensureRemindersChannel, REMINDERS_CHANNEL_ID } from "@/lib/nativeNotifications";
import { usePlannerEvents } from "@/lib/plannerEvents";
import { eventReminderFires, reminderDaysOf, reminderTimeOf } from "@/lib/plannerEventDates";

const LOG_KEY = "symphony_event_reminder_log_v1";
const HORIZON_DAYS = 45;
const MAX_SCHEDULED = 24;

const readLog = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch { return []; } };
const writeLog = (v) => { try { localStorage.setItem(LOG_KEY, JSON.stringify(v)); } catch { /* non-fatal */ } };

function nativeIdFor(eventId, fireMs) {
  const seed = `event|${eventId}|${fireMs}`;
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return 1_400_000_000 + (Math.abs(h) % 100_000_000);
}

const fmtDay = (d) => d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

export function eventReminderBody(fire) {
  if (fire.daysBefore === 0) return "Today";
  if (fire.daysBefore === 1) return `Tomorrow, ${fmtDay(fire.occurrence.date)}`;
  return `In a week, ${fmtDay(fire.occurrence.date)}`;
}

const routeFor = (fire) => `/planner?date=${fire.occurrence.key}&event=${encodeURIComponent(fire.event.id)}`;

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
      const n = new Notification(fire.event.title || "Event", {
        body: eventReminderBody(fire),
        tag: `event-${fire.event.id}-${fire.occurrence.key}-${fire.daysBefore}`,
      });
      n.onclick = () => { try { window.focus(); window.location.href = routeFor(fire); } catch { /* non-fatal */ } n.close(); };
    } catch { /* non-fatal */ }
  }, delay);
  webTimers.add(t);
}

// Cancel what we scheduled before, then schedule every reminder due in the
// next HORIZON_DAYS. Runs on app open and whenever events change.
export async function reconcileEventReminders(events) {
  // Preview Mode shows example data; never turn it into real notifications.
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

  const fires = eventReminderFires(events, { horizonDays: HORIZON_DAYS, limit: MAX_SCHEDULED });
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
      const nativeId = nativeIdFor(f.event.id, f.fireMs);
      log.push({ eventId: f.event.id, nativeId, fireAt: new Date(f.fireMs).toISOString() });
      return {
        id: nativeId,
        title: f.event.title || "Event",
        body: eventReminderBody(f),
        channelId: REMINDERS_CHANNEL_ID,
        largeIcon: "ic_notif_large",
        // allowWhileIdle: fire at the minute even in Doze (see planReminderScheduler).
        schedule: { at: new Date(f.fireMs), allowWhileIdle: true },
        extra: { kind: "event_reminder", eventId: f.event.id, date: f.occurrence.key },
      };
    });
    await LocalNotifications.schedule({ notifications });
    writeLog(log);
    return { scheduled: notifications.length };
  } catch (e) {
    return { scheduled: 0, error: e?.message || "schedule_failed" };
  }
}

// Ask for notification permission the first time someone turns a reminder
// on (no prompt otherwise). Best-effort.
export async function ensureEventReminderPermission() {
  try {
    if (isNative()) {
      const { requestNativePermission } = await import("@/lib/nativeNotifications");
      await requestNativePermission();
    } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch { /* permission stays whatever it is */ }
}

// Mounted once in App: keeps the OS queue in step with the events.
export function useEventReminderSync() {
  const events = usePlannerEvents();
  const lastSig = useRef(null);
  useEffect(() => {
    const sig = JSON.stringify(events
      .filter((e) => reminderDaysOf(e).length)
      .map((e) => [e.id, e.title, e.date, e.repeat, e.until, e.skipped_dates, reminderDaysOf(e), reminderTimeOf(e)]));
    // Re-run at least daily so the 45-day window keeps moving.
    const day = new Date().toDateString();
    if (`${sig}|${day}` === lastSig.current) return;
    lastSig.current = `${sig}|${day}`;
    reconcileEventReminders(events).catch(() => {});
  }, [events]);
}
