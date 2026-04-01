import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import ActivityTreeRow from "@/components/activities/ActivityTreeRow";

export default function ActivityCustomizationMenu({ onClose }) {
  const [showRootColorPicker, setShowRootColorPicker] = useState(false);
  const qc = useQueryClient();
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [creatingSubFor, setCreatingSubFor] = useState(null);
  const [newSubName, setNewSubName] = useState("");
  const [isCreatingRoot, setIsCreatingRoot] = useState(false);
  const [newRootName, setNewRootName] = useState("");
  const [newRootColor, setNewRootColor] = useState("#8b5cf6");

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const rootCategories = categories
    .filter((c) => !c.parent_category_id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelect = (id) => setSelectedId(id === selectedId ? null : id);

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      // Recursively delete children
      const deleteTree = async (catId) => {
        const children = categories.filter((c) => c.parent_category_id === catId);
        for (const child of children) await deleteTree(child.id);
        await base44.entities.ActivityCategory.delete(catId);
      };
      await deleteTree(id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["activityCategories"] }); toast.success("Deleted!"); setSelectedId(null); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ActivityCategory.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activityCategories"] }),
    onError: (e) => toast.error(e.message),
  });

  const createRootMutation = useMutation({
    mutationFn: (data) => base44.entities.ActivityCategory.create({
      name: data.name,
      color: data.color,
      parent_category_id: null,
      order: rootCategories.length,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activityCategories"] });
      setIsCreatingRoot(false);
      setNewRootName("");
      setNewRootColor("#8b5cf6");
      toast.success("Activity created!");
    },
    onError: (e) => toast.error(e.message),
  });

  const createSubMutation = useMutation({
    mutationFn: ({ parentId, name }) => {
      const siblings = categories.filter((c) => c.parent_category_id === parentId);
      const parent = categories.find((c) => c.id === parentId);
      return base44.entities.ActivityCategory.create({
        name,
        color: parent?.color || "#8b5cf6",
        parent_category_id: parentId,
        order: siblings.length,
      });
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["activityCategories"] });
      setExpandedIds((prev) => new Set([...prev, variables.parentId]));
      setCreatingSubFor(null);
      setNewSubName("");
      toast.success("Sub-activity created!");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDrop = async (draggedCatId, targetCatId) => {
    if (draggedCatId === targetCatId) return;
    await base44.entities.ActivityCategory.update(draggedCatId, { parent_category_id: targetCatId });
    qc.invalidateQueries({ queryKey: ["activityCategories"] });
    setSelectedId(null);
    toast.success("Moved!");
  };

  const handleMoveToRoot = async (id) => {
    await base44.entities.ActivityCategory.update(id, { parent_category_id: null });
    qc.invalidateQueries({ queryKey: ["activityCategories"] });
    setSelectedId(null);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customize Activities</DialogTitle>
          <p className="text-xs text-muted-foreground">Drag to reorder or nest. Click to select, then use buttons to edit/add/delete.</p>
        </DialogHeader>

        <div className="space-y-1 bg-card rounded-lg border border-border p-3 min-h-[100px]">
          {rootCategories.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground text-sm">No activities yet. Create one below.</p>
          ) : (
            rootCategories.map((cat) => (
              <ActivityTreeRow
                key={cat.id}
                category={cat}
                allCategories={categories}
                expandedIds={expandedIds}
                onToggleExpanded={toggleExpanded}
                selectedId={selectedId}
                onSelect={handleSelect}
                onDrop={handleDrop}
                draggedId={draggedId}
                setDraggedId={setDraggedId}
                level={0}
                creatingSubFor={creatingSubFor}
                onCreateSub={(parentId) => {
                  if (newSubName.trim()) createSubMutation.mutate({ parentId, name: newSubName.trim() });
                }}
                onStartCreateSub={(id) => { setCreatingSubFor(id); setNewSubName(""); setSelectedId(null); }}
                onCancelCreateSub={() => setCreatingSubFor(null)}
                newSubName={newSubName}
                onSubNameChange={setNewSubName}
                onDelete={(id) => deleteMutation.mutate(id)}
                onUpdate={(id, data) => updateMutation.mutate({ id, data })}
              />
            ))
          )}

          {/* Drop to root zone */}
          {selectedId && (
            <button
              className="w-full mt-2 py-2 text-xs text-muted-foreground border border-dashed border-border rounded-lg hover:bg-muted/50 transition-colors"
              onClick={() => handleMoveToRoot(selectedId)}
            >
              ↑ Move selected to root level
            </button>
          )}
        </div>

        {/* Create root activity */}
        {isCreatingRoot ? (
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-sm font-medium">New Root Activity</p>
            <div className="flex gap-2 items-center">
              <button
  type="button"
  onClick={() => setShowRootColorPicker(true)}
  className="w-9 h-9 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0"
  style={{ backgroundColor: newRootColor }}
/>
{showRootColorPicker && (
  <ColorPickerModal
    color={newRootColor}
    label="Activity Color"
    onSave={(hex) => setNewRootColor(hex)}
    onClose={() => setShowRootColorPicker(false)}
  />
)}
              <Input
                autoFocus
                value={newRootName}
                onChange={(e) => setNewRootName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newRootName.trim()) createRootMutation.mutate({ name: newRootName.trim(), color: newRootColor });
                  if (e.key === "Escape") setIsCreatingRoot(false);
                }}
                placeholder="Activity name"
                className="flex-1"
              />
              <Button onClick={() => { if (newRootName.trim()) createRootMutation.mutate({ name: newRootName.trim(), color: newRootColor }); }} disabled={!newRootName.trim()}>
                Create
              </Button>
              <Button variant="outline" onClick={() => setIsCreatingRoot(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setIsCreatingRoot(true)} variant="outline" className="w-full gap-2">
            <Plus className="w-4 h-4" /> New Activity
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}