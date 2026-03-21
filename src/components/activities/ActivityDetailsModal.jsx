import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { toast } from "sonner";
import { Trash2, Loader2, Palette } from "lucide-react";

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--foreground))";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

export default function ActivityDetailsModal({ isOpen, onClose, activity, alters, onSave }) {
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // Handle both single activity and array of activities
  const activities = Array.isArray(activity) ? activity : activity ? [activity] : [];

  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list(),
  });

  if (activities.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Activity Details</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const getEmotionsForActivity = (act) => {
    const emotionCheckIn = emotionCheckIns.find(e => {
      const checkInTime = new Date(e.timestamp);
      const actTime = new Date(act.timestamp);
      return Math.abs(checkInTime - actTime) < 300000;
    });
    return emotionCheckIn?.emotions || [];
  };

  const handleEdit = (act) => {
    setEditingId(act.id);
    setEditData({
      activity_name: act.activity_name,
      color: act.color,
      fronting_alter_ids: act.fronting_alter_ids || [],
      notes: act.notes || "",
    });
  };

  const handleSave = async (actId) => {
    if (!editData.activity_name.trim()) {
      toast.error("Activity name is required");
      return;
    }

    setIsLoading(true);
    try {
      await base44.entities.Activity.update(actId, editData);
      toast.success("Activity updated!");
      setEditingId(null);
      onSave?.();
    } catch (err) {
      toast.error(err.message || "Failed to update activity");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (actId) => {
    if (!confirm("Delete this activity?")) return;

    setIsLoading(true);
    try {
      await base44.entities.Activity.delete(actId);
      toast.success("Activity deleted");
      onSave?.();
      if (activities.length === 1) onClose();
    } catch (err) {
      toast.error(err.message || "Failed to delete activity");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAlter = (alterId) => {
    setEditData((prev) => ({
      ...prev,
      fronting_alter_ids: prev.fronting_alter_ids.includes(alterId)
        ? prev.fronting_alter_ids.filter((id) => id !== alterId)
        : [...prev.fronting_alter_ids, alterId],
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Activity Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {activities.map((act) => {
            const isEditing = editingId === act.id;
            const duration = Math.round((act.duration_minutes || 0) / 60 * 10) / 10;
            const startTime = new Date(act.timestamp);
            const endTime = new Date(startTime.getTime() + (act.duration_minutes || 0) * 60000);
            const activityAlters = (act.fronting_alter_ids || [])
              .map(id => alters.find(a => a.id === id))
              .filter(Boolean);

            return (
              <div key={act.id} className="space-y-3 pb-4 border-b border-border/50 last:border-b-0">
                {!isEditing ? (
                  <>
                    {/* View Mode */}
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Time</span>
                        <span className="font-medium">
                          {format(startTime, "MMM d, yyyy • HH:mm")} - {format(endTime, "HH:mm")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duration</span>
                        <span className="font-medium">{duration}h</span>
                      </div>
                    </div>

                    {/* Emotions */}
                    {getEmotionsForActivity(act).length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold mb-2">Emotions</p>
                        <div className="flex flex-wrap gap-1.5">
                          {getEmotionsForActivity(act).map((emotion, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 bg-accent/20 text-accent-foreground rounded-full text-xs font-medium"
                            >
                              {emotion}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fronting Alters */}
                    {activityAlters.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold mb-2">Fronting Alters</p>
                        <div className="flex flex-wrap gap-1.5">
                          {activityAlters.map((alter) => (
                            <div
                              key={alter.id}
                              className="px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2"
                              style={{ borderColor: alter.color }}
                            >
                              {alter.avatar_url && (
                                <img
                                  src={alter.avatar_url}
                                  alt={alter.name}
                                  className="w-4 h-4 rounded-full object-cover"
                                />
                              )}
                              <span>{alter.alias || alter.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Activity Name */}
                    <div>
                      <p className="text-xs text-muted-foreground font-semibold mb-2">Activity</p>
                      <div
                        className="rounded-lg p-3 text-sm font-medium text-center"
                        style={{
                          backgroundColor: act.color,
                          color: getContrastColor(act.color),
                        }}
                      >
                        {act.activity_name}
                      </div>
                    </div>

                    {/* Notes */}
                    {act.notes && (
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold mb-2">Notes</p>
                        <p className="text-sm bg-muted/30 rounded p-2">{act.notes}</p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => handleEdit(act)}
                        className="flex-1"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => handleDelete(act.id)}
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Edit Mode */}
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-foreground">Activity Name</label>
                        <Input
                          value={editData.activity_name}
                          onChange={(e) => setEditData({ ...editData, activity_name: e.target.value })}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-foreground">Color</label>
                        <div className="flex gap-2 mt-1">
                          <input
                            type="color"
                            value={editData.color}
                            onChange={(e) => setEditData({ ...editData, color: e.target.value })}
                            className="w-12 h-9 rounded-md cursor-pointer border border-border"
                          />
                          <Input
                            value={editData.color}
                            onChange={(e) => setEditData({ ...editData, color: e.target.value })}
                            placeholder="#8B5CF6"
                            className="flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">
                          Fronting Alters
                        </label>
                        <div className="space-y-2 max-h-40 overflow-y-auto border border-border rounded-lg p-3 bg-muted/20">
                          {alters.map((alter) => (
                            <div key={alter.id} className="flex items-center gap-2">
                              <Checkbox
                                checked={editData.fronting_alter_ids.includes(alter.id)}
                                onCheckedChange={() => handleToggleAlter(alter.id)}
                                id={`alter-${act.id}-${alter.id}`}
                              />
                              <label htmlFor={`alter-${act.id}-${alter.id}`} className="text-sm cursor-pointer flex-1">
                                {alter.alias || alter.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-foreground">Notes</label>
                        <Textarea
                          value={editData.notes}
                          onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                          placeholder="Any notes..."
                          className="mt-1 h-20"
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          onClick={() => setEditingId(null)}
                          disabled={isLoading}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => handleSave(act.id)}
                          disabled={isLoading}
                          className="flex-1 bg-primary hover:bg-primary/90"
                        >
                          {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          Save
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}