import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function ActivityPillSelector({ selectedActivities = [], onActivityChange, duration, onDurationChange }) {
  const [expandedCategories, setExpandedCategories] = useState({});

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  // Organize categories into main and sub
  const organized = useMemo(() => {
    const main = categories.filter(c => !c.parent_category_id);
    const subs = categories.filter(c => c.parent_category_id);
    
    return {
      main: main.sort((a, b) => a.order - b.order),
      subsByParent: subs.reduce((acc, sub) => {
        if (!acc[sub.parent_category_id]) acc[sub.parent_category_id] = [];
        acc[sub.parent_category_id].push(sub);
        return acc;
      }, {})
    };
  }, [categories]);

  const toggleActivity = (id) => {
    onActivityChange(
      selectedActivities.includes(id)
        ? selectedActivities.filter(a => a !== id)
        : [...selectedActivities, id]
    );
  };

  const toggleExpanded = (id) => {
    setExpandedCategories(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  if (!categories.length) return null;

  return (
    <div>
      <p className="text-sm font-medium mb-3">What activity? (optional)</p>
      
      <div className="space-y-2">
        {organized.main.map((main) => {
          const hasSubs = organized.subsByParent[main.id]?.length > 0;
          const isSelected = selectedActivities.includes(main.id);
          const isExpanded = expandedCategories[main.id];

          return (
            <div key={main.id}>
              {/* Main activity pill with expand button */}
              <div className="flex items-center gap-2">
                {hasSubs && (
                  <button
                    onClick={() => toggleExpanded(main.id)}
                    className="p-1 hover:bg-muted rounded transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                )}
                {!hasSubs && <div className="w-6" />}
                
                <button
                  onClick={() => toggleActivity(main.id)}
                  className={`flex-1 px-3 py-2 rounded-full text-sm font-medium transition-all ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {main.name}
                </button>
              </div>

              {/* Sub-activities (expandable) */}
              {hasSubs && isExpanded && (
                <div className="ml-8 mt-2 space-y-2 pb-2">
                  {organized.subsByParent[main.id].map((sub) => {
                    const isSubSelected = selectedActivities.includes(sub.id);
                    return (
                      <button
                        key={sub.id}
                        onClick={() => toggleActivity(sub.id)}
                        className={`w-full px-3 py-2 rounded-full text-sm font-medium transition-all text-left ${
                          isSubSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {sub.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Duration input - show only if activities selected */}
      {selectedActivities.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            type="number"
            placeholder="Duration"
            value={duration}
            onChange={(e) => onDurationChange(e.target.value)}
            className="text-sm"
            min="0"
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">mins</span>
        </div>
      )}
    </div>
  );
}