import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Heart, X, Plus } from "lucide-react";
import { toast } from "sonner";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import EmotionWheelPicker from "@/components/emotions/EmotionWheelPicker";


export default function QuickCheckInModal({ isOpen, onClose, alters = [], currentFronterIds = [] }) {
  const queryClient = useQueryClient();
  const terms = useTerms();
  const [selectedEmotions, setSelectedEmotions] = useState([]);
  const [selectedAlters, setSelectedAlters] = useState([]);
  const [selectedActivityCategories, setSelectedActivityCategories] = useState([]);
  const [alterInput, setAlterInput] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [activityDuration, setActivityDuration] = useState("");
  const [newActivityName, setNewActivityName] = useState("");
  const [showNewActivity, setShowNewActivity] = useState(false);

  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => base44.entities.CustomEmotion.list(),
  });

  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

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

  const addCustomEmotionMutation = useMutation({
    mutationFn: async ({ label, category = "custom" }) => {
      const existing = customEmotions.find(e => e.label.toLowerCase() === label.toLowerCase());
      if (existing) return existing;
      return base44.entities.CustomEmotion.create({ label, category });
    },
    onSuccess: (emotion) => {
      setSelectedEmotions(prev =>
        prev.includes(emotion.label) ? prev : [...prev, emotion.label]
      );
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
      setSelectedAlters(currentFronterIds.filter(id => id));
    }
  }, [isOpen, currentFronterIds]);

  const createCheckInMutation = useMutation({
    mutationFn: async () => {
      let journalEntryId = null;
      const wordCount = note ? note.trim().split(/\s+/).filter(Boolean).length : 0;
      if (note && wordCount > 50) {
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
        note: wordCount <= 50 ? note : note.substring(0, 300) + "...",
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

  const resetForm = () => {
    setSelectedEmotions([]);
    setSelectedAlters([]);
    setNote("");
    setSelectedActivityCategories([]);
    setActivityDuration("");
    setNewActivityName("");
    setShowNewActivity(false);
  };

  const handleCreateNewActivity = async () => {
    if (!newActivityName.trim()) return;
    const newCat = await base44.entities.ActivityCategory.create({
      name: newActivityName.trim(),
      color: "#8b5cf6",
      parent_category_id: null,
    });
    queryClient.invalidateQueries({ queryKey: ["activityCategories"] });
    setSelectedActivityCategories(prev => [...prev, newCat.id]);
    setNewActivityName("");
    setShowNewActivity(false);
  };

  const handleSaveActivity = async () => {
    if (selectedActivityCategories.length === 0) return;
    const catById = Object.fromEntries(activityCategories.map(c => [c.id, c]));
    for (const catId of selectedActivityCategories) {
      const cat = catById[catId];
      await base44.entities.Activity.create({
        timestamp: new Date().toISOString(),
        activity_name: cat?.name || catId,
        activity_category_ids: [catId],
        duration_minutes: activityDuration ? parseInt(activityDuration) : null,
        fronting_alter_ids: selectedAlters,
        emotions: selectedEmotions,
      });
    }
  };

const handleSubmit = async () => {
  if (selectedEmotions.length === 0) return;
  setSaving(true);
  try {
    await handleSaveActivity();

    const currentSorted = [...currentFronterIds].sort();
    const selectedSorted = [...selectedAlters].sort();
    if (JSON.stringify(currentSorted) !== JSON.stringify(selectedSorted) && selectedAlters.length > 0) {
      const now = new Date().toISOString();

      // End all active sessions
      const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });
      for (const s of activeSessions) {
        await base44.entities.FrontingSession.update(s.id, {
          is_active: false,
          end_time: now,
        });
      }

      // Create one session with all selected alters — first one is primary
      await base44.entities.FrontingSession.create({
        primary_alter_id: selectedAlters[0],
        co_fronter_ids: selectedAlters.slice(1),
        start_time: now,
        is_active: true,
        end_time: null,
      });

      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    }

    await createCheckInMutation.mutateAsync();
  } finally {
    setSaving(false);
  }
};

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-destructive" />
            Quick Check-In
          </DialogTitle>
          <DialogDescription>Track your emotions, activities, and state</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">How are you feeling?</p>
            <EmotionWheelPicker
              selectedEmotions={selectedEmotions}
              onToggle={toggleEmotion}
              customEmotions={customEmotions}
              onAddCustom={(label, category) => addCustomEmotionMutation.mutate({ label, category })}
            />
          </div>

          <div>
            <p className="text-sm font-medium mb-2">
              Who's {terms.fronting}? <span className="text-muted-foreground font-normal">(optional)</span>
            </p>
            <div className="relative mb-2">
              <Input
                placeholder={`Type ${terms.alter} name or alias...`}
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
                      {alter.avatar_url
                        ? <img src={alter.avatar_url} alt={alter.name} className="w-6 h-6 rounded-full object-cover" />
                        : <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                            style={{ backgroundColor: alter.color || "#8b5cf6" }}>{alter.name?.charAt(0)}</div>
                      }
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
                        {alter?.avatar_url
                          ? <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"
                              style={{ backgroundColor: alter?.color ? `${alter.color}30` : "hsl(var(--muted))" }}>
                              <span className="text-xs font-bold" style={{ color: alter?.color || "hsl(var(--primary))" }}>
                                {alter?.name?.charAt(0)}
                              </span>
                            </div>
                        }
                      </div>
                      <div className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <button onClick={() => setSelectedAlters(prev => prev.filter(id => id !== alterId))}
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

          <ActivityPillSelector
            selectedActivities={selectedActivityCategories}
            onActivityChange={setSelectedActivityCategories}
            duration={activityDuration}
            onDurationChange={setActivityDuration}
          />

          {showNewActivity ? (
            <div className="space-y-2">
              <Input placeholder="Activity name..." value={newActivityName}
                onChange={e => setNewActivityName(e.target.value)} className="text-sm" autoFocus />
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  onClick={() => { setShowNewActivity(false); setNewActivityName(""); }}
                  className="flex-1">Cancel</Button>
                <Button size="sm" onClick={handleCreateNewActivity}
                  disabled={!newActivityName.trim()} className="flex-1">Add</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewActivity(true)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors flex items-center justify-center gap-1">
              <Plus className="w-4 h-4" /> Create new activity
            </button>
          )}

          <div>
            <p className="text-sm font-medium mb-2">
              Quick note <span className="text-muted-foreground font-normal">(optional — over 50 words becomes a journal)</span>
            </p>
            <Textarea placeholder="Optional note..." value={note}
              onChange={e => setNote(e.target.value)} className="h-20 text-xs" />
            {note && (
              <p className="text-xs text-muted-foreground mt-1">
                {note.trim().split(/\s+/).filter(Boolean).length} / 50 words
                {note.trim().split(/\s+/).filter(Boolean).length > 50 && " · will save as journal entry"}
              </p>
            )}
          </div>

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
