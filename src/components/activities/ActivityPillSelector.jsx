import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

function ActivityPillNode({ category, allCategories, selectedActivities, onToggle, level = 0, expandedIds, onToggleExpanded }) {
  const children = allCategories
    .filter((c) => c.parent_category_id === category.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const hasChildren = children.length > 0;
  const isSelected = selectedActivities.includes(category.id);
  const isExpanded = expandedIds.has(category.id);

  return (
    <div>
      <div className="flex items-center gap-1.5" style={{ paddingLeft: `${level * 16}px` }}>
        <button
          onClick={() => onToggleExpanded(category.id)}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center"
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          ) : <div className="w-3.5 h-3.5" />}
        </button>
        <button
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
            {category.name}
          </span>
        </button>
      </div>
      {hasChildren && isExpanded && (
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Build the path string for a nested category — e.g. "Self Care › Brushing
// teeth". Used in search results so a leaf with the same name as a sibling
// in another branch is still disambiguated.
function buildCategoryPath(category, byId) {
  const parts = [category.name];
  let cur = category;
  while (cur?.parent_category_id) {
    const parent = byId[cur.parent_category_id];
    if (!parent) break;
    parts.unshift(parent.name);
    cur = parent;
  }
  return parts.join(" › ");
}

export default function ActivityPillSelector({ selectedActivities = [], onActivityChange }) {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [search, setSearch] = useState("");

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const rootCategories = useMemo(
    () => categories.filter((c) => !c.parent_category_id).sort((a, b) => (a.order || 0) - (b.order || 0)),
    [categories]
  );

  // Flat search results across the entire tree. Matched by name OR by any
  // parent-category name (so searching "Self" finds the "Self Care" leaves
  // even if the user wouldn't know the leaf's own name).
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const byId = Object.fromEntries(categories.map(c => [c.id, c]));
    const pathMatches = (cat) => {
      let cur = cat;
      while (cur) {
        if ((cur.name || "").toLowerCase().includes(q)) return true;
        cur = cur.parent_category_id ? byId[cur.parent_category_id] : null;
      }
      return false;
    };
    return categories
      .filter(pathMatches)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map(c => ({ cat: c, path: buildCategoryPath(c, byId) }));
  }, [categories, search]);

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

  if (!categories.length) return null;

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
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {search.trim() ? (
        searchResults.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {searchResults.map(({ cat, path }) => {
              const isSelected = selectedActivities.includes(cat.id);
              return (
                <button
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
