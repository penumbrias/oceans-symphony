// GET /api/friends/status?userId=X&viewerUserId=Y&viewerSecret=Z
// Returns front status of userId if viewerUserId is an approved friend.
import { kv, getProfile, getFriends, validateUser, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Not configured.' });
  }

  const { userId, viewerUserId, viewerSecret } = req.query;

  if (!userId || !viewerUserId || !viewerSecret) {
    return res.status(400).json({ error: 'Missing parameters.' });
  }

  // Authenticate viewer
  if (!await validateUser(viewerUserId, viewerSecret)) {
    return res.status(401).json({ error: 'Invalid viewer credentials.' });
  }

  // Check that viewerUserId is an approved friend of userId
  const ownerFriends = await getFriends(userId);
  const relationship = ownerFriends[viewerUserId];
  if (!relationship || relationship.status !== 'approved') {
    return res.status(403).json({ error: 'Not friends.' });
  }

  const [frontData, profile] = await Promise.all([
    kv.get(`user:${userId}:front`),
    getProfile(userId),
  ]);

  if (!frontData) {
    return res.status(200).json({
      fronters: [],
      terms: profile?.terms || {},
      systemName: profile?.systemName || '',
      displayName: profile?.displayName || 'A friend',
      privacyLevel: profile?.privacyLevel || 'names',
      updatedAt: null,
    });
  }

  // Apply privacy level
  let fronters = frontData.fronters || [];
  if (frontData.privacyLevel === 'count_only') {
    fronters = fronters.map(() => ({ name: '?', initial: '?', color: null, isPrimary: false }));
  } else if (frontData.privacyLevel === 'hidden') {
    fronters = [];
  }

  return res.status(200).json({
    fronters,
    terms: frontData.terms || {},
    systemName: frontData.systemName || profile?.systemName || '',
    displayName: frontData.displayName || profile?.displayName || 'A friend',
    privacyLevel: frontData.privacyLevel || 'names',
    updatedAt: frontData.updatedAt,
  });
}
