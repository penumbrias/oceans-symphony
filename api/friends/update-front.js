// POST /api/friends/update-front
// Body: { userId, secret, fronters, terms, systemName, displayName, privacyLevel }
// Pushes current front status. Optionally sends push notifications to friends with notifyOnChange.
import { kv, validateUser, getFriends, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { userId, secret, fronters = [], terms = {}, systemName, displayName, privacyLevel } = req.body || {};

  if (!await validateUser(userId, secret)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const frontData = {
    fronters,       // [{ name, initial, color, isPrimary, isCofronter }]
    terms,          // friend's vocabulary
    systemName,
    displayName,
    privacyLevel: privacyLevel || 'names',
    updatedAt: new Date().toISOString(),
  };

  await kv.set(`user:${userId}:front`, frontData);

  // Fire push notifications to friends who opted in (best-effort, non-blocking)
  const friends = await getFriends(userId);
  const notifyFriends = Object.entries(friends)
    .filter(([, f]) => f.status === 'approved' && f.notifyOnChange);

  if (notifyFriends.length > 0) {
    const vapidPub = process.env.VAPID_PUBLIC_KEY;
    const vapidPriv = process.env.VAPID_PRIVATE_KEY;
    const mailto = process.env.VAPID_MAILTO || 'mailto:hello@symphony.app';

    if (vapidPub && vapidPriv) {
      const { default: webpush } = await import('web-push');
      webpush.setVapidDetails(mailto, vapidPub, vapidPriv);

      const label = displayName || systemName || 'A friend';
      const fronterNames = fronters.filter(f => f.isPrimary || f.isCofronter).map(f => f.name);
      const body = fronterNames.length
        ? `${fronterNames.join(', ')} ${fronterNames.length === 1 ? 'is' : 'are'} now ${terms.fronting || 'fronting'}`
        : `${label}'s front is now clear`;

      await Promise.allSettled(notifyFriends.map(async ([friendUserId]) => {
        const sub = await kv.get(`user:${friendUserId}:pushsub`);
        if (!sub) return;
        try {
          await webpush.sendNotification(sub, JSON.stringify({
            title: label,
            body,
            tag: `front-change-${userId}`,
          }));
        } catch (e) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            await kv.del(`user:${friendUserId}:pushsub`);
          }
        }
      }));
    }
  }

  return res.status(200).json({ ok: true });
}
