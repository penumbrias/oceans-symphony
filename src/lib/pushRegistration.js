import { localEntities } from "@/api/base44Client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export async function registerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser.');
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Push not configured. Set VITE_VAPID_PUBLIC_KEY in your environment.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied.');
  }

  const registration = await navigator.serviceWorker.register('/sw-reminders.js');
  await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const subJson = subscription.toJSON();

  // Store in local IDB so we can look it up later
  const existing = await localEntities.PushSubscription.filter({ endpoint: subJson.endpoint });
  if (existing.length) {
    await localEntities.PushSubscription.update(existing[0].id, { is_active: true, keys: subJson.keys });
  } else {
    await localEntities.PushSubscription.create({
      endpoint: subJson.endpoint,
      keys: subJson.keys,
      user_agent: navigator.userAgent,
      is_active: true,
    });
  }

  return subscription;
}

export async function unregisterPush() {
  if (!('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration('/sw-reminders.js');
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const records = await localEntities.PushSubscription.filter({ is_active: true });
  const match = (records || []).find(r => r.endpoint === endpoint);
  if (match) {
    await localEntities.PushSubscription.update(match.id, { is_active: false });
  }
}

export async function isPushEnabled() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.getRegistration('/sw-reminders.js');
  if (!registration) return false;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  const records = await localEntities.PushSubscription.filter({ is_active: true });
  return (records || []).some(r => r.endpoint === subscription.endpoint);
}

// Returns the raw subscription JSON, or null if not subscribed.
export async function getActivePushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  if (Notification.permission !== 'granted') return null;

  const registration = await navigator.serviceWorker.getRegistration('/sw-reminders.js');
  if (!registration) return null;

  const sub = await registration.pushManager.getSubscription();
  return sub ? sub.toJSON() : null;
}

// Call this whenever you want to deliver a notification via push.
// payload: { title, body, reminderInstanceId?, inlineActions? }
export async function sendPushNotification(payload) {
  try {
    const subscription = await getActivePushSubscription();
    if (!subscription) return false;

    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, payload }),
    });

    if (res.status === 410) {
      // Subscription expired — clean up silently
      await unregisterPush().catch(() => {});
      return false;
    }

    return res.ok;
  } catch {
    return false;
  }
}
