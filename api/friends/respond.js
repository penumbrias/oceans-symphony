// POST /api/friends/respond
// Body: { myUserId, mySecret, fromUserId, action: "approve"|"deny" }
// Approves or denies a pending friend request.
import { kv, validateUser, getFriends, setFriends, getPending, setPending, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { myUserId, mySecret, fromUserId, action } = req.body || {};

  if (!myUserId || !mySecret || !fromUserId || !['approve', 'deny'].includes(action)) {
    return res.status(400).json({ error: 'Missing or invalid fields.' });
  }

  if (!await validateUser(myUserId, mySecret)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Remove from pending
  const pending = await getPending(myUserId);
  const req_ = pending.find(r => r.fromUserId === fromUserId);
  if (!req_) return res.status(404).json({ error: 'Request not found.' });

  const newPending = pending.filter(r => r.fromUserId !== fromUserId);
  await setPending(myUserId, newPending);

  if (action === 'deny') {
    // Also clean up sender's pending_sent
    const senderFriends = await getFriends(fromUserId);
    delete senderFriends[myUserId];
    await setFriends(fromUserId, senderFriends);
    return res.status(200).json({ ok: true });
  }

  // Approve — update both sides
  const now = new Date().toISOString();

  const myFriends = await getFriends(myUserId);
  myFriends[fromUserId] = { status: 'approved', addedAt: now, notifyOnChange: false };
  await setFriends(myUserId, myFriends);

  const theirFriends = await getFriends(fromUserId);
  theirFriends[myUserId] = { status: 'approved', addedAt: now, notifyOnChange: false };
  await setFriends(fromUserId, theirFriends);

  return res.status(200).json({ ok: true });
}
