// POST /api/push/send
// Body: { userId, secret, payload }
//
// Sends a web-push notification to THE CALLER'S OWN stored subscription.
// Used only by the in-app push self-test / deep-diagnostic.
//
// SECURITY (v0.180.0): this used to accept a caller-supplied
// `subscription` object with NO authentication — an open relay that would
// sign anything for anyone with the app's VAPID key. Anyone holding a
// user's subscription object (it's in device backups, and it was passed
// around client-side) could push arbitrary lock-screen text to that
// user's phone. Now: credentials are required and validated, and the
// target is ONLY the subscription stored server-side under that userId
// (save-push-sub). A caller can never name a target.
import webpush from 'web-push';
import { kv, validateUser, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const mailto = process.env.VAPID_MAILTO || 'mailto:hello@symphony.app';

  if (!pub || !priv) {
    return res.status(503).json({ error: 'Push not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel environment variables.' });
  }
  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { userId, secret, payload } = req.body || {};
  if (!userId || !secret) return res.status(400).json({ error: 'Missing credentials.' });
  if (!await validateUser(userId, secret)) return res.status(401).json({ error: 'Invalid credentials.' });
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Missing payload' });
  }

  const subscription = await kv.get(`user:${userId}:pushsub`);
  if (!subscription?.endpoint || !subscription?.keys) {
    return res.status(404).json({ error: 'No push subscription stored for this device — enable push first.' });
  }

  // Bound what a client can put on its own lock screen; this endpoint is a
  // self-test, not a general messaging channel.
  const safePayload = {
    title: String(payload.title || 'Oceans Symphony').slice(0, 120),
    body: String(payload.body || '').slice(0, 300),
    reminderInstanceId: null,
    inlineActions: [],
    ...(payload.diagId ? { diagId: String(payload.diagId).slice(0, 64) } : {}),
  };

  webpush.setVapidDetails(mailto, pub, priv);
  try {
    await webpush.sendNotification(subscription, JSON.stringify(safePayload));
    // Echo the server-side VAPID public key back so the client can
    // compare it against the build-time VITE_VAPID_PUBLIC_KEY. A
    // mismatch between the key the subscription was signed with and
    // the key the server uses to sign the push is one of the most
    // common silent "push delivered, nothing happened" causes.
    return res.status(200).json({ ok: true, vapidPub: pub });
  } catch (err) {
    // 410 Gone / 404 = subscription expired or invalid
    if (err.statusCode === 410 || err.statusCode === 404) {
      await kv.del(`user:${userId}:pushsub`).catch(() => {});
      return res.status(410).json({ error: 'Subscription expired' });
    }
    console.error('[push/send]', err.statusCode, err.message, typeof err.body === 'string' ? err.body.slice(0, 200) : '');
    return res.status(500).json({
      error: err.message,
      pushStatusCode: err.statusCode || null,
      pushBody: typeof err.body === 'string' ? err.body.slice(0, 300) : null,
      vapidPub: pub,
    });
  }
}
