// THE system-wide manual alter order.
//
// Long-standing request (owner, v0.126.0): people want to say "these
// three first, then this subsystem, then everyone else" and have it hold
// EVERYWHERE alters are listed — the alters page, the Set Front window,
// every dropdown and picker — not just in one widget.
//
// Shape: SystemSettings.alter_order = [{ type: "alter" | "group", id }]
// in display order. A "group" entry expands to that group's members
// (deduped against anyone already placed). Alters the user never placed
// follow afterwards in whatever order the surface would otherwise use, so
// a partial arrangement is perfectly valid — pin your three favourites
// and leave the rest alphabetical.
//
// Rides the shared ["systemSettings"] cache; costs nothing extra.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getMemberAlters } from "@/lib/subsystemUtils";

export function resolveAlterOrder(settingsRow) {
  const raw = settingsRow?.alter_order;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e === "object" && typeof e.id === "string" && e.id)
    .map((e) => ({ type: e.type === "group" ? "group" : "alter", id: e.id }));
}

// Pure: apply a manual order to a list of alters.
//   entries  — the stored arrangement
//   groups   — for expanding group entries
//   fallback — comparator for everyone not placed by hand (optional)
export function orderAlters(alters, entries, groups = [], fallback = null) {
  if (!Array.isArray(alters) || alters.length === 0) return alters || [];
  if (!entries || entries.length === 0) {
    return fallback ? [...alters].sort(fallback) : alters;
  }
  const byId = new Map(alters.map((a) => [a.id, a]));
  const placed = [];
  const seen = new Set();
  const take = (a) => {
    if (!a || seen.has(a.id) || !byId.has(a.id)) return;
    seen.add(a.id);
    placed.push(a);
  };
  for (const entry of entries) {
    if (entry.type === "alter") take(byId.get(entry.id));
    else {
      const g = groups.find((x) => x.id === entry.id);
      if (g) getMemberAlters(g, alters).forEach(take);
    }
  }
  const rest = alters.filter((a) => !seen.has(a.id));
  return [...placed, ...(fallback ? rest.sort(fallback) : rest)];
}

// Hook form: gives the entries plus a ready-made `arrange(list, fallback)`.
export function useAlterOrder() {
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });
  const entries = useMemo(() => resolveAlterOrder(settingsList[0]), [settingsList]);
  return useMemo(() => ({
    entries,
    hasOrder: entries.length > 0,
    settingsId: settingsList[0]?.id || null,
    arrange: (list, fallback = null) => orderAlters(list, entries, groups, fallback),
    // id → position for the alters the user actually PLACED (group
    // entries expand). Surfaces use this to let a hand-set order outrank
    // their own sorting while unplaced alters keep it.
    placedIndex: (list) => {
      if (!entries.length) return null;
      const n = countPlaced(entries, list, groups);
      return new Map(orderAlters(list, entries, groups).slice(0, n).map((a, i) => [a.id, i]));
    },
  }), [entries, groups, settingsList]);
}

// How many alters an arrangement actually places (group entries expand).
// Lets a surface distinguish "you put this one here" from "everyone else
// follows", so unplaced alters keep that surface's normal sorting.
export function countPlaced(entries, alters, groups = []) {
  if (!entries?.length || !alters?.length) return 0;
  const ids = new Set(alters.map((a) => a.id));
  const seen = new Set();
  for (const entry of entries) {
    if (entry.type === "alter") { if (ids.has(entry.id)) seen.add(entry.id); }
    else {
      const g = groups.find((x) => x.id === entry.id);
      if (g) getMemberAlters(g, alters).forEach((m) => seen.add(m.id));
    }
  }
  return seen.size;
}
