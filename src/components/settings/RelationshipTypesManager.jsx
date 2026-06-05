import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Archive, RotateCcw, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_RELATIONSHIP_TYPES,
  getRootTypes,
  indexTypesById,
  wouldCreateTypeCycle,
} from "@/lib/relationshipTypes";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import RelationshipTypeTreeRow from "@/components/settings/RelationshipTypeTreeRow";

/**
 * Relationship-type management — a nested, drag-to-nest/reorder tree editor
 * mirroring the Activity "Customize Activities" menu
 * (src/components/activities/ActivityCustomizationMenu.jsx). Lives inside the
 * existing Settings Card shell (it's a settings section, not a Dialog).
 *
 * Nesting is purely organisational. The AlterRelationship.relationship_type
 * field stores a type's LABEL (a string), never its id, so re-parenting /
 * reordering a type never touches existing relationships — only the inline
 * rename does, which is the same explicit edit the prior flat manager exposed.
 *
 * Archive support is kept from the prior manager: the tree shows active types;
 * archived types live in a flat "Archived" section below the tree with a
 * restore action. (Archive lives off the tree because dragging archived rows
 * around the active hierarchy is more confusing than useful.)
 */
export default function RelationshipTypesManager() {
  const qc = useQueryClient();
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [creatingSubFor, setCreatingSubFor] = useState(null);
  const [newSubName, setNewSubName] = useState("");
  const [isCreatingRoot, setIsCreatingRoot] = useState(false);
  const [newRootName, setNewRootName] = useState("");
  const [newRootColor, setNewRootColor] = useState("#6b7280");
  const [showRootColorPicker, setShowRootColorPicker] = useState(false);

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["relationshipTypes"],
    queryFn: async () => {
      const existing = await base44.entities.RelationshipType.list();
      if (existing.length === 0) {
        // First-load default seeding — unchanged from the prior manager.
        await Promise.all(
          DEFAULT_RELATIONSHIP_TYPES.map((t, i) =>
            base44.entities.RelationshipType.create({ ...t, order: i, is_default: true })
          )
        );
        return base44.entities.RelationshipType.list();
      }
      return existing;
    },
  });

  // Active types drive the tree; archived types render flat below. Pass the
  // active list to getRootTypes so a child whose parent was archived re-roots
  // sensibly instead of vanishing (see getRootTypes' archiving note).
  const activeTypes = types.filter((t) => !t.is_archived);
  const archivedTypes = [...types.filter((t) => t.is_archived)].sort(
    (a, b) => (a.order || 0) - (b.order || 0)
  );
  const rootTypes = getRootTypes(activeTypes);

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
      // parent_id chain can't send us into infinite recursion while deleting.
      const visited = new Set();
      const deleteTree = async (typeId) => {
        if (visited.has(typeId)) return;
        visited.add(typeId);
        const children = types.filter(
          (t) => t.parent_id === typeId && t.id !== typeId
        );
        for (const child of children) await deleteTree(child.id);
        await base44.entities.RelationshipType.delete(typeId);
      };
      await deleteTree(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["relationshipTypes"] });
      toast.success("Deleted!");
      setSelectedId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RelationshipType.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["relationshipTypes"] }),
    onError: (e) => toast.error(e.message),
  });

  const createSubMutation = useMutation({
    mutationFn: async ({ parentId, label }) => {
      const parent = types.find((t) => t.id === parentId);
      await base44.entities.RelationshipType.create({
        label,
        color: parent?.color || "#6b7280",
        parent_id: parentId,
        is_archived: false,
        is_default: false,
        order: types.filter((t) => t.parent_id === parentId).length,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["relationshipTypes"] });
      setCreatingSubFor(null);
      setNewSubName("");
      toast.success("Sub-type created!");
    },
    onError: (e) => toast.error(e.message),
  });

  const createRootMutation = useMutation({
    mutationFn: async ({ label, color }) => {
      await base44.entities.RelationshipType.create({
        label,
        color,
        parent_id: null,
        is_archived: false,
        is_default: false,
        order: rootTypes.length,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["relationshipTypes"] });
      setIsCreatingRoot(false);
      setNewRootName("");
      setNewRootColor("#6b7280");
      toast.success("Relationship type created!");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDrop = async (draggedTypeId, targetTypeId) => {
    if (draggedTypeId === targetTypeId) return;
    // Refuse drops that would make a node an ancestor of itself — e.g.
    // dragging "Family" onto "Family › Sibling". A cycle here would brick
    // the tree renderer on the next pass.
    const byId = indexTypesById(types);
    if (wouldCreateTypeCycle(draggedTypeId, targetTypeId, byId)) {
      toast.error("Can't nest a type inside one of its own sub-types.");
      return;
    }
    // Only parent_id changes — the label is never touched, so existing
    // relationships that resolve by label keep working.
    await base44.entities.RelationshipType.update(draggedTypeId, { parent_id: targetTypeId });
    qc.invalidateQueries({ queryKey: ["relationshipTypes"] });
    setSelectedId(null);
    toast.success("Moved!");
  };

  const handleMoveToRoot = async (id) => {
    await base44.entities.RelationshipType.update(id, { parent_id: null });
    qc.invalidateQueries({ queryKey: ["relationshipTypes"] });
    setSelectedId(null);
  };

  const handleToggleArchive = async (t) => {
    await base44.entities.RelationshipType.update(t.id, { is_archived: !t.is_archived });
    qc.invalidateQueries({ queryKey: ["relationshipTypes"] });
    setSelectedId(null);
    toast.success(t.is_archived ? "Restored" : "Archived");
  };

  if (isLoading) return null;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Relationship Types</CardTitle>
            <CardDescription>
              {activeTypes.length} active type{activeTypes.length !== 1 ? "s" : ""}. Drag to reorder or nest under a parent. Click to select, then edit, add a sub-type, or delete.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="space-y-1 bg-card rounded-lg border border-border p-3 min-h-[100px] max-h-80 overflow-y-auto">
          {rootTypes.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground text-sm">No relationship types yet. Create one below.</p>
          ) : (
            rootTypes.map((type) => (
              // Per-row error boundary — a single bad row (malformed colour,
              // missing label, etc.) can't blank the whole settings section.
              <ErrorBoundary
                key={type.id}
                fallback={(err, reset) => (
                  <div className="text-xs text-destructive p-2 rounded border border-destructive/40 bg-destructive/5">
                    Couldn't render "{type.label || "(unnamed)"}".
                    <button type="button" onClick={reset} className="ml-2 underline hover:no-underline">Retry</button>
                  </div>
                )}
              >
                <RelationshipTypeTreeRow
                  type={type}
                  allTypes={activeTypes}
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
                    if (newSubName.trim()) createSubMutation.mutate({ parentId, label: newSubName.trim() });
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
              ↑ Move selected to top level
            </button>
          )}

          {/* Archived types — flat list below the active tree */}
          {archivedTypes.length > 0 && (
            <div className="pt-3 mt-2 border-t border-border">
              <p className="text-xs text-muted-foreground/70 pb-1">Archived</p>
              {archivedTypes.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg opacity-50 group hover:bg-muted/40 transition-colors"
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || "#6b7280" }} />
                  <span className="text-sm text-foreground flex-1 truncate">{t.label}</span>
                  <span className="text-xs text-muted-foreground italic flex-shrink-0">archived</span>
                  <button
                    onClick={() => handleToggleArchive(t)}
                    className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded flex-shrink-0"
                    title="Restore"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Archive the selected active type (kept available since the tree row
            itself only exposes edit/add/delete, matching ActivityTreeRow). */}
        {selectedId && activeTypes.some((t) => t.id === selectedId) && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => {
              const t = types.find((x) => x.id === selectedId);
              if (t) handleToggleArchive(t);
            }}
          >
            <Archive className="w-3.5 h-3.5" /> Archive selected type
          </Button>
        )}

        {/* Create root type */}
        {isCreatingRoot ? (
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-sm font-medium">New Relationship Type</p>
            <div className="flex gap-2 items-center flex-wrap">
              <button
                type="button"
                onClick={() => setShowRootColorPicker(true)}
                className="w-9 h-9 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0"
                style={{ backgroundColor: newRootColor }}
              />
              {showRootColorPicker && (
                <ColorPickerModal
                  color={newRootColor}
                  label="Relationship type color"
                  onSave={(hex) => setNewRootColor(hex)}
                  onClose={() => setShowRootColorPicker(false)}
                />
              )}
              <Input
                autoFocus
                value={newRootName}
                onChange={(e) => setNewRootName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newRootName.trim()) {
                    createRootMutation.mutate({ label: newRootName.trim(), color: newRootColor });
                  }
                  if (e.key === "Escape") { setIsCreatingRoot(false); setNewRootName(""); }
                }}
                placeholder="Type name"
                className="flex-1 min-w-[6rem]"
              />
              <Button
                onClick={() => {
                  if (newRootName.trim()) {
                    createRootMutation.mutate({ label: newRootName.trim(), color: newRootColor });
                  }
                }}
                disabled={!newRootName.trim()}
              >
                Create
              </Button>
              <Button variant="outline" onClick={() => { setIsCreatingRoot(false); setNewRootName(""); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setIsCreatingRoot(true)} variant="outline" className="w-full gap-2">
            <Plus className="w-4 h-4" /> Add Relationship Type
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
