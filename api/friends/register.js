// POST /api/friends/register
// Body: { userId?, secret?, displayName, systemName, terms, privacyLevel }
// Creates or updates a user profile. Returns { userId, secret, friendCode }.
import { kv, generateId, generateFriendCode, getProfile, cors, timingSafeEqualStr, capStr, capTerms, capPrivacy } from '../_kv.js';

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ error: 'Friends feature not configured. Add an Upstash Redis integration to your project.' });
  }

  const { userId, secret, displayName, systemName, terms, privacyLevel } = req.body || {};

  // Returning user — update profile
  if (userId && secret) {
    const existing = await getProfile(userId);
    // Timing-safe, same as validateUser — this path used a plain ===.
    if (existing && typeof existing.secret === 'string' && timingSafeEqualStr(existing.secret, String(secret))) {
      const updated = {
        ...existing,
        displayName: displayName !== undefined ? capStr(displayName, 60, existing.displayName) : existing.displayName,
        systemName: systemName !== undefined ? capStr(systemName, 60, existing.systemName) : existing.systemName,
        terms: terms !== undefined ? capTerms(terms) : existing.terms,
        privacyLevel: privacyLevel !== undefined ? capPrivacy(privacyLevel) : existing.privacyLevel,
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
  // Friend codes are random in a ~10^12 space, but an unconditional
  // `code:` write on a collision would hijack another user's code — check
  // and re-roll instead (5 tries is astronomically more than enough).
  let friendCode = null;
  for (let i = 0; i < 5 && !friendCode; i++) {
    const candidate = generateFriendCode();
    if (!(await kv.get(`code:${candidate}`))) friendCode = candidate;
  }
  if (!friendCode) return res.status(503).json({ error: 'Try again.' });

  const profile = {
    userId: newUserId,
    secret: newSecret,
    friendCode,
    displayName: capStr(displayName, 60, 'A friend') || 'A friend',
    systemName: capStr(systemName, 60, ''),
    terms: capTerms(terms),
    privacyLevel: capPrivacy(privacyLevel),
    registeredAt: new Date().toISOString(),
  };

  await kv.set(`user:${newUserId}`, profile);
  await kv.set(`code:${friendCode}`, newUserId);

  return res.status(200).json({ userId: newUserId, secret: newSecret, friendCode });
}
