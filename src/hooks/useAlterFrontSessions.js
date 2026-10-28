// One alter's fronting sessions (v0.302.0) — the History tab and the
// Fronting stats / Fronting sessions widgets read them the same way.
//
// Scoped to this alter: their own rows, legacy group-shape rows
// (primary_alter_id / co_fronter_ids, matched from a bounded scan of the
// newest rows), and — when `includeInherited` — the sessions of alters
// they came from through a fusion or split logged in System History.
// Each returned session carries `_sourceAlterId` (null for their own).
// `recent` is the bounded scan itself, for finding co-fronters.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44, localEntities } from "@/api/base44Client";

export function useAlterFrontSessions(alterId, { includeInherited = false } = {}) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["frontHistory", "alter", alterId],
    queryFn: async () => {
      const [own, legacyPrimary, legacyScan] = await Promise.all([
        base44.entities.FrontingSession.filter({ alter_id: alterId }, "-start_time"),
        base44.entities.FrontingSession.filter({ primary_alter_id: alterId }, "-start_time"),
        base44.entities.FrontingSession.list("-start_time", 2000),
      ]);
      const seen = new Set();
      const out = [];
      for (const s of [...own, ...legacyPrimary, ...legacyScan]) {
        if (!s || seen.has(s.id)) continue;
        seen.add(s.id);
        out.push(s);
      }
      return out;
    },
    enabled: !!alterId,
  });

  const { data: changeEvents = [] } = useQuery({
    queryKey: ["systemChangeEvents"],
    queryFn: () => localEntities.SystemChangeEvent.list(),
  });

  // Fusion/split events this alter is a result of → source alter ids.
  const inheritanceMap = useMemo(() => {
    const map = {};
    for (const event of changeEvents) {
      if (!(event.type === "fusion" || event.type === "split") || !(event.result_alter_ids || []).includes(alterId)) continue;
      for (const sourceId of (event.source_alter_ids || [])) {
        if (sourceId !== alterId && !map[sourceId]) map[sourceId] = { eventType: event.type, eventDate: new Date(event.date) };
      }
    }
    return map;
  }, [changeEvents, alterId]);
  const inheritedAlterIds = useMemo(() => Object.keys(inheritanceMap), [inheritanceMap]);

  const own = useMemo(() => rows
    .filter((s) => (s.alter_id
      ? s.alter_id === alterId
      : s.primary_alter_id === alterId || (s.co_fronter_ids || []).includes(alterId)))
    .map((s) => ({ ...s, _sourceAlterId: null })), [rows, alterId]);

  const inherited = useMemo(() => {
    if (!inheritedAlterIds.length) return [];
    const out = [];
    for (const s of rows) {
      let source = null;
      if (s.alter_id) { if (inheritedAlterIds.includes(s.alter_id)) source = s.alter_id; }
      else if (inheritedAlterIds.includes(s.primary_alter_id)) source = s.primary_alter_id;
      else source = (s.co_fronter_ids || []).find((id) => inheritedAlterIds.includes(id)) || null;
      if (source) out.push({ ...s, _sourceAlterId: source });
    }
    return out;
  }, [rows, inheritedAlterIds]);

  const sessions = useMemo(() => {
    const byStart = (a, b) => new Date(b.start_time) - new Date(a.start_time);
    if (!includeInherited) return [...own].sort(byStart);
    const ownIds = new Set(own.map((s) => s.id));
    return [...own, ...inherited.filter((s) => !ownIds.has(s.id))].sort(byStart);
  }, [own, inherited, includeInherited]);

  return { sessions, recent: rows, isLoading, inheritanceMap, inheritedAlterIds };
}
