import React, { useState, useMemo, useRef, useEffect } from "react";
import { base44, localEntities } from "@/api/base44Client";
import { LOCATION_CATEGORIES, getCategoryMeta } from "@/lib/locationCategories";
import { findNearbyLocationName } from "@/lib/locationUtils";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTerms } from "@/lib/useTerms";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Heart, X, Plus, Smile, Users, Zap, Activity, BookOpen, FileText, Star, User, AlertTriangle, MapPin } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import EmotionWheelPicker from "@/components/emotions/EmotionWheelPicker";
import SymptomsSection from "@/components/symptoms/SymptomsSection";
import DiarySection, { hasDiaryData } from "@/components/diary/DiarySection";
import { seedSymptomDefaults } from "@/utils/symptomDefaults";
import { loadSystemDistressSet } from "@/lib/emotionDistress";
import SwitchJournalModal from "@/components/journal/SwitchJournalModal";
import { getCurrentPositionWithPrompt } from "@/lib/locationPermission";
import useSwipeActions from "@/hooks/useSwipeActions";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// One row in the Quick Check-In "Who's fronting?" picker. Same gesture model
// as the Set Fronters modal so the muscle memory carries over — operating on
// the modal's LOCAL selection (committed on Save), not the live front:
//   tap / swipe-right → toggle selected, swipe-left / long-press → toggle
//   primary, swipe-left-then-up → make this the sole fronter.
function FrontPickRow({ alter, isSelected, isPrimary, onToggle, onSetPrimary, onSolo }) {
  const resolvedUrl = useResolvedAvatarUrl(alter.avatar_url);
  const [imgError, setImgError] = useState(false);
  const { bind, dragX, swipeHint } = useSwipeActions({
    onTap: () => onToggle(),
    onSwipeRight: () => onToggle(),
    onSwipeLeft: () => onSetPrimary(),
    onSwipeLeftUp: () => onSolo(),
    onLongPress: () => onSetPrimary(),
  });
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${isSelected ? "Deselect" : "Select"} ${alter.name}. Swipe left or long-press to toggle primary, swipe left then up to make them the sole front.`}
      aria-pressed={isSelected}
      {...bind}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") ? onToggle() : undefined}
      style={{ transform: `translateX(${dragX}px)`, transition: dragX === 0 ? "transform 150ms ease-out" : "none", touchAction: "pan-y" }}
      className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all select-none ${isSelected ? "border-primary/60 bg-primary/5" : "border-border/50 bg-card hover:bg-muted/30"}`}
    >
      {swipeHint && (
        <span className={`absolute top-1 right-2 text-[0.5625rem] font-semibold uppercase tracking-wide pointer-events-none ${swipeHint === "front" ? "text-emerald-500" : swipeHint === "solo" ? "text-primary" : "text-amber-500"}`}>
          {swipeHint === "front" ? (isSelected ? "Deselect" : "Select") : swipeHint === "solo" ? "Solo" : (isPrimary ? "Demote" : "Primary")}
        </span>
      )}
      <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30"
        style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}>
        {resolvedUrl && !imgError
          ? <img src={resolvedUrl} alt={alter.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
          : <User className="w-4 h-4 text-white/70" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{alter.name}</p>
        {alter.pronouns && <p className="text-xs text-muted-foreground truncate">{alter.pronouns}</p>}
      </div>
      <button onClick={(e) => { e.stopPropagation(); if (isSelected) onSetPrimary(); }}
        aria-label={isPrimary ? `${alter.name} is primary — click to demote` : isSelected ? `Set ${alter.name} as primary` : `Select ${alter.name} first`}
        disabled={!isSelected}
        className={`p-1 rounded-md transition-colors flex-shrink-0 ${isPrimary ? "text-amber-500" : isSelected ? "text-muted-foreground hover:text-amber-400" : "text-muted-foreground/30"}`}>
        <Star className={`w-4 h-4 ${isPrimary ? "fill-amber-500" : ""}`} />
      </button>
    </div>
  );
}

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
{ id: "note", label: "Note", icon: FileText },
{ id: "location", label: "Location", icon: MapPin }];


