// Native (Capacitor Android) wrapper around @capacitor/local-notifications.
//
// The web/PWA build uses Web Push (pushRegistration.js). Native can't —
// Web Push relies on the browser's PushManager, which the Capacitor
// WebView doesn't expose. Instead we route notifications through
// LocalNotifications, the OS's own system-tray notifications.
//
// All functions return early if not on native — callers can call these
// unconditionally and the web/TWA bundles still tree-shake the import.
// Per CLAUDE.md: every @capacitor/* import lives behind an isNative()
// branch with a dynamic import.

import { isNative } from "@/lib/platform";

// Stable id for the immediate "fire now" channel. LocalNotifications
// requires a positive 32-bit int id per notification; we use a rolling
// counter so cancellation-by-id stays possible if we ever need it.
let immediateIdCounter = 1;
function nextImmediateId() {
  immediateIdCounter = (immediateIdCounter % 2_000_000_000) + 1;
  return immediateIdCounter;
}

// Android 8+ requires every notification to belong to a channel — the
// channel determines whether the OS plays a sound, vibrates, and shows
// a heads-up bubble. Without an explicit channel, the plugin's
// "default" channel ends up at IMPORTANCE_LOW, which is silent and
// gets clustered into the notification shade with no peek. We create
// a HIGH-importance channel on first use so reminders feel like real
// notifications rather than silent log entries.
//
// Channel properties are applied ONCE per install — Android refuses to
// downgrade an existing channel's importance/sound/vibration after the
// user has installed the app, so picking sensible defaults up front
// matters. Users can override per-channel afterwards in system
// Settings → Apps → Oceans Symphony → Notifications.
export const REMINDERS_CHANNEL_ID = "reminders-default";
let channelEnsured = false;

export async function ensureRemindersChannel() {
  if (!isNative()) return;
  if (channelEnsured) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    if (!LocalNotifications.createChannel) {
      // iOS or older plugin — channels are an Android-only concept.
      channelEnsured = true;
      return;
    }
    await LocalNotifications.createChannel({
      id: REMINDERS_CHANNEL_ID,
      name: "Reminders",
      description: "Scheduled reminders and check-in nudges",
      importance: 4, // IMPORTANCE_HIGH — heads-up + sound + vibration
      visibility: 1, // public lock-screen visibility
      sound: undefined, // OS default tone
      vibration: true,
      lights: true,
    });
    channelEnsured = true;
  } catch {
    /* createChannel can throw on older Android — fall through; the
       notification just won't have the heads-up treatment. */
    channelEnsured = true;
  }
}

export async function requestNativePermission() {
  if (!isNative()) return { display: "denied" };
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return LocalNotifications.requestPermissions();
}

export async function isNativeNotificationsEnabled() {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const res = await LocalNotifications.checkPermissions();
    return res.display === "granted";
  } catch {
    return false;
  }
}

// Fire a notification immediately from the running app. Mirrors what
// the web Push pipeline would have done — same payload shape so callers
// don't need to translate.
//   payload: { title, body, reminderInstanceId?, inlineActions? }
export async function sendNativeNotification(payload) {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const granted = await isNativeNotificationsEnabled();
    if (!granted) return false;
    await ensureRemindersChannel();
    const id = nextImmediateId();
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: payload?.title || "Reminder",
          body: payload?.body || "",
          channelId: REMINDERS_CHANNEL_ID,
          // Carry the reminder instance id so a future tap-listener can
          // route to the right screen / quick action.
          extra: {
            reminderInstanceId: payload?.reminderInstanceId || null,
            inlineActions: payload?.inlineActions || [],
          },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

// Mirrors showLocalTestNotification() in pushRegistration.js so the
// Settings "Show local test notification" button works on native too.
export async function showNativeTestNotification() {
  if (!isNative()) {
    return { ok: false, detail: "Not running in the native app." };
  }
  try {
    const granted = await isNativeNotificationsEnabled();
    if (!granted) {
      return { ok: false, detail: "Notification permission is not granted. Tap Enable first." };
    }
    const ok = await sendNativeNotification({
      title: "Local test ✓",
      body: "If you see this, the OS is willing to show notifications from this app.",
    });
    return ok
      ? { ok: true, detail: "Notification dispatched — check your tray." }
      : { ok: false, detail: "Failed to schedule the local notification." };
  } catch (e) {
    return { ok: false, detail: e?.message || "Native notification failed." };
  }
}

// Used by the Settings diagnostic so a native user sees an honest
// checklist instead of the Web-Push-specific one.
export async function nativeNotificationDiagnostics() {
  const out = [];
  if (!isNative()) {
    out.push({ ok: false, label: "Native runtime detected", detail: "Not running inside the Capacitor app." });
    return out;
  }
  out.push({ ok: true, label: "Native runtime detected" });

  let granted = false;
  try {
    granted = await isNativeNotificationsEnabled();
  } catch (e) {
    out.push({ ok: false, label: "Permission check failed", detail: e?.message || "" });
    return out;
  }
  out.push({
    ok: granted,
    label: `Notification permission: ${granted ? "granted" : "not granted"}`,
    detail: granted ? null : "Tap Enable to request permission. If you see no prompt, Android may have permanently denied — open the system Settings → Apps → Oceans Symphony → Notifications and allow.",
  });
  if (!granted) return out;

  const ok = await sendNativeNotification({
    title: "Push test ✓",
    body: "If you see this, native notifications are working.",
  });
  out.push({
    ok,
    label: ok ? "Test notification dispatched" : "Failed to dispatch test notification",
    detail: ok ? "Sent to the OS — check your notification tray." : "The OS rejected the schedule call.",
  });
  return out;
}
