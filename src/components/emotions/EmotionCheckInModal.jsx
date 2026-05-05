import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Heart, X } from "lucide-react";
import EmotionWheelPicker from "@/components/emotions/EmotionWheelPicker";
import AlterAvatar from "@/components/shared/AlterAvatar";

export default function EmotionCheckInModal({ isOpen, onClose, alters = [], currentFronterIds = [] }) {
  const queryClient = useQueryClient();
  const [selectedEmotions, setSelectedEmotions] = useState([]);
  const [selectedAlters,   setSelectedAlters]   = useState([]);
  const [alterInput,       setAlterInput]        = useState("");
  const [note,             setNote]              = useState("");
  const [saving,           setSaving]            = useState(false);
  const [activity,         setActivity]          = useState("");
  const [activityDuration, setActivityDuration]  = useState("");

  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => base44.entities.CustomEmotion.list(),
  });

  const activeAlters = useMemo(() => alters.filter(a => !a.is_archived), [alters]);

  const filteredAlters = useMemo(() => {
    if (!alterInput.trim()) return [];
    return activeAlters.filter(
      a => !selectedAlters.includes(a.id) &&
        (a.name.toLowerCase().includes(alterInput.toLowerCase()) ||
         a.alias?.toLowerCase().includes(alterInput.toLowerCase()))
    );
  }, [alterInput, activeAlters, selectedAlters]);

  const addCustomMutation = useMutation({
    mutationFn: async (label) => {
      const existing = customEmotions.find(e => e.label.toLowerCase() === label.toLowerCase());
      if (existing) return existing;
      return base44.entities.CustomEmotion.create({ label });
    },
    onSuccess: (emotion) => {
      setSelectedEmotions(prev => prev.includes(emotion.label) ? prev : [...prev, emotion.label]);
      queryClient.invalidateQueries({ queryKey: ["customEmotions"] });
    },
  });

  const toggleEmotion = (label) => {
    setSelectedEmotions(prev =>
      prev.includes(label) ? prev.filter(e => e !== label) : [...prev, label]
    );
  };

  React.useEffect(() => {
    if (isOpen && currentFronterIds.length > 0) {
      setSelectedAlters(currentFronterIds.filter(Boolean));
    }
  }, [isOpen, currentFronterIds]);

  const resetForm = () => {
    setSelectedEmotions([]);
    setSelectedAlters([]);
    setNote("");
    setActivity("");
    setActivityDuration("");
    setAlterInput("");
  };

  const createCheckInMutation = useMutation({
    mutationFn: async () => {
      let journalEntryId = null;
      if (note && note.split(/\s+/).length > 500) {
        const entry = await base44.entities.JournalEntry.create({
          title: `Emotion Check-in - ${new Date().toLocaleDateString()}`,
          content: note,
          entry_type: "personal",
          tags: ["emotion-checkin"],
        });
        journalEntryId = entry.id;
      }
      return base44.entities.EmotionCheckIn.create({
        timestamp: new Date().toISOString(),
        emotions: selectedEmotions,
        fronting_alter_ids: selectedAlters,
        note: note.split(/\s+/).length <= 500 ? note : note.substring(0, 500) + "...",
        journal_entry_id: journalEntryId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      resetForm();
      onClose();
    },
  });

  const handleSaveActivity = async () => {
    if (!activity.trim()) return;
    try {
      await base44.entities.Activity.create({
        timestamp: new Date().toISOString(),
        activity_name: activity,
        category: "other",
        duration_minutes: activityDuration ? parseInt(activityDuration) : null,
        fronting_alter_ids: selectedAlters,
      });
    } catch (err) {
      console.error("Failed to log activity", err);
    }
  };

  const handleSubmit = async () => {
    if (selectedEmotions.length === 0) return;
    setSaving(true);
    await handleSaveActivity();
    await createCheckInMutation.mutateAsync();
    setSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden p-0">

        {/* Fixed header */}
        <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-destructive" />
              Quick Emotion Check-In
            </DialogTitle>
            <DialogDescription>How are you feeling right now?</DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
          <EmotionWheelPicker
            selectedEmotions={selectedEmotions}
            onToggle={toggleEmotion}
            customEmotions={customEmotions}
            onAddCustom={(label) => addCustomMutation.mutate(label)}
          />

          <div>
            <p className="text-sm font-medium mb-2">Who's fronting? <span className="text-muted-foreground font-normal">(optional)</span></p>
            <div className="relative mb-2">
              <Input
                placeholder="Type name or alias..."
                value={alterInput}
                onChange={e => setAlterInput(e.target.value)}
                className="text-sm"
              />
              {filteredAlters.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 max-h-32 overflow-y-auto">
                  {filteredAlters.map(alter => (
                    <button key={alter.id}
                      onClick={() => { setSelectedAlters(prev => [...prev, alter.id]); setAlterInput(""); }}
                      className="w-full text-left p-2 hover:bg-muted flex items-center gap-2 text-sm transition-colors">
                      <AlterAvatar alter={alter} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{alter.name}</p>
                        {alter.alias && <p className="text-xs text-muted-foreground truncate">{alter.alias}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedAlters.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {selectedAlters.map(alterId => {
                  const alter = activeAlters.find(a => a.id === alterId);
                  return (
                    <div key={alterId} className="relative group">
                      <div className="aspect-square rounded-lg bg-muted overflow-hidden">
                        <AlterAvatar alter={alter} size="w-full h-full" rounded="none" />
                      </div>
                      <div className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <button onClick={() => setSelectedAlters(prev => prev.filter(id => id !== alterId))}
                          aria-label={`Remove ${alter?.alias || alter?.name || "alter"}`}
                          className="bg-destructive text-destructive-foreground rounded-full p-1">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-xs font-medium text-center mt-1 truncate">{alter?.alias || alter?.name}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-2">What activity? <span className="text-muted-foreground font-normal">(optional)</span></p>
            <div className="flex gap-2">
              <Input placeholder="e.g., Drawing, Playing games..." value={activity}
                onChange={e => setActivity(e.target.value)} className="flex-1 text-sm" />
              <Input type="number" placeholder="mins" value={activityDuration}
                onChange={e => setActivityDuration(e.target.value)} className="w-20 text-sm" min="0" />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Quick note <span className="text-muted-foreground font-normal">(optional)</span></p>
            <Textarea placeholder="Optional note..." value={note}
              onChange={e => setNote(e.target.value)} className="h-20 text-xs" />
            {note && (
              <p className="text-xs text-muted-foreground mt-1">
                {note.split(/\s+/).length} words
                {note.split(/\s+/).length > 500 && " · will create journal entry"}
              </p>
            )}
          </div>
        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-border/50">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSubmit} disabled={selectedEmotions.length === 0 || saving} className="flex-1">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Check-In
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}