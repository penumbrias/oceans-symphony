import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { pushFrontStatus } from "@/lib/friendsApi";
import { isPreviewActive } from "@/lib/previewMode";

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

  const { data: activeSessions = [], isSuccess: sessionsReady } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const { data: alters = [], isSuccess: altersReady } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
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
    if (!sessionsReady || !altersReady) return;

    const altersById = Object.fromEntries(alters.map((a) => [a.id, a]));

    // Build a list of alter ids that are currently up front. Handles both
    // schemas:
    //   - new: each FrontingSession row has `alter_id` and `is_primary`
    //   - legacy: a single FrontingSession row carries `primary_alter_id`
    //     and `co_fronter_ids[]` (one row per group of fronters). A
    //     long-running legacy session would otherwise push an empty
    //     fronters list to friends — which is what users see when their
    //     friend's view goes blank despite an actively-fronting alter.
    const collected = []; // [{alterId, isPrimary}]
    let seenPrimary = false;
    for (const s of activeSessions) {
      if (s.alter_id) {
        collected.push({ alterId: s.alter_id, isPrimary: !!s.is_primary });
        if (s.is_primary) seenPrimary = true;
      } else if (s.primary_alter_id) {
        collected.push({ alterId: s.primary_alter_id, isPrimary: true });
        seenPrimary = true;
        for (const coId of s.co_fronter_ids || []) {
          collected.push({ alterId: coId, isPrimary: false });
        }
      }
    }
    // Fallback: if no row was flagged primary, treat the first as primary
    // so the friend's display still has a name to lead with.
    if (!seenPrimary && collected.length > 0) {
      collected[0].isPrimary = true;
    }

    const primaryId = collected.find((c) => c.isPrimary)?.alterId || collected[0]?.alterId || null;

    const fronters = collected
      .map((c) => ({ entry: c, alter: altersById[c.alterId] }))
      .filter(({ alter }) => alter && !alter.is_archived && alter.friends_visible !== false)
      .map(({ entry, alter }) => ({
        id: alter.id,
        name: alter.name,
        initial: alter.name?.[0] || "?",
        color: alter.color || null,
        isPrimary: alter.id === primaryId,
        isCofronter: alter.id !== primaryId,
      }));

    // Deterministic signature so we only push when the front actually changed.
    const sig = JSON.stringify(
      fronters
        .map((f) => [f.id, f.isPrimary])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    );
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;

    pushFrontStatus({
      fronters,
      terms: {
        fronting: terms.fronting,
        front: terms.front,
        alter: terms.alter,
        system: terms.system,
      },
    }).catch(() => {});
  }, [activeSessions, alters, terms.fronting, terms.front, terms.alter, terms.system]);
}
