// POST /api/friends/update-front
// Body: { userId, secret, fronters, terms, systemName, displayName, privacyLevel, perFriendFronters? }
// Pushes current front status. Optionally stores per-friend filtered fronter lists.
import { kv, validateUser, getFriends, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const {
    userId, secret,
    fronters = [], terms = {}, systemName, displayName, privacyLevel,
    perFriendFronters = {},   // { [friendId]: { fronters, privacyLevel } }
  } = req.body || {};

  if (!await validateUser(userId, secret)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const now = new Date().toISOString();
  const frontData = {
    fronters,
    terms,
    systemName,
    displayName,
    privacyLevel: privacyLevel || 'names',
    updatedAt: now,
  };

  // Needed both to clear stale overrides below and for the notify pass further
  // down — fetched once, up front.
  const friends = await getFriends(userId);

  // Store default front blob + per-friend overrides in parallel
  const storeOps = [kv.set(`user:${userId}:front`, frontData)];
  for (const [friendId, data] of Object.entries(perFriendFronters)) {
    if (!friendId || !data) continue;
    storeOps.push(kv.set(`user:${userId}:front:${friendId}`, {
      fronters: data.fronters || [],
      terms,
      systemName,
      displayName,
      privacyLevel: data.privacyLevel || privacyLevel || 'names',
      updatedAt: now,
    }));
  }

  // Clear overrides for friends who no longer have one. saveFriendVisibility
  // drops a friend from perFriendVisibility once their settings are all empty,
  // so the client simply stops sending an override for them — it never asks for
  // one to be removed. Without this, the stored key survives forever, and both
  // list.js and status.js resolve `frontForMe || frontDefault`, so the stale
  // override silently pins that friend to an old snapshot. If it happened to be
  // a `hidden` one, they see an empty front permanently.
  // DEL takes N keys as a single command, so this costs one command regardless
  // of friend count.
  const staleKeys = Object.keys(friends)
    .filter((friendId) => !perFriendFronters[friendId])
    .map((friendId) => `user:${userId}:front:${friendId}`);
  if (staleKeys.length > 0) storeOps.push(kv.del(...staleKeys));

  await Promise.all(storeOps);

  // Notify friends who opted in (best-effort, non-blocking). Two delivery
  // channels, sent in the same pass so a friend gets notified on whatever
  // they've registered (a friend could have Web Push on desktop AND FCM on
  // their phone — both fire):
  //   - Web Push  → browser / TWA  (user:<id>:pushsub,   VAPID_* env vars)
  //   - FCM       → native Android (user:<id>:fcmtoken,  FIREBASE_SERVICE_ACCOUNT env var)
  const notifyFriends = Object.entries(friends)
    .filter(([, f]) => f.status === 'approved' && f.notifyOnChange);

  if (notifyFriends.length > 0) {
    const label = displayName || systemName || 'A friend';

    // ── Web Push setup ──
    let webpush = null;
    const vapidPub = process.env.VAPID_PUBLIC_KEY;
    const vapidPriv = process.env.VAPID_PRIVATE_KEY;
    const mailto = process.env.VAPID_MAILTO || 'mailto:hello@symphony.app';
    if (vapidPub && vapidPriv) {
      try {
        webpush = (await import('web-push')).default;
        webpush.setVapidDetails(mailto, vapidPub, vapidPriv);
      } catch { webpush = null; }
    }

    // ── FCM setup ── (firebase-admin, dynamically imported so it doesn't
    // slow cold starts on deployments that haven't configured FCM).
    let messaging = null;
    const svcRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (svcRaw) {
      try {
        const { initializeApp, getApps, cert } = await import('firebase-admin/app');
        const { getMessaging } = await import('firebase-admin/messaging');
        let svc = null;
        try { svc = JSON.parse(svcRaw); } catch { svc = null; }
        if (svc) {
          if (!getApps().length) initializeApp({ credential: cert(svc) });
          messaging = getMessaging();
        }
      } catch { messaging = null; }
    }

    if (webpush || messaging) {
      await Promise.allSettled(notifyFriends.map(async ([friendUserId]) => {
        // Per-friend fronter list + privacy (mirrors the stored override)
        const perFriend = perFriendFronters[friendUserId];
        const effectiveFronters = perFriend ? perFriend.fronters : fronters;
        const effectivePrivacy = perFriend ? perFriend.privacyLevel : (privacyLevel || 'names');

        const fronterNames = (effectivePrivacy === 'count_only' || effectivePrivacy === 'hidden')
          ? []
          : effectiveFronters.filter(f => f.isPrimary || f.isCofronter).map(f => f.name);

        const body = effectivePrivacy === 'hidden'
          ? `${label} updated their front`
          : effectivePrivacy === 'count_only'
            ? `${label}: ${effectiveFronters.length} ${effectiveFronters.length === 1 ? (terms.fronter || 'fronter') : (terms.fronters || 'fronters')}`
            : fronterNames.length
              ? `${fronterNames.join(', ')} ${fronterNames.length === 1 ? 'is' : 'are'} now ${terms.fronting || 'fronting'}`
              : `${label}'s front is now clear`;

        const tag = `front-change-${userId}`;

        // Web Push
        if (webpush) {
          const sub = await kv.get(`user:${friendUserId}:pushsub`);
          if (sub) {
            try {
              await webpush.sendNotification(sub, JSON.stringify({ title: label, body, tag }));
            } catch (e) {
              if (e.statusCode === 410 || e.statusCode === 404) {
                await kv.del(`user:${friendUserId}:pushsub`);
              }
            }
          }
        }

        // FCM (native Android)
        if (messaging) {
          const token = await kv.get(`user:${friendUserId}:fcmtoken`);
          if (token) {
            try {
              await messaging.send({
                token,
                notification: { title: label, body },
                android: {
                  priority: 'high',
                  // reminders-switch = the silent / banner-only channel the
                  // native app creates (see src/lib/nativeNotifications.js).
                  notification: { channelId: 'reminders-switch', tag },
                },
                data: { kind: 'front-change', fromUserId: String(userId) },
              });
            } catch (e) {
              const code = (e && (e.errorInfo?.code || e.code)) || '';
              if (code.includes('registration-token-not-registered') ||
                  code.includes('invalid-registration-token')) {
                await kv.del(`user:${friendUserId}:fcmtoken`);
              }
            }
          }
        }
      }));
    }
  }

  return res.status(200).json({ ok: true });
}
