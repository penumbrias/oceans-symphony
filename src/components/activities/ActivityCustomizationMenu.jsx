import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Edit2, X, GripVertical } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export default function ActivityCustomizationMenu({ onClose }) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#8b5cf6");

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const mainCategories = useMemo(() => {
    return categories
      .filter(c => !c.parent_category_id)
      .sort((a, b) => a.order - b.order);
  }, [categories]);

  const getSubcategories = (parentId) => {
    return categories
      .filter(c => c.parent_category_id === parentId)
      .sort((a, b) => a.order - b.order);
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ActivityCategory.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activityCategories"] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.ActivityCategory.update(data.id, {
      name: data.name,
      color: data.color
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activityCategories"] });
      setEditingId(null);
    }
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ActivityCategory.create({
      name: data.name,
      color: data.color,
      parent_category_id: null,
      order: mainCategories.length
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activityCategories"] });
      setShowCreateForm(false);
      setNewName("");
      setNewColor("#8b5cf6");
    }
  });

  const startEdit = (category) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditColor(category.color || "#8b5cf6");
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customize Activities</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Main categories */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Main Activities</h3>
            <div className="space-y-2">
              {mainCategories.map((cat) => (
                <div key={cat.id}>
                  {editingId === cat.id ? (
                    <div className="flex gap-2 items-end">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Activity name"
                        className="text-sm flex-1"
                      />
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="w-10 h-9 rounded cursor-pointer"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          updateMutation.mutate({
                            id: cat.id,
                            name: editName,
                            color: editColor
                          });
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2 bg-muted rounded group hover:bg-muted/80 transition-colors">
                      <div className="flex items-center gap-2 flex-1">
                        <GripVertical className="w-4 h-4 text-muted-foreground opacity-50 group-hover:opacity-100" />
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: cat.color || "#8b5cf6" }}
                        />
                        <span className="text-sm font-medium">{cat.name}</span>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => startEdit(cat)}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(cat.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Subcategories */}
                  {!editingId && (
                    <div className="ml-6 mt-1 space-y-1">
                      {getSubcategories(cat.id).map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between p-2 bg-secondary rounded text-sm group hover:bg-secondary/80 transition-colors"
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: sub.color || "#a78bfa" }}
                            />
                            <span className="text-xs font-medium">{sub.name}</span>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100"
                            onClick={() => deleteMutation.mutate(sub.id)}
                          >
                            <X className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Create new activity */}
          {showCreateForm ? (
            <div className="space-y-2 pt-2 border-t border-border">
              <h3 className="text-sm font-semibold">New Activity</h3>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Activity name"
                className="text-sm"
              />
              <div className="flex gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-10 h-9 rounded cursor-pointer"
                />
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (newName.trim()) {
                      createMutation.mutate({
                        name: newName.trim(),
                        color: newColor
                      });
                    }
                  }}
                >
                  Create
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowCreateForm(true)}
              className="w-full gap-2"
              variant="outline"
            >
              <Plus className="w-4 h-4" />
              New Activity
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}