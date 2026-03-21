import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, ChevronRight } from "lucide-react";

const DEFAULT_CATEGORIES = [
  { name: "Work", color: "#3B82F6", parent: null },
  { name: "Recreation", color: "#8B5CF6", parent: null },
  { name: "Exercise", color: "#10B981", parent: null },
  { name: "Creative", color: "#F59E0B", parent: null },
  { name: "Self-Care", color: "#EC4899", parent: null },
];

const DEFAULT_SUBCATEGORIES = [
  { name: "Games", parent: "Recreation" },
  { name: "Smoking", parent: "Recreation" },
  { name: "Social", parent: "Recreation" },
  { name: "Drawing", parent: "Creative" },
  { name: "Writing", parent: "Creative" },
  { name: "Coding", parent: "Work" },
  { name: "Meeting", parent: "Work" },
  { name: "Cardio", parent: "Exercise" },
  { name: "Stretching", parent: "Exercise" },
  { name: "Shower", parent: "Self-Care" },
  { name: "Meditation", parent: "Self-Care" },
];

export default function ActivityPicker({ selectedActivities = [], onActivityChange }) {
  const [expandedMain, setExpandedMain] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: async () => {
      const cats = await base44.entities.ActivityCategory.list();
      
      // Initialize defaults if empty
      if (cats.length === 0) {
        const createdCategories = [];
        
        for (const cat of DEFAULT_CATEGORIES) {
          const created = await base44.entities.ActivityCategory.create({
            name: cat.name,
            color: cat.color,
          });
          createdCategories.push(created);
        }

        // Create subcategories
        for (const subcat of DEFAULT_SUBCATEGORIES) {
          const parentCat = createdCategories.find(c => c.name === subcat.parent);
          if (parentCat) {
            await base44.entities.ActivityCategory.create({
              name: subcat.name,
              color: parentCat.color,
              parent_category_id: parentCat.id,
            });
          }
        }

        return createdCategories.concat(
          DEFAULT_SUBCATEGORIES.map(sc => ({
            name: sc.name,
            parent_category_id: createdCategories.find(c => c.name === sc.parent)?.id,
          }))
        );
      }

      return cats;
    },
  });

  const mainCategories = useMemo(() => {
    return categories.filter(c => !c.parent_category_id);
  }, [categories]);

  const subCategoriesByParent = useMemo(() => {
    const map = {};
    categories.forEach(c => {
      if (c.parent_category_id) {
        if (!map[c.parent_category_id]) {
          map[c.parent_category_id] = [];
        }
        map[c.parent_category_id].push(c);
      }
    });
    return map;
  }, [categories]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return mainCategories;
    const query = searchQuery.toLowerCase();
    return mainCategories.filter(c => 
      c.name.toLowerCase().includes(query) ||
      (subCategoriesByParent[c.id]?.some(sub => sub.name.toLowerCase().includes(query)))
    );
  }, [searchQuery, mainCategories, subCategoriesByParent]);

  const toggleActivity = (categoryId) => {
    const newActivities = selectedActivities.includes(categoryId)
      ? selectedActivities.filter(id => id !== categoryId)
      : [...selectedActivities, categoryId];
    onActivityChange(newActivities);
  };

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search activities..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="text-sm"
      />

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {filteredCategories.map((main) => {
          const subs = subCategoriesByParent[main.id] || [];
          const isExpanded = expandedMain === main.id;
          const isSelected = selectedActivities.includes(main.id);
          const anySubSelected = subs.some(s => selectedActivities.includes(s.id));

          return (
            <div key={main.id}>
              <button
                onClick={() => {
                  if (subs.length > 0) {
                    setExpandedMain(isExpanded ? null : main.id);
                  } else {
                    toggleActivity(main.id);
                  }
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : anySubSelected
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {subs.length > 0 && (
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                )}
                {subs.length === 0 && <div className="w-4" />}
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: main.color || "currentColor" }}
                />
                <span className="flex-1 text-left">{main.name}</span>
                {!subs.length && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleActivity(main.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {isSelected ? <X className="w-4 h-4" /> : null}
                  </button>
                )}
              </button>

              {isExpanded && subs.length > 0 && (
                <div className="ml-4 space-y-1 mt-1">
                  {subs.map((sub) => {
                    const isSubSelected = selectedActivities.includes(sub.id);
                    return (
                      <button
                        key={sub.id}
                        onClick={() => toggleActivity(sub.id)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-all ${
                          isSubSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/50 text-muted-foreground hover:bg-accent/50"
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: sub.color || main.color || "currentColor" }}
                        />
                        <span className="flex-1 text-left">{sub.name}</span>
                        {isSubSelected && <X className="w-3 h-3" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedActivities.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Selected activities:</p>
          <div className="flex flex-wrap gap-1">
            {selectedActivities.map((actId) => {
              const cat = categories.find(c => c.id === actId);
              return (
                <button
                  key={actId}
                  onClick={() => toggleActivity(actId)}
                  className="flex items-center gap-1 px-2 py-1 bg-primary/20 text-primary rounded text-xs hover:bg-primary/30 transition-colors"
                >
                  <span>{cat?.name}</span>
                  <X className="w-3 h-3" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}