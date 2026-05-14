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

  // Ensure /sw.js is registered (main.jsx registers it on startup, but
  // calling register again is a no-op if it's already the active SW with
  // the same URL). We deliberately reuse /sw.js so there's exactly one
  // SW at scope "/" — previously a separate /sw-reminders.js was
  // registered here too, and the two flip-flopped as the active SW
  // because they shared the same scope, silently dropping push events.
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // Best-effort: unregister any leftover /sw-reminders.js registration
  // from older builds so it doesn't fight with /sw.js for the scope.
  try {
    const stale = await navigator.serviceWorker.getRegistration('/sw-reminders.js');
    if (stale && stale.scope === registration.scope && stale !== registration) {
      await stale.unregister();
    }
  } catch { /* non-fatal */ }

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

  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
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

  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
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

  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!registration) return null;

  const sub = await registration.pushManager.getSubscription();
  return sub ? sub.toJSON() : null;
}

// Diagnostic — returns a structured report explaining whether push delivery
// would work right now, and which specific check is failing if not. Used by
// the Settings "Test push" button so the user can self-diagnose instead of
// just toggling Enable/Disable and hoping.
//
// Each check returns { ok, label, detail? }. Caller can render them as
// a checklist and identify the first ok:false row.
export async function pushDiagnostics() {
  const out = [];

  const sw = 'serviceWorker' in navigator;
  out.push({ ok: sw, label: 'serviceWorker supported', detail: sw ? null : 'Your browser doesn\'t expose serviceWorker — push notifications aren\'t supported here. On iOS, install the app to your home screen first.' });
  if (!sw) return out;

  const pm = 'PushManager' in window;
  out.push({ ok: pm, label: 'PushManager supported', detail: pm ? null : 'Your browser doesn\'t support web push. On iOS, install the app to your home screen and reopen it from there.' });
  if (!pm) return out;

  const hasKey = !!VAPID_PUBLIC_KEY;
  out.push({ ok: hasKey, label: 'VAPID public key present', detail: hasKey ? null : 'VITE_VAPID_PUBLIC_KEY is not set in the deployment. Add it to Vercel environment variables.' });
  if (!hasKey) return out;

  const perm = Notification.permission;
  const permOk = perm === 'granted';
  out.push({ ok: permOk, label: `Notification permission: ${perm}`, detail: permOk ? null : (perm === 'denied' ? 'Notification permission is denied. Reset it in your browser/OS settings for this site.' : 'Permission not yet requested — tap Enable.') });
  if (!permOk) return out;

  let registration;
  try { registration = await navigator.serviceWorker.getRegistration('/sw.js'); } catch {}
  const regOk = !!registration;
  out.push({ ok: regOk, label: 'Reminders service worker registered', detail: regOk ? null : 'No service worker registration — tap Disable then Enable to re-register.' });
  if (!regOk) return out;

  let subscription;
  try { subscription = await registration.pushManager.getSubscription(); } catch {}
  const subOk = !!subscription;
  out.push({ ok: subOk, label: 'Push subscription active', detail: subOk ? null : 'Browser has no active push subscription — tap Disable then Enable to subscribe.' });
  if (!subOk) return out;

  // Server config — try a test send via the API.
  try {
    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        payload: {
          title: 'Push test ✓',
          body: 'If you see this, push notifications are working.',
          reminderInstanceId: null,
          inlineActions: [],
        },
      }),
    });
    if (res.ok) {
      out.push({ ok: true, label: 'Test notification dispatched', detail: 'Sent to the OS — check your notification tray.' });
      // Compare server-side VAPID public key against build-time. A
      // mismatch means subscriptions were signed against one key and
      // the server is signing pushes with another — pushes reach the
      // provider but the browser silently drops them.
      try {
        const json = await res.clone().json();
        const serverPub = json?.vapidPub;
        if (serverPub && VAPID_PUBLIC_KEY && serverPub !== VAPID_PUBLIC_KEY) {
          out.push({
            ok: false,
            label: 'VAPID public key MISMATCH',
            detail: `The key your subscription was signed with (build-time VITE_VAPID_PUBLIC_KEY, first 12 chars "${VAPID_PUBLIC_KEY.slice(0, 12)}…") does not match the server's VAPID_PUBLIC_KEY ("${serverPub.slice(0, 12)}…"). The push provider accepts the send but the browser silently drops the payload. Fix: regenerate keys with \`npx web-push generate-vapid-keys\` and set BOTH env vars to the same values, then redeploy and re-subscribe.`,
          });
        }
      } catch { /* server didn't echo, skip */ }
    } else if (res.status === 503) {
      out.push({ ok: false, label: 'Server VAPID keys', detail: 'The deployment is missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars. Push send returned 503.' });
    } else if (res.status === 410) {
      out.push({ ok: false, label: 'Subscription expired', detail: 'The push provider rejected the subscription (410). Tap Disable then Enable to refresh.' });
    } else {
      const txt = await res.text().catch(() => '');
      out.push({ ok: false, label: `Push send failed (${res.status})`, detail: txt || 'Unknown error from /api/push/send.' });
    }
  } catch (e) {
    out.push({ ok: false, label: 'Push send request failed', detail: e?.message || 'Network error contacting /api/push/send.' });
  }

  return out;
}

