// One-shot native-side boot for the Capacitor build target. Web and TWA
// builds hit the isNative() guard immediately and return — the dynamic
// imports below are tree-shaken out of those bundles.
//
// Per CLAUDE.md: native-only dependencies MUST be dynamically imported
// inside an isNative() branch so Vite never includes @capacitor/* in
// the web bundle.

import { isNative } from '@/lib/platform';
import { ensureRemindersChannel } from '@/lib/nativeNotifications';
import {
  backfillFiredWhileClosed,
  recordPrescheduledFire,
  snoozePrescheduledFire,
  REMINDER_ACTION_TYPE_ID,
} from '@/lib/nativeReminderScheduler';
import {
  reconcileNativeBackupReminder,
  BACKUP_NOTIFICATION_EXTRA_KIND,
} from '@/lib/nativeBackupScheduler';
import { runAutoBackupNow, getAutoBackupMode, BACKUP_MODES } from '@/lib/autoBackup';

let started = false;

// Set by the OS notification-tap listener. AuthenticatedApp watches this
// on each render and, once routing is up, navigates to the reminders
// inbox so the user can act on the tap.
export const pendingNativeTap = { reminderId: null, scheduledFor: null };
const pendingTapSubscribers = new Set();

export function subscribeToNativeTap(fn) {
  pendingTapSubscribers.add(fn);
  return () => pendingTapSubscribers.delete(fn);
}

function notifyTap() {
  for (const fn of pendingTapSubscribers) {
    try { fn(pendingNativeTap); } catch { /* keep going */ }
  }
}

export async function initNativeShell() {
  if (started) return;
  started = true;
  if (!isNative()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Stop the WebView from drawing under the system status bar so the
    // app header doesn't sit beneath the clock / signal icons.
    await StatusBar.setOverlaysWebView({ overlay: false });
    // App is dark-themed — Style.Light means light foreground content
    // (white icons/text), which is what we want on the dark backdrop.
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    // Non-fatal: an older Android WebView or a missing native plugin
    // shouldn't block the app from booting.
  }

  // Make sure the high-importance Android notification channel exists
  // before any reminder schedules a notification against it.
  try { await ensureRemindersChannel(); } catch { /* non-fatal */ }

  // Back-fill ReminderInstance rows for OS-fired notifications that
  // happened while the app was closed, so the inbox catches up.
  try { await backfillFiredWhileClosed(); } catch { /* non-fatal */ }

  // Re-arm the backup-reminder notification (if the user is in
  // BACKUP_MODES.REMINDER). Idempotent — cancels any previous one
  // before laying down the new schedule.
  try { await reconcileNativeBackupReminder(); } catch { /* non-fatal */ }

  // Register tray action buttons (Snooze 10m / 1h) so the user can
  // snooze straight from the notification without opening the app. The
  // OS will deliver the chosen actionId back to our listener below.
  // Two buttons is the practical sweet spot — Android collapses extras
  // behind a "More" menu and the most-used snooze values (per the
  // app's own DEFAULT_SNOOZE_OPTIONS) are 10m and 1h.
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: REMINDER_ACTION_TYPE_ID,
          actions: [
            { id: 'snooze_10', title: 'Snooze 10m' },
            { id: 'snooze_60', title: 'Snooze 1h' },
          ],
        },
      ],
    });
  } catch { /* non-fatal — actions may not be supported on this Android */ }

  // Action listener: handles both the default tap (no actionId in event
  // body, or actionId === 'tap') AND the snooze buttons. Tap routes to
  // the inbox; snooze re-schedules a fresh native notification at the
  // chosen time and records a "snoozed" instance.
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    LocalNotifications.addListener('localNotificationActionPerformed', async (event) => {
      const extra = event?.notification?.extra || {};

      // Backup-reminder tap: run the backup immediately, write to
      // Documents on native (no chooser), toast on completion.
      if (extra.kind === BACKUP_NOTIFICATION_EXTRA_KIND) {
        try {
          if (getAutoBackupMode() === BACKUP_MODES.OFF) return; // user turned it off after the OS scheduled
          await runAutoBackupNow({ silent: false, preferNative: true });
        } catch { /* non-fatal */ }
        // Re-arm for the next interval — `every: 'day'` covers the
        // daily case at the OS level, but for weekly/biweekly/monthly
        // we schedule one-shot and refresh on each tap.
        try { await reconcileNativeBackupReminder(); } catch { /* non-fatal */ }
        return;
      }

      const reminderId = extra.reminderId;
      const scheduledFor = extra.scheduledFor;
      if (!reminderId) return;

      const actionId = event?.actionId || '';
      if (actionId === 'snooze_10') {
        try { await snoozePrescheduledFire({ reminderId, scheduledFor, opt: 10 }); } catch { /* non-fatal */ }
        return; // do NOT navigate — user wants to dismiss the tray for now
      }
      if (actionId === 'snooze_60') {
        try { await snoozePrescheduledFire({ reminderId, scheduledFor, opt: 60 }); } catch { /* non-fatal */ }
        return;
      }

      // Default tap — record the fire and route to the inbox.
      try { await recordPrescheduledFire({ reminderId, scheduledFor }); } catch { /* non-fatal */ }
      pendingNativeTap.reminderId = reminderId;
      pendingNativeTap.scheduledFor = scheduledFor;
      notifyTap();
    });
  } catch { /* non-fatal */ }
}
