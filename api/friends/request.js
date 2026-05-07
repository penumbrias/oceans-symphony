// POST /api/friends/request
// Body: { fromUserId, fromSecret, toCode, fromDisplayName, fromSystemName }
// Sends a friend request to the owner of toCode.
import { kv, validateUser, getProfile, getFriends, getPending, setPending, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { fromUserId, fromSecret, toCode, fromDisplayName, fromSystemName } = req.body || {};

  if (!fromUserId || !fromSecret || !toCode) {
    return res.status(400).json({ error: 'Missing fields.' });
  }

  if (!await validateUser(fromUserId, fromSecret)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Resolve the friend code to a userId
  const toUserId = await kv.get(`code:${toCode.toUpperCase().replace(/\s/g, '')}`);
  if (!toUserId) {
    return res.status(404).json({ error: 'Friend code not found.' });
  }
  if (toUserId === fromUserId) {
    return res.status(400).json({ error: 'Cannot add yourself.' });
  }

  // Check not already friends or pending
  const existingFriends = await getFriends(toUserId);
  if (existingFriends[fromUserId]) {
    const status = existingFriends[fromUserId].status;
    if (status === 'approved') return res.status(409).json({ error: 'Already friends.' });
    if (status === 'pending_received') return res.status(409).json({ error: 'Request already sent.' });
  }

  // Add to target's pending requests
  const pending = await getPending(toUserId);
  const alreadyPending = pending.some(r => r.fromUserId === fromUserId);
  if (alreadyPending) return res.status(409).json({ error: 'Request already sent.' });

  pending.push({
    fromUserId,
    fromDisplayName: fromDisplayName || 'Someone',
    fromSystemName: fromSystemName || '',
    requestedAt: new Date().toISOString(),
  });
  await setPending(toUserId, pending);

  // Also record on sender side as pending_sent
  const senderFriends = await getFriends(fromUserId);
  senderFriends[toUserId] = { status: 'pending_sent', addedAt: new Date().toISOString(), notifyOnChange: false };
  await kv.set(`user:${fromUserId}:friends`, senderFriends);

  return res.status(200).json({ ok: true, toUserId });
}
