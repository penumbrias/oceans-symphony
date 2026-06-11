// POST /api/friends/update-alters
// Body: { userId, secret, perFriend: { [friendId]: envelope | null } }
// Stores this system's END-TO-END-ENCRYPTED member-list share, one blob per
// friend (each `envelope` is encrypted on the client so only that friend can
// read it — see src/lib/friendsCrypto.js). Passing null for a friend deletes
// their blob (e.g. you stopped sharing any members with them). The relay never
// sees plaintext member data.
import { kv, validateUser, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { userId, secret, perFriend = {} } = req.body || {};
  if (!userId || !secret) return res.status(400).json({ error: 'Missing fields.' });
  if (!await validateUser(userId, secret)) return res.status(401).json({ error: 'Invalid credentials.' });

  const ops = [];
  for (const [friendId, envelope] of Object.entries(perFriend)) {
    if (!friendId) continue;
    const key = `user:${userId}:alters:${friendId}`;
    if (envelope) ops.push(kv.set(key, envelope));
    else ops.push(kv.del(key));
  }
  await Promise.all(ops);

  return res.status(200).json({ ok: true });
}
