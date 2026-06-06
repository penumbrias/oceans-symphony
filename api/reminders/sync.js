// POST /api/reminders/sync
// Body: { userId, secret, includeText, reminders: [{ reminderId, title, body, vibrate, fires: [ISO,...] }] }
//
// Stores this user's UPCOMING reminder fire-times in a sorted set keyed by
// fire time. A per-minute cron (/api/reminders/dispatch) pops the due ones
// and pushes them via FCM / Web Push — so reminders fire even when the app
// is fully closed or swiped away, which OS alarms can't survive.
//
// Privacy: when includeText is false, the title/body are NOT stored server-
// side — the push is generic ("You have a reminder") and the app fills in
// detail on open. The user controls this via a Settings toggle.
import { kv, validateUser, cors } from '../_kv.js';

const DUE_ZSET = 'reminders:due';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { userId, secret, reminders = [], includeText = true } = req.body || {};
  if (!userId || !secret) return res.status(400).json({ error: 'Missing fields.' });
  if (!await validateUser(userId, secret)) return res.status(401).json({ error: 'Invalid credentials.' });

  const indexKey = `reminders:index:${userId}`;

  // Wipe this user's PREVIOUS schedule so edits / deletions propagate (we
  // never want a stale fire to keep going off). The index is the list of
  // ZSET members we last wrote for this user.
  const prevMembers = (await kv.get(indexKey)) || [];
  if (Array.isArray(prevMembers) && prevMembers.length) {
    try { await kv.zrem(DUE_ZSET, ...prevMembers); } catch { /* non-fatal */ }
    const prevReminderIds = new Set(prevMembers.map((m) => String(m).split('|')[1]).filter(Boolean));
    for (const rid of prevReminderIds) {
      try { await kv.del(`reminder:content:${userId}:${rid}`); } catch { /* non-fatal */ }
    }
  }

  // Write the new schedule.
  const newMembers = [];
  const zaddItems = [];
  const contentOps = [];
  for (const r of reminders) {
    if (!r || !r.reminderId || !Array.isArray(r.fires)) continue;
    contentOps.push(kv.set(`reminder:content:${userId}:${r.reminderId}`, {
      title: includeText ? (r.title || 'Reminder') : '',
      body: includeText ? (r.body || '') : '',
      vibrate: r.vibrate !== false,
    }));
    for (const fireISO of r.fires) {
      const ms = new Date(fireISO).getTime();
      if (!ms || Number.isNaN(ms)) continue;
      const member = `${userId}|${r.reminderId}|${fireISO}`;
      newMembers.push(member);
      zaddItems.push({ score: ms, member });
    }
  }

  await Promise.all(contentOps);
  if (zaddItems.length) {
    try { await kv.zadd(DUE_ZSET, ...zaddItems); } catch (e) {
      return res.status(500).json({ error: e?.message || 'zadd failed' });
    }
  }
  await kv.set(indexKey, newMembers);

  return res.status(200).json({ ok: true, scheduled: newMembers.length });
}
