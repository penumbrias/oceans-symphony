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
// saw, and showing an IN-APP toast when the timestamp changes AND
// notifyOnChange is true for that friend.
//
// Why a toast and not an OS notification: the native background runner
// (public/runners/friends-poll.js) ALSO polls and fires the OS/tray
// notification when the app is backgrounded. If this foreground hook also
// fired an OS notification, the two paths (which keep separate dedup state
// and can't share it) would buzz the user TWICE for one change. So while the
// app is open we show a lightweight in-app toast; the tray notification is
// owned solely by the background runner — exactly one per change.
//
// Limitations (honest):
//   - The in-app toast only shows while the app is open. Out-of-app
//     (tray) notifications are the background runner's job, which on
//     Android runs on a ~15-minute WorkManager cadence — there's no FCM
//     hookup yet, so truly-closed apps can lag up to that interval.
//   - First poll after app start seeds the baseline and does NOT
//     notify. Otherwise every cold start would buzz the user about
//     every friend that updated since they last opened the app.
//   - State persists in localStorage so we don't re-toast across
//     reloads for the same updatedAt.

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchFriendsList } from "@/lib/friendsApi";
import { isNative } from "@/lib/platform";

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

      // In-app toast (not an OS notification — the background runner owns the
      // tray notification, so firing one here too would double up). Body
      // respects the friend's privacy level — "count only" doesn't name names.
      const body = describeFronters(
        friend.front?.fronters || [],
        friend.front?.privacyLevel || "names"
      );
      toast(`${friend.displayName || "A friend"} updated their front`, { description: body });
    }

    writeLastState(next);
    if (!seededRef.current) seededRef.current = true;
  }, [friendsData]);
}
