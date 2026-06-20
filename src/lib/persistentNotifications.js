// Persistent / ongoing status notifications (Android, Capacitor native).
//
// Unlike scheduled reminders (nativeReminderScheduler) these are "ongoing"
// notifications: they sit in the tray, are non-dismissible by swipe, and we
// rewrite them in place whenever the underlying state changes (a switch, a
// new symptom, an activity started/ended). Re-scheduling with the SAME id
// updates the existing notification rather than stacking a new one.
//
// Scope of v1: updates happen while the app is running (foreground or
// recently backgrounded). We do NOT promise live updates while the app is
// fully killed — that would need a foreground service / background runner,
// which is a later phase. The ongoing notification still *persists* in the
// tray after the app is backgrounded; it just reflects the last known state.
//
// All native deps are dynamically imported behind isNative() so the web
// bundle tree-shakes @capacitor/local-notifications out entirely.

import { isNative } from "@/lib/platform";

const CHANNEL_ID = "persistent-status";

// Fixed, stable notification ids — one per persistent type. Chosen well
// outside the reminder (nativeReminderScheduler) and plan-reminder
// (planReminderScheduler) int31 hash ranges so they can never collide on
// the same OS notification slot.
const IDS = {
  fronters: 2100001,
  symptoms: 2100002,
  activity: 2100003,
};

let channelEnsured = false;
let actionTypesRegistered = false;

// Register the inline action buttons used by the activity + symptom
// notifications ("End & log", "End"). Idempotent; safe to call repeatedly.
export async function registerPersistentActionTypes() {
  if (!isNative() || actionTypesRegistered) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    if (!LocalNotifications.registerActionTypes) { actionTypesRegistered = true; return; }
    await LocalNotifications.registerActionTypes({
      types: [
        { id: "ACTIVITY_ACTIONS", actions: [{ id: "end_activity", title: "End & log" }] },
        { id: "SYMPTOM_ACTIONS", actions: [{ id: "end_symptom", title: "End" }] },
      ],
    });
  } catch {
    /* non-fatal — notification just won't carry buttons */
  }
  actionTypesRegistered = true;
}

async function ensureChannel(LocalNotifications) {
  if (channelEnsured) return;
  if (!LocalNotifications.createChannel) {
    channelEnsured = true;
    return;
  }
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "Status (ongoing)",
      description: "Persistent at-a-glance notifications for fronters, symptoms, and the activity timer",
      importance: 2, // IMPORTANCE_LOW — silent, no heads-up, just a tray entry
      visibility: 1, // public lock-screen visibility
      vibration: false,
      lights: false,
    });
  } catch {
    /* older Android may reject createChannel — non-fatal */
  }
  channelEnsured = true;
}

// Create/update or cancel a single ongoing notification.
//   syncPersistentNotification("fronters", { enabled, title, body })
// When enabled is false or body is empty, the notification is cancelled.
// actionTypeId + extra add inline action buttons (see registerPersistentActionTypes).
export async function syncPersistentNotification(type, { enabled, title, body, actionTypeId, extra } = {}) {
  if (!isNative()) return;
  const id = IDS[type];
  if (!id) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    if (!enabled || !body) {
      await LocalNotifications.cancel({ notifications: [{ id }] });
      return;
    }

    // Don't try to display if the user never granted notification permission.
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") return;
    } catch {
      /* checkPermissions unavailable — attempt the schedule anyway */
    }

    await ensureChannel(LocalNotifications);
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: title || "",
          body,
          channelId: CHANNEL_ID,
          ongoing: true, // sticky/persistent (best-effort — see note below)
          autoCancel: false, // tapping doesn't clear it
          ...(actionTypeId ? { actionTypeId } : {}),
          ...(extra ? { extra } : {}),
          // No custom smallIcon — referencing a drawable that isn't bundled
          // throws a native Resources.NotFoundException that crashes past the
          // JS try/catch. Match the working reminder scheduler: let the plugin
          // fall back to the app's default notification icon.
          //
          // NOTE on "ongoing": on Android 13- this makes the notification
          // non-dismissible; on Android 14+ the user can still swipe it away
          // unless it's backed by a foreground service (which @capacitor/
          // local-notifications can't create). The watcher re-creates it on
          // app resume so a swiped one comes back.
        },
      ],
    });
  } catch {
    /* scheduling can throw on permission edge cases — non-fatal */
  }
}

// Tear down every persistent notification (e.g. user turned them all off,
// or on a clean reset). Safe to call on web (no-op).
export async function cancelAllPersistentNotifications() {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({
      notifications: Object.values(IDS).map((id) => ({ id })),
    });
  } catch {
    /* non-fatal */
  }
}
