// Fronting levels — a configurable closeness-to-front spectrum.
//
// Some systems experience presence as a spectrum (fronting → close to
// front → nearby → observing), not a front/co-front binary. This module is
// the single source for that feature:
//
//   • The level catalogue lives in SystemSettings.front_levels
//     ({ levels: [{ id, label, counts_as_front }] }), ordered
//     closest-to-front first. ALWAYS ON since v0.121.0 — the default two
//     levels ARE the old front/co-front model, so simple systems see
//     nothing new until they add levels.
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

// Levels are THE fronting system (owner decision, v0.121.0) — the old
// front/co-front binary is expressed as the DEFAULT two-level spectrum, so
// existing users migrate seamlessly: same words, same analytics, same
// derived lead. Systems that experience more gradation add levels
// (Close to front, Observing, …) in Settings → Tracking setup.
export const DEFAULT_FRONT_LEVELS = [
  { id: "front", label: "{{Fronting}}", counts_as_front: true },
  { id: "cofront", label: "Co-{{fronting}}", counts_as_front: true },
];

// What a NEW system starts with. "Co-fronting" stopped earning its place
// once levels existed — it only says "also fronting" — so the starting
// spectrum describes degrees instead. Labels seed from the user's
// terminology via {{Fronting}} but are plain text once edited, so renaming
// a level doesn't tie it to the terminology setting forever.
//
// NOT the fallback for existing systems: their sessions may carry
// front_level "cofront", and DEFAULT_FRONT_LEVELS keeps that id resolvable.
export const NEW_SYSTEM_FRONT_LEVELS = [
  { id: "front", label: "{{Fronting}}", counts_as_front: true },
  { id: "influencing", label: "Influencing", counts_as_front: true },
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
  const soloRaw = raw?.solo_swipe || {};
  return {
    // Always on — the binary model IS the default two-level spectrum now.
    // Stored `enabled` from the opt-in era is deliberately ignored.
    enabled: true,
    levels: levels.length > 0 ? levels : DEFAULT_FRONT_LEVELS,
    // The rail's sideways-slide "sole" gesture: while picking a level,
    // sliding sideways commits the alter as the ONLY one — at that level
    // (scope "level": others there shift one level further out, or leave
    // front if there's nothing below) or outright (scope "all": everyone
    // else leaves front). Configurable in Fronting levels settings.
    solo_swipe: {
      enabled: soloRaw.enabled !== false,
      direction: soloRaw.direction === "right" ? "right" : "left",
      scope: soloRaw.scope === "all" ? "all" : "level",
    },
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

// The level of a session. Rows from the pre-levels era have no
// front_level — they map onto the spectrum by their old role (primary →
// the top level, co-fronter → the second) so nothing changes for them
// until the user picks something else. Never returns null for a session.
export function getSessionLevel(session, cfg) {
  if (!cfg?.enabled || !session) return null;
  if (session.front_level) {
    const found = cfg.levels.find((l) => l.id === session.front_level);
    if (found) return found;
  }
  return session.is_primary ? cfg.levels[0] : (cfg.levels[1] || cfg.levels[0]);
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
