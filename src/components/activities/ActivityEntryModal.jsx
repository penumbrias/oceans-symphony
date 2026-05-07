import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function ActivityEntryModal({
  isOpen,
  onClose,
  selectedDate,
  selectedHour,
  allActivities,
  alters,
}) {
  const queryClient = useQueryClient();
  const [activityName, setActivityName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [selectedAlters, setSelectedAlters] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [category, setCategory] = useState("other");

  // Get unique activity names from history for autocomplete
  const uniqueActivityNames = useMemo(() => {
    const names = new Set(allActivities.map((a) => a.activity_name));
    return Array.from(names).filter((name) =>
      name.toLowerCase().includes(activityName.toLowerCase())
    );
  }, [activityName, allActivities]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Activity.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Activity logged!");
      resetForm();
      onClose();
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activityName.trim()) {
      toast.error("Activity name is required");
      return;
    }

    const timestamp = selectedDate
      ? new Date(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate(),
          selectedHour || 0,
          0,
          0
        )
      : new Date();

    createMutation.mutate({
      timestamp: timestamp.toISOString(),
      activity_name: activityName.trim(),
      duration_minutes: durationMinutes ? parseInt(durationMinutes) : null,
      fronting_alter_ids: selectedAlters,
      category,
      notes: "",
    });
  };

  const resetForm = () => {
    setActivityName("");
    setDurationMinutes("");
    setSelectedAlters([]);
    setShowSuggestions(false);
    setCategory("other");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const dateDisplay = selectedDate
    ? `${format(selectedDate, "MMM d, yyyy")}${selectedHour !== undefined ? ` at ${String(selectedHour).padStart(2, "0")}:00` : ""}`
    : "Today";

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">{dateDisplay}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Activity name with autocomplete */}
          <div className="space-y-2">
            <Label htmlFor="activity">Activity Name</Label>
            <div className="relative">
              <Input
                id="activity"
                placeholder="e.g., Drawing, Reading, Gaming"
                value={activityName}
                onChange={(e) => {
                  setActivityName(e.target.value);
                  setShowSuggestions(e.target.value.length > 0);
                }}
                onFocus={() =>
                  setShowSuggestions(activityName.length > 0)
                }
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                autoFocus
              />
              {showSuggestions && uniqueActivityNames.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-md mt-1 z-10 max-h-40 overflow-y-auto">
                  {uniqueActivityNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setActivityName(name);
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors text-sm"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Activity Type</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
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

          {/* Duration (optional) */}
          <div className="space-y-2">
            <Label htmlFor="duration">Duration (minutes) - Optional</Label>
            <Input
              id="duration"
              type="number"
              placeholder="e.g., 30"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              min="0"
              step="5"
            />
          </div>

          {/* Alters (optional) */}
          {alters.length > 0 && (
            <div className="space-y-2">
              <Label>Fronting Alters (optional)</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {alters.map((alter) => (
                  <label
                    key={alter.id}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAlters.includes(alter.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAlters([...selectedAlters, alter.id]);
                        } else {
                          setSelectedAlters(
                            selectedAlters.filter((id) => id !== alter.id)
                          );
                        }
                      }}
                      className="rounded border-input"
                    />
                    <span className="text-sm">{alter.alias || alter.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !activityName.trim()}
            >
              {createMutation.isPending ? "Saving..." : "Log Activity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}