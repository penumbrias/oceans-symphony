// GET /api/reminders/dispatch  — invoked every minute by Vercel Cron
// (see vercel.json `crons`). Pops every reminder whose fire time has
// arrived and pushes it to the owning user's device via FCM (native) and
// Web Push (browser/TWA), then removes it so it can't re-fire.
//
// This is what makes reminders survive the app being fully closed /
// swiped away: the SERVER holds the clock and initiates the push, exactly
// like the friend-front-change pipeline — OS alarms (which Android cancels
// on force-stop) are no longer the only delivery path.
import { kv } from '../_kv.js';

const DUE_ZSET = 'reminders:due';

export default async function handler(req, res) {
  // Cron auth: when CRON_SECRET is set, Vercel Cron sends it as a Bearer
  // token. Require it so the endpoint can't be triggered by randoms.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.KV_REST_API_URL) return res.status(503).json({ error: 'Not configured.' });

  const now = Date.now();
  let due = [];
  try {
    // Members with score (fire time) at or before now.
    due = await kv.zrange(DUE_ZSET, 0, now, { byScore: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'zrange failed' });
  }
  if (!Array.isArray(due) || due.length === 0) return res.status(200).json({ ok: true, sent: 0 });
  due = due.slice(0, 200); // cap per run to stay well within the function timeout

  // ── Transport setup (mirror of /api/friends/update-front) ──
  let webpush = null;
  const vapidPub = process.env.VAPID_PUBLIC_KEY;
  const vapidPriv = process.env.VAPID_PRIVATE_KEY;
  const mailto = process.env.VAPID_MAILTO || 'mailto:hello@symphony.app';
  if (vapidPub && vapidPriv) {
    try { webpush = (await import('web-push')).default; webpush.setVapidDetails(mailto, vapidPub, vapidPriv); }
    catch { webpush = null; }
  }
  let messaging = null;
  const svcRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (svcRaw) {
    try {
      const { initializeApp, getApps, cert } = await import('firebase-admin/app');
      const { getMessaging } = await import('firebase-admin/messaging');
      let svc = null;
      try { svc = JSON.parse(svcRaw); } catch { svc = null; }
      if (svc) { if (!getApps().length) initializeApp({ credential: cert(svc) }); messaging = getMessaging(); }
    } catch { messaging = null; }
  }

  let sent = 0;
  const firedMembers = [];
  await Promise.allSettled(due.map(async (member) => {
    firedMembers.push(member); // remove regardless of send outcome so it can't loop
    const [userId, reminderId] = String(member).split('|');
    if (!userId || !reminderId) return;

    const content = (await kv.get(`reminder:content:${userId}:${reminderId}`)) || {};
    const title = content.title || 'Reminder';
    const body = content.body || '';
    const vibrate = content.vibrate !== false;
    const tag = `reminder-${reminderId}`;

    // Web Push (browser / TWA)
    if (webpush) {
      const sub = await kv.get(`user:${userId}:pushsub`);
      if (sub) {
        try {
          await webpush.sendNotification(sub, JSON.stringify({
            title, body, tag, url: '/reminders',
            vibrate: vibrate ? [200, 100, 200] : undefined,
          }));
        } catch (e) {
          if (e.statusCode === 410 || e.statusCode === 404) await kv.del(`user:${userId}:pushsub`);
        }
      }
    }

    // FCM (native Android)
    if (messaging) {
      const token = await kv.get(`user:${userId}:fcmtoken`);
      if (token) {
        try {
          await messaging.send({
            token,
            notification: { title, body },
            android: {
              priority: 'high',
              notification: {
                // reminders-default = the high-importance channel the native
                // app creates (sound + vibration + heads-up). reminders-switch
                // is the quiet channel used for ambient friend-front pings.
                channelId: vibrate ? 'reminders-default' : 'reminders-switch',
                tag,
              },
            },
            data: { kind: 'reminder', reminderId: String(reminderId), url: '/reminders' },
          });
        } catch (e) {
          const code = (e && (e.errorInfo?.code || e.code)) || '';
          if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
            await kv.del(`user:${userId}:fcmtoken`);
          }
        }
      }
    }
    sent += 1;
  }));

  if (firedMembers.length) {
    try { await kv.zrem(DUE_ZSET, ...firedMembers); } catch { /* non-fatal — next run retries */ }
  }
  return res.status(200).json({ ok: true, sent });
}
