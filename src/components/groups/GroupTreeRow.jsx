import React, { useState } from "react";
import { ChevronDown, ChevronRight, ArrowRight, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function GroupTreeRow({
  group,
  allGroups,
  expandedGroups,
  onToggleExpanded,
  selectedGroupId,
  onSelectGroup,
  onChangeColor,
  onMoveGroupsIn,
  onMoveGroupsOut,
  level = 0,
  parentId = null,
}) {
  const [isHoldingArrow, setIsHoldingArrow] = useState(false);
  const [selectedForMove, setSelectedForMove] = useState(new Set());

  // Find children by matching parent to this group's ID
  const childGroups = allGroups
    .filter((g) => g.parent && (g.parent === group.id || g.parent === group.sp_id))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const hasChildren = childGroups.length > 0;
  const isExpanded = expandedGroups.has(group.id);
  const isSelected = selectedGroupId === group.id;

  // Get siblings at this level
  const siblings = allGroups
    .filter((g) => {
      if (!parentId && (!g.parent || g.parent === "" || g.parent === "root")) return true;
      return g.parent === parentId;
    })
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Show arrow-in for sibling folders when a folder is selected (pointing to selected)
  const showArrowIn = selectedGroupId && selectedGroupId !== group.id && siblings.some((g) => g.id === selectedGroupId);

  // Show arrow-out for child folders when parent is selected
  const showArrowOut = isSelected && hasChildren;

  const handleArrowDown = () => {
    setIsHoldingArrow(true);
    setSelectedForMove(new Set([group.id]));
  };

  const handleArrowUp = () => {
    setIsHoldingArrow(false);
    if (showArrowIn) {
      onMoveGroupsIn(Array.from(selectedForMove), selectedGroupId);
    } else if (showArrowOut) {
      onMoveGroupsOut(Array.from(selectedForMove));
    }
    setSelectedForMove(new Set());
  };

  const handleArrowClick = () => {
    if (showArrowIn) {
      onMoveGroupsIn([group.id], selectedGroupId);
    } else if (showArrowOut) {
      onMoveGroupsOut([group.id]);
    }
  };

  return (
    <>
      <div
        className={`flex items-center gap-2 py-2 px-2 rounded-lg transition-colors cursor-pointer group ${
          isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"
        }`}
        style={{ paddingLeft: `${level * 24 + 8}px` }}
        onClick={() => onSelectGroup(group.id)}
      >
        {/* Chevron */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpanded(group.id);
          }}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )
          ) : (
            <div className="w-4 h-4" />
          )}
        </button>

        {/* Color dot + name */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isSelected && (
            <input
              type="color"
              value={group.color || "#9333ea"}
              onChange={(e) => onChangeColor(group.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="w-6 h-6 rounded cursor-pointer flex-shrink-0 border-0"
            />
          )}
          {!isSelected && group.color && (
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: group.color }}
            />
          )}
          <span className="text-sm text-foreground truncate">{group.name}</span>
        </div>

        {/* Arrows */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {showArrowIn && (
            <button
              onMouseDown={handleArrowDown}
              onMouseUp={handleArrowUp}
              onTouchStart={handleArrowDown}
              onTouchEnd={handleArrowUp}
              onClick={handleArrowClick}
              className="flex-shrink-0 p-1 text-primary hover:bg-primary/10 rounded transition-colors"
              title="Move into selected group"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {showArrowOut && (
            <button
              onMouseDown={handleArrowDown}
              onMouseUp={handleArrowUp}
              onTouchStart={handleArrowDown}
              onTouchEnd={handleArrowUp}
              onClick={handleArrowClick}
              className="flex-shrink-0 p-1 text-accent hover:bg-accent/10 rounded transition-colors"
              title="Move out of parent group"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Children */}
      {isExpanded && childGroups.length > 0 && (
        <div className="space-y-0">
          {childGroups.map((child) => (
            <GroupTreeRow
              key={child.id}
              group={child}
              allGroups={allGroups}
              expandedGroups={expandedGroups}
              onToggleExpanded={onToggleExpanded}
              selectedGroupId={selectedGroupId}
              onSelectGroup={onSelectGroup}
              onChangeColor={onChangeColor}
              onMoveGroupsIn={onMoveGroupsIn}
              onMoveGroupsOut={onMoveGroupsOut}
              level={level + 1}
              parentId={group.id}
            />
          ))}
        </div>
      )}
    </>
  );
}