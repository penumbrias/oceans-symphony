import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, Edit2, Check, X } from "lucide-react";
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
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import { getChildTypes, MAX_TYPE_DEPTH } from "@/lib/relationshipTypes";

/**
 * Recursive tree row for nestable relationship types. Mirrors
 * src/components/activities/ActivityTreeRow.jsx — same expand/collapse,
 * select, inline rename, colour swatch, add-child, recursive delete, and
 * drag-to-nest/reorder behaviour — translated for the RelationshipType
 * entity (`label`/`color`/`parent_id` instead of `name`/`color`/
 * `parent_category_id`, and the relationshipTypes tree helpers instead of
 * categoryTreeUtils).
 *
 * IMPORTANT: nesting/reordering is purely organisational. A type's `label`
 * is what AlterRelationship.relationship_type stores, so renaming a type via
 * the inline editor DOES affect resolution — but drag-to-nest / move-to-root
 * never touch the label (only `parent_id`), so existing relationships keep
 * resolving. The inline rename here is the same explicit edit the old flat
 * manager exposed.
 */
export default function RelationshipTypeTreeRow({
  type,
  allTypes,
  expandedIds,
  onToggleExpanded,
  selectedId,
  onSelect,
  onDrop,
  draggedId,
  setDraggedId,
  level = 0,
  creatingSubFor,
  onCreateSub,
  onStartCreateSub,
  onCancelCreateSub,
  newSubName,
  onSubNameChange,
  onDelete,
  onUpdate,
  seen,
}) {
  // Cycle guard — if a malformed parent_id chain made the same id appear
  // higher in the render stack, refuse to recurse so we don't blow the JS
  // stack.
  if (seen && seen.has(type.id)) return null;
  const atDepthLimit = level >= MAX_TYPE_DEPTH;
  const nextSeen = seen ? new Set(seen) : new Set();
  nextSeen.add(type.id);
  const [showEditColorPicker, setShowEditColorPicker] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(type.label);
  const [editColor, setEditColor] = useState(type.color || "#6b7280");
  const autoExpandRef = useRef(null);

  // Cycle-safe child fetch — filters out self-parent rows so an A→A type
  // can't appear as its own child and re-recurse.
  const children = getChildTypes(type.id, allTypes);

  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(type.id);
  const isSelected = selectedId === type.id;
  const isCreatingSub = creatingSubFor === type.id;

  useEffect(() => () => { if (autoExpandRef.current) clearTimeout(autoExpandRef.current); }, []);

  const handleDragStart = (e) => {
    setDraggedId(type.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDropTarget(true);
    if (!isExpanded && hasChildren) {
      if (autoExpandRef.current) clearTimeout(autoExpandRef.current);
      autoExpandRef.current = setTimeout(() => onToggleExpanded(type.id), 1500);
    }
  };

  const handleDragLeave = () => {
    setIsDropTarget(false);
    if (autoExpandRef.current) { clearTimeout(autoExpandRef.current); autoExpandRef.current = null; }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedId && draggedId !== type.id) onDrop(draggedId, type.id);
    setIsDropTarget(false);
    setDraggedId(null);
    if (autoExpandRef.current) clearTimeout(autoExpandRef.current);
  };

  const saveEdit = () => {
    // Never write an empty label — that would orphan any AlterRelationship
    // that resolves by this label. Fall back to the existing label.
    const label = editLabel.trim() || type.label;
    onUpdate(type.id, { label, color: editColor });
    setIsEditing(false);
  };

  return (
    <>
      <div
        className={`flex items-center gap-2 py-2 px-2 rounded-lg transition-colors cursor-grab active:cursor-grabbing group ${
          isDropTarget ? "bg-primary/20 border-2 border-primary" : ""
        } ${isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"} ${
          draggedId === type.id ? "opacity-50" : ""
        }`}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={() => !isEditing && onSelect(type.id)}
        draggable={!isEditing}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Chevron */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpanded(type.id); }}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : <div className="w-4 h-4" />}
        </button>

        {/* Inline edit or display */}
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowEditColorPicker(true)}
              className="w-7 h-7 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0"
              style={{ backgroundColor: editColor }}
            />
            {showEditColorPicker && (
              <ColorPickerModal
                color={editColor}
                label="Relationship type color"
                onSave={(hex) => setEditColor(hex)}
                onClose={() => setShowEditColorPicker(false)}
              />
            )}
            <Input
              autoFocus
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setIsEditing(false); }}
              className="h-7 text-sm flex-1"
            />
            <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={saveEdit}>
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditing(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: type.color || "#6b7280" }} />
            <span className="text-sm text-foreground truncate">{type.label}</span>
          </div>
        )}

        {/* Actions (when selected, not editing) */}
        {isSelected && !isEditing && (
          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setEditLabel(type.label); setEditColor(type.color || "#6b7280"); setIsEditing(true); }}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onStartCreateSub(type.id)}
              className="p-1 text-white bg-primary hover:bg-primary/90 rounded"
              title="Add sub-type"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="p-1 text-white bg-destructive hover:bg-destructive/90 rounded"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Move-here arrow when another is selected */}
        {selectedId && selectedId !== type.id && !isEditing && (
          <button
            onClick={(e) => { e.stopPropagation(); onDrop(selectedId, type.id); }}
            className="flex-shrink-0 text-xs px-2 py-0.5 bg-primary/20 hover:bg-primary/40 text-primary rounded transition-colors"
            title="Move selected here"
          >
            → here
          </button>
        )}
      </div>

      {/* Sub-creation inline input */}
      {isCreatingSub && (
        <div className="flex gap-2 py-2" style={{ paddingLeft: `${(level + 1) * 20 + 8}px` }}>
          <Input
            autoFocus
            placeholder="Sub-type name"
            value={newSubName}
            onChange={(e) => onSubNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onCreateSub(type.id); if (e.key === "Escape") onCancelCreateSub(); }}
            className="flex-1 h-8 text-sm"
          />
          <Button size="sm" onClick={() => onCreateSub(type.id)} className="bg-primary hover:bg-primary/90 h-8">Create</Button>
          <Button size="sm" variant="outline" onClick={onCancelCreateSub} className="h-8">Cancel</Button>
        </div>
      )}

      {/* Children */}
      {isExpanded && children.length > 0 && !atDepthLimit && (
        <div>
          {children.map((child) => (
            <RelationshipTypeTreeRow
              key={child.id}
              type={child}
              allTypes={allTypes}
              expandedIds={expandedIds}
              onToggleExpanded={onToggleExpanded}
              selectedId={selectedId}
              onSelect={onSelect}
              onDrop={onDrop}
              draggedId={draggedId}
              setDraggedId={setDraggedId}
              level={level + 1}
              creatingSubFor={creatingSubFor}
              onCreateSub={onCreateSub}
              onStartCreateSub={onStartCreateSub}
              onCancelCreateSub={onCancelCreateSub}
              newSubName={newSubName}
              onSubNameChange={onSubNameChange}
              onDelete={onDelete}
              onUpdate={onUpdate}
              seen={nextSeen}
            />
          ))}
        </div>
      )}
      {isExpanded && children.length > 0 && atDepthLimit && (
        <div
          className="text-[11px] italic text-muted-foreground py-1"
          style={{ paddingLeft: `${(level + 1) * 20 + 8}px` }}
        >
          (deeper sub-types hidden — drag a parent to the root level to access them)
        </div>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete relationship type?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete "{type.label}" and all its sub-types. Existing relationships already saved with these labels keep their text, but the labels will no longer appear as pickable types. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onDelete(type.id); setShowDeleteDialog(false); }}
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
