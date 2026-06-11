// POST /api/friends/save-pubkey
// Body: { userId, secret, publicKey }   (publicKey = JSON string of the ECDH public JWK)
// Stores this system's E2E public key on its profile so friends can fetch it
// (returned by /api/friends/list). The relay only ever holds the PUBLIC key —
// the private key never leaves the user's device.
import { kv, validateUser, getProfile, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { userId, secret, publicKey } = req.body || {};
  if (!userId || !secret) return res.status(400).json({ error: 'Missing fields.' });
  if (!await validateUser(userId, secret)) return res.status(401).json({ error: 'Invalid credentials.' });

  const profile = await getProfile(userId);
  if (!profile) return res.status(404).json({ error: 'No profile.' });

  if (publicKey) profile.publicKey = String(publicKey);
  else delete profile.publicKey;
  await kv.set(`user:${userId}`, profile);

  return res.status(200).json({ ok: true });
}
