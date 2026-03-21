import React from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function GroupTreeRow({
  group,
  allGroups,
  expandedGroups,
  onToggleExpanded,
  onDelete,
  onCreateChild,
  onEdit,
  onMoveUp,
  onMoveDown,
  creatingParentId,
  newGroupName,
  onNewGroupNameChange,
  onCreateGroup,
  deletingId,
  level = 0,
  parentId = null,
}) {
  const childGroups = allGroups.filter((g) => g.parent === group.id);
  const hasChildren = childGroups.length > 0;
  const isExpanded = expandedGroups.has(group.id);
  const isDeleting = deletingId === group.id;
  
  // Get sibling groups to determine if we can move up/down
  const siblings = allGroups.filter((g) => g.parent === parentId);
  const siblingIndex = siblings.findIndex((g) => g.id === group.id);
  const canMoveUp = siblingIndex > 0;
  const canMoveDown = siblingIndex < siblings.length - 1;

  return (
    <>
      {/* Row */}
      <div
        className="flex items-center gap-2 py-2 px-2 hover:bg-muted/50 rounded-lg transition-colors group"
        style={{ paddingLeft: `${level * 24 + 8}px` }}
      >
        {/* Chevron */}
        <button
          onClick={() => onToggleExpanded(group.id)}
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
          {group.color && (
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: group.color }}
            />
          )}
          <button
            onClick={() => onEdit(group)}
            className="text-sm text-foreground truncate hover:underline cursor-pointer flex-1 text-left"
          >
            {group.name}
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onMoveUp(group.id)}
            disabled={!canMoveUp}
            title="Move up"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onMoveDown(group.id)}
            disabled={!canMoveDown}
            title="Move down"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onCreateChild(group.id)}
            title="Add subgroup"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(group.id)}
            disabled={isDeleting}
            title="Delete group"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Create child form */}
      {creatingParentId === group.id && (
        <div
          className="flex items-center gap-2 py-2 px-2 bg-primary/5 rounded-lg"
          style={{ paddingLeft: `${(level + 1) * 24 + 8}px` }}
        >
          <div className="w-5" />
          <Input
            autoFocus
            value={newGroupName}
            onChange={(e) => onNewGroupNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreateGroup(group.id);
            }}
            placeholder="Subgroup name"
            className="flex-1 h-7 text-sm"
          />
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onCreateGroup(group.id)}
          >
            Add
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
              onDelete={onDelete}
              onCreateChild={onCreateChild}
              onEdit={onEdit}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              creatingParentId={creatingParentId}
              newGroupName={newGroupName}
              onNewGroupNameChange={onNewGroupNameChange}
              onCreateGroup={onCreateGroup}
              deletingId={deletingId}
              level={level + 1}
              parentId={group.id}
            />
          ))}
        </div>
      )}
    </>
  );
}