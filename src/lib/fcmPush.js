// Native (Capacitor Android) Firebase Cloud Messaging registration, so a
// friend's fronting change can push to this device INSTANTLY — even when the
// Oceans Symphony app is fully closed.
//
// Why this exists separately from pushRegistration.js:
//   - Web / TWA targets use Web Push (pushRegistration.js). The Capacitor
//     WebView has no PushManager, so the native build can't use Web Push.
//   - Instead the native build registers with FCM via
//     @capacitor/push-notifications, gets a device token, and hands it to
//     the friends server (POST /api/friends/save-fcm-token). When a friend
//     updates their front, /api/friends/update-front sends an FCM message to
//     that token and the OS displays it without waking our JS.
//
// Relationship to the 15-minute background poll (public/runners/friends-poll.js):
//   - That poll was the ONLY closed-app mechanism before FCM existed. Once a
//     token is saved successfully we flip the runner's `fcm_active` flag so
//     the poll stops firing notifications (FCM is faster + more reliable) —
//     otherwise the same change would buzz twice. If FCM isn't configured /
//     permission is refused / no token arrives, the flag stays off and the
//     poll remains the fallback. The flag is re-asserted every boot, so it
//     self-corrects.
//
// Per CLAUDE.md: every @capacitor/* import lives behind an isNative() branch
// with a dynamic import so Vite tree-shakes it out of the web bundle.

import { isNative } from "@/lib/platform";
import { getLocalIdentity, FRIENDS_API_BASE } from "@/lib/friendsApi";
import { setBackgroundRunnerFcmActive } from "@/lib/nativeBackgroundFriendSync";

// Listeners must only be attached once per app lifetime (register() can be
// called repeatedly — on boot and whenever the user flips a friend's bell).
let listenersBound = false;
// Avoid re-POSTing the same token every boot.
let lastSavedToken = null;

async function saveTokenToServer(token) {
  if (!token) return false;
  const identity = await getLocalIdentity().catch(() => null);
  if (!identity?.userId || !identity?.secret) return false;
  if (token === lastSavedToken) return true;
  try {
    const res = await fetch(`${FRIENDS_API_BASE}/save-fcm-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: identity.userId, secret: identity.secret, token }),
    });
    if (res.ok) {
      lastSavedToken = token;
      // FCM is now the delivery path — silence the 15-min fallback poll so
      // it doesn't double-notify for the same change.
      await setBackgroundRunnerFcmActive(true).catch(() => {});
      return true;
    }
  } catch { /* non-fatal — boot will retry */ }
  return false;
}

// Register the device with FCM and persist the token server-side.
//   opts.prompt — when false, only proceeds if notification permission was
//     ALREADY granted (used on boot so we never surprise the user with a
//     permission dialog they didn't ask for). Defaults to true for the
//     explicit "turn on this friend's bell" path.
// Native only — returns false (no-op) on web/TWA. Safe to call repeatedly.
export async function registerFcmPush({ prompt = true } = {}) {
  if (!isNative()) return false;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      if (!prompt) {
        await setBackgroundRunnerFcmActive(false).catch(() => {});
        return false;
      }
      if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
        perm = await PushNotifications.requestPermissions();
      }
    }
    if (perm.receive !== "granted") {
      // No permission → FCM can't deliver. Keep the 15-min poll as fallback.
      await setBackgroundRunnerFcmActive(false).catch(() => {});
      return false;
    }

    if (!listenersBound) {
      listenersBound = true;
      await PushNotifications.addListener("registration", (token) => {
        saveTokenToServer(token?.value);
      });
      await PushNotifications.addListener("registrationError", (err) => {
        // Most common cause: google-services.json missing from the build, so
        // FCM never issues a token. The poll fallback stays active because
        // saveTokenToServer never runs (so fcm_active is never set true).
        console.warn("[fcmPush] registration error:", err?.error || err);
      });
      // A foreground FCM message (e.g. a friend's front changed) — nudge any
      // open Friends page to refetch immediately instead of waiting for its
      // timer (push-instead-of-poll). Tray display is handled by the OS /
      // the in-app toast hook; this is only the "go refresh the list" signal.
      await PushNotifications.addListener("pushNotificationReceived", () => {
        try { window.dispatchEvent(new CustomEvent("fcm-front-change")); } catch { /* non-fatal */ }
      });
      // Tapping the OS notification already brings the app to the foreground.
      // Surface the payload so a future listener can route to the friend;
      // harmless if nothing listens.
      await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        try {
          const data = action?.notification?.data || {};
          window.dispatchEvent(new CustomEvent("fcm-notification-tap", { detail: data }));
        } catch { /* non-fatal */ }
      });
    }

    await PushNotifications.register();
    return true;
  } catch (e) {
    console.warn("[fcmPush] registerFcmPush failed:", e?.message || e);
    await setBackgroundRunnerFcmActive(false).catch(() => {});
    return false;
  }
}

// Remove the token server-side and let the 15-min poll resume notifying.
// Called when the user turns off all friend notifications / leaves Friends.
export async function unregisterFcmPush() {
  if (!isNative()) return;
  try {
    const identity = await getLocalIdentity().catch(() => null);
    if (identity?.userId && identity?.secret) {
      await fetch(`${FRIENDS_API_BASE}/save-fcm-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: identity.userId, secret: identity.secret, token: null }),
      }).catch(() => {});
    }
  } finally {
    lastSavedToken = null;
    await setBackgroundRunnerFcmActive(false).catch(() => {});
  }
}
