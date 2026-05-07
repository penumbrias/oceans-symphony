// GET /api/friends/list?userId=X&secret=Y
// Returns { friends: [...], pending: [...] }
import { kv, validateUser, getFriends, getPending, getProfile, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { userId, secret } = req.query;

  if (!userId || !secret) return res.status(400).json({ error: 'Missing parameters.' });
  if (!await validateUser(userId, secret)) return res.status(401).json({ error: 'Invalid credentials.' });

  const [friendsMap, pending] = await Promise.all([
    getFriends(userId),
    getPending(userId),
  ]);

  // Enrich approved friends with their profile + cached front
  const approvedIds = Object.entries(friendsMap)
    .filter(([, f]) => f.status === 'approved')
    .map(([id]) => id);

  const pendingSentIds = Object.entries(friendsMap)
    .filter(([, f]) => f.status === 'pending_sent')
    .map(([id]) => id);

  const enriched = await Promise.all(approvedIds.map(async (fId) => {
    const [profile, frontDefault, frontForMe] = await Promise.all([
      getProfile(fId),
      kv.get(`user:${fId}:front`),
      kv.get(`user:${fId}:front:${userId}`),  // per-friend override
    ]);
    return {
      userId: fId,
      displayName: profile?.displayName || 'A friend',
      systemName: profile?.systemName || '',
      friendCode: profile?.friendCode || '',
      notifyOnChange: friendsMap[fId].notifyOnChange || false,
      addedAt: friendsMap[fId].addedAt,
      front: frontForMe || frontDefault || null,
    };
  }));

  return res.status(200).json({
    friends: enriched,
    pending,           // incoming requests (need approval)
    pendingSent: pendingSentIds,  // outgoing requests waiting
  });
}