export default function QuickCheckInModal({ isOpen, onClose, alters: altersProp, currentFronterIds = [], initialSection = null, retroTimestamp = null, editingEntry = null }) {
  // Edit mode: when `editingEntry` is set we update that EmotionCheckIn
  // record in place instead of creating a new one. Only fields on the
  // EmotionCheckIn itself (emotions, fronting alters, note, timestamp)
  // are editable — symptom check-ins, activities, locations, and diary
  // cards saved alongside the original check-in are NOT mutated here,
  // because they're separate records linked only by timestamp/check_in_id
  // and silently rewriting them would risk data loss. The form sections
  // for those still render so the user can ADD new related records, but
  // existing ones aren't pre-populated or replaced.
  const isEditing = !!editingEntry;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const terms = useTerms();
  const [openSections, setOpenSections] = useState(new Set(["feeling"]));
  const [hadFrontingOpen, setHadFrontingOpen] = useState(false);
  // Touch-block on open. The original 200ms (PR #87) wasn't always
  // enough on Android — testers reported the modal would mount and the
  // touchend from the finger that opened it would land on whatever
  // button is now at that screen position (Save / Cancel sit at the top
  // of the new modal, right where the user just tapped). Bumped to
  // 400ms.
  //
  // Critical: we set this synchronously when `isOpen` flips to true
  // (using React's "adjusting state on prop change" pattern, NOT a
  // useEffect) so the overlay is guaranteed to be in the DOM on the
  // very FIRST paint after open. If we leave it to a useEffect, the
  // first painted frame has the modal open with no overlay, and the
  // Android ghost-click queued from the opening tap lands on Cancel
  // before React commits the overlay. That's the bug PR #124 thought
  // it fixed but didn't — the 400ms timer was right, the timing of
  // when the overlay first rendered was the actual issue.
  const [interactBlocked, setInteractBlocked] = useState(isOpen);
  const [lastIsOpen, setLastIsOpen] = useState(isOpen);
  if (isOpen !== lastIsOpen) {
    setLastIsOpen(isOpen);
    setInteractBlocked(isOpen);
  }
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => setInteractBlocked(false), 400);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Feeling
  const [selectedEmotions, setSelectedEmotions] = useState([]);
  // Fronting
  const [primaryId, setPrimaryId] = useState("");
  const [coFronterIds, setCoFronterIds] = useState([]);
  const [alterSearch, setAlterSearch] = useState("");
  // Activity
  const [selectedActivityCategories, setSelectedActivityCategories] = useState([]);
  const [activityDuration, setActivityDuration] = useState("");
  const [activityNote, setActivityNote] = useState("");
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
  // Location
  const [locationName, setLocationName] = useState("");
  const [locationCategory, setLocationCategory] = useState("");
  const [locationLat, setLocationLat] = useState(null);
  const [locationLng, setLocationLng] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);

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
  const [initialSymptomChecks, setInitialSymptomChecks] = useState([]);

  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => base44.entities.CustomEmotion.list()
  });

  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list()
  });

  const { data: pastLocations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => localEntities.Location.list(),
  });

  // Fetch alters internally so callers that mount this modal without
  // passing the prop (ReminderToast, RemindersInbox) still get a
  // populated "Who's fronting?" list. The shared ["alters"] cache means
  // no extra fetch when the parent already loaded them.
  const { data: fetchedAlters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
    enabled: !altersProp,
  });
  const alters = altersProp ?? fetchedAlters;

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
      // Edit mode: pre-fill from the EmotionCheckIn record and open the
      // sections that actually have data so the user can see what
      // they're editing without expanding anything.
      if (editingEntry) {
        setEntryTime(toDatetimeLocal(editingEntry.timestamp));
        setSelectedEmotions(editingEntry.emotions || []);
        // If a long note was saved as a JournalEntry (note >50 words at
        // create-time), the EmotionCheckIn.note field only holds a
        // truncated preview ("first 300 chars…"). Load the JournalEntry
        // content so the user edits the FULL text, not the snippet.
        setNote(editingEntry.note || "");
        if (editingEntry.journal_entry_id) {
          base44.entities.JournalEntry
            .filter({ id: editingEntry.journal_entry_id })
            .then((rows) => {
              const j = rows?.[0];
              if (j?.content) setNote(j.content);
            })
            .catch(() => {});
        }
        const fronterIds = editingEntry.fronting_alter_ids || [];
        const pid = fronterIds[0] || "";
        const co = fronterIds.slice(1);
        setPrimaryId(pid);
        setCoFronterIds(co);
        initialFrontRef.current = { primaryId: pid, coFronterIds: co };
        const initial = new Set();
        if ((editingEntry.emotions || []).length > 0) initial.add("feeling");
        if (fronterIds.length > 0) { initial.add("fronting"); setHadFrontingOpen(true); }
        if ((editingEntry.note || "").trim()) initial.add("note");
        // Load symptoms that were attached to this check-in so the
        // user can see/adjust/remove them in the same modal —
        // previously edit-mode silently dropped the symptom section,
        // so accidental symptom logs stuck around on the timeline
        // even after the user thought they'd edited them out.
        base44.entities.SymptomCheckIn
          .filter({ check_in_id: editingEntry.id })
          .then((rows) => {
            const list = (rows || []).map((r) => ({
              symptom_id: r.symptom_id,
              severity: typeof r.severity === "number" ? r.severity : null,
            }));
            setInitialSymptomChecks(list);
            if (list.length > 0) initial.add("symptoms");
            if (initial.size === 0) initial.add("feeling");
            setOpenSections(new Set(initial));
          })
          .catch(() => {
            if (initial.size === 0) initial.add("feeling");
            setOpenSections(initial);
          });
        seedSymptomDefaults();
        return;
      }
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
    setActivityNote("");
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
    setInitialSymptomChecks([]);
    setLocationName("");
    setLocationCategory("");
    setLocationLat(null);
    setLocationLng(null);
    setGpsLoading(false);
  };

  const handleGPS = async () => {
    setGpsLoading(true);
    const pos = await getCurrentPositionWithPrompt();
    setGpsLoading(false);
    if (!pos) return;
    setLocationLat(pos.lat);
    setLocationLng(pos.lng);
    if (!locationName.trim()) {
      const nearby = findNearbyLocationName(pos.lat, pos.lng, pastLocations);
      if (nearby) setLocationName(nearby);
    }
    toast.success("Location captured");
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

  // Swipe-left-then-up "solo": make this alter the only (and primary) fronter.
  const soloAlter = (id) => {
    setCoFronterIds([]);
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

  const handleSaveActivities = async (timestamp) => {
    if (selectedActivityCategories.length === 0) return;
    const catById = Object.fromEntries(activityCategories.map((c) => [c.id, c]));
    for (const catId of selectedActivityCategories) {
      const cat = catById[catId];
      await base44.entities.Activity.create({
        timestamp,
        activity_name: cat?.name || catId,
        activity_category_ids: [catId],
        duration_minutes: activityDuration ? parseInt(activityDuration) : null,
        fronting_alter_ids: selectedAlters,
        // Emotions are NOT copied onto the activity — they live on the
        // EmotionCheckIn this same save creates (the source of truth). Stamping
        // them here duplicated them onto every activity and made them appear to
        // "extend" when an activity was lengthened. The day view reads emotions
        // from the check-in, not the activity.
        notes: activityNote.trim() || null,
      });
    }
  };

  const handleSubmit = async () => {
    const symptomCheckIns = symptomGetterRef.current ? symptomGetterRef.current() : [];
    // In edit mode the only fields we persist are the EmotionCheckIn's
    // own — so validate against those rather than the broader form.
    const hasData =
      selectedEmotions.length > 0 ||
      selectedAlterIds.size > 0 ||
      selectedActivityCategories.length > 0 ||
      note.trim().length > 0 ||
      symptomCheckIns.length > 0 ||
      hasDiaryData(diaryData) ||
      (openSections.has("location") && (locationName.trim() || locationCategory));

    if (!hasData) {
      toast.error(isEditing ? "Check-in can't be empty" : "Add at least one entry before saving");
      return;
    }

    setSaving(true);
    try {
      const now = entryTime ? new Date(entryTime).toISOString() : new Date().toISOString();

      // Edit mode: update the existing EmotionCheckIn in place and exit
      // early. We deliberately skip the activity/fronting-sync/diary/
      // location create-paths because those would spawn fresh records
      // each time the user opens an existing check-in to fix a typo,
      // silently duplicating data. The original related records (e.g.
      // the activity logged alongside the first save) stay untouched.
      if (isEditing) {
        // Mirror the create-path's >50-word rule: long notes live in a
        // JournalEntry, the EmotionCheckIn holds a 300-char preview +
        // journal_entry_id. Update the existing journal entry, create
        // a new one if the note crossed the threshold mid-edit, or
        // detach the link if the note shrank below the threshold.
        const trimmedNote = note.trim();
        const wc = trimmedNote ? trimmedNote.split(/\s+/).filter(Boolean).length : 0;
        let journalEntryId = editingEntry.journal_entry_id || null;
        if (trimmedNote && wc > 50) {
          if (journalEntryId) {
            try {
              await base44.entities.JournalEntry.update(journalEntryId, { content: trimmedNote });
            } catch {
              const entry = await base44.entities.JournalEntry.create({
                title: `Check-in - ${new Date(now).toLocaleDateString()}`,
                content: trimmedNote,
                entry_type: "personal",
                tags: ["checkin"],
                folder: "Check-In Journals",
                created_date: now,
              });
              journalEntryId = entry.id;
            }
          } else {
            const entry = await base44.entities.JournalEntry.create({
              title: `Check-in - ${new Date(now).toLocaleDateString()}`,
              content: trimmedNote,
              entry_type: "personal",
              tags: ["checkin"],
              folder: "Check-In Journals",
              created_date: now,
            });
            journalEntryId = entry.id;
          }
        }
        const noteForCheckIn = trimmedNote
          ? (wc <= 50 ? trimmedNote : trimmedNote.substring(0, 300) + "...")
          : null;
        await base44.entities.EmotionCheckIn.update(editingEntry.id, {
          timestamp: now,
          emotions: selectedEmotions,
          fronting_alter_ids: selectedAlters,
          note: noteForCheckIn,
          journal_entry_id: journalEntryId,
        });
        queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
        // Propagate symptom changes attached to this check-in so
        // edits actually reflect on the Timeline / Current symptoms
        // panel. Compare draft against the originals we loaded; for
        // each row in the draft, update an existing record or
        // create a fresh one. Delete any originals the user removed.
        try {
          const existing = await base44.entities.SymptomCheckIn.filter({ check_in_id: editingEntry.id });
          const existingBySymptomId = new Map((existing || []).map((r) => [r.symptom_id, r]));
          const draftBySymptomId = new Map(symptomCheckIns.map((sc) => [sc.symptom_id, sc]));
          for (const row of existing || []) {
            if (!draftBySymptomId.has(row.symptom_id)) {
              await base44.entities.SymptomCheckIn.delete(row.id);
            } else {
              const sc = draftBySymptomId.get(row.symptom_id);
              await base44.entities.SymptomCheckIn.update(row.id, {
                severity: sc.severity,
                timestamp: now,
              });
            }
          }
          for (const sc of symptomCheckIns) {
            if (existingBySymptomId.has(sc.symptom_id)) continue;
            await base44.entities.SymptomCheckIn.create({
              symptom_id: sc.symptom_id,
              severity: sc.severity,
              timestamp: now,
              check_in_id: editingEntry.id,
            });
          }
        } catch (e) {
          // Non-fatal — the emotion edit still saved.
          // eslint-disable-next-line no-console
          console.warn("Symptom edit propagation failed", e);
        }
        // Activities/diary/location added during edit are new records —
        // the modal doesn't pre-load existing activities/diary/locations,
        // so anything in these fields was added by the user this session.
        // Create them as fresh rows (linked by timestamp proximity, same
        // as the create-path). Issue #229: previously these were silently
        // dropped in edit mode, leaving the user thinking they'd saved.
        if (selectedActivityCategories.length > 0) {
          await handleSaveActivities(now);
          queryClient.invalidateQueries({ queryKey: ["activities"] });
        }
        if (hasDiaryData(diaryData)) {
          const cardDate = new Date(now);
          await base44.entities.DiaryCard.create({
            card_type: "daily",
            date: format(cardDate, "yyyy-MM-dd"),
            name: `Daily — ${format(cardDate, "MMM d, yyyy")}`,
            fronting_alter_ids: selectedAlters,
            emotions: selectedEmotions,
            urges: diaryData.urges || null,
            body_mind: diaryData.body_mind || null,
            skills_practiced: diaryData.skills?.skills_practiced ?? null,
            medication_safety: diaryData.skills ? {
              rx_meds_taken: diaryData.skills.rx_meds_taken,
              self_harm_occurred: diaryData.skills.self_harm_occurred,
              substances_count: diaryData.skills.substances_count
            } : null,
            notes: trimmedNote ? { optional: trimmedNote } : null
          });
          queryClient.invalidateQueries({ queryKey: ["diaryCards"] });
        }
        if (openSections.has("location") && (locationName.trim() || locationCategory)) {
          await localEntities.Location.create({
            timestamp: now,
            name: locationName.trim() || getCategoryMeta(locationCategory).label,
            category: locationCategory || "other",
            latitude: locationLat ?? null,
            longitude: locationLng ?? null,
            source: locationLat != null ? "gps" : "manual",
          });
          queryClient.invalidateQueries({ queryKey: ["locations"] });
        }
        queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
        queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
        queryClient.invalidateQueries({ queryKey: ["timeline"] });
        queryClient.invalidateQueries({ queryKey: ["currentSymptoms"] });
        onClose();
        return;
      }

      // Pass `now` so retroactive check-ins stamp the activity at the
      // back-dated time, not the current wall clock.
      await handleSaveActivities(now);

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

        // Group by alter_id — duplicates (>1 active session per alter) get
        // fully cleared and a single clean session is re-created. Matches
        // SetFrontModal so the two front-setting entry points agree.
        const sessionsByAlterId = {};
        for (const s of newModelSessions) {
          if (!sessionsByAlterId[s.alter_id]) sessionsByAlterId[s.alter_id] = [];
          sessionsByAlterId[s.alter_id].push(s);
        }

        // 1. End sessions for removed alters, status-changed alters, and ALL duplicates
        for (const [alterId, sessions] of Object.entries(sessionsByAlterId)) {
          const isStillPresent = alterId in desiredMap;
          const hasDuplicates = sessions.length > 1;
          if (hasDuplicates) {
            for (const s of sessions) {
              await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
            }
          } else {
            const primaryStatusChanged = isStillPresent && sessions[0].is_primary !== desiredMap[alterId];
            if (!isStillPresent || primaryStatusChanged) {
              await base44.entities.FrontingSession.update(sessions[0].id, { is_active: false, end_time: now });
            }
          }
        }

        // 2. Create sessions for new alters, status-changed alters, or duplicates that were cleared
        let firstNewSessionId = null;
        for (const id of allSelectedIds) {
          const sessions = sessionsByAlterId[id] || [];
          const hasDuplicates = sessions.length > 1;
          const single = sessions.length === 1 ? sessions[0] : null;
          const statusUnchanged = single && single.is_primary === desiredMap[id];

          if (hasDuplicates || !statusUnchanged) {
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
        const cardDate = new Date(now);
        await base44.entities.DiaryCard.create({
          card_type: "daily",
          date: format(cardDate, "yyyy-MM-dd"),
          name: `Daily — ${format(cardDate, "MMM d, yyyy")}`,
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

      // Location
      if (openSections.has("location") && (locationName.trim() || locationCategory)) {
        await localEntities.Location.create({
          timestamp: now,
          name: locationName.trim() || getCategoryMeta(locationCategory).label,
          category: locationCategory || "other",
          latitude: locationLat ?? null,
          longitude: locationLng ?? null,
          source: locationLat != null ? "gps" : "manual",
        });
        queryClient.invalidateQueries({ queryKey: ["locations"] });
      }

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
                ? `You've noted a triggered ${terms.switch}. Would you like some support?`
                : "Would you like to try a grounding exercise?"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {isTriggered
                ? `It can help to use a grounding technique after a triggered ${terms.switch}.`
                : "It looks like you might be having a hard time. A grounding technique might help."}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowGroundingPrompt(false); onClose(); }} className="flex-1">
                No thanks
              </Button>
              <Button onClick={() => { setShowGroundingPrompt(false); onClose(); navigate("/grounding"); }} className="flex-1">
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
      <DialogContent
        className="max-w-md max-h-[90vh] flex flex-col overflow-hidden p-0"
        // Block accidental dismissal — testers were tapping off-canvas
        // mid-entry and losing the whole check-in. The user has to use
        // the X, Cancel, or Save button to close. Escape is blocked for
        // the same reason (mobile virtual keyboards sometimes fire it).
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {interactBlocked && (
          <div
            aria-hidden
            // Explicit pointer-events: auto + onClick stopPropagation
            // belt-and-braces — without them, some Android WebViews
            // pass the synthetic ghost-click through to the element
            // underneath the overlay.
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            style={{ pointerEvents: "auto" }}
            className="absolute inset-0 z-[60]"
          />
        )}

        {/* Fixed header — Save/Cancel live up here so they're reachable
            without scrolling past the whole form (tap-fatigue from the
            old bottom-footer placement was producing accidental early
            saves). */}
        <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-border/50 space-y-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-destructive" />
              {isEditing ? "Edit Check-In" : "Quick Check-In"}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 pt-1">
              <input
                type="datetime-local"
                aria-label="Check-in date and time"
                value={entryTime}
                onChange={e => setEntryTime(e.target.value)}
                className="h-7 px-2 rounded-md border border-input bg-background text-xs text-foreground"
              />
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving} className="flex-1">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEditing ? "Save Changes" : "Save Check-In"}
            </Button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-3">
          {/* Pill toggles */}
          <div className="flex flex-wrap gap-1.5 pb-1">
            {PILLS.map((pill) => {
              const PillIcon = pill.icon;
              // Module-scope PILLS can't hit useTerms, so resolve the
              // label for any system-customisable terms here at render.
              const label = pill.id === "fronting" ? terms.Fronting : pill.label;
              return (
                <button key={pill.id} onClick={() => toggleSection(pill.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex-shrink-0 ${
                openSections.has(pill.id) ?
                "bg-primary text-primary-foreground border-primary" :
                "bg-card text-muted-foreground border-border hover:text-foreground"}`
                }>
                  <PillIcon className="w-3 h-3" />
                  {label}
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
                        <button onClick={() => setAsPrimary(id)} className="hover:underline" aria-label={id === primaryId ? `${a.name} is primary — click to demote` : `Set ${a.name} as primary`}>{a.name}</button>
                        <button onClick={() => toggleAlter(id)} aria-label={`Remove ${a.name}`} className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Tap to toggle · swipe left (or hold) for <Star className="inline w-3 h-3 text-amber-500 fill-amber-500" /> Primary · swipe left+up to solo</p>
              <Input placeholder={`Search ${terms.alters}...`} value={alterSearch}
                onChange={(e) => setAlterSearch(e.target.value)} className="text-sm" />
              <div className="max-h-40 overflow-y-auto space-y-1">
                {activeAlters
                  .filter(a => !alterSearch || a.name.toLowerCase().includes(alterSearch.toLowerCase()) || a.alias?.toLowerCase().includes(alterSearch.toLowerCase()))
                  .map(a => (
                    <FrontPickRow
                      key={a.id}
                      alter={a}
                      isSelected={selectedAlterIds.has(a.id)}
                      isPrimary={primaryId === a.id}
                      onToggle={() => toggleAlter(a.id)}
                      onSetPrimary={() => setAsPrimary(a.id)}
                      onSolo={() => soloAlter(a.id)}
                    />
                  ))}
              </div>
              {frontingActuallyChanged && (
                <div className="border-t border-border/40 pt-2 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={journalSwitch} onChange={e => setJournalSwitch(e.target.checked)} className="w-3.5 h-3.5 accent-primary" />
                    <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Journal this {terms.switch}?</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={isTriggeredSwitch} onChange={e => setIsTriggeredSwitch(e.target.checked)} className="w-3.5 h-3.5 accent-orange-500" />
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-sm text-muted-foreground">This was a triggered {terms.switch}</span>
                  </label>
                  {isTriggeredSwitch && (
                    <div className="border border-orange-400/30 rounded-lg p-2.5 bg-orange-50/30 dark:bg-orange-900/10 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">What triggered it?</p>
                      <div className="flex flex-wrap gap-1">
                        {TRIGGER_CATEGORIES.map(cat => (
                          <button key={cat.id} type="button" onClick={() => setTriggerCategory(c => c === cat.id ? "" : cat.id)} title={cat.hint}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
                              triggerCategory === cat.id
                                ? "bg-orange-100 text-orange-800 border-orange-400 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
                                : "text-muted-foreground border-border hover:bg-muted/50"
                            }`}>
                            {cat.emoji} {cat.label}
                          </button>
                        ))}
                      </div>
                      <Input value={triggerLabel} onChange={e => setTriggerLabel(e.target.value)} placeholder="Optional: describe the trigger..." className="h-7 text-xs" />
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
            allowCreate={false}
            duration={activityDuration} onDurationChange={setActivityDuration} />
              <Textarea
                placeholder="Add a note about this activity... (optional)"
                value={activityNote}
                onChange={e => setActivityNote(e.target.value)}
                className="text-sm min-h-[60px] resize-none"
                aria-label="Activity note"
              />
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
              <SymptomsSection
                onCheckInsReady={(getter) => {symptomGetterRef.current = getter;}}
                initialChecked={initialSymptomChecks}
              />
            </div>
          }

          {/* Diary */}
          {openSections.has("diary") &&
          <div className="border border-border/50 rounded-xl p-3 space-y-2">
              <p className="text-sm font-medium">Check-In Log</p>
              <DiarySection data={diaryData} onChange={(groupKey, value) => setDiaryData((prev) => ({ ...prev, [groupKey]: value }))} />
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

          {/* Location */}
          {openSections.has("location") && (
            <div className="border border-border/50 rounded-xl p-3 space-y-3">
              <p className="text-sm font-medium">Where are you?</p>
              <div className="flex flex-wrap gap-1.5">
                {LOCATION_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setLocationCategory(cat.id === locationCategory ? "" : cat.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-all"
                    style={
                      locationCategory === cat.id
                        ? { backgroundColor: cat.color, borderColor: cat.color, color: "#fff" }
                        : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                    }
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={locationName}
                  onChange={e => setLocationName(e.target.value)}
                  placeholder={locationCategory ? getCategoryMeta(locationCategory).label : "Place name (optional)..."}
                  className="flex-1 h-8 text-sm"
                />
                <button
                  type="button"
                  onClick={handleGPS}
                  disabled={gpsLoading}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0 ${
                    locationLat != null
                      ? "border-green-500/60 bg-green-500/10 text-green-600 dark:text-green-400"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                  }`}
                >
                  {gpsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                  {locationLat != null ? "✓" : "GPS"}
                </button>
              </div>
              {locationLat != null && locationLng != null && (
                <a
                  href={`https://www.google.com/maps?q=${locationLat},${locationLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                  onClick={e => e.stopPropagation()}
                >
                  📍 {locationLat.toFixed(4)}, {locationLng.toFixed(4)} — Open in Maps ↗
                </a>
              )}
            </div>
          )}
        </div>

      </DialogContent>
    </Dialog>
    </>
  );
}