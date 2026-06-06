// POST /api/friends/save-fcm-token
// Body: { userId, secret, token }
// Stores this device's Firebase Cloud Messaging registration token so
// friends can push a front-change notification to it (native app). Pass
// token: null to remove it (e.g. when the user turns notifications off).
// Mirrors save-push-sub.js (the Web Push equivalent for browser / TWA).
import { kv, validateUser, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { userId, secret, token } = req.body || {};

  if (!userId || !secret) return res.status(400).json({ error: 'Missing fields.' });
  if (!await validateUser(userId, secret)) return res.status(401).json({ error: 'Invalid credentials.' });

  if (token) {
    await kv.set(`user:${userId}:fcmtoken`, token);
  } else {
    await kv.del(`user:${userId}:fcmtoken`);
  }

  return res.status(200).json({ ok: true });
}
