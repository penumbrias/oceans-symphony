import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { pushFrontStatus } from "@/lib/friendsApi";
import { isPreviewActive } from "@/lib/previewMode";
import { buildFriendFronters, friendTerms } from "@/lib/friendFronters";

// Whenever the local front state changes — regardless of WHICH UI mutated it
// (Set Fronters modal, dashboard chip swipe, Alters page long-press, etc.) —
// push a fresh snapshot to the Friends server. Friends with notifyOnChange
// turned on are notified via web-push in /api/friends/update-front.
//
// Without this, only saves through SetFrontModal pushed updates, so any
// quick-action gesture switch would leave the server's stored front stale
// and "notify on change" would silently never fire.
export function useFriendsFrontSync() {
  const lastSigRef = useRef(null);
  const terms = useTerms();
  const [retryTick, setRetryTick] = useState(0);

  // Retry a failed push when the connection or the app comes back.
  useEffect(() => {
    const retry = () => {
      if (lastSigRef.current !== null) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setRetryTick((n) => n + 1);
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, []);

  const { data: activeSessions = [], isSuccess: sessionsReady } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const { data: alters = [], isSuccess: altersReady } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: groups = [], isSuccess: groupsFetched } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

  useEffect(() => {
    // Don't leak preview-mode mock fronters to real friends.
    if (isPreviewActive()) return;

    // Wait until BOTH queries have actually loaded before pushing. Otherwise
    // the first render runs with empty arrays and pushes an empty fronters
    // list to the server — so a friend who reads in that window (or before
    // the corrected push lands / if it fails) sees "no one fronting" even
    // though someone is up front. This was the intermittent "blank front"
    // friends kept hitting.
    // Groups too: a push before they load would skip the "hide from
    // friends" groups and briefly share those members.
    if (!sessionsReady || !altersReady || !groupsFetched) return;

    // One rule for who a friend may see (src/lib/friendFronters.js).
    const fronters = buildFriendFronters({ activeSessions, alters, groups });

    // Deterministic signature so we only push when the front actually
    // changed. Pronouns + preferences are part of the signature so editing
    // them re-pushes on the next evaluation instead of waiting for a switch.
    const sig = JSON.stringify(
      fronters
        .map((f) => [f.id, f.isPrimary, f.pronouns, f.preferences])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    );
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;

    pushFrontStatus({ fronters, terms: friendTerms(terms) })
      .then((ok) => {
        // A push that never reached the relay (offline at launch, a relay
        // hiccup) used to be forgotten until the next switch, so friends
        // kept seeing an old or empty front. Forget the signature and try
        // again when the device is back online or the app comes forward.
        if (!ok && lastSigRef.current === sig) lastSigRef.current = null;
      })
      .catch(() => { if (lastSigRef.current === sig) lastSigRef.current = null; });
  }, [activeSessions, alters, groups, sessionsReady, altersReady, groupsFetched, retryTick, terms.fronting, terms.front, terms.alter, terms.system]);
}
