// Can this device actually deliver a notification — and if not, the one tap
// that fixes it (owner, 2026-10-01: notifications were off at the OS level
// with no in-app way to see it or get to the switch). Read by
// NotificationStatusCard; every place that depends on notifications shows
// that card instead of its own instructions.
//
//   getNotificationHealth() → {
//     supported,            false where the platform has no notifications
//     allowed,              notifications permitted for this app
//     canAsk,               the system prompt can still be shown (else only
//                           the phone's settings can turn them on)
//     channelMuted,         Android: the reminders channel is set to off
//     exactAlarms,          Android 12+: on-time alarms allowed (null = n/a)
//     batteryUnrestricted,  Android: exempt from battery optimisation (null = n/a)
//   }
//
// Android reads come from the app's own SystemSettings plugin
// (android/.../SystemSettingsPlugin.java). Never resolve a plugin proxy from
// an async function (Capacitor's `.then` trap) — only call its methods.

import { registerPlugin } from "@capacitor/core";
import { isNative, getNativePlatform } from "@/lib/platform";

const ANDROID = isNative() && getNativePlatform() === "android";
const SystemSettings = ANDROID ? registerPlugin("SystemSettings") : null;

async function localNotifications() {
  const m = await import("@capacitor/local-notifications");
  return m.LocalNotifications;
}

export async function getNotificationHealth() {
  if (isNative()) {
    let display = "prompt";
    try { display = (await (await localNotifications()).checkPermissions()).display; } catch { /* unknown */ }
    let status = null;
    if (SystemSettings) {
      try { status = await SystemSettings.status(); } catch { status = null; }
    }
    const allowed = status ? !!status.notificationsEnabled : display === "granted";
    return {
      supported: true,
      allowed,
      canAsk: display !== "denied",
      channelMuted: status ? !!status.remindersChannelMuted : null,
      exactAlarms: status ? !!status.exactAlarms : null,
      batteryUnrestricted: status ? !!status.batteryUnrestricted : null,
    };
  }
  if (typeof Notification === "undefined") {
    return { supported: false, allowed: false, canAsk: false, channelMuted: null, exactAlarms: null, batteryUnrestricted: null };
  }
  return {
    supported: true,
    allowed: Notification.permission === "granted",
    canAsk: Notification.permission === "default",
    channelMuted: null,
    exactAlarms: null,
    batteryUnrestricted: null,
  };
}

// Ask for permission where the system still allows asking; otherwise open
// the phone's notification settings. Resolves to the new health.
export async function allowNotifications() {
  const h = await getNotificationHealth();
  if (h.allowed) return h;
  if (h.canAsk) {
    try {
      if (isNative()) await (await localNotifications()).requestPermissions();
      else if (typeof Notification !== "undefined") await Notification.requestPermission();
    } catch { /* fall through to settings */ }
    const after = await getNotificationHealth();
    if (after.allowed || !ANDROID) return after;
  }
  await openNotificationSettings();
  return getNotificationHealth();
}

export const canOpenPhoneSettings = () => !!SystemSettings;

export async function openNotificationSettings() {
  if (!SystemSettings) return false;
  try { await SystemSettings.openNotificationSettings(); return true; } catch { return false; }
}
export async function openExactAlarmSettings() {
  if (!SystemSettings) return false;
  try { await SystemSettings.openExactAlarmSettings(); return true; } catch { return false; }
}
export async function openBatterySettings() {
  if (!SystemSettings) return false;
  try { await SystemSettings.openBatterySettings(); return true; } catch { return false; }
}
