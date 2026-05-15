// Native (Android) scheduler for "backup reminder" mode. When the user
// picks BACKUP_MODES.REMINDER in Settings, we hand a recurring local
// notification to the OS so they get a tray prompt at their chosen
// interval even when the app is closed. Tap → app opens → runs the
// backup via the existing autoBackup pipeline.
//
// "Fully automated" mode (BACKUP_MODES.AUTO) does NOT use this file —
// it relies on runAutoBackupIfDue() running on app boot and writing
// straight to Filesystem. The reminder mode exists for users who want
// an explicit confirmation step, or who want to know a backup is
// happening rather than have it slip silently into Documents.
//
// Web/PWA + TWA: every export here returns early on !isNative(). The
// reminder option is gated in the Settings UI for those targets.

import { isNative } from "@/lib/platform";
import {
  isNativeNotificationsEnabled,
  ensureRemindersChannel,
  REMINDERS_CHANNEL_ID,
} from "@/lib/nativeNotifications";
import {
  getAutoBackupInterval,
  getAutoBackupLastAt,
  getAutoBackupMode,
  BACKUP_MODES,
} from "@/lib/autoBackup";

// Fixed positive int31 id so we can cancel any previous schedule
// before laying down a new one. Distinct range from the reminder-
// scheduler ids (which hash reminder ids into 0..2_000_000_000) by
// being a small constant — collision probability is negligible.
const NATIVE_BACKUP_NOTIFICATION_ID = 99_999_001;

// Tag we put on the notification's `extra` so the bootstrap action
// listener can route a tap to the backup flow instead of the reminder
// inbox.
export const BACKUP_NOTIFICATION_EXTRA_KIND = "backup_reminder";

// Cancel any pending backup reminder, no-op if none. Idempotent.
export async function cancelNativeBackupReminder() {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({
      notifications: [{ id: NATIVE_BACKUP_NOTIFICATION_ID }],
    });
  } catch { /* non-fatal */ }
}

// Compute the next fire time. If a previous backup happened, schedule
// `interval` days after it. If not, schedule one interval from now.
// Either way, never schedule in the past — push forward by intervals
// until the candidate is at least an hour out, so flipping modes
// doesn't immediately spawn a noisy prompt.
function computeNextFire(now = new Date()) {
  const days = getAutoBackupInterval();
  if (days <= 0) return null;
  const lastIso = getAutoBackupLastAt();
  const intervalMs = days * 24 * 60 * 60 * 1000;
  const minFuture = now.getTime() + 60 * 60 * 1000; // at least 1h out
  let next = lastIso ? Date.parse(lastIso) + intervalMs : now.getTime() + intervalMs;
  if (!Number.isFinite(next)) next = now.getTime() + intervalMs;
  while (next < minFuture) next += intervalMs;
  return new Date(next);
}

// Schedule (or re-schedule) the recurring backup-reminder notification
// based on the user's current mode + interval. Idempotent — cancels
// the previous one first.
export async function reconcileNativeBackupReminder() {
  if (!isNative()) return { scheduled: false, reason: "not_native" };

  await cancelNativeBackupReminder();

  const mode = getAutoBackupMode();
  if (mode !== BACKUP_MODES.REMINDER) {
    return { scheduled: false, reason: `mode_${mode}` };
  }
  const days = getAutoBackupInterval();
  if (days <= 0) return { scheduled: false, reason: "interval_off" };

  const granted = await isNativeNotificationsEnabled();
  if (!granted) return { scheduled: false, reason: "no_permission" };

  const fireAt = computeNextFire();
  if (!fireAt) return { scheduled: false, reason: "no_fire_time" };

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await ensureRemindersChannel();
    // Map our interval choices onto Capacitor's `every` units so the
    // OS auto-repeats — that way the user gets reminders even if they
    // never tap a notification, and the schedule survives reboots
    // (RECEIVE_BOOT_COMPLETED is declared by the plugin manifest).
    // Anything else falls back to a one-shot + on-tap rearm.
    const everyUnit = (
      days === 1 ? "day"
      : days === 7 ? "week"
      : days === 14 ? "two-weeks"
      : days === 30 ? "month"
      : null
    );

    await LocalNotifications.schedule({
      notifications: [
        {
          id: NATIVE_BACKUP_NOTIFICATION_ID,
          title: "Time to back up Oceans Symphony",
          body: "Tap to save a fresh copy of your data to Documents.",
          channelId: REMINDERS_CHANNEL_ID,
          schedule: everyUnit
            ? { at: fireAt, every: everyUnit, allowWhileIdle: true }
            : { at: fireAt, allowWhileIdle: true },
          extra: { kind: BACKUP_NOTIFICATION_EXTRA_KIND },
        },
      ],
    });
    return { scheduled: true, fireAt: fireAt.toISOString(), repeating: !!everyUnit };
  } catch (e) {
    return { scheduled: false, reason: e?.message || "schedule_failed" };
  }
}
