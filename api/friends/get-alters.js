// GET /api/friends/get-alters?userId=X&secret=Y&friendId=Z
// Returns { envelope } — the encrypted member-list blob that friend Z shared
// with user X (stored by Z at user:Z:alters:X). Fetched on demand when X opens
// Z's card, so it never rides the frequent friends poll. The blob is end-to-end
// encrypted to X's key; the relay can't read it. Gated on a mutual approved
// friendship as defence-in-depth.
import { kv, validateUser, getFriends, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { userId, secret, friendId } = req.query;
  if (!userId || !secret || !friendId) return res.status(400).json({ error: 'Missing parameters.' });
  if (!await validateUser(userId, secret)) return res.status(401).json({ error: 'Invalid credentials.' });

  // Only hand back blobs from someone this user is actually approved-friends with.
  const myFriends = await getFriends(userId);
  if (myFriends?.[friendId]?.status !== 'approved') {
    return res.status(200).json({ envelope: null });
  }

  const envelope = await kv.get(`user:${friendId}:alters:${userId}`);
  return res.status(200).json({ envelope: envelope || null });
}
