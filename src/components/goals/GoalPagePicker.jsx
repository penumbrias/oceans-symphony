// Pick a goal page (v0.353.0) — the one goal picker for things that link to
// a goal: wishes (WishLinkFields) and to-dos (the quick composer and the
// to-do form). Nested like the Goals sidebar (flattenPages, cycle-safe),
// searchable, and can offer "make a new one" as its first row (`newOption`,
// an { id, label } the caller recognises on save).

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { GOALS_QUERY_KEY } from "@/lib/goals";
import { indexPages, flattenPages } from "@/lib/goalTree";

export default function GoalPagePicker({ value, onChange, newOption = null, label = "Goal", placeholder = "Link a goal…" }) {
  const { data: goals = [] } = useQuery({ queryKey: GOALS_QUERY_KEY, queryFn: () => base44.entities.Goal.list() });
  const options = useMemo(() => [
    ...(newOption ? [{ ...newOption, _depth: 0 }] : []),
    ...flattenPages(indexPages(goals)).map(({ page, depth }) => ({
      id: page.id, label: `${page.icon ? `${page.icon} ` : ""}${page.title || "Untitled"}`, _depth: depth,
    })),
  ], [goals, newOption]);
  return (
    <div className="space-y-[0.25em]">
      {label && <p className="text-[0.75em] font-medium opacity-70">{label}</p>}
      <SearchableSelect value={value || null} onChange={(id) => onChange(id || null)} options={options} allowClear
        placeholder={placeholder} searchPlaceholder="Search goals…" emptyMessage="No goals yet"
        renderOption={(o) => (
          <span className="flex items-center gap-2 min-w-0">
            {o._depth > 0 && <span style={{ width: o._depth * 12 }} className="flex-shrink-0 text-xs text-right opacity-60">↳</span>}
            <span className="truncate text-sm">{o.label}</span>
          </span>
        )} />
    </div>
  );
}
