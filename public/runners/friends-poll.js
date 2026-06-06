// Background runner — polls the Friends API on a 15-minute timer when
// the Oceans Symphony app is in the background, and fires a local
// notification if any followed friend's front has changed since the
// last poll.
//
// This file runs in an ISOLATED JS context (not the WebView), so:
//   - No imports / module system. Plain script only.
//   - No access to app code, IndexedDB, localStorage, document, etc.
//   - Available globals: fetch, console, setTimeout, addEventListener,
//     CapacitorKV (string key/value store backed by SharedPreferences),
//     CapacitorNotifications (schedule local notifications).
//
// State sharing with the main app:
//   - Identity (userId + secret) is seeded into CapacitorKV by the
//     main app via BackgroundRunner.dispatchEvent('setIdentity', ...)
//     after the user has a Friends profile.
//   - The runner's per-friend "last seen updatedAt" snapshot lives in
//     CapacitorKV under "friend_last_state_v1". The main app's
//     useFriendsFrontNotifications hook uses a separate localStorage
//     key for its own foreground polling — the two don't talk, which
//     is fine: each side just tries not to re-notify against its own
//     snapshot.
//
// Caveats baked in below:
//   - 15-minute minimum interval is an Android WorkManager limit.
//   - Some OEMs (Samsung, Xiaomi) aggressively throttle background
//     tasks unless the user disables battery optimisation for the
//     app. We can't prevent that from JS — best the user can do is
//     toggle it in Android settings.

const KEY_USER_ID = "friend_userId";
const KEY_SECRET = "friend_secret";
const KEY_LAST_STATE = "friend_last_state_v1";
// "1" when the main app has registered for instant FCM push. While set,
// this poll still tracks state but does NOT fire notifications — FCM
// (src/lib/fcmPush.js + /api/friends/update-front) delivers the same
// friend-front changes instantly, so notifying here too would double-buzz.
const KEY_FCM_ACTIVE = "friend_fcm_active";
const API_BASE = "https://oceans-symphony.app/api/friends";
// Mirrors REMINDERS_CHANNEL_ID / SWITCH_CHANNEL_ID over in
// src/lib/nativeNotifications.js — kept in sync manually because this
// file can't import from there. If you rename a channel id in the
// main app, mirror the change here.
const SWITCH_CHANNEL_ID = "reminders-switch";

function describeFronters(fronters, privacyLevel) {
  if (privacyLevel === "count_only") {
    return !fronters || fronters.length === 0
      ? "Their front is now empty"
      : `${fronters.length} fronting`;
  }
  if (!fronters || fronters.length === 0) return "Their front is now empty";
  return "Fronting: " + fronters.map(f => f && f.name).filter(Boolean).join(", ");
}

// Stable positive int31 id derived from the friend userId so re-firing
// for the same friend coalesces in the tray rather than spamming N
// new notifications.
function notificationIdFor(friendUserId) {
  let h = 5381;
  for (let i = 0; i < friendUserId.length; i++) {
    h = ((h << 5) + h + friendUserId.charCodeAt(i)) | 0;
  }
  const positive = Math.abs(h) % 2_000_000_000;
  return positive === 0 ? 1 : positive;
}

