import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { toast } from "sonner";

export default function ActivityLogModal({
  isOpen,
  onClose,
  onSave,
  selectedDate,
  alters,
}) {
  const [activityName, setActivityName] = useState("");
  const [category, setCategory] = useState("other");
  const [duration, setDuration] = useState("");
  const [selectedAlters, setSelectedAlters] = useState([]);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
      await base44.entities.Activity.create({
        timestamp: selectedDate?.toISOString() || new Date().toISOString(),
        activity_name: activityName,
        category,
        duration_minutes: duration ? parseInt(duration) : null,
        fronting_alter_ids: selectedAlters,
        notes: notes || null,
      });

      setActivityName("");
      setCategory("other");
      setDuration("");
      setSelectedAlters([]);
      setNotes("");
      onSave?.();
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to log activity");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Log Activity{selectedDate && ` - ${format(selectedDate, "MMM d")}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Activity name */}
          <div>
            <label className="text-sm font-medium text-foreground">
              What were you doing?
            </label>
            <Input
              value={activityName}
              onChange={(e) => setActivityName(e.target.value)}
              placeholder="e.g., Drawing, Playing games, Working"
              className="mt-1"
            />
          </div>

          {/* Category */}
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

          {/* Duration */}
          <div>
            <label className="text-sm font-medium text-foreground">
              Duration (minutes) - Optional
            </label>
            <Input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g., 30"
              className="mt-1"
              min="0"
            />
          </div>

          {/* Alters */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Who was fronting?
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {alters.map((alter) => (
                <div key={alter.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedAlters.includes(alter.id)}
                    onCheckedChange={() => handleToggleAlter(alter.id)}
                    id={`alter-${alter.id}`}
                  />
                  <label
                    htmlFor={`alter-${alter.id}`}
                    className="text-sm cursor-pointer"
                  >
                    {alter.alias || alter.name}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-foreground">
              Notes - Optional
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              className="mt-1 h-20"
            />
          </div>

          {/* Save button */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90"
            >
              {isLoading ? "Saving..." : "Save Activity"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}