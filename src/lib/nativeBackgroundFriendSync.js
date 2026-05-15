// Main-thread bridge for the friends background runner (see
// public/runners/friends-poll.js). The runner needs the user's friend
// identity (userId + secret) to authenticate against the API, but it
// runs in an isolated JS context with no access to our IndexedDB.
// We seed it via BackgroundRunner.dispatchEvent — the runner's
// setIdentity handler writes the values into CapacitorKV, which the
// scheduled checkFriends handler reads on each run.
//
// Web/TWA paths: no-op. There's no runner there, and Web Push handles
// the equivalent on those targets.

import { isNative } from "@/lib/platform";
import { getLocalIdentity } from "@/lib/friendsApi";

const RUNNER_LABEL = "app.oceans_symphony.twa.friends";

async function dispatchRunnerEvent(event, details) {
  if (!isNative()) return false;
  try {
    const { BackgroundRunner } = await import("@capacitor/background-runner");
    await BackgroundRunner.dispatchEvent({
      label: RUNNER_LABEL,
      event,
      details: details || {},
    });
    return true;
  } catch (e) {
    console.warn("[nativeBackgroundFriendSync] dispatch failed:", e?.message || e);
    return false;
  }
}

// Push the current local identity into the runner. Safe to call
// repeatedly — the runner just overwrites its stored credentials.
// `resetState`: when true, the runner clears its last-known friend
// front snapshot so the next poll doesn't fire stale comparisons
// (useful right after the user creates a fresh profile).
export async function pushIdentityToBackgroundRunner({ resetState = false } = {}) {
  if (!isNative()) return false;
  const identity = await getLocalIdentity().catch(() => null);
  if (!identity?.userId || !identity?.secret) return false;
  return dispatchRunnerEvent("setIdentity", {
    userId: identity.userId,
    secret: identity.secret,
    resetState,
  });
}

// Wipe the runner's stored identity + snapshot. Call from the
// "delete friend profile" / "reset app" flows so the background
// poller no-ops instead of carrying old credentials forward.
export async function clearBackgroundRunnerIdentity() {
  if (!isNative()) return false;
  return dispatchRunnerEvent("clearIdentity", {});
}
