import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Play, Users } from "lucide-react";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import MentionTextarea from "@/components/shared/MentionTextarea";
import ActivityLogModal from "@/components/activities/ActivityLogModal";
import ContactMultiSelect from "@/components/contacts/ContactMultiSelect";
import { contactDisplayName } from "@/lib/contacts";
import { addActiveActivity } from "@/lib/activitySession";
import { toLocalDatetimeValue, fromLocalDatetimeValue } from "@/lib/dateTimeInput";

// Dashboard quick-start button. Default path is a MINIMAL "start this now"
// flow — no fronting-alter picker by design (that's what the toggle below
// exists for: flip to "Log activity" and get the real ActivityLogModal,
// exactly as used in the Activity Tracker, with all its usual fields).
export default function StartActivityModal({ isOpen, onClose, alters = [] }) {
  const [mode, setMode] = useState("start"); // "start" | "log"
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const [startTimeStr, setStartTimeStr] = useState(() => toLocalDatetimeValue(new Date().toISOString()));
  const [notes, setNotes] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list(),
  });

  const reset = () => {
    setSelectedCategoryIds([]);
    setStartTimeStr(toLocalDatetimeValue(new Date().toISOString()));
    setNotes("");
    setSelectedContactIds([]);
    setMode("start");
  };

  const handleClose = () => { reset(); onClose(); };

  // Flipped to "Log activity" — delegate entirely to the real modal.
  if (mode === "log") {
    return (
      <ActivityLogModal
        isOpen={isOpen}
        onClose={handleClose}
        alters={alters}
        frontingHistory={[]}
        onSave={handleClose}
      />
    );
  }

  const handleStart = () => {
    if (selectedCategoryIds.length === 0) {
      toast.error("Select an activity");
      return;
    }
    const startDate = fromLocalDatetimeValue(startTimeStr);
    if (!startDate) {
      toast.error("Set a start time");
      return;
    }
    setStarting(true);
    try {
      const catId = selectedCategoryIds[0];
      const cat = categories.find((c) => c.id === catId);
      addActiveActivity({
        categoryId: catId,
        name: cat?.name || catId,
        color: cat?.color || null,
        startTime: startDate.toISOString(),
        alterIds: [],
        contactIds: selectedContactIds,
        notes: notes.trim() || "",
      });
      toast.success(`▶ Started ${cat?.name || "activity"}`);
      handleClose();
    } finally {
      setStarting(false);
    }
  };

  const selectedContactNames = selectedContactIds
    .map((id) => contacts.find((c) => c.id === id))
    .filter(Boolean)
    .map(contactDisplayName);

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-4 h-4" /> Start Activity
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-muted/30">
          <span className="text-sm font-medium">Log activity instead</span>
          <Switch checked={mode === "log"} onCheckedChange={(v) => setMode(v ? "log" : "start")} />
        </div>

        <div className="space-y-3">
          <div>
            <ActivityPillSelector
              selectedActivities={selectedCategoryIds}
              onActivityChange={setSelectedCategoryIds}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Start time <span className="text-destructive">*</span></label>
            <input
              type="datetime-local"
              value={startTimeStr}
              onChange={(e) => setStartTimeStr(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setContactsOpen(true)}
              className="w-full flex items-center gap-1.5 text-left px-3 py-2 rounded-lg border border-border/60 bg-background text-sm hover:border-foreground/30"
            >
              <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className={selectedContactNames.length ? "text-foreground truncate" : "text-muted-foreground"}>
                {selectedContactNames.length ? `Company: ${selectedContactNames.join(", ")}` : "Choose who you're with…"}
              </span>
            </button>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Notes</label>
            <MentionTextarea
              value={notes}
              onChange={setNotes}
              alters={alters || []}
              placeholder="Notes… @ to mention"
              className="mt-1 h-20"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
          <Button className="flex-1 gap-1.5" onClick={handleStart} disabled={starting}>
            <Play className="w-3.5 h-3.5" /> Start
          </Button>
        </div>
      </DialogContent>

      <ContactMultiSelect
        isOpen={contactsOpen}
        onClose={() => setContactsOpen(false)}
        selectedContactIds={selectedContactIds}
        onChange={setSelectedContactIds}
      />
    </Dialog>
  );
}
