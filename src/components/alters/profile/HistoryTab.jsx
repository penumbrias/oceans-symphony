import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44, localEntities } from "@/api/base44Client";
import { format } from "date-fns";
import { Clock, GitMerge, Split } from "lucide-react";

function formatDuration(start, end) {
  if (!end) return "Active now";
  const diff = new Date(end) - new Date(start);
  const s = Math.floor(diff / 1000) % 60;
  const m = Math.floor(diff / 60000) % 60;
  const h = Math.floor(diff / 3600000) % 24;
  const d = Math.floor(diff / 86400000);
  const parts = [];
  if (d > 0) parts.push(`${d} Day${d > 1 ? "s" : ""}`);
  if (h > 0) parts.push(`${h} Hour${h > 1 ? "s" : ""}`);
  if (m > 0) parts.push(`${m} Minute${m > 1 ? "s" : ""}`);
  if (s > 0 || parts.length === 0) parts.push(`${String(s).padStart(2, "0")} Seconds`);
  return parts.join(", ");
}

export default function HistoryTab({ alterId }) {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 20000),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: changeEvents = [] } = useQuery({
    queryKey: ["systemChangeEvents"],
    queryFn: () => localEntities.SystemChangeEvent.list(),
  });

  const altersById = useMemo(
    () => Object.fromEntries(alters.map(a => [a.id, a])),
    [alters]
  );

  // Find fusion/split events where this alter appears as a result
  const inheritanceEvents = useMemo(() =>
    changeEvents.filter(e =>
      (e.type === "fusion" || e.type === "split") &&
      (e.result_alter_ids || []).includes(alterId)
    ),
    [changeEvents, alterId]
  );

  // Build map: sourceAlterId → { eventType, eventDate }
  const inheritanceMap = useMemo(() => {
    const map = {};
    for (const event of inheritanceEvents) {
      for (const sourceId of (event.source_alter_ids || [])) {
        if (sourceId !== alterId && !map[sourceId]) {
          map[sourceId] = { eventType: event.type, eventDate: new Date(event.date) };
        }
      }
    }
    return map;
  }, [inheritanceEvents, alterId]);

  const inheritedAlterIds = Object.keys(inheritanceMap);

  // This alter's own sessions
  const ownSessions = useMemo(() =>
    sessions
      .filter(s =>
        s.alter_id
          ? s.alter_id === alterId
          : s.primary_alter_id === alterId || (s.co_fronter_ids || []).includes(alterId)
      )
      .map(s => ({ ...s, _sourceAlterId: null })),
    [sessions, alterId]
  );

  // Inherited sessions from source alters (all sessions where any source alter was present)
  const inheritedSessions = useMemo(() => {
    if (inheritedAlterIds.length === 0) return [];
    const results = [];
    for (const s of sessions) {
      // Find which inherited alter was involved in this session
      let matchedSourceId = null;
      if (s.alter_id) {
        if (inheritedAlterIds.includes(s.alter_id)) matchedSourceId = s.alter_id;
      } else {
        if (inheritedAlterIds.includes(s.primary_alter_id)) {
          matchedSourceId = s.primary_alter_id;
        } else {
          const coMatch = (s.co_fronter_ids || []).find(id => inheritedAlterIds.includes(id));
          if (coMatch) matchedSourceId = coMatch;
        }
      }
      if (!matchedSourceId) continue;
      results.push({ ...s, _sourceAlterId: matchedSourceId });
    }
    return results;
  }, [sessions, inheritedAlterIds]);

  // Merge and deduplicate (prefer own session if same id appears in both)
  const allSessions = useMemo(() => {
    const ownIds = new Set(ownSessions.map(s => s.id));
    const merged = [
      ...ownSessions,
      ...inheritedSessions.filter(s => !ownIds.has(s.id)),
    ];
    return merged.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  }, [ownSessions, inheritedSessions]);

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  if (allSessions.length === 0) return (
    <div className="text-center py-16 text-muted-foreground text-sm">
      <Clock className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
      No fronting history for this alter yet.
    </div>
  );

  return (
    <div className="space-y-2">
      {inheritedAlterIds.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-xl border text-xs mb-2"
          style={{ backgroundColor: "hsl(var(--primary)/0.05)", borderColor: "hsl(var(--primary)/0.2)", color: "hsl(var(--primary))" }}>
          <GitMerge className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Includes pre-fusion history from{" "}
            <span className="font-semibold">
              {inheritedAlterIds.map(id => altersById[id]?.name || "Unknown").join(", ")}
            </span>
          </span>
        </div>
      )}

      {allSessions.map((session) => {
        const start = new Date(session.start_time);
        const end = session.end_time ? new Date(session.end_time) : null;
        const isInherited = !!session._sourceAlterId;
        const sourceAlter = isInherited ? altersById[session._sourceAlterId] : null;
        const inheritInfo = isInherited ? inheritanceMap[session._sourceAlterId] : null;
        const isPrimary = session.alter_id
          ? (session.is_primary ?? false)
          : session.primary_alter_id === (isInherited ? session._sourceAlterId : alterId);

        const prefixLabel = inheritInfo?.eventType === "split"
          ? "from split source"
          : "pre-fusion";

        return (
          <div
            key={`${session.id}-${session._sourceAlterId || "own"}`}
            className="rounded-xl border border-border/50 bg-muted/10 p-4"
            style={isInherited ? { borderLeftColor: sourceAlter?.color || "hsl(var(--border))", borderLeftWidth: 3 } : {}}
          >
            {isInherited && sourceAlter && (
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: sourceAlter.color || "#9333ea" }} />
                <span className="text-xs text-muted-foreground/70 italic">
                  as {sourceAlter.name} · {prefixLabel}
                </span>
              </div>
            )}
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{format(start, "dd/MM/yyyy")}<br />{format(start, "h:mm a")}</span>
              {end && (
                <span className="text-right">
                  {format(end, "dd/MM/yyyy")}<br />{format(end, "h:mm a")}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground mt-1">
              {formatDuration(start, end)}
            </p>
            {!isPrimary && (
              <span className="text-xs text-muted-foreground/60 mt-1 inline-block">co-fronting</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
