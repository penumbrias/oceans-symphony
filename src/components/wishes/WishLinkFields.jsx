// What a wish is connected to (v0.353.0) — the kind decides the link:
//   activity / experience → one of the planner's activities (the same
//                           ActivityPillSelector the planner uses: nested,
//                           searchable, "create" when nothing matches)
//   goal                  → a goal page, or "Make a new goal from this wish"
//   item                  → a list to put it on (wishlists first, or a new
//                           wishlist); in the quick add it can also be drawn
//                           FROM a list — pick an item already on one
//
// Shared by WishQuickAdd and WishEditor so both speak the same links. The
// value is { category_id, goal_id, list_id, list_item_id }; goal_id may be
// NEW_GOAL and list_id NEW_WISHLIST, which applyWishLinks (wishes.js) turns
// into real records after the wish is saved.
//
// Sized in em so it follows a widget's own text size when it sits on a board.

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import GoalPagePicker from "@/components/goals/GoalPagePicker";
import { useNoteLists, isItemList, listLabel, listKind } from "@/lib/noteLists";
import { NEW_GOAL, NEW_WISHLIST, WISHES_QUERY_KEY } from "@/lib/wishes";

const labelCls = "text-[0.75em] font-medium opacity-70";

// The kinds that carry each link.
export const linksActivity = (kind) => kind === "activity" || kind === "experience";
export const linksGoal = (kind) => kind === "goal";
export const linksList = (kind) => kind === "item";

// Item lists, wishlists first, then the rest by name.
export function itemListsFirst(lists = []) {
  const rank = (l) => (listKind(l) === "wishlist" ? 0 : listKind(l) === "shopping" ? 1 : 2);
  return (lists || []).filter(isItemList)
    .sort((a, b) => rank(a) - rank(b) || String(a.name || "").localeCompare(String(b.name || "")));
}

// One activity, picked with the planner's own picker. Folded to a single
// row until the person opens it, so the quick add stays small.
function ActivityLink({ value, onChange, startOpen = false }) {
  const [open, setOpen] = useState(startOpen && !value);
  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list(),
  });
  const picked = categories.find((c) => c.id === value) || null;
  // The picker is multi-select; a wish holds one activity, so the newest
  // tap wins and tapping the picked one again clears it.
  const change = (ids) => {
    const next = (ids || []).find((id) => id !== value) ?? (ids?.includes(value) ? value : null);
    onChange(next || null);
    if (next && next !== value) setOpen(false);
  };
  return (
    <div className="space-y-[0.4em]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full min-h-[2.75em] px-[0.75em] rounded-lg border flex items-center gap-[0.5em] text-left"
        style={{ borderColor: "color-mix(in srgb, currentColor 20%, transparent)" }}>
        <span className="text-[0.75em] opacity-70 flex-shrink-0">Activity</span>
        {picked?.color && <span className="w-[0.5em] h-[0.5em] rounded-full flex-shrink-0" style={{ background: picked.color }} />}
        <span className="flex-1 min-w-0 truncate text-[0.875em]">{picked ? picked.name : "Pick or create one…"}</span>
        {open ? <ChevronUp className="w-4 h-4 opacity-60" /> : <ChevronDown className="w-4 h-4 opacity-60" />}
      </button>
      {open && (
        <div className="rounded-lg border p-[0.6em]" style={{ borderColor: "color-mix(in srgb, currentColor 14%, transparent)" }}>
          <ActivityPillSelector selectedActivities={value ? [value] : []} onActivityChange={change} />
        </div>
      )}
    </div>
  );
}

const NEW_GOAL_OPTION = { id: NEW_GOAL, label: "＋ Make a new goal from this wish" };
function GoalLink({ value, onChange }) {
  return <GoalPagePicker value={value} onChange={onChange} newOption={NEW_GOAL_OPTION} />;
}

function ListLink({ value, onChange, lists }) {
  const options = useMemo(() => [
    ...itemListsFirst(lists).map((l) => ({
      id: l.id, label: listLabel(l), sublabel: l.unlocked ? "Available when locked" : null,
    })),
    { id: NEW_WISHLIST, label: "＋ New wishlist" },
  ], [lists]);
  return (
    <div className="space-y-[0.25em]">
      <p className={labelCls}>Put it on a list</p>
      <SearchableSelect value={value || null} onChange={(id) => onChange(id || null)} options={options} allowClear
        placeholder="No list" searchPlaceholder="Search lists…" />
    </div>
  );
}

// Pick something already on a list to wish for. Ticked rows, and rows a
// wish already points at, are left out.
function DrawFromList({ lists, items, onPick }) {
  const { data: wishes = [] } = useQuery({ queryKey: WISHES_QUERY_KEY, queryFn: () => base44.entities.Wish.list() });
  const options = useMemo(() => {
    const wished = new Set((wishes || []).map((w) => w?.list_item_id).filter(Boolean));
    const out = [];
    for (const l of itemListsFirst(lists)) {
      for (const i of items(l.id)) {
        if (!i || i.checked || wished.has(i.id) || !String(i.name || "").trim()) continue;
        out.push({ id: i.id, label: i.name, sublabel: listLabel(l), _list: l, _item: i });
      }
    }
    return out;
  }, [lists, items, wishes]);
  if (!options.length) return null;
  return (
    <div className="space-y-[0.25em]">
      <p className={labelCls}>Or take it from a list</p>
      <SearchableSelect value={null} options={options} placeholder="Pick from a list…" searchPlaceholder="Search your lists…"
        onChange={(id) => { const o = options.find((x) => x.id === id); if (o) onPick(o._item, o._list); }} />
    </div>
  );
}

export default function WishLinkFields({ kind, value = {}, onChange, allowDraw = false, onDraw = null, activityOpen = false }) {
  const notes = useNoteLists({ enabled: linksList(kind) });
  const set = (patch) => onChange({ ...value, ...patch });
  const drawnList = value.list_item_id ? notes.byId.get(value.list_id) : null;

  if (linksActivity(kind)) {
    return <ActivityLink value={value.category_id} onChange={(id) => set({ category_id: id })} startOpen={activityOpen} />;
  }
  if (linksGoal(kind)) {
    return <GoalLink value={value.goal_id} onChange={(id) => set({ goal_id: id })} />;
  }
  if (linksList(kind)) {
    if (drawnList) {
      return (
        <div className="flex items-center gap-[0.5em] text-[0.8125em]">
          <span className="flex-1 min-w-0 truncate opacity-80">{allowDraw ? "From" : "On"} {listLabel(drawnList)}</span>
          <button type="button" className="underline opacity-70 min-h-[2.25em]"
            onClick={() => set({ list_id: null, list_item_id: null })}>{allowDraw ? "Not from a list" : "Change"}</button>
        </div>
      );
    }
    return (
      <div className="space-y-[0.6em]">
        <ListLink value={value.list_id} onChange={(id) => set({ list_id: id, list_item_id: null })} lists={notes.lists} />
        {allowDraw && onDraw && (
          <DrawFromList lists={notes.lists} items={notes.items}
            onPick={(item, list) => { set({ list_id: list.id, list_item_id: item.id }); onDraw(item, list); }} />
        )}
      </div>
    );
  }
  return null;
}

// Only the links the kind carries (switching kind in the form mid-way must
// not leave an activity on an item wish).
export function linksForKind(kind, links = {}) {
  return {
    category_id: linksActivity(kind) ? links.category_id || null : null,
    goal_id: linksGoal(kind) ? links.goal_id || null : null,
    list_id: linksList(kind) ? links.list_id || null : null,
    list_item_id: linksList(kind) ? links.list_item_id || null : null,
  };
}
