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

// Set by the @capacitor/app `appUrlOpen` listener. Holds the next in-app
// route the React tree should navigate to (path + search + hash, no
// origin). Used for OS launcher shortcuts that deep-link via VIEW
// intents at our Capacitor hostname.
export const pendingNativeRoute = { target: null };
const pendingRouteSubscribers = new Set();

export function subscribeToNativeRoute(fn) {
  pendingRouteSubscribers.add(fn);
  return () => pendingRouteSubscribers.delete(fn);
}

function notifyRoute() {
  for (const fn of pendingRouteSubscribers) {
    try { fn(pendingNativeRoute); } catch { /* keep going */ }
  }
}

// Trim a Capacitor app URL down to the SPA-relative bit we can hand to
// react-router. Returns null if the URL isn't ours.
function extractInAppRoute(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    // Only handle URLs that match our Capacitor hostname; ignore mailto:,
    // tel:, or external https links that happen to come through.
    if (u.hostname !== "app.local.oceans-symphony") return null;
    return `${u.pathname || "/"}${u.search || ""}${u.hash || ""}`;
  } catch {
    return null;
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
    await StatusBar.setOverlaysWebView({ overlay: true });
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

  // Seed the friends background-poll runner with the current identity.
  // Idempotent — overwrites whatever credentials the runner had. Safe
  // to call even if the user has no Friends profile (the bridge
  // short-circuits when getLocalIdentity returns null). Covers the
  // uninstall-reinstall case where the runner's CapacitorKV is fresh
  // but the IndexedDB identity survived restore.
  try {
    const { pushIdentityToBackgroundRunner } = await import("@/lib/nativeBackgroundFriendSync");
    await pushIdentityToBackgroundRunner();
  } catch { /* non-fatal */ }

  // Re-register with Firebase Cloud Messaging so friend-front changes push
  // INSTANTLY even when the app is fully closed. FCM rotates tokens, so we
  // refresh + re-save on every boot. prompt:false → never raises a
  // permission dialog here (only the explicit "turn on a friend's bell"
  // path prompts); if permission isn't already granted, or
  // google-services.json isn't in the build, this no-ops and the 15-minute
  // background poll stays the fallback. Gated on having a Friends profile.
  try {
    const { getLocalIdentity } = await import("@/lib/friendsApi");
    const identity = await getLocalIdentity().catch(() => null);
    if (identity?.userId) {
      const { registerFcmPush } = await import("@/lib/fcmPush");
      await registerFcmPush({ prompt: false });
    }
  } catch { /* non-fatal */ }

  // Document-level interceptor for external anchor clicks. In a
  // Capacitor WebView, <a target="_blank"> opens INSIDE the WebView
  // instead of in the user's browser — which means tapping a
  // GitHub link, a Google Maps link, a YouTube channel, or a
  // user-pasted bulletin URL strands the user on that page with no
  // back-to-app affordance. Route every external http(s) anchor
  // click through @capacitor/browser so it opens in a Chrome Custom
  // Tab (swipeable back to the app). Catches all existing call sites
  // — no need to refactor every <a> in the tree.
  //
  // Skipped:
  //   - same-origin clicks (in-app react-router navigation)
  //   - non-http protocols (mailto:, tel:, geo:, sms: — let Android
  //     decide which app handles them)
  //   - in-page anchors (#hash)
  try {
    document.addEventListener("click", async (e) => {
      const anchor = e.target && typeof e.target.closest === "function"
        ? e.target.closest("a[href]")
        : null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url;
      try { url = new URL(href, window.location.href); }
      catch { return; }
      if (url.origin === window.location.origin) return;
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      e.preventDefault();
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: url.toString() });
      } catch (err) {
        console.warn("[nativeBootstrap] Browser.open failed:", err?.message || err);
      }
    }, true);
  } catch { /* non-fatal */ }

  // Deep-link handling for OS launcher shortcuts (and any other
  // appUrlOpen source). When the app is cold-launched via a shortcut,
  // the WebView's initial location already has the query params, so
  // the page reads them on mount and we don't need to do anything
  // here. When the app is WARM (already in memory) and a shortcut is
  // tapped, appUrlOpen fires — we stash the target route and let
  // AuthenticatedApp's subscriber pick it up via react-router's
  // navigate().
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("appUrlOpen", (event) => {
      const route = extractInAppRoute(event?.url);
      if (!route) return;
      pendingNativeRoute.target = route;
      notifyRoute();
    });
  } catch { /* non-fatal */ }

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

      // Plan reminder tap: deep-link straight into the Activity
      // Tracker with the plan id pre-loaded — same convention as the
      // Dashboard's critical-plan card. Doesn't record a
      // ReminderInstance (plans don't share the Reminder entity).
      if (extra.kind === "plan_reminder" && extra.activityId) {
        pendingNativeRoute.target = `/activities?activityId=${encodeURIComponent(extra.activityId)}`;
        notifyRoute();
        return;
      }

      // Backup-reminder tap: run the backup immediately, write to
      // Documents on native (no chooser), toast on completion.
      if (extra.kind === BACKUP_NOTIFICATION_EXTRA_KIND) {
        try {
          if (getAutoBackupMode() === BACKUP_MODES.OFF) return; // user turned it off after the OS scheduled
          await runAutoBackupNow({ silent: false });
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