// Main scheduled handler. Capacitor invokes this every interval minutes
// while the app is backgrounded. Must call resolve() (or reject()) or
// the OS will kill the runner mid-task.
addEventListener("checkFriends", async (resolve, reject) => {
  try {
    const userId = CapacitorKV.get(KEY_USER_ID);
    const secret = CapacitorKV.get(KEY_SECRET);
    if (!userId || !secret) {
      // No friend identity → nothing to poll.
      resolve();
      return;
    }

    const url = `${API_BASE}/list?userId=${encodeURIComponent(userId)}&secret=${encodeURIComponent(secret)}`;
    const res = await fetch(url);
    if (!res || !res.ok) {
      resolve();
      return;
    }
    const data = await res.json();

    let prevState = {};
    try {
      const raw = CapacitorKV.get(KEY_LAST_STATE);
      if (raw) prevState = JSON.parse(raw);
    } catch (_) { /* ignore */ }

    const nextState = {};
    const toNotify = [];

    const friends = (data && data.friends) || [];
    for (const friend of friends) {
      if (!friend || !friend.userId) continue;
      const key = friend.userId;
      const updatedAt = (friend.front && friend.front.updatedAt) || null;
      nextState[key] = updatedAt;
      if (!friend.notifyOnChange) continue;
      const prevUpdatedAt = prevState[key] || null;
      if (!updatedAt) continue;
      if (updatedAt === prevUpdatedAt) continue;
      // First time we see a friend (no prev entry) is treated as a
      // change — without this, brand-new friends would never trigger
      // a background notification on their first front change.
      toNotify.push({
        friend,
        updatedAt,
      });
    }

    // If instant FCM push is live, FCM already delivered these — keep the
    // snapshot fresh (below) but don't fire a duplicate from the poll.
    let fcmActive = false;
    try { fcmActive = CapacitorKV.get(KEY_FCM_ACTIVE) === "1"; } catch (_) { /* ignore */ }

    if (toNotify.length > 0 && !fcmActive) {
      const notifications = toNotify.map(({ friend }) => ({
        id: notificationIdFor(friend.userId),
        title: `${friend.displayName || "A friend"} updated their front`,
        body: describeFronters(
          (friend.front && friend.front.fronters) || [],
          (friend.front && friend.front.privacyLevel) || "names"
        ),
        channelId: SWITCH_CHANNEL_ID,
      }));
      try { CapacitorNotifications.schedule(notifications); }
      catch (e) { console.log("schedule failed:", e && e.message); }
    }

    try { CapacitorKV.set(KEY_LAST_STATE, JSON.stringify(nextState)); }
    catch (_) { /* ignore — next poll will overwrite */ }

    resolve();
  } catch (e) {
    console.log("checkFriends error:", e && e.message);
    // Resolve rather than reject — rejecting once causes the runner to
    // back off, and a server hiccup shouldn't disable background sync.
    resolve();
  }
});

// Main app pushes credentials in here after registering / updating
// the friend identity. We also reset the last-state snapshot so the
// next poll doesn't immediately notify based on stale comparisons.
addEventListener("setIdentity", (resolve, reject, args) => {
  try {
    if (args && args.userId && args.secret) {
      CapacitorKV.set(KEY_USER_ID, String(args.userId));
      CapacitorKV.set(KEY_SECRET, String(args.secret));
    }
    if (args && args.resetState) {
      try { CapacitorKV.remove(KEY_LAST_STATE); }
      catch (_) { /* ignore */ }
    }
    resolve();
  } catch (e) {
    reject(e && e.message ? e.message : "setIdentity_failed");
  }
});

// Main app flips this when FCM push registration succeeds (true) or
// fails / is turned off (false). While "1", checkFriends tracks state
// but suppresses its own notifications so FCM is the sole delivery path.
addEventListener("setFcmActive", (resolve, reject, args) => {
  try {
    CapacitorKV.set(KEY_FCM_ACTIVE, args && args.active ? "1" : "0");
    resolve();
  } catch (e) {
    reject(e && e.message ? e.message : "setFcmActive_failed");
  }
});

// Called when the user deletes their friend profile / wipes data —
// clears everything we know about so the periodic task no-ops.
addEventListener("clearIdentity", (resolve) => {
  try { CapacitorKV.remove(KEY_USER_ID); } catch (_) {}
  try { CapacitorKV.remove(KEY_SECRET); } catch (_) {}
  try { CapacitorKV.remove(KEY_LAST_STATE); } catch (_) {}
  try { CapacitorKV.remove(KEY_FCM_ACTIVE); } catch (_) {}
  resolve();
});
