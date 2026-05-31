import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { ChevronDown, ChevronRight, Search, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  getChildren,
  indexById,
  getAncestorIds,
  MAX_RENDER_DEPTH,
  getRootCategories,
} from "@/lib/categoryTreeUtils";

// Max trail dots to render before collapsing the rest into "+N". The
// pill is narrow; rendering >3 distinct child-colours bloats the row.
const MAX_TRAIL_DOTS = 3;

function ActivityPillNode({ category, allCategories, selectedActivities, onToggle, level = 0, expandedIds, onToggleExpanded, seen, descendantColorsById }) {
  // Cycle guard — bail if this id already appears further up the
  // render stack (a malformed parent_category_id chain).
  if (seen && seen.has(category.id)) return null;
  const children = getChildren(category.id, allCategories);
  const hasChildren = children.length > 0;
  const atDepthLimit = level >= MAX_RENDER_DEPTH;
  const nextSeen = seen ? new Set(seen) : new Set();
  nextSeen.add(category.id);
  const isSelected = selectedActivities.includes(category.id);
  const isExpanded = expandedIds.has(category.id);
  const trailColors = descendantColorsById?.get(category.id) || [];

  return (
    <div>
      <div className="flex items-center gap-1.5" style={{ paddingLeft: `${level * 16}px` }}>
        <button
          type="button"
          onClick={() => onToggleExpanded(category.id)}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center"
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          ) : <div className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => onToggle(category.id)}
          className={`flex-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all text-left ${
            isSelected ? "text-white" : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
          style={isSelected && category.color ? { backgroundColor: category.color } : {}}
        >
          <span className="flex items-center gap-1.5">
            {category.color && !isSelected && (
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
            )}
            <span className="flex-1">{category.name}</span>
            {/* "Follow the trail" dots — surface the colour of each
                selected descendant so the user can find their picks
                inside a collapsed sub-tree without expanding every
                branch. Hidden when the row is collapsed and there's
                nothing selected below; capped at MAX_TRAIL_DOTS plus
                a "+N" overflow indicator. */}
            {hasChildren && trailColors.length > 0 && (
              <span className="flex items-center gap-0.5 ml-auto flex-shrink-0" aria-label={`${trailColors.length} selected below`}>
                {trailColors.slice(0, MAX_TRAIL_DOTS).map((c, i) => (
                  <span
                    key={`${c}-${i}`}
                    className={`w-2 h-2 rounded-full border ${isSelected ? "border-white/60" : "border-background"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                {trailColors.length > MAX_TRAIL_DOTS && (
                  <span className={`text-[9px] font-semibold tabular-nums leading-none ${isSelected ? "text-white/80" : "text-muted-foreground"}`}>
                    +{trailColors.length - MAX_TRAIL_DOTS}
                  </span>
                )}
              </span>
            )}
          </span>
        </button>
      </div>
      {hasChildren && isExpanded && !atDepthLimit && (
        <div className="mt-1 space-y-1">
          {children.map((child) => (
            <ActivityPillNode
              key={child.id}
              category={child}
              allCategories={allCategories}
              selectedActivities={selectedActivities}
              onToggle={onToggle}
              level={level + 1}
              expandedIds={expandedIds}
              onToggleExpanded={onToggleExpanded}
              seen={nextSeen}
              descendantColorsById={descendantColorsById}
            />
          ))}
        </div>
      )}
      {hasChildren && isExpanded && atDepthLimit && (
        <div className="text-[11px] italic text-muted-foreground" style={{ paddingLeft: `${(level + 1) * 16}px` }}>
          (deeper sub-activities hidden — flatten in Customize Activities)
        </div>
      )}
    </div>
  );
}

// Build the path string for a nested category — e.g. "Self Care › Brushing
// teeth". Used in search results so a leaf with the same name as a sibling
// in another branch is still disambiguated. Cycle-safe — a malformed
// parent_category_id chain used to spin this in an infinite while loop.
function buildCategoryPath(category, byId) {
  const parts = [category.name];
  let cur = category;
  const seen = new Set([category.id]);
  while (cur?.parent_category_id && cur.parent_category_id !== cur.id) {
    if (seen.has(cur.parent_category_id)) break;
    const parent = byId[cur.parent_category_id];
    if (!parent) break;
    seen.add(parent.id);
    parts.unshift(parent.name);
    cur = parent;
  }
  return parts.join(" › ");
}

