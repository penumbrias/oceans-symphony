// POST /api/friends/register
// Body: { userId?, secret?, displayName, systemName, terms, privacyLevel }
// Creates or updates a user profile. Returns { userId, secret, friendCode }.
import { kv, generateId, generateFriendCode, getProfile, cors } from '../_kv.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Friends feature not configured. Add a Vercel KV store to your project.' });
  }

  const { userId, secret, displayName, systemName, terms, privacyLevel } = req.body || {};

  // Returning user — update profile
  if (userId && secret) {
    const existing = await getProfile(userId);
    if (existing && existing.secret === secret) {
      const updated = {
        ...existing,
        displayName: displayName ?? existing.displayName,
        systemName: systemName ?? existing.systemName,
        terms: terms ?? existing.terms,
        privacyLevel: privacyLevel ?? existing.privacyLevel,
        updatedAt: new Date().toISOString(),
      };
      await kv.set(`user:${userId}`, updated);
      return res.status(200).json({ userId, secret, friendCode: existing.friendCode });
    }
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // New registration
  const newUserId = generateId(16);
  const newSecret = generateId(24);
  const friendCode = generateFriendCode();

  const profile = {
    userId: newUserId,
    secret: newSecret,
    friendCode,
    displayName: displayName || 'A friend',
    systemName: systemName || '',
    terms: terms || {},
    privacyLevel: privacyLevel || 'names',
    registeredAt: new Date().toISOString(),
  };

  await kv.set(`user:${newUserId}`, profile);
  await kv.set(`code:${friendCode}`, newUserId);

  return res.status(200).json({ userId: newUserId, secret: newSecret, friendCode });
}
