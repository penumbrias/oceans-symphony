import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import ActivityTreeRow from "@/components/activities/ActivityTreeRow";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { indexById, wouldCreateCycle, getRootCategories } from "@/lib/categoryTreeUtils";

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
  // Debounced count of past activities with a name matching newRootName
  // but no link to any existing category. Used to surface a real warning
  // before the user clicks Create — replaces the prior silent auto-link
  // behaviour. Only re-queried when the name is non-empty.
  const [orphanMatchCount, setOrphanMatchCount] = useState(0);
  const [orphanCheckLoading, setOrphanCheckLoading] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  // Show categories at the root level if their parent_category_id is
  // missing (true root), points at a deleted record (orphan), OR is
  // self-parented (corruption from older drag-drop) — any of which would
  // otherwise be invisible and unrecoverable through the UI.
  const _byId = indexById(categories);
  const rootCategories = getRootCategories(categories);

  // Existing-category match — real-time, case-insensitive. Drives the
  // "this name already exists" warning that replaces the prior silent
  // auto-link.
  const existingCategoryMatch = useMemo(() => {
    const q = newRootName.trim().toLowerCase();
    if (!q) return null;
    return categories.find((c) => c.name?.toLowerCase() === q) || null;
  }, [newRootName, categories]);

  // Orphan-match count — past activities whose activity_name matches
  // newRootName but which aren't linked to any existing category.
  // Debounced because Activity.list() can be large; we only fire after
  // the user stops typing for 250ms. Skipped when an existing-category
  // match is found, since that case has its own dedicated warning.
  useEffect(() => {
    const q = newRootName.trim().toLowerCase();
    if (!q || existingCategoryMatch) {
      setOrphanMatchCount(0);
      return;
    }
    setOrphanCheckLoading(true);
    const handle = setTimeout(async () => {
      try {
        const all = await base44.entities.Activity.list();
        const count = all.filter((a) =>
          a.activity_name?.toLowerCase() === q &&
          (a.activity_category_ids || []).length === 0
        ).length;
        setOrphanMatchCount(count);
      } catch {
        setOrphanMatchCount(0);
      } finally {
        setOrphanCheckLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [newRootName, existingCategoryMatch]);

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
      // Cycle-safe recursive delete. Tracks visited ids so a malformed
      // parent_category_id chain can't send us into infinite recursion
      // (and stack-overflow the JS engine) while deleting.
      const visited = new Set();
      const deleteTree = async (catId) => {
        if (visited.has(catId)) return;
        visited.add(catId);
        const children = categories.filter(
          (c) => c.parent_category_id === catId && c.id !== catId,
        );
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

  const createSubMutation = useMutation({
    mutationFn: async ({ parentId, name }) => {
      const parent = categories.find(c => c.id === parentId);
      await base44.entities.ActivityCategory.create({
        name,
        color: parent?.color || "#8b5cf6",
        parent_category_id: parentId,
        order: categories.filter(c => c.parent_category_id === parentId).length,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["activityCategories"] }); setCreatingSubFor(null); setNewSubName(""); toast.success("Sub-activity created!"); },
    onError: (e) => toast.error(e.message),
  });

  // Two distinct paths now:
  //   1. `linkOrphans: true` — user has explicitly chosen to link past
  //      activities with the same name. (Previously this happened
  //      silently for every create; that was the bug.)
  //   2. `linkOrphans: false` — plain create, never touches existing
  //      Activity records.
  // `useExisting: true` — short-circuits creation and just acknowledges
  //      the existing category (no field changes), used by the
  //      "Link to existing" choice in the warning UI.
  const createRootMutation = useMutation({
    mutationFn: async (data) => {
      const existing = categories.find(
        c => c.name.toLowerCase() === data.name.toLowerCase()
      );

      if (data.useExisting && existing) {
        return { category: existing, restored: 0, usedExisting: true };
      }

      let category;
      if (existing) {
        // Defensive: shouldn't reach here from the UI since the warning
        // forces either useExisting or a name change. Keep behaviour
        // minimal — update the colour only, don't auto-link.
        await base44.entities.ActivityCategory.update(existing.id, { color: data.color });
        category = existing;
      } else {
        category = await base44.entities.ActivityCategory.create({
          name: data.name,
          color: data.color,
          parent_category_id: null,
          order: rootCategories.length,
        });
      }

      let restored = 0;
      if (data.linkOrphans) {
        // Explicit user choice — link orphan activities whose
        // activity_name matches this category but which have no
        // category linked yet. We never touch activities that are
        // already linked to other categories.
        const allActivities = await base44.entities.Activity.list();
        const orphaned = allActivities.filter(a =>
          a.activity_name?.toLowerCase() === data.name.toLowerCase() &&
          (a.activity_category_ids || []).length === 0
        );
        for (const act of orphaned) {
          await base44.entities.Activity.update(act.id, {
            activity_category_ids: [category.id],
          });
        }
        restored = orphaned.length;
      }

      return { category, restored, usedExisting: false };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["activityCategories"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      setIsCreatingRoot(false);
      setNewRootName("");
      setNewRootColor("#8b5cf6");
      setOrphanMatchCount(0);
      if (result.usedExisting) {
        toast.success("Linked to existing activity.");
      } else if (result.restored > 0) {
        toast.success(`Activity created — linked ${result.restored} past ${result.restored === 1 ? "activity" : "activities"}.`);
      } else {
        toast.success("Activity created!");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDrop = async (draggedCatId, targetCatId) => {
    if (draggedCatId === targetCatId) return;
    // Refuse drops that would make a node an ancestor of itself —
    // e.g. dragging "Self Care" onto "Self Care › Brushing teeth". A
    // cycle here used to brick the Activities page on next render.
    const byId = indexById(categories);
    if (wouldCreateCycle(draggedCatId, targetCatId, byId)) {
      toast.error("Can't nest an activity inside one of its own sub-activities.");
      return;
    }
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
              // Per-row error boundary — a single bad row (malformed
              // colour, missing name, etc.) can't blank the entire
              // customization dialog any more.
              <ErrorBoundary
                key={cat.id}
                fallback={(err, reset) => (
                  <div className="text-xs text-destructive p-2 rounded border border-destructive/40 bg-destructive/5">
                    Couldn't render "{cat.name || "(unnamed)"}".
                    <button type="button" onClick={reset} className="ml-2 underline hover:no-underline">Retry</button>
                  </div>
                )}
              >
                <ActivityTreeRow
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
              </ErrorBoundary>
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
                  // Bail to Cancel on Escape. Enter only submits the
                  // clean path — when the name collides with an existing
                  // category or has orphan matches, the warning UI is
                  // the only way forward. This is deliberate: silently
                  // linking past activities by name is what the previous
                  // version did, and it caused surprising side effects.
                  if (e.key === "Enter" && newRootName.trim() && !existingCategoryMatch && orphanMatchCount === 0) {
                    createRootMutation.mutate({ name: newRootName.trim(), color: newRootColor, linkOrphans: false });
                  }
                  if (e.key === "Escape") { setIsCreatingRoot(false); setNewRootName(""); setOrphanMatchCount(0); }
                }}
                placeholder="Activity name"
                className="flex-1"
              />
              {!existingCategoryMatch && orphanMatchCount === 0 && (
                <>
                  <Button
                    onClick={() => {
                      if (newRootName.trim()) {
                        createRootMutation.mutate({ name: newRootName.trim(), color: newRootColor, linkOrphans: false });
                      }
                    }}
                    disabled={!newRootName.trim() || orphanCheckLoading}
                  >
                    Create
                  </Button>
                  <Button variant="outline" onClick={() => { setIsCreatingRoot(false); setNewRootName(""); setOrphanMatchCount(0); }}>Cancel</Button>
                </>
              )}
            </div>

            {/* Name conflict — existing category */}
            {existingCategoryMatch && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    A category named <strong>"{existingCategoryMatch.name}"</strong> already exists. Saving this name would just link to the existing one — past activities won't be auto-attached unless you explicitly choose to link them on the existing category.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      createRootMutation.mutate({
                        name: newRootName.trim(),
                        color: newRootColor,
                        useExisting: true,
                      })
                    }
                  >
                    Link to existing
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setNewRootName(""); setOrphanMatchCount(0); }}>
                    Use a different name
                  </Button>
                </div>
              </div>
            )}

            {/* No existing category, but orphan activities with this name */}
            {!existingCategoryMatch && orphanMatchCount > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    Saving this name will link <strong>{orphanMatchCount}</strong> past {orphanMatchCount === 1 ? "activity" : "activities"} with the same name to this new category. You can keep them separate by choosing a different name.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      createRootMutation.mutate({
                        name: newRootName.trim(),
                        color: newRootColor,
                        linkOrphans: true,
                      })
                    }
                  >
                    Create &amp; link {orphanMatchCount} past
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      createRootMutation.mutate({
                        name: newRootName.trim(),
                        color: newRootColor,
                        linkOrphans: false,
                      })
                    }
                  >
                    Create without linking
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setNewRootName(""); setOrphanMatchCount(0); }}>
                    Use a different name
                  </Button>
                </div>
              </div>
            )}
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