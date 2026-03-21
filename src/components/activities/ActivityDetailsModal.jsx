import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";

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
  const [isEditing, setIsEditing] = useState(false);
  const [activityName, setActivityName] = useState(activity?.activity_name || "");
  const [category, setCategory] = useState(activity?.category || "other");
  const [color, setColor] = useState(activity?.color || "#8B5CF6");
  const [selectedAlters, setSelectedAlters] = useState(activity?.fronting_alter_ids || []);
  const [notes, setNotes] = useState(activity?.notes || "");
  const [isLoading, setIsLoading] = useState(false);

  if (!activity) return null;

  const duration = Math.round((activity.duration_minutes || 0) / 60 * 10) / 10;
  const startTime = new Date(activity.timestamp);
  const endTime = new Date(startTime.getTime() + (activity.duration_minutes || 0) * 60000);

  const handleToggleAlter = (alterId) => {
    setSelectedAlters((prev) =>
      prev.includes(alterId)
        ? prev.filter((id) => id !== alterId)
        : [...prev, alterId]
    );
  };

  const handleSave = async () => {
    if (!activityName.trim()) {
      toast.error("Activity name is required");
      return;
    }

    setIsLoading(true);
    try {
      await base44.entities.Activity.update(activity.id, {
        activity_name: activityName,
        category,
        color,
        fronting_alter_ids: selectedAlters,
        notes: notes || null,
      });

      toast.success("Activity updated!");
      setIsEditing(false);
      onSave?.();
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to update activity");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this activity?")) return;

    setIsLoading(true);
    try {
      await base44.entities.Activity.delete(activity.id);
      toast.success("Activity deleted");
      onSave?.();
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to delete activity");
    } finally {
      setIsLoading(false);
    }
  };

  const activityAlters = alters.filter((a) => selectedAlters.includes(a.id));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Activity Details</DialogTitle>
        </DialogHeader>

        {!isEditing ? (
          // View mode
          <div className="space-y-4">
            <div
              className="rounded-lg p-4 text-center"
              style={{
                backgroundColor: color,
                color: getContrastColor(color),
              }}
            >
              <h3 className="text-lg font-bold">{activity.activity_name}</h3>
              <p className="text-sm opacity-90 mt-1">{category}</p>
            </div>

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

            {activity.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="text-sm bg-muted/30 rounded p-2">{activity.notes}</p>
              </div>
            )}

            {activityAlters.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Fronting Alters</p>
                <div className="space-y-1.5">
                  {activityAlters.map((alter) => (
                    <div
                      key={alter.id}
                      className="flex items-center gap-2 p-2 rounded-lg border border-border/50"
                    >
                      {alter.avatar_url && (
                        <img
                          src={alter.avatar_url}
                          alt={alter.name}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      )}
                      <span className="text-sm font-medium">{alter.alias || alter.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="flex-1"
              >
                Edit
              </Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={handleDelete}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        ) : (
          // Edit mode
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">
                Activity Name
              </label>
              <Input
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">
                Category
              </label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="play">Play</SelectItem>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="art">Art</SelectItem>
                  <SelectItem value="drawing">Drawing</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Color</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-12 h-9 rounded-md cursor-pointer border border-border"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
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
                      checked={selectedAlters.includes(alter.id)}
                      onCheckedChange={() => handleToggleAlter(alter.id)}
                      id={`alter-${alter.id}`}
                    />
                    <label htmlFor={`alter-${alter.id}`} className="text-sm cursor-pointer flex-1">
                      {alter.alias || alter.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes..."
                className="mt-1 h-20"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isLoading}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}