// POST /api/friends/save-push-sub
// Body: { userId, secret, subscription }
// Stores the push subscription server-side so friends can notify us.
import { kv, validateUser, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { userId, secret, subscription } = req.body || {};

  if (!userId || !secret) return res.status(400).json({ error: 'Missing fields.' });
  if (!await validateUser(userId, secret)) return res.status(401).json({ error: 'Invalid credentials.' });

  if (subscription) {
    await kv.set(`user:${userId}:pushsub`, subscription);
  } else {
    await kv.del(`user:${userId}:pushsub`);
  }

  return res.status(200).json({ ok: true });
}
