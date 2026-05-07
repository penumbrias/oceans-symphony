// Client-side wrapper for the Friends API + local identity management.
// Identity (userId, secret) lives in localEntities.FriendIdentity (IDB).
import { localEntities } from "@/api/base44Client";
import { getActivePushSubscription } from "@/lib/pushRegistration";

const BASE = '/api/friends';

// ─── Identity ─────────────────────────────────────────────────────────────────

export async function getLocalIdentity() {
  const records = await localEntities.FriendIdentity.list();
  return records[0] || null;
}

export async function registerIdentity({ displayName, systemName, terms, privacyLevel }) {
  const existing = await getLocalIdentity();

  const body = { displayName, systemName, terms, privacyLevel };
  if (existing) {
    body.userId = existing.userId;
    body.secret = existing.secret;
  }

  const res = await fetch(`${BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Registration failed.');
  }

  const { userId, secret, friendCode } = await res.json();

  if (existing) {
    await localEntities.FriendIdentity.update(existing.id, { displayName, systemName, terms, privacyLevel, friendCode });
  } else {
    await localEntities.FriendIdentity.create({ userId, secret, friendCode, displayName, systemName, terms, privacyLevel });
  }

  return { userId, secret, friendCode };
}

// ─── Friend list & pending ─────────────────────────────────────────────────────

export async function fetchFriendsList() {
  const identity = await getLocalIdentity();
  if (!identity) return { friends: [], pending: [], pendingSent: [] };

  const res = await fetch(`${BASE}/list?userId=${identity.userId}&secret=${identity.secret}`);
  if (!res.ok) return { friends: [], pending: [], pendingSent: [] };
  return res.json();
}

// ─── Front status (single friend poll) ────────────────────────────────────────

export async function fetchFriendStatus(friendUserId) {
  const identity = await getLocalIdentity();
  if (!identity) return null;

  const res = await fetch(
    `${BASE}/status?userId=${friendUserId}&viewerUserId=${identity.userId}&viewerSecret=${identity.secret}`
  );
  if (!res.ok) return null;
  return res.json();
}

// ─── Add / remove ─────────────────────────────────────────────────────────────

export async function sendFriendRequest(code) {
  const identity = await getLocalIdentity();
  if (!identity) throw new Error('Set up your Friends profile first.');

  const res = await fetch(`${BASE}/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromUserId: identity.userId,
      fromSecret: identity.secret,
      toCode: code,
      fromDisplayName: identity.displayName,
      fromSystemName: identity.systemName,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export async function respondToRequest(fromUserId, action) {
  const identity = await getLocalIdentity();
  if (!identity) throw new Error('Not registered.');

  const res = await fetch(`${BASE}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      myUserId: identity.userId,
      mySecret: identity.secret,
      fromUserId,
      action,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed.');
}

export async function removeFriend(friendUserId) {
  const identity = await getLocalIdentity();
  if (!identity) return;

  await fetch(`${BASE}/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      myUserId: identity.userId,
      mySecret: identity.secret,
      friendUserId,
    }),
  });
}

export async function toggleNotify(friendUserId, notifyOnChange) {
  const identity = await getLocalIdentity();
  if (!identity) return;

  // Save push sub server-side so the friend can notify us
  if (notifyOnChange) {
    const sub = await getActivePushSubscription().catch(() => null);
    if (sub) {
      await fetch(`${BASE}/save-push-sub`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: identity.userId, secret: identity.secret, subscription: sub }),
      });
    }
  }

  await fetch(`${BASE}/notify-toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      myUserId: identity.userId,
      mySecret: identity.secret,
      friendUserId,
      notifyOnChange,
    }),
  });
}

// ─── Push own front status to server ──────────────────────────────────────────

export async function pushFrontStatus({ fronters, terms, systemName, displayName, privacyLevel }) {
  const identity = await getLocalIdentity();
  if (!identity) return;

  await fetch(`${BASE}/update-front`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: identity.userId,
      secret: identity.secret,
      fronters,
      terms,
      systemName: systemName ?? identity.systemName,
      displayName: displayName ?? identity.displayName,
      privacyLevel: privacyLevel ?? identity.privacyLevel ?? 'names',
    }),
  }).catch(() => {});  // fire and forget
}
