// POST /api/friends/remove
// Body: { myUserId, mySecret, friendUserId }
import { kv, validateUser, getFriends, setFriends, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { myUserId, mySecret, friendUserId } = req.body || {};

  if (!myUserId || !mySecret || !friendUserId) {
    return res.status(400).json({ error: 'Missing fields.' });
  }

  if (!await validateUser(myUserId, mySecret)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Remove from both sides
  const [myFriends, theirFriends] = await Promise.all([
    getFriends(myUserId),
    getFriends(friendUserId),
  ]);

  delete myFriends[friendUserId];
  delete theirFriends[myUserId];

  await Promise.all([
    setFriends(myUserId, myFriends),
    setFriends(friendUserId, theirFriends),
  ]);

  return res.status(200).json({ ok: true });
}
