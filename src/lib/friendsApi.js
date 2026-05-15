// Client-side wrapper for the Friends API + local identity management.
// Identity (userId, secret) lives in localEntities.FriendIdentity (IDB).
import { localEntities } from "@/api/base44Client";
import { getActivePushSubscription } from "@/lib/pushRegistration";
import { isNative } from "@/lib/platform";

// On web/TWA the Friends API lives at /api/friends on the same origin
// the page was served from — relative paths work. On the Capacitor
// native build the WebView is served from a private hostname
// (app.local.oceans-symphony, see capacitor.config.ts) which doesn't
// exist on the public internet, so relative /api/* requests return a
// 404 HTML page → the JSON parser throws "Unexpected token '<', '<!doctype'…".
// On native we point at the production Vercel deployment explicitly.
// Exported so other callers (Friends.jsx's save-push-sub fetch) can
// use the same base without re-implementing the platform check.
const NATIVE_API_HOST = "https://oceans-symphony.vercel.app";
export const FRIENDS_API_BASE = isNative()
  ? `${NATIVE_API_HOST}/api/friends`
  : "/api/friends";

const BASE = FRIENDS_API_BASE;

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

  // Native-only: seed the background poll runner with the freshly-
  // saved credentials so it can authenticate when WorkManager wakes
  // it up. resetState wipes any stale last-front snapshot left over
  // from a previous profile so the next poll doesn't spam false
  // "front changed" notifications.
  try {
    const { pushIdentityToBackgroundRunner } = await import("@/lib/nativeBackgroundFriendSync");
    await pushIdentityToBackgroundRunner({ resetState: !existing });
  } catch { /* non-fatal on web */ }

  return { userId, secret, friendCode };
}

// Deletes the user's profile on the server AND clears the local identity.
// Friends-list/cache entries on this device are also wiped so the UI
// returns to the no-profile setup screen.
export async function deleteIdentity() {
  const identity = await getLocalIdentity();
  if (!identity) return;

  // Best-effort server delete. If the server is unreachable we still wipe
  // local state — the user has explicitly asked to leave.
  try {
    await fetch(`${BASE}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: identity.userId, secret: identity.secret }),
    });
  } catch {}

  await localEntities.FriendIdentity.delete(identity.id);

  // Native-only: wipe the background runner's stored identity so its
  // periodic poll no-ops instead of hammering the API with the old
  // credentials.
  try {
    const { clearBackgroundRunnerIdentity } = await import("@/lib/nativeBackgroundFriendSync");
    await clearBackgroundRunnerIdentity();
  } catch { /* non-fatal on web */ }
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

// fronters may include an `id` field (local alter ID) used for per-friend filtering;
// it is stripped before being sent to the server.
export async function pushFrontStatus({ fronters, terms, systemName, displayName, privacyLevel }) {
  const identity = await getLocalIdentity();
  if (!identity) return;

  // Compute per-friend fronter overrides from local visibility settings
  const perFriendVisibility = identity.perFriendVisibility || {};
  const perFriendFronters = {};

  for (const [friendId, vis] of Object.entries(perFriendVisibility)) {
    if (!vis) continue;

    if (vis.privacyOverride === 'hidden') {
      perFriendFronters[friendId] = { fronters: [], privacyLevel: 'hidden' };
    } else if (vis.privacyOverride === 'count_only') {
      perFriendFronters[friendId] = {
        fronters: fronters.map(({ id: _, ...rest }) => ({ ...rest, name: '?', initial: '?', color: null })),
        privacyLevel: 'count_only',
      };
    } else {
      // Filter by hidden alter IDs (fronters include local `id` for this purpose)
      const hiddenIds = new Set(vis.hiddenAlterIds || []);
      if (hiddenIds.size > 0) {
        const filtered = fronters.filter(f => !hiddenIds.has(f.id));
        perFriendFronters[friendId] = {
          fronters: filtered.map(({ id: _, ...rest }) => rest),
          privacyLevel: vis.privacyOverride || privacyLevel || identity.privacyLevel || 'names',
        };
      }
    }
  }

  // Strip local IDs from default fronters before sending
  const cleanFronters = fronters.map(({ id: _, ...rest }) => rest);

  await fetch(`${BASE}/update-front`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: identity.userId,
      secret: identity.secret,
      fronters: cleanFronters,
      terms,
      systemName: systemName ?? identity.systemName,
      displayName: displayName ?? identity.displayName,
      privacyLevel: privacyLevel ?? identity.privacyLevel ?? 'names',
      perFriendFronters,
    }),
  }).catch(() => {});  // fire and forget
}

// ─── Per-friend visibility settings ───────────────────────────────────────────

// Save per-friend visibility settings locally.
// hiddenAlterIds: string[] of local alter IDs to hide from this friend
// privacyOverride: null | 'names' | 'count_only' | 'hidden'
export async function saveFriendVisibility(friendUserId, { hiddenAlterIds = [], privacyOverride = null } = {}) {
  const existing = await getLocalIdentity();
  if (!existing) return null;

  const perFriendVisibility = { ...(existing.perFriendVisibility || {}) };

  if (!hiddenAlterIds.length && !privacyOverride) {
    delete perFriendVisibility[friendUserId];
  } else {
    perFriendVisibility[friendUserId] = { hiddenAlterIds, privacyOverride };
  }

  await localEntities.FriendIdentity.update(existing.id, { perFriendVisibility });
  return perFriendVisibility;
}
