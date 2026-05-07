// POST /api/friends/notify-toggle
// Body: { myUserId, mySecret, friendUserId, notifyOnChange }
// Toggles the notification preference for a specific friend.
import { validateUser, getFriends, setFriends, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { myUserId, mySecret, friendUserId, notifyOnChange } = req.body || {};

  if (!myUserId || !mySecret || !friendUserId) {
    return res.status(400).json({ error: 'Missing fields.' });
  }

  if (!await validateUser(myUserId, mySecret)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const friends = await getFriends(myUserId);
  if (!friends[friendUserId] || friends[friendUserId].status !== 'approved') {
    return res.status(404).json({ error: 'Friend not found.' });
  }

  friends[friendUserId].notifyOnChange = !!notifyOnChange;
  await setFriends(myUserId, friends);

  // Mirror the preference onto the subject's side so that update-front
  // (which runs under friendUserId) can find who to notify.
  const subjectFriends = await getFriends(friendUserId);
  if (subjectFriends[myUserId]) {
    subjectFriends[myUserId].notifyOnChange = !!notifyOnChange;
    await setFriends(friendUserId, subjectFriends);
  }

  return res.status(200).json({ ok: true });
}
