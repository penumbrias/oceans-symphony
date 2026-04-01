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
import { HexColorPicker } from "react-colorful";

function ColorPickerModal({ color = "#8b5cf6", label = "Color", onSave, onClose }) {
  const [hex, setHex] = React.useState(color);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border-2 border-border rounded-xl p-6 space-y-4 max-w-sm mx-4 w-full">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{label}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <HexColorPicker color={hex} onChange={setHex} style={{ width: "100%" }} />
        <input type="text" value={hex}
          onChange={(e) => { if (/^#?[0-9A-F]{0,6}$/i.test(e.target.value)) setHex(e.target.value); }}
          placeholder="#000000"
          className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-mono" />
        <div className="w-full h-12 rounded-lg border-2 border-border" style={{ backgroundColor: hex }} />
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 font-medium text-sm cursor-pointer">
            Cancel
          </button>
          <button type="button" onClick={() => { onSave(hex); onClose(); }}
            disabled={!/^#[0-9A-F]{6}$/i.test(hex)}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm cursor-pointer disabled:opacity-50">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
export default function ActivityTreeRow({
  category,
  allCategories,
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
}) {
  const [showEditColorPicker, setShowEditColorPicker] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const [editColor, setEditColor] = useState(category.color || "#8b5cf6");
  const autoExpandRef = useRef(null);

  const children = allCategories
    .filter((c) => c.parent_category_id === category.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(category.id);
  const isSelected = selectedId === category.id;
  const isCreatingSub = creatingSubFor === category.id;

  useEffect(() => () => { if (autoExpandRef.current) clearTimeout(autoExpandRef.current); }, []);

  const handleDragStart = (e) => {
    setDraggedId(category.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDropTarget(true);
    if (!isExpanded && hasChildren) {
      if (autoExpandRef.current) clearTimeout(autoExpandRef.current);
      autoExpandRef.current = setTimeout(() => onToggleExpanded(category.id), 1500);
    }
  };

  const handleDragLeave = () => {
    setIsDropTarget(false);
    if (autoExpandRef.current) { clearTimeout(autoExpandRef.current); autoExpandRef.current = null; }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedId && draggedId !== category.id) onDrop(draggedId, category.id);
    setIsDropTarget(false);
    setDraggedId(null);
    if (autoExpandRef.current) clearTimeout(autoExpandRef.current);
  };

  const saveEdit = () => {
    onUpdate(category.id, { name: editName, color: editColor });
    setIsEditing(false);
  };

  return (
    <>
      <div
        className={`flex items-center gap-2 py-2 px-2 rounded-lg transition-colors cursor-grab active:cursor-grabbing group ${
          isDropTarget ? "bg-primary/20 border-2 border-primary" : ""
        } ${isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"} ${
          draggedId === category.id ? "opacity-50" : ""
        }`}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={() => !isEditing && onSelect(category.id)}
        draggable={!isEditing}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Chevron */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpanded(category.id); }}
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
    label="Activity Color"
    onSave={(hex) => setEditColor(hex)}
    onClose={() => setShowEditColorPicker(false)}
  />
)}
            <Input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
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
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: category.color || "#8b5cf6" }} />
            <span className="text-sm text-foreground truncate">{category.name}</span>
          </div>
        )}

        {/* Actions (when selected, not editing) */}
        {isSelected && !isEditing && (
          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setEditName(category.name); setEditColor(category.color || "#8b5cf6"); setIsEditing(true); }}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onStartCreateSub(category.id)}
              className="p-1 text-white bg-primary hover:bg-primary/90 rounded"
              title="Add sub-activity"
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
        {selectedId && selectedId !== category.id && !isEditing && (
          <button
            onClick={(e) => { e.stopPropagation(); onDrop(selectedId, category.id); }}
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
            placeholder="Sub-activity name"
            value={newSubName}
            onChange={(e) => onSubNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onCreateSub(category.id); if (e.key === "Escape") onCancelCreateSub(); }}
            className="flex-1 h-8 text-sm"
          />
          <Button size="sm" onClick={() => onCreateSub(category.id)} className="bg-primary hover:bg-primary/90 h-8">Create</Button>
          <Button size="sm" variant="outline" onClick={onCancelCreateSub} className="h-8">Cancel</Button>
        </div>
      )}

      {/* Children */}
      {isExpanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <ActivityTreeRow
              key={child.id}
              category={child}
              allCategories={allCategories}
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
            />
          ))}
        </div>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Activity?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete "{category.name}" and all its sub-activities. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onDelete(category.id); setShowDeleteDialog(false); }}
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