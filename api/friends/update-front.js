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
  await Promise.all(storeOps);

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

      await Promise.allSettled(notifyFriends.map(async ([friendUserId]) => {
        const sub = await kv.get(`user:${friendUserId}:pushsub`);
        if (!sub) return;

        // Use per-friend fronter list if available, otherwise default
        const perFriend = perFriendFronters[friendUserId];
        const effectiveFronters = perFriend ? perFriend.fronters : fronters;
        const effectivePrivacy = perFriend ? perFriend.privacyLevel : (privacyLevel || 'names');

        let notifyFronters = effectiveFronters;
        if (effectivePrivacy === 'hidden') notifyFronters = [];
        else if (effectivePrivacy === 'count_only') notifyFronters = effectiveFronters; // keep count but don't use names

        const fronterNames = effectivePrivacy === 'count_only'
          ? []
          : notifyFronters.filter(f => f.isPrimary || f.isCofronter).map(f => f.name);

        const body = effectivePrivacy === 'hidden'
          ? `${label} updated their front`
          : effectivePrivacy === 'count_only'
            ? `${label}: ${effectiveFronters.length} ${effectiveFronters.length === 1 ? (terms.fronter || 'fronter') : (terms.fronters || 'fronters')}`
            : fronterNames.length
              ? `${fronterNames.join(', ')} ${fronterNames.length === 1 ? 'is' : 'are'} now ${terms.fronting || 'fronting'}`
              : `${label}'s front is now clear`;

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
