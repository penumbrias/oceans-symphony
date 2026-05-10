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

  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  useEffect(() => {
    // Don't leak preview-mode mock fronters to real friends.
    if (isPreviewActive()) return;

    const altersById = Object.fromEntries(alters.map((a) => [a.id, a]));
    const primaryId =
      activeSessions.find((s) => s.is_primary)?.alter_id ||
      activeSessions[0]?.alter_id ||
      null;

    const fronters = activeSessions
      .map((s) => altersById[s.alter_id])
      .filter((a) => a && !a.is_archived && a.friends_visible !== false)
      .map((a) => ({
        id: a.id,
        name: a.name,
        initial: a.name?.[0] || "?",
        color: a.color || null,
        isPrimary: a.id === primaryId,
        isCofronter: a.id !== primaryId,
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
