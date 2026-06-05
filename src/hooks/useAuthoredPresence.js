import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  buildAuthoredEvents,
  buildInferredSessions,
  inferAlterIdsAt,
  getInferPresenceEnabled,
} from "@/lib/inferredPresence";

// Shared analytics helper: turns authored content (chat / bulletins /
// comments / journals) into "inferred presence" so analytics can attribute
// activities / emotions / symptoms to the alter(s) who were around then,
// even without fronting data. Honours the on/off toggle.
//
// Returns:
//   enabled          — whether inferred presence is on
//   authoredEvents   — [{ alterId, ts }]
//   inferredSessions — synthetic FrontingSession rows to merge with real ones
//   inferAlters(ts)  — alter ids present (via authorship) at a timestamp (ms),
//                      [] when disabled. Use as a FALLBACK when a record has
//                      no explicit fronting alter.
export function useAuthoredPresence() {
  const enabled = getInferPresenceEnabled();

  // Shared query keys (already used elsewhere) so this rides the cache.
  const { data: mentionLogs = [] } = useQuery({
    queryKey: ["mentionLogs"],
    queryFn: () => base44.entities.MentionLog.list("-source_date", 5000),
  });
  const { data: journals = [] } = useQuery({
    queryKey: ["journals"],
    queryFn: () => base44.entities.JournalEntry.list("-created_date", 1000),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const authoredEvents = useMemo(() => {
    if (!enabled) return [];
    // Only assert presence for alters that still exist — a deleted/legacy
    // author id shouldn't conjure a ghost "alter" in the analytics.
    const known = new Set(alters.map((a) => a.id));
    return buildAuthoredEvents({ mentionLogs, journals }).filter((e) => known.has(e.alterId));
  }, [enabled, mentionLogs, journals, alters]);
  const inferredSessions = useMemo(() => buildInferredSessions(authoredEvents), [authoredEvents]);
  const inferAlters = useCallback(
    (tsMs) => (enabled ? inferAlterIdsAt(tsMs, authoredEvents) : []),
    [enabled, authoredEvents]
  );

  return { enabled, authoredEvents, inferredSessions, inferAlters };
}
