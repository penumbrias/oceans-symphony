// One sorting vocabulary for every alter list in the app.
//
// Owner rule (v0.127.0): every picker can sort by the hand-set
// arrangement (Settings → {Alter} setup → Order your {alters}) OR by the
// usual automatic orders, and switching between them is one tap. The
// chosen mode is remembered per surface, so the Set-Front window and the
// alters page can differ without fighting each other.
//
// Fronters always float to the top — including in manual mode. The manual
// arrangement then orders each band (fronters among themselves, everyone
// else among themselves), which is what "my order" means in practice on a
// list whose first job is showing who's here.

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAlterOrder } from "@/lib/alterOrder";

// Who's here right now, as a Set of alter ids. Rides the shared
// ["activeFront"] cache every fronting surface already fills, so a picker
// that opts into fronters-first costs no extra read.
export function useFrontingIds(enabled = true) {
  const { data } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
    enabled,
    staleTime: 30_000,
  });
  return useMemo(
    () => new Set((data || []).map((s) => s.alter_id || s.primary_alter_id).filter(Boolean)),
    [data],
  );
}

export const ALTER_SORTS = [
  { id: "manual", label: "My order", short: "Mine" },
  { id: "alpha-asc", label: "A → Z", short: "A–Z" },
  { id: "alpha-desc", label: "Z → A", short: "Z–A" },
  { id: "most", label: "Most {{fronting}} time", short: "Most" },
  { id: "least", label: "Least {{fronting}} time", short: "Least" },
  { id: "recent", label: "Recently updated", short: "Recent" },
];

// localStorage, not sessionStorage: the choice should survive closing the
// app — "always opens alphabetical again" was the complaint. Old
// sessionStorage values are read once as a fallback so nobody's current
// in-session choice snaps back during the release that changes this.
const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || fallback;
  } catch { return fallback; }
};

// storageKey — remembers this surface's choice. When the user has a
// manual arrangement, "manual" is the sensible default; otherwise A→Z.
// frontingFirst (default true) floats whoever is currently here to the top
// of every mode. Pass frontingIds when the caller already has them; pass
// frontingFirst: false for lists where "who's here" is irrelevant.
// The DEFAULT order, for lists that can't host a sort toggle: whoever is
// fronting first, then the user's own arrangement, then alphabetical.
//
// Presence outranks arrangement everywhere — if someone is here right now,
// they belong at the top of any list that names them. Surfaces that DO have
// room for a toggle should use useAlterSorter instead; this is the same
// ordering it starts from.
export function useFrontersFirst({ enabled = true } = {}) {
  const { placedIndex, hasOrder } = useAlterOrder();
  const fronting = useFrontingIds(enabled);
  return useMemo(() => {
    const rank = (a) => {
      if (fronting?.has?.(a.id)) return -1;
      if (hasOrder) {
        const i = placedIndex?.[a.id];
        if (i !== undefined) return i;
      }
      return Number.MAX_SAFE_INTEGER;
    };
    return (list) => [...(list || [])].sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [fronting, hasOrder, placedIndex]);
}

export function useAlterSorter(storageKey, { frontingIds = null, totals = null, frontingFirst = true } = {}) {
  const { placedIndex, hasOrder } = useAlterOrder();
  const liveFronting = useFrontingIds(frontingFirst && !frontingIds);
  const fronting = frontingIds || (frontingFirst ? liveFronting : null);
  const [mode, setModeState] = useState(() => read(storageKey, hasOrder ? "manual" : "alpha-asc"));
  const setMode = useCallback((next) => {
    setModeState(next);
    try { localStorage.setItem(storageKey, next); } catch { /* storage off */ }
  }, [storageKey]);
  const cycle = useCallback(() => {
    const options = hasOrder ? ALTER_SORTS : ALTER_SORTS.filter((s) => s.id !== "manual");
    const i = options.findIndex((s) => s.id === mode);
    setMode(options[(i + 1) % options.length].id);
  }, [mode, hasOrder, setMode]);

  // totalsOverride lets a caller compute fronting-time totals AFTER the
  // sorter exists (the totals query is gated on the chosen mode, so the
  // dependency runs that way round).
  const sort = useCallback((list, totalsOverride = null) => {
    if (!Array.isArray(list)) return [];
    const t = totalsOverride || totals;
    const manual = mode === "manual" && hasOrder ? placedIndex(list) : null;
    const rank = (a) => (fronting ? (fronting.has(a.id) ? 0 : 1) : 0);
    return [...list].sort((a, b) => {
      // Fronters first, always — then the chosen order within each band.
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (manual) {
        const ma = manual.get(a.id), mb = manual.get(b.id);
        if (ma !== undefined && mb !== undefined) return ma - mb;
        if (ma !== undefined) return -1;
        if (mb !== undefined) return 1;
      }
      if (mode === "most") return (t?.[b.id] || 0) - (t?.[a.id] || 0);
      if (mode === "least") return (t?.[a.id] || 0) - (t?.[b.id] || 0);
      if (mode === "recent") {
        return new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0);
      }
      const cmp = (a.name || "").localeCompare(b.name || "");
      return mode === "alpha-desc" ? -cmp : cmp;
    });
  }, [mode, hasOrder, placedIndex, fronting, totals]);

  return useMemo(() => ({
    mode, setMode, cycle, sort, hasOrder,
    options: hasOrder ? ALTER_SORTS : ALTER_SORTS.filter((s) => s.id !== "manual"),
    current: ALTER_SORTS.find((s) => s.id === mode) || ALTER_SORTS[1],
  }), [mode, setMode, cycle, sort, hasOrder]);
}
