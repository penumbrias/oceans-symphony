// Client-side wrapper for the Friends API + local identity management.
// Identity (userId, secret) lives in localEntities.FriendIdentity (IDB).
import { localEntities } from "@/api/base44Client";
import { getActivePushSubscription } from "@/lib/pushRegistration";
import { isNative } from "@/lib/platform";
import { markFriendAddedToday } from "@/lib/dailyTaskSystem";
import { getSharedFriendIdentity, setSharedFriendIdentity, clearSharedFriendIdentity } from "@/lib/friendIdentityStore";

// On web/TWA the Friends API lives at /api/friends on the same origin
// the page was served from — relative paths work. On the Capacitor
// native build the WebView is served from a private hostname
// (app.local.oceans-symphony, see capacitor.config.ts) which doesn't
// exist on the public internet, so relative /api/* requests return a
// 404 HTML page → the JSON parser throws "Unexpected token '<', '<!doctype'…".
// On native we point at the production Vercel deployment explicitly.
// Exported so other callers (Friends.jsx's save-push-sub fetch) can
// use the same base without re-implementing the platform check.
// Must be oceans-symphony.app (the canonical production domain),
// NOT .vercel.app — Chrome storage / CORS / cookies are scoped by
// origin and the TWA was wrapping the .app origin, so anything else
// would land us in a different storage scope from web users.
const NATIVE_API_HOST = "https://oceans-symphony.app";
export const FRIENDS_API_BASE = isNative()
  ? `${NATIVE_API_HOST}/api/friends`
  : "/api/friends";

const BASE = FRIENDS_API_BASE;

// ─── Identity ─────────────────────────────────────────────────────────────────

export async function getLocalIdentity() {
  const records = await localEntities.FriendIdentity.list();
  return records[0] || null;
}

// One Friends identity shared across ALL systems (P4). The app-level
// friendIdentityStore is the source of truth. mirrorIdentityToShared() pushes
// the active system's identity up after any change; syncSharedFriendIdentity()
// pulls it back into the active system on each app load so every system uses the
// same identity. (Device-bound — never enters backups.)
async function mirrorIdentityToShared() {
  try {
    const local = await getLocalIdentity();
    if (local) await setSharedFriendIdentity(local);
    else await clearSharedFriendIdentity();
  } catch { /* non-fatal */ }
}

export async function syncSharedFriendIdentity() {
  let shared = null;
  try { shared = await getSharedFriendIdentity(); } catch { shared = null; }
  const local = await getLocalIdentity();
  if (shared && shared.userId) {
    // App-level identity wins — make this system match it. Strip storage-only
    // fields so the local record keeps its own id/timestamps.
    const { id, created_date, updated_date, created_by, ...fields } = shared;
    void id; void created_date; void updated_date; void created_by;
    try {
      if (!local) await localEntities.FriendIdentity.create(fields);
      else if (local.userId !== shared.userId || JSON.stringify({ ...local, id: 0, created_date: 0, updated_date: 0, created_by: 0 }) !== JSON.stringify({ ...shared, id: 0, created_date: 0, updated_date: 0, created_by: 0 })) {
        await localEntities.FriendIdentity.update(local.id, fields);
      }
    } catch { /* non-fatal */ }
  } else if (local && local.userId) {
    // First run after this landed — seed the shared store from this system.
    await setSharedFriendIdentity(local);
  }
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
    // push_only: false — setting up the social profile UPGRADES a push-only
    // identity (one auto-provisioned just for reminder/FCM delivery) into a
    // real Friends identity, under the same stable userId.
    await localEntities.FriendIdentity.update(existing.id, { displayName, systemName, terms, privacyLevel, friendCode, push_only: false });
  } else {
    await localEntities.FriendIdentity.create({ userId, secret, friendCode, displayName, systemName, terms, privacyLevel, push_only: false });
  }
  await mirrorIdentityToShared();

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

