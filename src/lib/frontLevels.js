// Fronting levels — a configurable closeness-to-front spectrum.
//
// Some systems experience presence as a spectrum (fronting → close to
// front → nearby → observing), not a front/co-front binary. This module is
// the single source for that feature:
//
//   • The level catalogue lives in SystemSettings.front_levels
//     ({ enabled, levels: [{ id, label, counts_as_front }] }), ordered
//     closest-to-front first. OFF by default — systems that don't
//     experience fronting this way never see any of it.
//   • An active FrontingSession may carry `front_level` (a level id).
//     Absent/null means full fronting — exactly the pre-feature
//     semantics, so no data migration and no behaviour change for
//     existing rows.
//   • `counts_as_front: false` levels (e.g. Observing) are excluded from
//     fronting-TIME analytics via filterCountedSessions — an alter who
//     watched all day must not chart as hours of fronting. Presence
//     display (who's here, timeline) always shows every active session.
//
// Level labels may use {{term}} placeholders ({{Fronting}}, {{front}}) —
// resolve at display time with applyTerms so terminology changes
// propagate. NOTE: "presence" is already taken by the sensed-fragment
// feature (components/presences/) — this feature is "front levels"
// everywhere in code to keep the two apart.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { applyTerms } from "@/lib/dailyTaskSystem";

export const DEFAULT_FRONT_LEVELS = [
  { id: "front", label: "{{Fronting}}", counts_as_front: true },
  { id: "close", label: "Close to {{front}}", counts_as_front: true },
  { id: "nearby", label: "Nearby", counts_as_front: false },
  { id: "observing", label: "Observing", counts_as_front: false },
];

export function newFrontLevelId() {
  return `fl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Tolerant read of the stored config. Always returns a usable shape.
export function resolveFrontLevels(settingsRow) {
  const raw = settingsRow?.front_levels;
  const levels = Array.isArray(raw?.levels)
    ? raw.levels
        .filter((l) => l && typeof l === "object" && typeof l.id === "string" && l.id)
        .map((l) => ({
          id: l.id,
          label: typeof l.label === "string" && l.label ? l.label.slice(0, 40) : "Level",
          counts_as_front: l.counts_as_front !== false,
        }))
    : DEFAULT_FRONT_LEVELS;
  return {
    enabled: !!raw?.enabled,
    levels: levels.length > 0 ? levels : DEFAULT_FRONT_LEVELS,
  };
}

export function frontLevelLabel(level, terms) {
  return applyTerms(level?.label || "", terms);
}

// Hook consumers use — rides the shared ["systemSettings"] cache (same as
// useTerms / useAccessibility), so it costs no extra fetch per widget.
// Also exposes _settingsId for writers (the level rail's commit).
export function useFrontLevels() {
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
    staleTime: 0,
  });
  const row = settingsList[0];
  return useMemo(
    () => ({ ...resolveFrontLevels(row), _settingsId: row?.id || null }),
    [row]
  );
}

// The level of a session. null = the classic "just fronting" (level 0
// semantics) — callers that only care about display can show nothing.
export function getSessionLevel(session, cfg) {
  if (!cfg?.enabled || !session?.front_level) return null;
  return cfg.levels.find((l) => l.id === session.front_level) || null;
}

// Sessions that count toward fronting TIME (analytics, reports, leaders).
// A session with no level, an unknown level id (the user deleted the
// level), or the feature off always counts — never silently drop data.
export function filterCountedSessions(sessions, cfg) {
  if (!cfg?.enabled) return sessions || [];
  const byId = new Map(cfg.levels.map((l) => [l.id, l]));
  return (sessions || []).filter((s) => {
    const level = s?.front_level ? byId.get(s.front_level) : null;
    return level ? level.counts_as_front !== false : true;
  });
}
