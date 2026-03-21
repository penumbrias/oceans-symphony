import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, ArrowLeft, ArrowUp, Users } from "lucide-react";
import GroupMembersModal from "./GroupMembersModal";

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const autoExpandTimeoutRef = useRef(null);

  // Find children by matching parent to this group's ID or sp_id
  const childGroups = allGroups
    .filter((g) => g.parent && (g.parent === group.id || g.parent === group.sp_id))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const hasChildren = childGroups.length > 0;
  const isExpanded = expandedGroups.has(group.id);
  const isSelected = selectedGroupId === group.id;



  useEffect(() => {
    return () => {
      if (autoExpandTimeoutRef.current) clearTimeout(autoExpandTimeoutRef.current);
    };
  }, []);

  const handleDragStart = (e) => {
    setDraggedGroupId(group.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDropTarget(true);

    // Auto-expand on hover for 1.5 seconds
    if (!expandedGroups.has(group.id) && hasChildren) {
      if (autoExpandTimeoutRef.current) clearTimeout(autoExpandTimeoutRef.current);
      autoExpandTimeoutRef.current = setTimeout(() => {
        onToggleExpanded(group.id);
      }, 1500);
    }
  };

  const handleDragLeave = () => {
    setIsDropTarget(false);
    if (autoExpandTimeoutRef.current) {
      clearTimeout(autoExpandTimeoutRef.current);
      autoExpandTimeoutRef.current = null;
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedGroupId && draggedGroupId !== group.id) {
      onDropGroup(draggedGroupId, group.id);
    }
    setIsDropTarget(false);
    setDraggedGroupId(null);
    if (autoExpandTimeoutRef.current) clearTimeout(autoExpandTimeoutRef.current);
  };

  const handleMoveToParent = (e) => {
    e.stopPropagation();
    // Move to root by setting parent to null or empty
    onDropGroup(group.id, null);
  };

  return (
    <>
      <div
        className={`flex items-center gap-2 py-2 px-2 rounded-lg transition-colors cursor-grab active:cursor-grabbing group ${
          isDropTarget ? "bg-primary/20 border-2 border-primary" : ""
        } ${isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"} ${
          draggedGroupId === group.id ? "opacity-50" : ""
        }`}
        style={{ paddingLeft: `${level * 24 + 8}px` }}
        onClick={() => onSelectGroup(group.id)}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
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

        {/* Left arrow if selected group exists and this isn't the selected group */}
        {selectedGroupId && selectedGroupId !== group.id && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDropGroup(selectedGroupId, group.id);
            }}
            className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            title="Move here"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        {/* Members button if selected */}
        {isSelected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsModalOpen(true);
            }}
            className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            title="Manage members"
          >
            <Users className="w-4 h-4" />
          </button>
        )}

        {/* Up arrow if this group is selected and not in root */}
        {isSelected && group.parent && group.parent !== "root" && (
          <button
            onClick={handleMoveToParent}
            className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            title="Move to parent"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        )}
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
              onDropGroup={onDropGroup}
              draggedGroupId={draggedGroupId}
              setDraggedGroupId={setDraggedGroupId}
              level={level + 1}
            />
          ))}
        </div>
      )}

      {/* Members Modal */}
      <GroupMembersModal
        group={group}
        allGroups={allGroups}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}