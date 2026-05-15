// One-shot native-side boot for the Capacitor build target. Web and TWA
// builds hit the isNative() guard immediately and return — the dynamic
// imports below are tree-shaken out of those bundles.
//
// Per CLAUDE.md: native-only dependencies MUST be dynamically imported
// inside an isNative() branch so Vite never includes @capacitor/* in
// the web bundle.

import { isNative } from '@/lib/platform';
import { ensureRemindersChannel } from '@/lib/nativeNotifications';
import { backfillFiredWhileClosed, recordPrescheduledFire } from '@/lib/nativeReminderScheduler';

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

  // Action listener: when the user taps a pre-scheduled OS notification,
  // record the fire (so the inbox tracks it) and surface a pending-tap
  // event to the React tree, which routes to /reminders.
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    LocalNotifications.addListener('localNotificationActionPerformed', async (event) => {
      const extra = event?.notification?.extra || {};
      const reminderId = extra.reminderId;
      const scheduledFor = extra.scheduledFor;
      if (!reminderId) return;
      try { await recordPrescheduledFire({ reminderId, scheduledFor }); } catch { /* non-fatal */ }
      pendingNativeTap.reminderId = reminderId;
      pendingNativeTap.scheduledFor = scheduledFor;
      notifyTap();
    });
  } catch { /* non-fatal */ }
}
