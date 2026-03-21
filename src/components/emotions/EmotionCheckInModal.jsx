import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Heart } from "lucide-react";

const EMOTIONS = [
  "Happy", "Sad", "Angry", "Anxious", "Calm", "Excited", 
  "Confused", "Grateful", "Frustrated", "Hopeful", "Neutral", "Overwhelmed"
];

export default function EmotionCheckInModal({ isOpen, onClose, alters = [] }) {
  const queryClient = useQueryClient();
  const [selectedEmotions, setSelectedEmotions] = useState([]);
  const [selectedAlters, setSelectedAlters] = useState([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const createCheckInMutation = useMutation({
    mutationFn: async (data) => {
      let journalEntryId = null;
      
      // If note is over 500 words, create journal entry
      if (note && note.split(/\s+/).length > 500) {
        const entry = await base44.entities.JournalEntry.create({
          title: `Emotion Check-in - ${new Date().toLocaleDateString()}`,
          content: note,
          entry_type: "personal",
          tags: ["emotion-checkin"]
        });
        journalEntryId = entry.id;
      }

      return base44.entities.EmotionCheckIn.create({
        timestamp: new Date().toISOString(),
        emotions: selectedEmotions,
        fronting_alter_ids: selectedAlters,
        note: note.split(/\s+/).length <= 500 ? note : note.substring(0, 500) + "...",
        journal_entry_id: journalEntryId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
      resetForm();
      onClose();
    }
  });

  const resetForm = () => {
    setSelectedEmotions([]);
    setSelectedAlters([]);
    setNote("");
  };

  const handleSubmit = async () => {
    if (selectedEmotions.length === 0) return;
    setSaving(true);
    await createCheckInMutation.mutateAsync({});
    setSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-destructive" />
            Quick Emotion Check-In
          </DialogTitle>
          <DialogDescription>How are you feeling right now?</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Emotions */}
          <div>
            <p className="text-sm font-medium mb-2">Select emotions</p>
            <div className="grid grid-cols-3 gap-2">
              {EMOTIONS.map((emotion) => (
                <button
                  key={emotion}
                  onClick={() =>
                    setSelectedEmotions(
                      selectedEmotions.includes(emotion)
                        ? selectedEmotions.filter(e => e !== emotion)
                        : [...selectedEmotions, emotion]
                    )
                  }
                  className={`px-3 py-2 text-xs rounded-lg font-medium transition-all ${
                    selectedEmotions.includes(emotion)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {emotion}
                </button>
              ))}
            </div>
          </div>

          {/* Alters */}
          <div>
            <p className="text-sm font-medium mb-2">Who's fronting? (optional)</p>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {alters.filter(a => !a.is_archived).map((alter) => (
                <label key={alter.id} className="flex items-center gap-2 text-sm p-2 hover:bg-muted rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedAlters.includes(alter.id)}
                    onChange={() =>
                      setSelectedAlters(
                        selectedAlters.includes(alter.id)
                          ? selectedAlters.filter(id => id !== alter.id)
                          : [...selectedAlters, alter.id]
                      )
                    }
                    className="w-4 h-4 rounded"
                  />
                  {alter.name}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm p-2 hover:bg-muted rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedAlters.includes("unsure")}
                  onChange={() =>
                    setSelectedAlters(
                      selectedAlters.includes("unsure")
                        ? selectedAlters.filter(id => id !== "unsure")
                        : [...selectedAlters, "unsure"]
                    )
                  }
                  className="w-4 h-4 rounded"
                />
                Unsure
              </label>
            </div>
          </div>

          {/* Note */}
          <div>
            <p className="text-sm font-medium mb-2">Quick note (max 500 words)</p>
            <Textarea
              placeholder="Optional note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-20 text-xs"
            />
            {note && (
              <p className="text-xs text-muted-foreground mt-1">
                {note.split(/\s+/).length} words
                {note.split(/\s+/).length > 500 && " (will create journal entry)"}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={selectedEmotions.length === 0 || saving}
              className="flex-1"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Check-In
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}