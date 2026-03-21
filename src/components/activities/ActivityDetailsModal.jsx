import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";

function getContrastColor(hex) {
  if (!hex) return "#000000";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

export default function ActivityDetailsModal({ isOpen, onClose, activity, alters = [], onSave }) {
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // Handle both single activity and array of activities
  const activities = useMemo(() => {
    if (!activity) return [];
    return Array.isArray(activity) ? activity : [activity];
  }, [activity]);

  // Fetch emotion check-ins to show emotions for this time
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list(),
  });

  const getEmotionsNearActivity = (act) => {
    const actTime = new Date(act.timestamp);
    const emotionData = emotionCheckIns.find((e) => {
      const eTime = new Date(e.timestamp);
      // Find emotions within 30 minutes
      return Math.abs(eTime - actTime) < 30 * 60 * 1000;
    });
    return emotionData?.emotions || [];
  };

  const handleEdit = (act) => {
    setEditingId(act.id);
    setEditData({
      activity_category_ids: act.activity_category_ids || [],
      duration_minutes: act.duration_minutes || 60,
      fronting_alter_ids: act.fronting_alter_ids || [],
      notes: act.notes || "",
    });
  };

  const handleSave = async (actId) => {
    if (!editData.activity_name.trim()) {
      toast.error("Activity name required");
      return;
    }

    setIsLoading(true);
    try {
      await base44.entities.Activity.update(actId, editData);
      toast.success("Activity updated");
      setEditingId(null);
      onSave?.();
    } catch (err) {
      toast.error("Failed to update activity");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (actId) => {
    if (!window.confirm("Delete this activity?")) return;

    setIsLoading(true);
    try {
      await base44.entities.Activity.delete(actId);
      toast.success("Activity deleted");
      onSave?.();
      if (activities.length === 1) {
        onClose();
      }
    } catch (err) {
      toast.error("Failed to delete");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAlter = (alterId) => {
    setEditData((prev) => ({
      ...prev,
      fronting_alter_ids: prev.fronting_alter_ids.includes(alterId)
        ? prev.fronting_alter_ids.filter((id) => id !== alterId)
        : [...prev.fronting_alter_ids, alterId],
    }));
  };

  if (activities.length === 0) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Activity Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {activities.map((act) => {
            const isEditing = editingId === act.id;
            const startTime = new Date(act.timestamp);
            const endTime = new Date(startTime.getTime() + (act.duration_minutes || 60) * 60000);
            const activityAlters = (act.fronting_alter_ids || [])
              .map((id) => alters.find((a) => a.id === id))
              .filter(Boolean);
            const emotions = getEmotionsNearActivity(act);

            return (
              <div
                key={act.id}
                className="border border-border rounded-lg p-4 space-y-4"
              >
                {!isEditing ? (
                  <>
                    {/* View Mode */}
                    <div className="space-y-3">
                      {/* Activity Title */}
                      <div
                        className="rounded-lg p-3 text-center font-semibold text-lg"
                        style={{
                          backgroundColor: act.color,
                          color: getContrastColor(act.color),
                        }}
                      >
                        {act.activity_name}
                      </div>

                      {/* Time Info */}
                      <div className="grid grid-cols-3 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                        <div>
                          <p className="text-muted-foreground text-xs font-semibold mb-1">Start</p>
                          <p className="font-medium">{format(startTime, "HH:mm")}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs font-semibold mb-1">End</p>
                          <p className="font-medium">{format(endTime, "HH:mm")}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs font-semibold mb-1">Duration</p>
                          <p className="font-medium">
                            {Math.round((act.duration_minutes || 60) / 60 * 10) / 10}h
                          </p>
                        </div>
                      </div>

                      {/* Fronting Alters */}
                      {activityAlters.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-2">
                            Fronting Alters
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {activityAlters.map((alter) => (
                              <div
                                key={alter.id}
                                className="px-3 py-2 rounded-lg border text-sm font-medium flex items-center gap-2"
                                style={{ borderColor: alter.color || "#999" }}
                              >
                                {alter.avatar_url && (
                                  <img
                                    src={alter.avatar_url}
                                    alt={alter.name}
                                    className="w-5 h-5 rounded-full object-cover"
                                  />
                                )}
                                <span>{alter.alias || alter.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Emotions */}
                      {emotions.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-2">
                            Emotions
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {emotions.map((emotion, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1.5 bg-accent/20 text-accent-foreground rounded-full text-sm font-medium"
                              >
                                {emotion}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {act.notes && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-2">
                            Notes
                          </p>
                          <p className="text-sm bg-muted/30 rounded-lg p-3">{act.notes}</p>
                        </div>
                      )}

                      {/* Actions */}
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
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Edit Mode */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold mb-2">Activity Name</label>
                        <Input
                          value={editData.activity_name}
                          onChange={(e) =>
                            setEditData({ ...editData, activity_name: e.target.value })
                          }
                          placeholder="Enter activity name"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold mb-2">Color</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={editData.color}
                            onChange={(e) =>
                              setEditData({ ...editData, color: e.target.value })
                            }
                            className="w-12 h-10 rounded-lg cursor-pointer border border-border"
                          />
                          <Input
                            value={editData.color}
                            onChange={(e) =>
                              setEditData({ ...editData, color: e.target.value })
                            }
                            placeholder="#8b5cf6"
                            className="flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold mb-2">
                          Duration (minutes)
                        </label>
                        <Input
                          type="number"
                          value={editData.duration_minutes}
                          onChange={(e) =>
                            setEditData({
                              ...editData,
                              duration_minutes: parseInt(e.target.value) || 60,
                            })
                          }
                          min="1"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold mb-2">
                          Fronting Alters
                        </label>
                        <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/20 max-h-48 overflow-y-auto">
                          {alters.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No alters available</p>
                          ) : (
                            alters.map((alter) => (
                              <div key={alter.id} className="flex items-center gap-2">
                                <Checkbox
                                  checked={editData.fronting_alter_ids.includes(alter.id)}
                                  onCheckedChange={() => toggleAlter(alter.id)}
                                  id={`alter-${alter.id}`}
                                />
                                <label
                                  htmlFor={`alter-${alter.id}`}
                                  className="text-sm cursor-pointer flex-1"
                                >
                                  {alter.alias || alter.name}
                                </label>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold mb-2">Notes</label>
                        <Textarea
                          value={editData.notes}
                          onChange={(e) =>
                            setEditData({ ...editData, notes: e.target.value })
                          }
                          placeholder="Add any notes..."
                          className="h-20"
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
                          className="flex-1"
                        >
                          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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