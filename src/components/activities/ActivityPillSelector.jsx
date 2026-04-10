import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown, ChevronRight } from "lucide-react";

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
          <button onClick={() => setShowNewActivity(true)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors flex items-center justify-center gap-1">
              <Plus className="w-4 h-4" /> Create new activity
            </button>
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

export default function ActivityPillSelector({ selectedActivities = [], onActivityChange }) {
  const [expandedIds, setExpandedIds] = useState(new Set());

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const rootCategories = useMemo(
    () => categories.filter((c) => !c.parent_category_id).sort((a, b) => (a.order || 0) - (b.order || 0)),
    [categories]
  );

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
      <p className="text-sm font-medium mb-3">What activity?</p>
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
    </div>
  );
}