import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Heart, X } from "lucide-react";

const EMOTIONS = [
  "Happy", "Sad", "Angry", "Anxious", "Calm", "Excited", 
  "Confused", "Grateful", "Frustrated", "Hopeful", "Neutral", "Overwhelmed"
];

export default function EmotionCheckInModal({ isOpen, onClose, alters = [], currentFronterIds = [] }) {
  const queryClient = useQueryClient();
  const [selectedEmotions, setSelectedEmotions] = useState([]);
  const [selectedAlters, setSelectedAlters] = useState([]);
  const [alterInput, setAlterInput] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const activeAlters = useMemo(() => alters.filter(a => !a.is_archived), [alters]);
  
  const filteredAlters = useMemo(() => {
    if (!alterInput.trim()) return [];
    return activeAlters.filter(
      a => 
        !selectedAlters.includes(a.id) &&
        (a.name.toLowerCase().includes(alterInput.toLowerCase()) || 
         a.alias?.toLowerCase().includes(alterInput.toLowerCase()))
    );
  }, [alterInput, activeAlters, selectedAlters]);

  React.useEffect(() => {
    if (isOpen && currentFronterIds.length > 0) {
      setSelectedAlters(currentFronterIds.filter(id => id));
    }
  }, [isOpen, currentFronterIds]);

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
            <div className="relative mb-3">
              <Input
                placeholder="Type name or alias..."
                value={alterInput}
                onChange={(e) => setAlterInput(e.target.value)}
                className="text-sm"
              />
              {filteredAlters.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 max-h-32 overflow-y-auto">
                  {filteredAlters.map((alter) => (
                    <button
                      key={alter.id}
                      onClick={() => {
                        setSelectedAlters([...selectedAlters, alter.id]);
                        setAlterInput("");
                      }}
                      className="w-full text-left p-2 hover:bg-muted flex items-center gap-2 text-sm transition-colors"
                    >
                      {alter.avatar_url && (
                        <img src={alter.avatar_url} alt={alter.name} className="w-6 h-6 rounded-full object-cover" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{alter.name}</p>
                        {alter.alias && <p className="text-xs text-muted-foreground truncate">{alter.alias}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected alters grid */}
            {selectedAlters.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {selectedAlters.map((alterId) => {
                  const alter = activeAlters.find(a => a.id === alterId);
                  return (
                    <div key={alterId} className="relative group">
                      <div className="aspect-square rounded-lg bg-muted flex flex-col items-center justify-center p-2 text-center">
                        {alter?.avatar_url ? (
                          <img src={alter.avatar_url} alt={alter.name} className="w-full h-full rounded-lg object-cover" />
                        ) : (
                          <div className="w-full h-full rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">{alter?.name.charAt(0)}</span>
                          </div>
                        )}
                      </div>
                      <div className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <button
                          onClick={() => setSelectedAlters(selectedAlters.filter(id => id !== alterId))}
                          className="bg-destructive text-destructive-foreground rounded-full p-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-xs font-medium text-center mt-1 truncate">{alter?.alias || alter?.name}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedAlters.includes("unsure") && (
              <div className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm">
                <span>Unsure</span>
                <button
                  onClick={() => setSelectedAlters(selectedAlters.filter(id => id !== "unsure"))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
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