export default function ActivityPillSelector({ selectedActivities = [], onActivityChange, allowCreate = true }) {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  // Create a brand-new top-level activity from whatever the user typed when
  // their search finds no exact match — so they're never stuck unable to log
  // an activity that doesn't exist yet (same affordance as the Quick Check-In
  // screen). Reuses an existing same-name category instead of duplicating.
  const handleCreate = async () => {
    const name = search.trim();
    if (!name || creating) return;
    const existing = categories.find(
      (c) => (c.name || "").trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      if (!selectedActivities.includes(existing.id)) onActivityChange([...selectedActivities, existing.id]);
      setSearch("");
      return;
    }
    setCreating(true);
    try {
      const newCat = await base44.entities.ActivityCategory.create({
        name,
        color: "#8b5cf6",
        parent_category_id: null,
      });
      await queryClient.invalidateQueries({ queryKey: ["activityCategories"] });
      onActivityChange([...selectedActivities, newCat.id]);
      setSearch("");
    } catch (err) {
      toast.error(err?.message || "Couldn't create the activity");
    } finally {
      setCreating(false);
    }
  };

  const byIdAll = useMemo(() => indexById(categories), [categories]);

  const rootCategories = useMemo(
    () => getRootCategories(categories),
    [categories],
  );

  // For every parent in the tree, build the ordered list of distinct
  // colours from the selected descendants below it. Used by
  // ActivityPillNode to render "follow the trail" dots so the user
  // can spot where their picks live inside a collapsed branch.
  // Order preserves the user's selection order so the first pick's
  // colour stays leftmost. Cycle-safe via getAncestorIds.
  const descendantColorsById = useMemo(() => {
    const map = new Map(); // parentId -> string[] (distinct colours, in pick order)
    if (!selectedActivities.length) return map;
    for (const selId of selectedActivities) {
      const sel = byIdAll[selId];
      if (!sel) continue;
      const colour = sel.color || "hsl(var(--muted-foreground))";
      for (const ancId of getAncestorIds(selId, byIdAll)) {
        const arr = map.get(ancId) || [];
        if (!arr.includes(colour)) arr.push(colour);
        map.set(ancId, arr);
      }
    }
    return map;
  }, [selectedActivities, byIdAll]);

  // Flat search results across the entire tree. Matched by name OR by any
  // parent-category name (so searching "Self" finds the "Self Care" leaves
  // even if the user wouldn't know the leaf's own name). Cycle-safe — we
  // track visited ids while walking up the parent chain so a malformed
  // edge can't lock the UI.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const pathMatches = (cat) => {
      let cur = cat;
      const seen = new Set();
      while (cur) {
        if (seen.has(cur.id)) return false;
        seen.add(cur.id);
        if ((cur.name || "").toLowerCase().includes(q)) return true;
        if (!cur.parent_category_id || cur.parent_category_id === cur.id) return false;
        cur = byIdAll[cur.parent_category_id] || null;
      }
      return false;
    };
    return categories
      .filter(pathMatches)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map((c) => ({ cat: c, path: buildCategoryPath(c, byIdAll) }));
  }, [categories, search, byIdAll]);

  const toggleActivity = (id) => {
    onActivityChange(
      selectedActivities.includes(id)
        ? selectedActivities.filter((a) => a !== id)
        : [...selectedActivities, id]
    );
  };

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // When create is allowed, still render even with no categories yet so the
  // user can make their first one. Otherwise keep the old "hide if empty".
  if (!categories.length && !allowCreate) return null;

  const trimmedSearch = search.trim();
  const canCreate =
    allowCreate &&
    !!trimmedSearch &&
    !categories.some((c) => (c.name || "").trim().toLowerCase() === trimmedSearch.toLowerCase());

  return (
    <div>
      <p className="text-sm font-medium mb-2">What activity?</p>
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search activities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-7 h-8 text-sm"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {search.trim() ? (
        searchResults.length > 0 || canCreate ? (
          <div className="flex flex-wrap gap-1.5">
            {searchResults.map(({ cat, path }) => {
              const isSelected = selectedActivities.includes(cat.id);
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => toggleActivity(cat.id)}
                  title={path}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all text-left ${
                    isSelected ? "text-white" : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                  style={isSelected && cat.color ? { backgroundColor: cat.color } : {}}
                >
                  <span className="flex items-center gap-1.5">
                    {cat.color && !isSelected && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    )}
                    {cat.name}
                    {cat.parent_category_id && (
                      <span className={`text-[10px] ${isSelected ? "text-white/70" : "text-muted-foreground/60"}`}>
                        in {path.split(" › ").slice(0, -1).join(" › ")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {canCreate && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="px-3 py-1.5 rounded-full text-sm font-medium border border-dashed border-primary/60 text-primary hover:bg-primary/10 transition-all inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Create &ldquo;{trimmedSearch}&rdquo;
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No matching activity.</p>
        )
      ) : (
        <div className="space-y-1">
          {rootCategories.map((cat) => (
            <ActivityPillNode
              key={cat.id}
              category={cat}
              allCategories={categories}
              selectedActivities={selectedActivities}
              onToggle={toggleActivity}
              level={0}
              expandedIds={expandedIds}
              onToggleExpanded={toggleExpanded}
              descendantColorsById={descendantColorsById}
            />
          ))}
        </div>
      )}
    </div>
  );
}