// Returns this device's server identity (userId + secret), provisioning a
// neutral PUSH-ONLY one if none exists yet. The durable reminder/FCM relay needs
// a valid identity to key pushes to, but it must NOT require the user to set up
// the social Friends feature. So when the user opts into cloud-backed reminder
// delivery and has no identity, we register a bare profile and mark it
// push_only. Having one exposes nothing — friends are added only by sharing a
// code, and the Friends page treats a push_only identity as "no profile yet" (it
// still shows setup and never runs front-sharing). If the user later sets up
// Friends, registerIdentity upgrades the SAME record (push_only → false), so the
// FCM token / reminder schedule keep working under one stable userId.
//
// Callers must ONLY invoke this once the user has explicitly opted into cloud
// delivery — never silently, so a fully-local user never touches the server.
export async function ensurePushIdentity() {
  const existing = await getLocalIdentity();
  if (existing?.userId && existing?.secret) return existing;

  const res = await fetch(`${BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: '', systemName: '', terms: {}, privacyLevel: 'names' }),
  });
  if (!res.ok) return null;
  const { userId, secret, friendCode } = await res.json();
  if (!userId || !secret) return null;

  const created = await localEntities.FriendIdentity.create({
    userId, secret, friendCode,
    displayName: '', systemName: '', terms: {}, privacyLevel: 'names',
    push_only: true,
  });
  await mirrorIdentityToShared();
  return created;
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
  await clearSharedFriendIdentity();

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
  if (!res.ok) {
    // THROW rather than return an empty list. A transient 5xx / offline blip
    // that still produced an HTTP response would otherwise resolve as a
    // *successful* empty result — and React Query caches it, wiping the friends
    // list the user could see a moment ago until a full app restart (the
    // "friends disappeared on resume" bug). Throwing leaves the query in error
    // state with the last-known-good data intact, and it retries on its own.
    throw new Error(`friends/list failed (${res.status})`);
  }
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
  // Mark the daily-task trigger — a friend request going out counts as
  // "adding a friend" for the user-facing trigger. Accepting an incoming
  // request also fires it (see respondToRequest below).
  markFriendAddedToday();
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
  if (action === 'accept') markFriendAddedToday();
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

  // Register the right push channel server-side so the friend can notify us:
  //   - native (Capacitor): FCM device token via @capacitor/push-notifications
  //   - web / TWA: Web Push subscription (the WebView has no PushManager)
  // Dynamic import of fcmPush avoids a static import cycle (fcmPush imports
  // getLocalIdentity / FRIENDS_API_BASE from this module).
  if (notifyOnChange) {
    if (isNative()) {
      try {
        const { registerFcmPush } = await import("@/lib/fcmPush");
        await registerFcmPush();
      } catch { /* non-fatal — falls back to the 15-min background poll */ }
    } else {
      const sub = await getActivePushSubscription().catch(() => null);
      if (sub) {
        await fetch(`${BASE}/save-push-sub`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: identity.userId, secret: identity.secret, subscription: sub }),
        });
      }
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
  // Never share fronting from a push-only identity (one auto-provisioned solely
  // for cloud reminder / FCM delivery). This is the single chokepoint for all
  // outgoing front data, so it protects every caller (Friends page + the
  // always-mounted useFriendsFrontSync hook).
  if (!identity || identity.push_only) return;

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
// Merge a visibility patch for one friend. Fields (all optional, only the ones
// you pass are changed):
//   hiddenAlterIds: string[]   — front-share: alters to hide from this friend
//   privacyOverride: null | 'names' | 'count_only' | 'hidden'  — front-share level
//   allowedLevelIds: string[]  — member-list share: privacy levels this friend may see
//   shownAlterIds: string[]    — member-list share: force-reveal specific alters
// Merges into the existing entry so front-share and member-share settings don't
// clobber each other; the entry is removed only when everything is empty.
export async function saveFriendVisibility(friendUserId, patch = {}) {
  const existing = await getLocalIdentity();
  if (!existing) return null;

  const perFriendVisibility = { ...(existing.perFriendVisibility || {}) };
  const prev = perFriendVisibility[friendUserId] || {};
  const merged = { ...prev, ...patch };

  const hiddenAlterIds = merged.hiddenAlterIds || [];
  const allowedLevelIds = merged.allowedLevelIds || [];
  const shownAlterIds = merged.shownAlterIds || [];
  const privacyOverride = merged.privacyOverride || null;

  const isEmpty = !hiddenAlterIds.length && !allowedLevelIds.length && !shownAlterIds.length && !privacyOverride;
  if (isEmpty) {
    delete perFriendVisibility[friendUserId];
  } else {
    perFriendVisibility[friendUserId] = { hiddenAlterIds, privacyOverride, allowedLevelIds, shownAlterIds };
  }

  await localEntities.FriendIdentity.update(existing.id, { perFriendVisibility });
  await mirrorIdentityToShared();
  return perFriendVisibility;
}

// Record that the user has compared + confirmed a friend's E2E safety number.
// Stored against the number itself so it auto-invalidates if the friend's key
// (and thus the number) ever changes. Pass null to clear.
export async function setFriendVerified(friendUserId, safetyNumber) {
  const existing = await getLocalIdentity();
  if (!existing) return null;
  const verifiedFriends = { ...(existing.verifiedFriends || {}) };
  if (safetyNumber) verifiedFriends[friendUserId] = safetyNumber;
  else delete verifiedFriends[friendUserId];
  await localEntities.FriendIdentity.update(existing.id, { verifiedFriends });
  await mirrorIdentityToShared();
  return verifiedFriends;
}
