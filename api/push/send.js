import webpush from 'web-push';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const mailto = process.env.VAPID_MAILTO || 'mailto:hello@symphony.app';

  if (!pub || !priv) {
    return res.status(503).json({ error: 'Push not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel environment variables.' });
  }

  webpush.setVapidDetails(mailto, pub, priv);

  const { subscription, payload } = req.body || {};

  if (!subscription?.endpoint || !subscription?.keys || !payload) {
    return res.status(400).json({ error: 'Missing subscription or payload' });
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    // Echo the server-side VAPID public key back so the client can
    // compare it against the build-time VITE_VAPID_PUBLIC_KEY. A
    // mismatch between the key the subscription was signed with and
    // the key the server uses to sign the push is one of the most
    // common silent "push delivered, nothing happened" causes.
    return res.status(200).json({ ok: true, vapidPub: pub });
  } catch (err) {
    // 410 Gone / 404 = subscription expired or invalid
    if (err.statusCode === 410 || err.statusCode === 404) {
      return res.status(410).json({ error: 'Subscription expired' });
    }
    console.error('[push/send]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
