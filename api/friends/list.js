// GET /api/friends/list?userId=X&secret=Y
// Returns { friends: [...], pending: [...] }
import { kv, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { userId, secret } = req.query;

  if (!userId || !secret) return res.status(400).json({ error: 'Missing parameters.' });

  // Clients poll this endpoint every 30s, so its command count drives the Redis
  // bill more than anything else in the API. Upstash bills per COMMAND, and MGET
  // fetches N keys for the price of one — so reads are batched into two MGETs
  // (own keys, then friend keys) instead of 3 + 3-per-friend GETs. Reverting to
  // per-key kv.get() restores a cost that grows with every friend a user adds.
  const [profile, friendsMap, pending] = await kv.mget(
    `user:${userId}`,
    `user:${userId}:friends`,
    `user:${userId}:pending`,
  );

  // Inlined from validateUser() — the profile is already in hand, and calling it
  // would spend a second command re-reading the same key.
  if (!profile || profile.secret !== secret) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const friends = friendsMap || {};

  // Enrich approved friends with their profile + cached front
  const approvedIds = Object.entries(friends)
    .filter(([, f]) => f.status === 'approved')
    .map(([id]) => id);

  const pendingSentIds = Object.entries(friends)
    .filter(([, f]) => f.status === 'pending_sent')
    .map(([id]) => id);

  let enriched = [];
  // MGET with no keys is an error — skip the round trip when there are no
  // approved friends yet.
  if (approvedIds.length > 0) {
    const keys = [];
    for (const fId of approvedIds) {
      keys.push(`user:${fId}`, `user:${fId}:front`, `user:${fId}:front:${userId}`);
    }
    const values = await kv.mget(...keys);

    enriched = approvedIds.map((fId, i) => {
      const fProfile = values[i * 3];
      const frontDefault = values[i * 3 + 1];
      const frontForMe = values[i * 3 + 2];  // per-friend override
      return {
        userId: fId,
        displayName: fProfile?.displayName || 'A friend',
        systemName: fProfile?.systemName || '',
        friendCode: fProfile?.friendCode || '',
        notifyOnChange: friends[fId].notifyOnChange || false,
        addedAt: friends[fId].addedAt,
        front: frontForMe || frontDefault || null,
        // E2E public key (JSON string of the ECDH public JWK), if published.
        publicKey: fProfile?.publicKey || null,
      };
    });
  }

  return res.status(200).json({
    friends: enriched,
    pending: pending || [],       // incoming requests (need approval)
    pendingSent: pendingSentIds,  // outgoing requests waiting
  });
}
