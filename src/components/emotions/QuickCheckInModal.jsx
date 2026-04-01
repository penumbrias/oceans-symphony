import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Heart, X, Plus, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import { HexColorPicker } from "react-colorful";

function ColorPickerModal({ color = "#8b5cf6", label = "Color", onSave, onClose }) {
  const [hex, setHex] = React.useState(color);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border-2 border-border rounded-xl p-6 space-y-4 max-w-sm mx-4 w-full">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{label}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <HexColorPicker color={hex} onChange={setHex} style={{ width: "100%" }} />
        <input
          type="text"
          value={hex}
          onChange={(e) => { if (/^#?[0-9A-F]{0,6}$/i.test(e.target.value)) setHex(e.target.value); }}
          placeholder="#000000"
          className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-mono"
        />
        <div className="w-full h-12 rounded-lg border-2 border-border" style={{ backgroundColor: hex }} />
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 font-medium text-sm cursor-pointer">
            Cancel
          </button>
          <button type="button" onClick={() => { onSave(hex); onClose(); }}
            disabled={!/^#[0-9A-F]{6}$/i.test(hex)}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm cursor-pointer disabled:opacity-50">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const PRESET_EMOTIONS = [
  "Happy", "Sad", "Angry", "Anxious", "Calm", "Excited", 
  "Confused", "Grateful", "Frustrated", "Hopeful", "Neutral", "Overwhelmed"
];

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
  const [newEmotionInput, setNewEmotionInput] = useState("");
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

  const allEmotions = useMemo(() => {
    const customLabels = customEmotions.map(ce => ce.label);
    return [...PRESET_EMOTIONS, ...customLabels];
  }, [customEmotions]);

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
    mutationFn: async (label) => {
      const existing = customEmotions.find(e => e.label.toLowerCase() === label.toLowerCase());
      if (existing) {
        return existing;
      }
      return base44.entities.CustomEmotion.create({ label });
    },
    onSuccess: (emotion) => {
      setSelectedEmotions([...selectedEmotions, emotion.label]);
      setNewEmotionInput("");
      queryClient.invalidateQueries({ queryKey: ["customEmotions"] });
    }
  });

  React.useEffect(() => {
    if (isOpen && currentFronterIds.length > 0) {
      setSelectedAlters(currentFronterIds.filter(id => id));
    }
  }, [isOpen, currentFronterIds]);

  const createCheckInMutation = useMutation({
    mutationFn: async (data) => {
      let journalEntryId = null;
      
      // If note is over 50 words, create journal entry
      const wordCount = note ? note.trim().split(/\s+/).filter(Boolean).length : 0;
      if (note && wordCount > 50) {
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
        note: note.trim().split(/\s+/).filter(Boolean).length <= 50 ? note : note.substring(0, 300) + "...",
        journal_entry_id: journalEntryId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      resetForm();
      onClose();
    }
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

  const handleSaveActivity = async () => {
    if (selectedActivityCategories.length === 0 && !newActivityName.trim()) return;
    
    // Save category-based activities
   if (selectedActivityCategories.length > 0) {
  const catById = Object.fromEntries(activityCategories.map((c) => [c.id, c]));
  // Create one activity record per selected category
  for (const catId of selectedActivityCategories) {
    const cat = catById[catId];
    await base44.entities.Activity.create({
      timestamp: new Date().toISOString(),
      activity_name: cat?.name || catId,
      activity_category_ids: [catId],
      duration_minutes: activityDuration ? parseInt(activityDuration) : null,
      fronting_alter_ids: selectedAlters,
    });
  }
}
    
    // Save new activity if entered
    if (newActivityName.trim()) {
      await base44.entities.Activity.create({
        timestamp: new Date().toISOString(),
        activity_name: newActivityName.trim(),
        activity_category_ids: [],
        duration_minutes: activityDuration ? parseInt(activityDuration) : null,
        fronting_alter_ids: selectedAlters,
      });
    }
  };

  const handleSubmit = async () => {
    if (selectedEmotions.length === 0) return;
    setSaving(true);
    try {
      await handleSaveActivity();

      // Update front history if alters changed
      const currentSorted = [...currentFronterIds].sort();
      const selectedSorted = [...selectedAlters].sort();
      if (JSON.stringify(currentSorted) !== JSON.stringify(selectedSorted)) {
        const now = new Date().toISOString();
        const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });
        // End old session at this moment, then start a new one
        for (const s of activeSessions) {
  await base44.entities.FrontingSession.update(s.id, {
    is_active: false,
    end_time: now,
  });
}
if (selectedAlters.length > 0) {
  await base44.entities.FrontingSession.create({
    primary_alter_id: selectedAlters[0],
    co_fronter_ids: selectedAlters.slice(1),
    start_time: now,
    is_active: true,
  });
}
        queryClient.invalidateQueries({ queryKey: ["activeFront"] });
        queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      }

      await createCheckInMutation.mutateAsync({});
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
          {/* Emotions */}
          <div>
            <p className="text-sm font-medium mb-2">Select emotions</p>
            <div className="grid grid-cols-3 gap-2">
              {allEmotions.map((emotion) => (
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

            {/* Add custom emotion */}
            <div className="flex gap-2 mt-3">
              <Input
                placeholder="Add custom emotion..."
                value={newEmotionInput}
                onChange={(e) => setNewEmotionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newEmotionInput.trim()) {
                    addCustomEmotionMutation.mutate(newEmotionInput.trim());
                  }
                }}
                className="text-sm flex-1"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  if (newEmotionInput.trim()) {
                    addCustomEmotionMutation.mutate(newEmotionInput.trim());
                  }
                }}
                disabled={!newEmotionInput.trim()}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Alters */}
          <div>
            <p className="text-sm font-medium mb-2">Who's {terms.fronting}? (optional)</p>
            <div className="relative mb-3">
              <Input
                placeholder={`Type ${terms.alter} name or alias...`}
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
          </div>

          {/* Activities */}
          <ActivityPillSelector 
            selectedActivities={selectedActivityCategories}
            onActivityChange={setSelectedActivityCategories}
            duration={activityDuration}
            onDurationChange={setActivityDuration}
          />

          {/* New Activity */}
          {showNewActivity ? (
            <div className="space-y-2">
              <Input
                placeholder="Activity name..."
                value={newActivityName}
                onChange={(e) => setNewActivityName(e.target.value)}
                className="text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setShowNewActivity(false); setNewActivityName(""); }} className="flex-1">Cancel</Button>
                <Button size="sm" onClick={() => { setShowNewActivity(false); }} disabled={!newActivityName.trim()} className="flex-1">Add</Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewActivity(true)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" /> Create new activity
            </button>
          )}

          {/* Note */}
          <div>
            <p className="text-sm font-medium mb-2">Quick note (max 50 words — longer becomes a journal)</p>
            <Textarea
              placeholder="Optional note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-20 text-xs"
            />
            {note && (
              <p className="text-xs text-muted-foreground mt-1">
                {note.trim().split(/\s+/).filter(Boolean).length} / 50 words
                {note.trim().split(/\s+/).filter(Boolean).length > 50 && " — will save as journal entry"}
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