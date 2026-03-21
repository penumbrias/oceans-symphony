import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown } from "lucide-react";

export default function GroupTreeRow({
  group,
  allGroups,
  expandedGroups,
  onToggleExpanded,
  selectedGroupId,
  onSelectGroup,
  onChangeColor,
  onMoveUp,
  onMoveDown,
  onDropGroup,
  draggedGroupId,
  setDraggedGroupId,
  level = 0,
}) {
  const [isDropTarget, setIsDropTarget] = useState(false);
  const autoExpandTimeoutRef = useRef(null);

  // Find children by matching parent to this group's ID or sp_id
  const childGroups = allGroups
    .filter((g) => g.parent && (g.parent === group.id || g.parent === group.sp_id))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const hasChildren = childGroups.length > 0;
  const isExpanded = expandedGroups.has(group.id);
  const isSelected = selectedGroupId === group.id;

  // Get siblings for up/down movement
  const siblings = allGroups.filter((g) => g.parent === group.parent).sort((a, b) => (a.order || 0) - (b.order || 0));
  const siblingIndex = siblings.findIndex((g) => g.id === group.id);
  const canMoveUp = siblingIndex > 0;
  const canMoveDown = siblingIndex < siblings.length - 1;

  const handleDragStart = (e) => {
    setIsDragging(true);
    setDraggedGroupId(group.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedGroupId && draggedGroupId !== group.id) {
      onDropGroup(draggedGroupId, group.id);
    }
    setIsDragging(false);
    setDraggedGroupId(null);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDraggedGroupId(null);
  };

  return (
    <>
      <div
        className={`flex items-center gap-2 py-2 px-2 rounded-lg transition-colors cursor-pointer group ${
          isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"
        } ${isDragging ? "opacity-50" : ""}`}
        style={{ paddingLeft: `${level * 24 + 8}px` }}
        onClick={() => onSelectGroup(group.id)}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
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

        {/* Up/Down arrows */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp(group.id);
            }}
            disabled={!canMoveUp}
            className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted rounded transition-colors"
            title="Move up"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown(group.id);
            }}
            disabled={!canMoveDown}
            className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted rounded transition-colors"
            title="Move down"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
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
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onDropGroup={onDropGroup}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </>
  );
}