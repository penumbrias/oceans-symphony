// Shared utilities for Friends API endpoints
import { kv } from '@vercel/kv';
import { randomBytes } from 'node:crypto';

export { kv };

export function generateId(bytes = 16) {
  return randomBytes(bytes).toString('hex');
}

export function generateFriendCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const raw = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[raw[i] % chars.length];
  }
  return code;
}

// Returns the profile object or null
export async function getProfile(userId) {
  return kv.get(`user:${userId}`);
}

// Validates that (userId, secret) is a real registered user
export async function validateUser(userId, secret) {
  if (!userId || !secret) return false;
  const profile = await getProfile(userId);
  if (!profile || typeof profile.secret !== 'string') return false;
  return timingSafeEqualStr(profile.secret, String(secret));
}

// Constant-time string compare (secrets are 128-bit random, so remote
// timing is impractical anyway — this is cheap hardening, not a fix).
// Exported so endpoints that already hold the profile in hand (list.js's
// MGET batch, register's returning-user path) can compare without the
// extra KV read validateUser would spend.
export function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Compare against self to keep timing flat, then fail.
    cryptoTimingSafeEqual(ab, ab);
    return false;
  }
  return cryptoTimingSafeEqual(ab, bb);
}
import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';

// Read/write the friends map for a user: { [friendUserId]: { status, addedAt, ... } }
export async function getFriends(userId) {
  return (await kv.get(`user:${userId}:friends`)) || {};
}

export async function setFriends(userId, friends) {
  return kv.set(`user:${userId}:friends`, friends);
}

// Read/write pending incoming requests array
export async function getPending(userId) {
  return (await kv.get(`user:${userId}:pending`)) || [];
}

export async function setPending(userId, pending) {
  return kv.set(`user:${userId}:pending`, pending);
}

// Origins allowed to call /api/*: the production + staging web origins and
// the native app's private WebView origin (capacitor.config.ts hostname).
// Auth is body-borne (not cookies) so this isn't CSRF defence — it stops
// arbitrary web pages from driving the API from a victim's browser, and
// removes the wildcard that made an unauthenticated endpoint trivially
// reachable from anywhere. Extra origins can be added via
// EXTRA_ALLOWED_ORIGINS (comma-separated) without a code change.
const ALLOWED_ORIGINS = new Set([
  'https://oceans-symphony.app',
  'https://www.oceans-symphony.app',
  'https://oceans-symphony.vercel.app',
  'https://app.local.oceans-symphony',
  'capacitor://localhost',
  'http://localhost',
  'http://localhost:5173',
  ...String(process.env.EXTRA_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
]);

// Input caps — every string a user hands the relay is bounded before it
// is stored or echoed to a friend. Not sanitisation (clients render via
// React text nodes); this stops storage bloat and absurd payloads.
export function capStr(v, max, fallback = "") {
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t;
}

export const PRIVACY_LEVELS = new Set(["names", "count_only", "hidden", ""]);
export function capPrivacy(v, fallback = "names") {
  return PRIVACY_LEVELS.has(v) ? (v || fallback) : fallback;
}

// terms is a small map of display words ({ fronter: "driver", … }) — cap
// both breadth and value length so it can't be used as a dumping ground.
export function capTerms(t) {
  if (!t || typeof t !== "object" || Array.isArray(t)) return {};
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(t)) {
    if (n >= 24) break;
    if (typeof v !== "string") continue;
    out[String(k).slice(0, 32)] = v.slice(0, 48);
    n += 1;
  }
  return out;
}

// Bounded fronter list for update-front: entries beyond the cap are
// dropped, and every echoed field is length-capped.
export function capFronters(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 150).map((f) => ({
    ...(f && typeof f === "object" ? f : {}),
    name: capStr(f?.name, 80, ""),
  }));
}

export function cors(res, req) {
  const origin = req?.headers?.origin;
  // Native WebViews and server-to-server calls send no Origin — allow
  // (they can't be driven by a hostile page). A present-but-unlisted
  // origin gets no ACAO header at all, so the browser blocks the read.
  if (!origin || ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
