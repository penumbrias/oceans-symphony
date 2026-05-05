import React, { useState, useMemo, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Heart, X, Plus, Smile, Users, Zap, Activity, BookOpen, FileText, Star, User, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import EmotionWheelPicker from "@/components/emotions/EmotionWheelPicker";
import SymptomsSection from "@/components/symptoms/SymptomsSection";
import DiarySection, { hasDiaryData } from "@/components/diary/DiarySection";
import { seedSymptomDefaults } from "@/utils/symptomDefaults";
import { loadSystemDistressSet } from "@/lib/emotionDistress";
import SwitchJournalModal from "@/components/journal/SwitchJournalModal";

const TRIGGER_CATEGORIES = [
  { id: "sensory",         label: "Sensory",        emoji: "👂", hint: "loud noise, smell, touch" },
  { id: "emotional",       label: "Emotional",      emoji: "💙", hint: "grief, fear, loneliness" },
  { id: "interpersonal",   label: "Interpersonal",  emoji: "👥", hint: "conflict, rejection" },
  { id: "trauma_reminder", label: "Trauma reminder",emoji: "⚡", hint: "anniversary, place, memory" },
  { id: "physical",        label: "Physical",       emoji: "🫀", hint: "pain, fatigue, illness" },
  { id: "internal",        label: "Internal",       emoji: "🧠", hint: "intrusive thought, body memory" },
  { id: "unknown",         label: "Unknown",        emoji: "❓" },
];

const PILLS = [
{ id: "feeling", label: "Feeling", icon: Smile },
{ id: "fronting", label: "Fronting", icon: Users },
{ id: "activity", label: "Activity", icon: Zap },
{ id: "symptoms", label: "Symptoms / Habits", icon: Activity },
{ id: "diary", label: "Diary", icon: BookOpen },
{ id: "note", label: "Note", icon: FileText }];


export default function QuickCheckInModal({ isOpen, onClose, alters = [], currentFronterIds = [], initialSection = null, retroTimestamp = null }) {
  const queryClient = useQueryClient();
  const terms = useTerms();
  const [openSections, setOpenSections] = useState(new Set(["feeling"]));
  const [hadFrontingOpen, setHadFrontingOpen] = useState(false);

  // Feeling
  const [selectedEmotions, setSelectedEmotions] = useState([]);
  // Fronting
  const [primaryId, setPrimaryId] = useState("");
  const [coFronterIds, setCoFronterIds] = useState([]);
  const [alterSearch, setAlterSearch] = useState("");
  // Activity
  const [selectedActivityCategories, setSelectedActivityCategories] = useState([]);
  const [activityDuration, setActivityDuration] = useState("");
  const [newActivityName, setNewActivityName] = useState("");
  const [showNewActivity, setShowNewActivity] = useState(false);
  // Diary
  const [diaryData, setDiaryData] = useState({});
  // Note
  const [note, setNote] = useState("");
  // Switch journaling + trigger
  const [journalSwitch, setJournalSwitch] = useState(false);
  const [isTriggeredSwitch, setIsTriggeredSwitch] = useState(false);
  const [triggerCategory, setTriggerCategory] = useState("");
  const [triggerLabel, setTriggerLabel] = useState("");
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [newSessionId, setNewSessionId] = useState(null);
  const [showSupportPrompt, setShowSupportPrompt] = useState(false);
  const initialFrontRef = useRef({ primaryId: "", coFronterIds: [] });
  // Saving
  const [saving, setSaving] = useState(false);
  const [showGroundingPrompt, setShowGroundingPrompt] = useState(false);

  // datetime-local input value — defaults to retroTimestamp or now
  const toDatetimeLocal = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [entryTime, setEntryTime] = useState(() => toDatetimeLocal(retroTimestamp));

  const isDistressingEmotion = (label) => {
    const key = label.toLowerCase();
    const sysSet = loadSystemDistressSet();
    if (sysSet.has(key)) return true;
    const ce = customEmotions.find(e => e.label === label || e.label.toLowerCase() === key);
    return !!ce?.is_distressing;
  };

  const symptomGetterRef = useRef(null);

  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => base44.entities.CustomEmotion.list()
  });

  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list()
  });

  const activeAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);



  const toggleSection = (id) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    if (id === "fronting") setHadFrontingOpen(true);
  };

  useEffect(() => {
    if (isOpen) {
      setEntryTime(toDatetimeLocal(retroTimestamp));
      const initial = new Set(["feeling"]);
      if (initialSection) initial.add(initialSection);
      setOpenSections(initial);
      if (initialSection === "fronting") setHadFrontingOpen(true);
      // Load current active sessions to pre-populate fronting state
      base44.entities.FrontingSession.filter({ is_active: true }).then((active) => {
        const newModel = active.filter(s => s.alter_id);
        if (newModel.length > 0) {
          const primarySess = newModel.find(s => s.is_primary);
          const coSessions = newModel.filter(s => !s.is_primary);
          const pid = primarySess?.alter_id || "";
          const co = coSessions.map(s => s.alter_id);
          setPrimaryId(pid);
          setCoFronterIds(co);
          initialFrontRef.current = { primaryId: pid, coFronterIds: co };
        } else if (active.length > 0) {
          const s = active[0];
          const pid = s.primary_alter_id || "";
          const co = s.co_fronter_ids || [];
          setPrimaryId(pid);
          setCoFronterIds(co);
          initialFrontRef.current = { primaryId: pid, coFronterIds: co };
        } else if (currentFronterIds.length > 0) {
          setPrimaryId(currentFronterIds[0] || "");
          setCoFronterIds(currentFronterIds.slice(1));
          initialFrontRef.current = { primaryId: currentFronterIds[0] || "", coFronterIds: currentFronterIds.slice(1) };
        }
      }).catch(() => {
        if (currentFronterIds.length > 0) {
          setPrimaryId(currentFronterIds[0] || "");
          setCoFronterIds(currentFronterIds.slice(1));
        }
      });
      seedSymptomDefaults();
    } else {
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setSelectedEmotions([]);
    setPrimaryId("");
    setCoFronterIds([]);
    setAlterSearch("");
    setSelectedActivityCategories([]);
    setActivityDuration("");
    setNewActivityName("");
    setShowNewActivity(false);
    setDiaryData({});
    setNote("");
    setHadFrontingOpen(false);
    setJournalSwitch(false);
    setIsTriggeredSwitch(false);
    setTriggerCategory("");
    setTriggerLabel("");
    setShowJournalModal(false);
    setNewSessionId(null);
    setShowSupportPrompt(false);
    initialFrontRef.current = { primaryId: "", coFronterIds: [] };
    symptomGetterRef.current = null;
  };

  // Derived: all selected alter IDs
  const selectedAlterIds = useMemo(() => {
    const ids = new Set(coFronterIds);
    if (primaryId) ids.add(primaryId);
    return ids;
  }, [primaryId, coFronterIds]);

  // Derive flat array for legacy uses (activity logging, etc.)
  const selectedAlters = useMemo(() => [...selectedAlterIds], [selectedAlterIds]);

  const frontingActuallyChanged = useMemo(() => {
    if (!hadFrontingOpen) return false;
    const init = initialFrontRef.current;
    const initSet = new Set([init.primaryId, ...init.coFronterIds].filter(Boolean));
    const currSet = new Set([primaryId, ...coFronterIds].filter(Boolean));
    if (initSet.size !== currSet.size) return true;
    for (const id of currSet) if (!initSet.has(id)) return true;
    if (primaryId !== init.primaryId) return true;
    return false;
  }, [primaryId, coFronterIds, hadFrontingOpen]);

  const triggerString = useMemo(() => {
    const cat = TRIGGER_CATEGORIES.find(c => c.id === triggerCategory);
    return [cat?.label, triggerLabel].filter(Boolean).join(": ");
  }, [triggerCategory, triggerLabel]);

  const toggleAlter = (id) => {
    if (primaryId === id) {
      setPrimaryId("");
      return;
    }
    if (coFronterIds.includes(id)) {
      setCoFronterIds(coFronterIds.filter(x => x !== id));
    } else {
      setCoFronterIds([...coFronterIds, id]);
      if (!primaryId) setPrimaryId(id);
    }
  };

  const setAsPrimary = (id) => {
    if (primaryId === id) {
      setPrimaryId("");
      return;
    }
    setCoFronterIds([...coFronterIds.filter(x => x !== id), primaryId].filter(Boolean));
    setPrimaryId(id);
  };

  const addCustomEmotionMutation = useMutation({
    mutationFn: async ({ label, category = "custom" }) => {
      const existing = customEmotions.find((e) => e.label.toLowerCase() === label.toLowerCase());
      if (existing) return existing;
      return base44.entities.CustomEmotion.create({ label, category });
    },
    onSuccess: (emotion) => {
      setSelectedEmotions((prev) => prev.includes(emotion.label) ? prev : [...prev, emotion.label]);
      queryClient.invalidateQueries({ queryKey: ["customEmotions"] });
    }
  });

  const handleCreateNewActivity = async () => {
    if (!newActivityName.trim()) return;
    const newCat = await base44.entities.ActivityCategory.create({ name: newActivityName.trim(), color: "#8b5cf6", parent_category_id: null });
    queryClient.invalidateQueries({ queryKey: ["activityCategories"] });
    setSelectedActivityCategories((prev) => [...prev, newCat.id]);
    setNewActivityName("");setShowNewActivity(false);
  };

  const handleSaveActivities = async () => {
    if (selectedActivityCategories.length === 0) return;
    const catById = Object.fromEntries(activityCategories.map((c) => [c.id, c]));
    for (const catId of selectedActivityCategories) {
      const cat = catById[catId];
      await base44.entities.Activity.create({
        timestamp: new Date().toISOString(),
        activity_name: cat?.name || catId,
        activity_category_ids: [catId],
        duration_minutes: activityDuration ? parseInt(activityDuration) : null,
        fronting_alter_ids: selectedAlters,
        emotions: selectedEmotions
      });
    }
  };

  const handleSubmit = async () => {
    const symptomCheckIns = symptomGetterRef.current ? symptomGetterRef.current() : [];
    const hasData =
    selectedEmotions.length > 0 ||
    selectedAlterIds.size > 0 ||
    selectedActivityCategories.length > 0 ||
    note.trim().length > 0 ||
    symptomCheckIns.length > 0 ||
    hasDiaryData(diaryData);

    if (!hasData) {
      toast.error("Add at least one entry before saving");
      return;
    }

    setSaving(true);
    try {
      const now = entryTime ? new Date(entryTime).toISOString() : new Date().toISOString();
      await handleSaveActivities();

      // Fronting sync — if fronting section was opened at any point (even if later collapsed)
      if (hadFrontingOpen || openSections.has("fronting")) {
        const allSelectedIds = [...selectedAlterIds];
        const desiredMap = {}; // alterId -> is_primary
        for (const id of allSelectedIds) desiredMap[id] = id === primaryId;

        const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });

        // End legacy sessions
        for (const s of activeSessions.filter(s => !s.alter_id && s.primary_alter_id)) {
          await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
        }

        const newModelSessions = activeSessions.filter(s => s.alter_id);

        // End sessions for removed alters or those whose primary status changed
        for (const session of newModelSessions) {
          const isStillPresent = session.alter_id in desiredMap;
          const primaryChanged = isStillPresent && session.is_primary !== desiredMap[session.alter_id];
          if (!isStillPresent || primaryChanged) {
            await base44.entities.FrontingSession.update(session.id, { is_active: false, end_time: now });
          }
        }

        // Create sessions for new alters or those whose primary status changed
        let firstNewSessionId = null;
        for (const id of allSelectedIds) {
          const existing = newModelSessions.find(s => s.alter_id === id);
          const statusUnchanged = existing && existing.is_primary === desiredMap[id];
          if (!statusUnchanged) {
            const triggerExtras = isTriggeredSwitch && triggerCategory
              ? { is_triggered_switch: true, trigger_category: triggerCategory, trigger_label: triggerLabel }
              : {};
            const newSession = await base44.entities.FrontingSession.create({
              alter_id: id,
              is_primary: desiredMap[id],
              start_time: now,
              is_active: true,
              ...triggerExtras,
            });
            if (!firstNewSessionId) firstNewSessionId = newSession?.id || null;
          }
        }
        setNewSessionId(firstNewSessionId);

        queryClient.invalidateQueries({ queryKey: ["activeFront"] });
        queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      }

      // EmotionCheckIn
      let checkInId = null;
      if (selectedEmotions.length > 0 || note.trim() || selectedAlters.length > 0) {
        const wordCount = note ? note.trim().split(/\s+/).filter(Boolean).length : 0;
        let journalEntryId = null;
        if (note && wordCount > 50) {
          const entry = await base44.entities.JournalEntry.create({
            title: `Check-in - ${new Date(now).toLocaleDateString()}`,
            content: note,
            entry_type: "personal",
            tags: ["checkin"],
            folder: "Check-In Journals",
            created_date: now,
          });
          journalEntryId = entry.id;
        }
        const checkIn = await base44.entities.EmotionCheckIn.create({
          timestamp: now,
          emotions: selectedEmotions,
          fronting_alter_ids: selectedAlters,
          note: wordCount <= 50 ? note : note.substring(0, 300) + "...",
          journal_entry_id: journalEntryId
        });
        checkInId = checkIn?.id || null;
        queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
      }

      // SymptomCheckIns
      for (const sc of symptomCheckIns) {
        await base44.entities.SymptomCheckIn.create({
          symptom_id: sc.symptom_id,
          timestamp: now,
          severity: sc.severity,
          check_in_id: checkInId
        });
      }
      if (symptomCheckIns.length > 0) queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });

      // DiaryCard (only if diary-specific fields have data)
      if (hasDiaryData(diaryData)) {
        await base44.entities.DiaryCard.create({
          card_type: "daily",
          date: format(new Date(), "yyyy-MM-dd"),
          name: `Daily — ${format(new Date(), "MMM d, yyyy")}`,
          fronting_alter_ids: selectedAlters,
          emotions: selectedEmotions,
          urges: diaryData.urges || null,
          body_mind: diaryData.body_mind || null,
          skills_practiced: diaryData.skills?.skills_practiced ?? null,
          medication_safety: diaryData.skills ?
          {
            rx_meds_taken: diaryData.skills.rx_meds_taken,
            self_harm_occurred: diaryData.skills.self_harm_occurred,
            substances_count: diaryData.skills.substances_count
          } :
          null,
          notes: note.trim() ? { optional: note.trim() } : null
        });
        queryClient.invalidateQueries({ queryKey: ["diaryCards"] });
      }

      queryClient.invalidateQueries({ queryKey: ["activities"] });

      const hasDistress = selectedEmotions.some(e => isDistressingEmotion(e));
      if (journalSwitch && frontingActuallyChanged) {
        // Journal modal opens; support prompt shows after it closes
        setShowJournalModal(true);
        if (hasDistress || isTriggeredSwitch) setShowSupportPrompt(true);
      } else if (isTriggeredSwitch || hasDistress) {
        setShowGroundingPrompt(true);
      } else {
        onClose();
      }
    } catch (e) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (showGroundingPrompt) {
    const isTriggered = isTriggeredSwitch;
    return (
      <Dialog open={isOpen} onOpenChange={() => { setShowGroundingPrompt(false); onClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Check-in saved 🤍</DialogTitle>
            <DialogDescription>
              {isTriggered
                ? "You've noted a triggered switch. Would you like some support?"
                : "Would you like to try a grounding exercise?"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {isTriggered
                ? "It can help to use a grounding technique after a triggered switch."
                : "It looks like you might be having a hard time. A grounding technique might help."}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowGroundingPrompt(false); onClose(); }} className="flex-1">
                No thanks
              </Button>
              <Button onClick={() => { setShowGroundingPrompt(false); onClose(); window.location.href = "/grounding"; }} className="flex-1">
                Yes, open grounding
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
    {showJournalModal && (
      <SwitchJournalModal
        open={showJournalModal}
        onClose={() => {
          setShowJournalModal(false);
          if (showSupportPrompt) {
            setShowSupportPrompt(false);
            setShowGroundingPrompt(true);
          } else {
            onClose();
          }
        }}
        sessionId={newSessionId}
        authorAlterId={primaryId}
        defaultTrigger={triggerString}
      />
    )}
    <Dialog open={isOpen && !showJournalModal} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-destructive" />
            Quick Check-In
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 pt-1">
            <input
              type="datetime-local"
              value={entryTime}
              onChange={e => setEntryTime(e.target.value)}
              className="h-7 px-2 rounded-md border border-input bg-background text-xs text-foreground"
            />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Pill toggles — scrollable row on mobile */}
          <div className="flex flex-wrap gap-1.5 pb-1">
            {PILLS.map((pill) => {
              const PillIcon = pill.icon;
              return (
                <button key={pill.id} onClick={() => toggleSection(pill.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex-shrink-0 ${
                openSections.has(pill.id) ?
                "bg-primary text-primary-foreground border-primary" :
                "bg-card text-muted-foreground border-border hover:text-foreground"}`
                }>
                  <PillIcon className="w-3 h-3" />
                  {pill.label}
                </button>);

            })}
          </div>

          {/* Feeling */}
          {openSections.has("feeling") &&
          <div className="border border-border/50 rounded-xl p-3 space-y-2">
              <p className="text-sm font-medium">How are you feeling?</p>
              <EmotionWheelPicker
              selectedEmotions={selectedEmotions}
              onToggle={(label) => setSelectedEmotions((prev) => prev.includes(label) ? prev.filter((e) => e !== label) : [...prev, label])}
              customEmotions={customEmotions}
              onAddCustom={(label, category) => addCustomEmotionMutation.mutate({ label, category })} />
            
            </div>
          }

          {/* Fronting */}
          {openSections.has("fronting") &&
          <div className="border border-border/50 rounded-xl p-3 space-y-2">
              <p className="text-sm font-medium">Who's {terms.fronting}?</p>

              {/* Selected chips */}
              {selectedAlterIds.size > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {[...selectedAlterIds].map(id => {
                    const a = activeAlters.find(x => x.id === id);
                    if (!a) return null;
                    return (
                      <span key={id}
                        className="px-2.5 py-1 text-xs font-medium rounded-full flex items-center gap-1 border"
                        style={{ backgroundColor: a.color ? `${a.color}20` : undefined, borderColor: a.color || undefined }}>
                        {id === primaryId && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                        <button onClick={() => setAsPrimary(id)} className="hover:underline" title="Set as primary">{a.name}</button>
                        <button onClick={() => toggleAlter(id)} className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Tap to toggle · <Star className="inline w-3 h-3 text-amber-500 fill-amber-500" /> = Primary · hold to set primary</p>

              {/* Search */}
              <Input placeholder={`Search ${terms.alters}...`} value={alterSearch}
                onChange={(e) => setAlterSearch(e.target.value)} className="text-sm" />

              {/* Alter list */}
              <div className="max-h-40 overflow-y-auto space-y-1">
                {activeAlters
                  .filter(a => !alterSearch || a.name.toLowerCase().includes(alterSearch.toLowerCase()) || a.alias?.toLowerCase().includes(alterSearch.toLowerCase()))
                  .map(a => {
                    const isSelected = selectedAlterIds.has(a.id);
                    const isPrimary = primaryId === a.id;
                    return (
                      <div key={a.id} onClick={() => toggleAlter(a.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                          isSelected ? "border-primary/60 bg-primary/5" : "border-border/50 bg-card hover:bg-muted/30"
                        }`}>
                        <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30"
                          style={{ backgroundColor: a.color || "hsl(var(--muted))" }}>
                          {a.avatar_url
                            ? <img src={a.avatar_url} alt={a.name} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
                            : <User className="w-4 h-4 text-white/70" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{a.name}</p>
                          {a.pronouns && <p className="text-xs text-muted-foreground truncate">{a.pronouns}</p>}
                        </div>
                        <button onClick={e => { e.stopPropagation(); if (isSelected) setAsPrimary(a.id); }}
                            title={isPrimary ? "Primary fronter (tap to unset)" : isSelected ? "Set as primary" : "Select first"}
                            className={`p-1 rounded-md transition-colors flex-shrink-0 ${
                              isPrimary ? "text-amber-500" : isSelected ? "text-muted-foreground hover:text-amber-400" : "text-muted-foreground/30"
                            }`}>
                            <Star className={`w-4 h-4 ${isPrimary ? "fill-amber-500" : ""}`} />
                          </button>
                      </div>
                    );
                  })}
              </div>

              {/* Journal + trigger options — only show when front has changed */}
              {frontingActuallyChanged && (
                <div className="border-t border-border/40 pt-2 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={journalSwitch}
                      onChange={e => setJournalSwitch(e.target.checked)}
                      className="w-3.5 h-3.5 accent-primary"
                    />
                    <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Journal this {terms.switch}?</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isTriggeredSwitch}
                      onChange={e => setIsTriggeredSwitch(e.target.checked)}
                      className="w-3.5 h-3.5 accent-orange-500"
                    />
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-sm text-muted-foreground">This was a triggered {terms.switch}</span>
                  </label>
                  {isTriggeredSwitch && (
                    <div className="border border-orange-400/30 rounded-lg p-2.5 bg-orange-50/30 dark:bg-orange-900/10 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">What triggered it?</p>
                      <div className="flex flex-wrap gap-1">
                        {TRIGGER_CATEGORIES.map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setTriggerCategory(c => c === cat.id ? "" : cat.id)}
                            title={cat.hint}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
                              triggerCategory === cat.id
                                ? "bg-orange-100 text-orange-800 border-orange-400 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
                                : "text-muted-foreground border-border hover:bg-muted/50"
                            }`}
                          >
                            {cat.emoji} {cat.label}
                          </button>
                        ))}
                      </div>
                      <Input
                        value={triggerLabel}
                        onChange={e => setTriggerLabel(e.target.value)}
                        placeholder="Optional: describe the trigger..."
                        className="h-7 text-xs"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          }

          {/* Activity */}
          {openSections.has("activity") &&
          <div className="border border-border/50 rounded-xl p-3 space-y-2">
              <ActivityPillSelector selectedActivities={selectedActivityCategories}
            onActivityChange={setSelectedActivityCategories}
            duration={activityDuration} onDurationChange={setActivityDuration} />
              {showNewActivity ?
            <div className="space-y-2">
                  <Input placeholder="Activity name..." value={newActivityName}
              onChange={(e) => setNewActivityName(e.target.value)} className="text-sm" autoFocus />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => {setShowNewActivity(false);setNewActivityName("");}} className="flex-1">Cancel</Button>
                    <Button size="sm" onClick={handleCreateNewActivity} disabled={!newActivityName.trim()} className="flex-1">Add</Button>
                  </div>
                </div> :

            <button onClick={() => setShowNewActivity(true)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary hover:text-foreground transition-colors flex items-center justify-center gap-1">
                  <Plus className="w-4 h-4" /> Create new activity
                </button>
            }
            </div>
          }

          {/* Symptoms / Habits */}
          {openSections.has("symptoms") &&
          <div className="border border-border/50 rounded-xl p-3">
              <SymptomsSection onCheckInsReady={(getter) => {symptomGetterRef.current = getter;}} />
            </div>
          }

          {/* Diary */}
          {openSections.has("diary") &&
          <div className="border border-border/50 rounded-xl p-3 space-y-2">
              <p className="text-sm font-medium">Daily Log</p>
              <DiarySection
              data={diaryData}
              onChange={(groupKey, value) => setDiaryData((prev) => ({ ...prev, [groupKey]: value }))} />
            
            </div>
          }

          {/* Note */}
          {openSections.has("note") &&
          <div className="border border-border/50 rounded-xl p-3 space-y-2">
              <p className="text-sm font-medium">Quick note <span className="text-muted-foreground font-normal">(over 50 words → journal)</span></p>
              <Textarea placeholder="Optional note..." value={note} onChange={(e) => setNote(e.target.value)} className="h-20 text-xs" />
              {note &&
            <p className="text-xs text-muted-foreground">
                  {note.trim().split(/\s+/).filter(Boolean).length} / 50 words
                  {note.trim().split(/\s+/).filter(Boolean).length > 50 && " · will save as journal entry"}
                </p>
            }
            </div>
          }

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving} className="flex-1">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Check-In
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}