// Deep-dive diagnostic: sends a real push that the SW tags with a unique
// `diagId`, and concurrently listens for that diagId arriving back via a
// service-worker postMessage. Three outcomes:
//
//   - `delivered` — SW received the push AND we got the postMessage. Means
//     the entire pipeline works; if the user still doesn't see a
//     notification visually, the OS is suppressing display only (Do Not
//     Disturb, notification channel disabled at OS level, etc.).
//   - `sw_only` — server said 200 but no postMessage within 30s. Means the
//     server signed the payload but the push provider never woke the SW
//     on this device. Common causes: stale subscription, VAPID key
//     mismatch (build-time VITE_VAPID_PUBLIC_KEY ≠ server-side
//     VAPID_PUBLIC_KEY), aggressive battery optimisation killing Chrome's
//     background process, or a TWA wrapper not routing push to the
//     underlying SW.
//   - `send_failed` — server rejected the send (500/410/etc). Surfaced
//     with the HTTP status.
//
// Returns { result, detail }.
export async function pushDeepDiagnostic() {
  const subscription = await getActivePushSubscription();
  if (!subscription) return { result: 'no_subscription', detail: 'No active push subscription on this device.' };
  if (!('serviceWorker' in navigator)) return { result: 'no_sw', detail: 'serviceWorker not supported.' };

  const diagId = `diag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let resolved = false;
  let resolver;
  const promise = new Promise((r) => (resolver = r));

  const onMessage = (e) => {
    if (e.data?.type === 'push-received' && e.data?.diagId === diagId && !resolved) {
      resolved = true;
      resolver({ result: 'delivered', detail: 'The push reached your service worker. If you still didn\'t see a tray notification, the OS is suppressing display only (Do Not Disturb, notification channel off, battery optimisation, etc.).' });
    }
  };
  navigator.serviceWorker.addEventListener('message', onMessage);

  try {
    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription,
        payload: {
          title: 'Push deep-diagnostic',
          body: 'If you see this and the diagnostic page reports "delivered", push is fully working.',
          reminderInstanceId: null,
          inlineActions: [],
          diagId,
        },
      }),
    });
    if (!res.ok) {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      const txt = await res.text().catch(() => '');
      return { result: 'send_failed', detail: `Server rejected push send (${res.status}). ${txt}` };
    }
  } catch (e) {
    navigator.serviceWorker.removeEventListener('message', onMessage);
    return { result: 'send_failed', detail: `Network error contacting /api/push/send: ${e?.message || 'unknown'}` };
  }

  // Wait up to 30 seconds for the SW to post back.
  const timeout = new Promise((r) =>
    setTimeout(
      () =>
        r({
          result: 'sw_only',
          detail: 'Server accepted the push (200) but your service worker never received it within 30s. Most likely causes: stale subscription, VAPID key mismatch between build and server, or the OS killing Chrome\'s background process (battery saver). Try toggling push Disable → Enable to refresh the subscription.',
        }),
      30_000
    )
  );

  const outcome = await Promise.race([promise, timeout]);
  navigator.serviceWorker.removeEventListener('message', onMessage);
  return outcome;
}

// Show a notification directly from the running app, bypassing the push
// pipeline entirely. Useful for isolating "the push send succeeded but
// nothing appeared" issues — if even this local notification doesn't show,
// the problem is OS-side (notification channel for the browser disabled,
// battery optimization throttling Chrome, Do Not Disturb, etc.).
export async function showLocalTestNotification() {
  if (!('serviceWorker' in navigator)) {
    return { ok: false, detail: 'Service workers not supported in this browser.' };
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, detail: 'Notification permission is not granted.' };
  }
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!registration) {
    return { ok: false, detail: 'No service worker registration — tap Enable on push to re-register.' };
  }
  try {
    await registration.showNotification('Local test ✓', {
      body: 'If you see this, the OS is willing to show notifications from this app.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'local-test',
      requireInteraction: false,
    });
    return { ok: true, detail: 'Notification dispatched locally — check your tray.' };
  } catch (e) {
    return { ok: false, detail: e?.message || 'showNotification rejected.' };
  }
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
