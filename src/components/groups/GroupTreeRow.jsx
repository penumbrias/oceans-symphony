import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, ArrowLeft, ArrowUp, Users, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  creatingSubgroupFor = null,
  onCreateSubgroup = null,
  onStartCreateSubgroup = null,
  onCancelCreateSubgroup = null,
  newSubgroupName = "",
  onSubgroupNameChange = null,
  onDeleteGroup = null,
}) {
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const autoExpandTimeoutRef = useRef(null);
  const isCreatingSubgroup = creatingSubgroupFor === group.id;

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

        {/* Plus button to create subgroup if selected */}
        {isSelected && !isCreatingSubgroup && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartCreateSubgroup(group.id);
              }}
              className="flex-shrink-0 p-1 text-white bg-primary hover:bg-primary/90 rounded transition-colors"
              title="Create subgroup"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(true);
              }}
              className="flex-shrink-0 p-1 text-white bg-destructive hover:bg-destructive/90 rounded transition-colors"
              title="Delete group"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Subgroup creation input - shown if this group is creating a subgroup */}
      {isCreatingSubgroup && (
        <div className="flex gap-2 px-2 py-2" style={{ paddingLeft: `${level * 24 + 8 + 24}px` }}>
          <Input
            autoFocus
            placeholder="Subgroup name"
            value={newSubgroupName}
            onChange={(e) => onSubgroupNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreateSubgroup(group.id);
              if (e.key === "Escape") onCancelCreateSubgroup();
            }}
            className="flex-1 h-8 text-sm"
          />
          <Button
            size="sm"
            onClick={() => onCreateSubgroup(group.id)}
            className="bg-primary hover:bg-primary/90 h-8"
          >
            Create
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onCancelCreateSubgroup}
            className="h-8"
          >
            Cancel
          </Button>
        </div>
      )}

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
              creatingSubgroupFor={creatingSubgroupFor}
              onCreateSubgroup={onCreateSubgroup}
              onStartCreateSubgroup={onStartCreateSubgroup}
              onCancelCreateSubgroup={onCancelCreateSubgroup}
              newSubgroupName={newSubgroupName}
              onSubgroupNameChange={onSubgroupNameChange}
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

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete "{group.name}" and all its subgroups. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDeleteGroup(group.id);
                setShowDeleteDialog(false);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}