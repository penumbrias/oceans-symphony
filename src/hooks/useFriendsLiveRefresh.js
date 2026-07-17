import { useEffect } from "react";
import { queryClientInstance } from "@/lib/query-client";

// A friend's front-change push can arrive while the app is open on ANY page.
// The Friends page has its own push→refetch listener, but it only runs while
// that page is mounted — so a push received on the dashboard (or anywhere else)
// left the friends data stale until the next resume-invalidate or a manual
// visit. This app-wide listener invalidates the friends queries the moment a
// push signal arrives, so the list is fresh the instant the user looks at it.
//
// Complements useRefreshOnResume (which covers focus / visibility / native
// resume): this one covers the push-while-foregrounded case. Throttled so a
// burst of pushes doesn't thrash the network.
let lastRefresh = 0;
const MIN_INTERVAL_MS = 5000;

function refreshFriends() {
  const now = Date.now();
  if (now - lastRefresh < MIN_INTERVAL_MS) return;
  lastRefresh = now;
  try {
    queryClientInstance.invalidateQueries({ queryKey: ["friendsList"] });
    queryClientInstance.invalidateQueries({ queryKey: ["friendsListForNotifications"] });
  } catch { /* noop */ }
}

export default function useFriendsLiveRefresh() {
  useEffect(() => {
    // Web Push (browser / TWA): the service worker posts { type: 'push-received' }
    // to all clients on every push (see public/sw.js).
    const onSwMsg = (e) => { if (e?.data?.type === "push-received") refreshFriends(); };
    try { navigator.serviceWorker?.addEventListener("message", onSwMsg); } catch { /* no SW */ }
    // Native (Capacitor): fcmPush.js dispatches this on a foreground FCM message.
    window.addEventListener("fcm-front-change", refreshFriends);
    return () => {
      try { navigator.serviceWorker?.removeEventListener("message", onSwMsg); } catch { /* */ }
      window.removeEventListener("fcm-front-change", refreshFriends);
    };
  }, []);
}
