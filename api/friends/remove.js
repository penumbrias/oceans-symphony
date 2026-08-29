// POST /api/friends/remove
// Body: { myUserId, mySecret, friendUserId }
import { kv, validateUser, getFriends, setFriends, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { myUserId, mySecret, friendUserId } = req.body || {};

  if (!myUserId || !mySecret || !friendUserId) {
    return res.status(400).json({ error: 'Missing fields.' });
  }

  if (!await validateUser(myUserId, mySecret)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Remove from both sides
  const [myFriends, theirFriends] = await Promise.all([
    getFriends(myUserId),
    getFriends(friendUserId),
  ]);

  delete myFriends[friendUserId];
  delete theirFriends[myUserId];

  await Promise.all([
    setFriends(myUserId, myFriends),
    setFriends(friendUserId, theirFriends),
    // Retention: without these, both sides' per-friend blobs (front
    // overrides carry plaintext fronter names; alters envelopes are the
    // shared member list) survived the unfriending FOREVER — update-front's
    // stale sweep only touches ids still in the friends map.
    kv.del(
      `user:${myUserId}:front:${friendUserId}`,
      `user:${myUserId}:alters:${friendUserId}`,
      `user:${friendUserId}:front:${myUserId}`,
      `user:${friendUserId}:alters:${myUserId}`,
    ),
  ]);

  return res.status(200).json({ ok: true });
}
