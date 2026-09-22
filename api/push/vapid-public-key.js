// GET /api/push/vapid-public-key
// Returns { publicKey } — the VAPID public key this relay signs with.
//
// Why this exists: the client used to read the public key from
// VITE_VAPID_PUBLIC_KEY, which is baked into the JS bundle at BUILD time.
// That is fine while everyone talks to the same relay, but a user pointing
// the app at their own self-hosted relay (Settings → Friends & sync
// server) would keep subscribing with OUR key while their relay signs with
// THEIRS. The push service accepts the send and the browser silently drops
// the payload — the exact failure the push diagnostics already warn about,
// except unfixable from the user's side.
//
// The public key is public by definition: it is handed to every push
// service and embedded in every subscription. Nothing here is a secret, so
// the endpoint needs no authentication.
import { cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  if (!publicKey) {
    return res.status(503).json({ error: 'Push not configured on this relay — VAPID_PUBLIC_KEY is not set.' });
  }
  // Safe to cache: rotating VAPID keys invalidates every existing
  // subscription anyway, so it is not something that changes quietly.
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({ publicKey });
}
