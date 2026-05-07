// POST /api/friends/delete-profile
// Body: { userId, secret }
// Removes the user's profile and all associated KV data.
// Also removes them from every approved/pending friend's friends list.
import { kv, validateUser, getFriends, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { userId, secret } = req.body || {};

  if (!await validateUser(userId, secret)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Gather friends so we can remove ourselves from their lists and clean up per-friend blobs
  const myFriends = await getFriends(userId);
  const friendIds = Object.keys(myFriends);

  // Remove self from each friend's list and delete per-friend front blobs
  await Promise.allSettled(friendIds.map(async (friendId) => {
    const [theirFriends] = await Promise.all([
      getFriends(friendId),
    ]);
    delete theirFriends[userId];
    await Promise.allSettled([
      kv.set(`user:${friendId}:friends`, theirFriends),
      kv.del(`user:${userId}:front:${friendId}`),
    ]);
  }));

  // Delete all own KV keys
  await Promise.allSettled([
    kv.del(`user:${userId}`),
    kv.del(`user:${userId}:front`),
    kv.del(`user:${userId}:friends`),
    kv.del(`user:${userId}:pending`),
    kv.del(`user:${userId}:pushsub`),
  ]);

  return res.status(200).json({ ok: true });
}
