// Receiver-side sanitation for friend-server data.
//
// Everything that arrives from the Friends API is UNTRUSTED — a modified
// client (or, once self-hosted servers ship, a hostile server operator) can
// send anything, regardless of what our own client strips before sending.
// These helpers run at the fetch boundary (friendsApi / friendsShare) so no
// render site ever sees a raw remote string:
//
// - Colors flow into inline `style` props; a crafted value like
//   `url(https://…)` on a background property is a tracking beacon. Only
//   plain color syntaxes survive.
// - Names/labels flow into toasts, OS notifications and list rows; control
//   characters and bidi-override characters can spoof or mangle that text,
//   and unbounded strings are a layout/storage abuse. Text is stripped,
//   trimmed and capped.
//
// All helpers are total: bad input yields a safe fallback, never a throw.

// Plain CSS color syntaxes only: #hex(3/4/6/8), rgb()/rgba(), hsl()/hsla()
// with numeric-ish innards, or a short alphabetic keyword (e.g. "teal").
// No url(), no var(), no gradients, no functions beyond the color ones.
const HEX_RE = /^#[0-9a-f]{3,8}$/i;
const FUNC_RE = /^(rgb|rgba|hsl|hsla)\(\s*[\d.,%\s/-]+\)$/i;
const KEYWORD_RE = /^[a-z]{3,20}$/i;

export function safeCssColor(value, fallback = null) {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (v.length === 0 || v.length > 40) return fallback;
  if (HEX_RE.test(v) || FUNC_RE.test(v) || KEYWORD_RE.test(v)) return v;
  return fallback;
}

// Strip C0/C1 control characters and Unicode bidi-override/formatting marks
// (U+202A–202E explicit overrides, U+2066–2069 isolates, U+200E/200F marks),
// collapse leading/trailing whitespace, and cap the length.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\u200E\u200F]/g;

export function sanitizeRemoteText(value, maxLen = 120) {
  if (value == null) return "";
  const s = String(value).replace(CONTROL_RE, "").trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

// A friend's front blob: { fronters:[{name,initial,color,isPrimary,isCofronter}],
// terms, systemName, displayName, privacyLevel, updatedAt }. Sanitizes in
// place-ish (returns a new object, unknown fields preserved).
export function sanitizeFrontBlob(front) {
  if (!front || typeof front !== "object") return front;
  const out = { ...front };
  if (typeof out.systemName !== "undefined") out.systemName = sanitizeRemoteText(out.systemName, 80);
  if (typeof out.displayName !== "undefined") out.displayName = sanitizeRemoteText(out.displayName, 80);
  if (Array.isArray(out.fronters)) {
    out.fronters = out.fronters.slice(0, 100).map((f) => {
      if (!f || typeof f !== "object") return f;
      return {
        ...f,
        name: sanitizeRemoteText(f.name, 80),
        initial: sanitizeRemoteText(f.initial, 4),
        color: safeCssColor(f.color),
      };
    });
  }
  if (out.terms && typeof out.terms === "object") {
    const terms = {};
    for (const [k, v] of Object.entries(out.terms)) {
      terms[k] = sanitizeRemoteText(v, 40);
    }
    out.terms = terms;
  }
  return out;
}

// One entry from the friends list (friend / pending / pendingSent rows).
export function sanitizeFriendEntry(entry) {
  if (!entry || typeof entry !== "object") return entry;
  const out = { ...entry };
  for (const k of ["displayName", "systemName", "fromDisplayName", "fromSystemName", "name"]) {
    if (typeof out[k] !== "undefined") out[k] = sanitizeRemoteText(out[k], 80);
  }
  if (out.front) out.front = sanitizeFrontBlob(out.front);
  return out;
}

export function sanitizeFriendsListResponse(json) {
  if (!json || typeof json !== "object") return json;
  const out = { ...json };
  for (const k of ["friends", "pending", "pendingSent"]) {
    if (Array.isArray(out[k])) out[k] = out[k].map(sanitizeFriendEntry);
  }
  return out;
}

// A member object a friend shared (decrypted client-side): our client strips
// HTML before sending, but the RECEIVER must not rely on that.
export function sanitizeSharedMember(m) {
  if (!m || typeof m !== "object") return m;
  return {
    ...m,
    name: sanitizeRemoteText(m.name, 80),
    pronouns: sanitizeRemoteText(m.pronouns, 60),
    role: sanitizeRemoteText(m.role, 80),
    age: sanitizeRemoteText(m.age, 30),
    color: safeCssColor(m.color),
    bio: sanitizeRemoteText(m.bio, 2000),
    groups: Array.isArray(m.groups) ? m.groups.slice(0, 50).map((g) => sanitizeRemoteText(g, 80)) : m.groups,
    customFields: Array.isArray(m.customFields)
      ? m.customFields.slice(0, 50).map((cf) =>
          cf && typeof cf === "object"
            ? { ...cf, name: sanitizeRemoteText(cf.name, 80), value: sanitizeRemoteText(cf.value, 500) }
            : cf
        )
      : m.customFields,
  };
}
