import React from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, Edit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function GroupTreeNode({
  group,
  allGroups,
  expandedGroups,
  onToggleExpanded,
  onEdit,
  onDelete,
  onCreateChild,
  creatingParentId,
  newGroupName,
  onNewGroupNameChange,
  onCreateGroup,
  deletingId,
  level = 0,
}) {
  const childGroups = allGroups.filter((g) => g.parent === group.id || g.parent === (group.sp_id || group.id));
  const isExpanded = expandedGroups.has(group.id);
  const hasChildren = childGroups.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border/50 bg-card hover:bg-muted/30 transition-all group"
        style={{ marginLeft: `${level * 20}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => onToggleExpanded(group.id)}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        ) : (
          <div className="w-5" />
        )}

        <div
          className="w-4 h-4 rounded flex-shrink-0"
          style={{ backgroundColor: group.color || "hsl(var(--muted))" }}
        />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{group.name}</p>
        </div>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(group)}
            title="Edit"
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onCreateChild(group.id)}
            title="Add subgroup"
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(group.id)}
            disabled={deletingId === group.id}
            title="Delete"
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
          >
            {deletingId === group.id ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Create child input */}
      {creatingParentId === group.id && (
        <div className="p-3 space-y-2" style={{ marginLeft: `${(level + 1) * 20}px` }}>
          <div className="flex gap-2">
            <Input
              value={newGroupName}
              onChange={(e) => onNewGroupNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreateGroup(group.id);
              }}
              placeholder="Subgroup name"
              className="flex-1 h-8 text-sm"
              autoFocus
            />
            <Button
              onClick={() => onCreateGroup(group.id)}
              size="sm"
              className="bg-primary hover:bg-primary/90"
            >
              Add
            </Button>
            <Button
              onClick={() => onCreateChild(null)}
              variant="outline"
              size="sm"
            >
              ✕
            </Button>
          </div>
        </div>
      )}

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="space-y-2 mt-2">
          {childGroups.map((child) => (
            <GroupTreeNode
              key={child.id}
              group={child}
              allGroups={allGroups}
              expandedGroups={expandedGroups}
              onToggleExpanded={onToggleExpanded}
              onEdit={onEdit}
              onDelete={onDelete}
              onCreateChild={onCreateChild}
              creatingParentId={creatingParentId}
              newGroupName={newGroupName}
              onNewGroupNameChange={onNewGroupNameChange}
              onCreateGroup={onCreateGroup}
              deletingId={deletingId}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}