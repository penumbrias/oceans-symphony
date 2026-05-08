// POST /api/friends/delete
// Body: { userId, secret }
// Deletes the user's profile, friends map, pending requests, push
// subscription, and front status. Removes this user from every friend's
// friends map. Frees the friend code so it could be re-used later.
import { kv, validateUser, getProfile, getFriends, setFriends, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { userId, secret } = req.body || {};
  if (!userId || !secret) return res.status(400).json({ error: 'Missing fields.' });
  if (!await validateUser(userId, secret)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const profile = await getProfile(userId);
  const myFriends = await getFriends(userId);

  // Remove this user from every friend's friends map.
  await Promise.all(Object.keys(myFriends).map(async friendId => {
    const theirFriends = await getFriends(friendId);
    if (theirFriends && theirFriends[userId]) {
      delete theirFriends[userId];
      await setFriends(friendId, theirFriends);
    }
  }));

  // Drop this user's data. Per-friend front overrides aren't enumerated by
  // the friends map, but they're keyed `user:${userId}:front:${friendId}`
  // and orphaned overrides are harmless once the profile is gone.
  const ops = [
    kv.del(`user:${userId}`),
    kv.del(`user:${userId}:friends`),
    kv.del(`user:${userId}:pending`),
    kv.del(`user:${userId}:pushsub`),
    kv.del(`user:${userId}:front`),
  ];
  if (profile?.friendCode) ops.push(kv.del(`code:${profile.friendCode}`));
  await Promise.all(ops);

  return res.status(200).json({ ok: true });
}
