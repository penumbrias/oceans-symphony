// Native-only fallback for friend-front-change push notifications.
//
// On web/TWA, the Friends backend pushes a Web Push payload to the
// user's browser whenever a friend's front updates and that user has
// `notify_on_change` toggled on for them. That whole pipeline relies
// on the browser's PushManager, which the Capacitor WebView doesn't
// expose — so on native, the server's pushes go nowhere and the user
// never hears about updates.
//
// This hook closes the gap by polling the same /api/friends/list
// endpoint client-side every 30 seconds while the app is open,
// comparing each friend's front.updatedAt against the last value we
// saw, and firing a @capacitor/local-notifications notification when
// the timestamp changes AND notifyOnChange is true for that friend.
//
// Limitations (honest):
//   - Only fires while the app process is alive (foreground or recent
//     background). Truly-closed Android kills the polling — there's
//     no FCM hookup yet, so swiped-away apps go quiet.
//   - First poll after app start seeds the baseline and does NOT
//     notify. Otherwise every cold start would buzz the user about
//     every friend that updated since they last opened the app, which
//     is noisy after a long absence.
//   - State persists in localStorage so we don't re-notify across
//     reloads for the same updatedAt.

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchFriendsList } from "@/lib/friendsApi";
import { isNative } from "@/lib/platform";
import { sendNativeNotification } from "@/lib/nativeNotifications";

const STATE_KEY = "symphony_friends_last_front_state_v1";
const POLL_MS = 30 * 1000;

function readLastState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || "{}"); }
  catch { return {}; }
}

function writeLastState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); }
  catch { /* quota / disabled */ }
}

function describeFronters(fronters, privacyLevel) {
  if (privacyLevel === "count_only") {
    return fronters.length === 0
      ? "Their front is now empty"
      : `${fronters.length} fronting`;
  }
  if (!fronters || fronters.length === 0) return "Their front is now empty";
  return `Fronting: ${fronters.map(f => f.name).filter(Boolean).join(", ")}`;
}

export function useFriendsFrontChangeNotifications() {
  // Tracks whether we've completed the baseline poll. The very first
  // poll after a fresh load just records state — we don't notify the
  // user about every friend that moved since they last opened the
  // app.
  const seededRef = useRef(false);

  const { data: friendsData } = useQuery({
    // Distinct key from the Friends page's own useQuery — we don't
    // want to interfere with its 10-second polling cadence when both
    // are mounted. React Query shares the request economically; the
    // dedupe makes the extra subscription nearly free.
    queryKey: ["friendsListForNotifications"],
    queryFn: fetchFriendsList,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    // Only run on native. On web/TWA the server's Web Push handles
    // this and we'd duplicate every notification.
    enabled: isNative(),
  });

  useEffect(() => {
    if (!isNative()) return;
    if (!friendsData?.friends) return;

    const prev = readLastState();
    const next = {};

    for (const friend of friendsData.friends) {
      const key = friend.userId;
      const updatedAt = friend.front?.updatedAt || null;
      next[key] = { updatedAt };

      // Baseline pass — record but never notify.
      if (!seededRef.current) continue;

      const prevUpdatedAt = prev[key]?.updatedAt || null;
      if (updatedAt === prevUpdatedAt) continue;
      if (!friend.notifyOnChange) continue;

      // Fire local notification mirroring what Web Push would have
      // delivered on web. Body respects the friend's privacy level
      // — if they're showing "count only" we don't name names.
      const body = describeFronters(
        friend.front?.fronters || [],
        friend.front?.privacyLevel || "names"
      );
      sendNativeNotification({
        title: `${friend.displayName || "A friend"} updated their front`,
        body,
      }).catch(() => { /* non-fatal */ });
    }

    writeLastState(next);
    if (!seededRef.current) seededRef.current = true;
  }, [friendsData]);
}
