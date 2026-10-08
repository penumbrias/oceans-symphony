import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { applyFrontSelection } from "@/lib/setFront";
import useFormDraft from "@/hooks/useFormDraft";
import { base44, localEntities } from "@/api/base44Client";
import { LOCATION_CATEGORIES, getCategoryMeta } from "@/lib/locationCategories";
import { findNearbyLocationName } from "@/lib/locationUtils";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTerms } from "@/lib/useTerms";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Heart, X, Plus, Minus, Smile, Users, Zap, Activity, BookOpen, FileText, Star, User, AlertTriangle, MapPin, List, FolderTree, SlidersHorizontal, ChevronLeft, ChevronRight, UserCheck } from "lucide-react";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import { addActiveActivity, endAndLogActiveActivity, getActiveActivities, ACTIVE_ACTIVITY_EVENT } from "@/lib/activitySession";
import { ContactMultiSelectList } from "@/components/contacts/ContactMultiSelect";
import { getActiveEncounters, startEncounter, endEncounterForContact } from "@/lib/contactEncounters";
import { enabledCheckinSectionIds } from "@/lib/quickCheckinSections";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import ActivityTimeStrip from "@/components/activities/ActivityTimeStrip";
import EmotionWheelPicker from "@/components/emotions/EmotionWheelPicker";
import SymptomsSection from "@/components/symptoms/SymptomsSection";
import { AlterAssignPopup } from "@/components/shared/AlterAssignChip";
import RatingMeter from "@/components/emotions/RatingMeter";
import { readQuickCheckinSliderEnabled, writeQuickCheckinSliderEnabled } from "@/lib/quickCheckinPrefs";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { emotionAttributionDefault, defaultEmotionAlterIds } from "@/lib/emotionAttribution";
import DiarySection, { hasDiaryData, extraDiaryGroups } from "@/components/diary/DiarySection";
import { seedSymptomDefaults } from "@/utils/symptomDefaults";
import { loadSystemDistressSet, mapEmotionsToGroundingStates } from "@/lib/emotionDistress";
import SwitchJournalModal from "@/components/journal/SwitchJournalModal";
import { getCurrentPositionWithPrompt } from "@/lib/locationPermission";
import { useHoldDragLevel, FrontLevelRail, useFrontOptionsMenu } from "@/components/fronting/FrontLevelRail";
import { useFrontLevels, getSessionLevel } from "@/lib/frontLevels";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useAlterSorter } from "@/lib/alterSort";
import AlterSortToggle from "@/components/shared/AlterSortToggle";
import { useAlterLabel } from "@/lib/useAlterLabel";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { parseSignpostAuthors } from "@/lib/signpostAuthors";

// One row in the Quick Check-In "Who's fronting?" picker. Uses the SAME
// hold-and-slide level rail as every other {front} surface (the swipe
// trio it used to carry was the last place the old gesture model
// survived — owner report). Operates on the modal's LOCAL selection,
// committed on Save.
//   tap → toggle selected · hold + slide → pick a level (or Remove)
function FrontPickRow({ alter, isSelected, isPrimary, levelId, holdProps, onToggle, onSetPrimary }) {
  const resolvedUrl = useResolvedAvatarUrl(alter.avatar_url);
  const formatAlter = useAlterLabel();
  const [imgErrorFor, setImgError] = useState(null);
  const imgError = !!imgErrorFor && imgErrorFor === resolvedUrl;
  const bind = holdProps || {};
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${isSelected ? "Deselect" : "Select"} ${alter.name}. Hold and slide to pick a level.`}
      aria-pressed={isSelected}
      {...bind}
      onClick={() => onToggle()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") ? onToggle() : undefined}
      style={{ touchAction: "pan-y" }}
      className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all select-none ${isSelected ? "border-primary/60 bg-primary/5" : "border-border/50 bg-card hover:bg-muted/30"}`}
    >
      {isSelected && levelId && (
        <span className="absolute top-1 right-2 text-[0.5625rem] font-semibold uppercase tracking-wide pointer-events-none text-muted-foreground">
          {levelId}
        </span>
      )}
      <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30"
        style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}>
        {resolvedUrl && !imgError
          ? <img src={resolvedUrl} alt={alter.name} className="w-full h-full object-cover" onError={() => setImgError(resolvedUrl)} />
          : <User className="w-4 h-4 text-white/70" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{formatAlter(alter)}</p>
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
{ id: "contacts", label: "Company", icon: UserCheck },
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
  // Which section pills the user has enabled (Manage Check-In → Sections).
  const { data: ssList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const enabledSectionIds = useMemo(() => enabledCheckinSectionIds(ssList?.[0]), [ssList]);
  const visiblePills = useMemo(() => PILLS.filter((p) => enabledSectionIds.includes(p.id)), [enabledSectionIds]);
  const [openSections, setOpenSections] = useState(new Set(["feeling"]));
  // The section the bottom prev/next arrows currently step from. Tracks the
  // most-recently-opened section; arrows close it and open the adjacent one.
  const [currentSectionId, setCurrentSectionId] = useState("feeling");
  const sectionRefs = useRef({});
  const [hadFrontingOpen, setHadFrontingOpen] = useState(false);
  // Feeling-section rating slider: a quick way to log ONE rating-type
  // symptom/habit (default "Energy level"). The tracked symptom is
  // remembered in localStorage; the value (0–5, null = untouched) resets
  // each open and is merged into the symptom check-ins on save.
  const SLIDER_KEY = "symphony_quickcheckin_slider_symptom_v1";
  const [sliderSymptomId, setSliderSymptomId] = useState(() => {
    try { return localStorage.getItem(SLIDER_KEY) || ""; } catch { return ""; }
  });
  const [sliderValue, setSliderValue] = useState(null);
  const [showSliderPicker, setShowSliderPicker] = useState(false);
  // The side rating can be turned off (here, or Manage Check-In → Feelings).
  const [sliderEnabled, setSliderEnabled] = useState(() => readQuickCheckinSliderEnabled());
  useEffect(() => { if (isOpen) setSliderEnabled(readQuickCheckinSliderEnabled()); }, [isOpen]);
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
  // Per-emotion alter assignment overrides: { [emotionLabel]: [alterIds] }.
  // Emotions absent from the map inherit the check-in's fronters.
  const [emotionAlters, setEmotionAlters] = useState({});
  // Emotion whose "who feels this" popup is open (press-and-hold a pill).
  const [holdEmotion, setHoldEmotion] = useState(null);
  const [sessionLevelById, setSessionLevelById] = useState({});
  // Fronting
  const [primaryId, setPrimaryId] = useState("");
  const [coFronterIds, setCoFronterIds] = useState([]);
  const [alterSearch, setAlterSearch] = useState("");
  // Contacts — "who are you with?" mirrors live ContactEncounter sessions,
  // same idea as Fronting but there's no primary/co concept.
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const initialContactIdsRef = useRef([]);
  // Activity
  const [selectedActivityCategories, setSelectedActivityCategories] = useState([]);
  const [activityDuration, setActivityDuration] = useState("");
  const [activityNote, setActivityNote] = useState("");
  // Per-activity optional details (duration / note) the user can log inline
  // without opening the Activity Tracker. Keyed by category id.
  const [activityDetails, setActivityDetails] = useState({});
  const [expandedActId, setExpandedActId] = useState(null);
  // Which selected activity the day strip on the right is timing — the one
  // last tapped, else the newest selection.
  const [timeTargetId, setTimeTargetId] = useState(null);
  // Live active-activity sessions (so a "+ active" toggle mirrors the symptom
  // active affordance — start an open-ended session that logs on end).
  const [activeActs, setActiveActs] = useState(() => getActiveActivities());
  useEffect(() => {
    const refresh = () => setActiveActs(getActiveActivities());
    window.addEventListener(ACTIVE_ACTIVITY_EVENT, refresh);
    return () => window.removeEventListener(ACTIVE_ACTIVITY_EVENT, refresh);
  }, []);
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
  // Synchronous re-entry guard — setSaving is async, so a fast double-tap could
  // otherwise write two check-ins (+ duplicate fronting/activity/diary rows).
  const savingRef = useRef(false);
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
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
    enabled: isOpen,
  });

  // Rating-type symptoms/habits feed the Feeling-section slider's picker.
  const { data: allSymptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
    enabled: isOpen,
  });
  const ratingSymptoms = useMemo(
    // The slider is a 0–5 unipolar control — bipolar-scale items (mood,
    // energy on the −2..+2 scale) can't ride it; they're rated in the
    // Symptoms section with their own two-ended row.
    () => allSymptoms.filter((s) => s.type === "rating" && !s.is_archived && s.scale !== "bipolar_2"),
    [allSymptoms]
  );
  // Default the slider to "Energy level"; fall back to any rating symptom.
  const energySymptomId = useMemo(
    () => ratingSymptoms.find((s) => /energy/i.test(s.label))?.id || ratingSymptoms[0]?.id || "",
    [ratingSymptoms]
  );
  // The stored choice wins, but only if it still exists; else Energy level.
  const effectiveSliderSymptomId =
    sliderSymptomId && ratingSymptoms.some((s) => s.id === sliderSymptomId)
      ? sliderSymptomId
      : energySymptomId;
  const sliderSymptom = useMemo(
    () => ratingSymptoms.find((s) => s.id === effectiveSliderSymptomId) || null,
    [ratingSymptoms, effectiveSliderSymptomId]
  );
  const chooseSliderSymptom = (id) => {
    setSliderSymptomId(id);
    try { localStorage.setItem(SLIDER_KEY, id); } catch { /* storage off */ }
    setShowSliderPicker(false);
  };

  // Whoever is fronting first, then the user's arrangement — the
  // standard order for every list that names members, with the same
  // one-tap sort toggle the other member pickers carry.
  const alterSorter = useAlterSorter("symphony_checkin_alter_sort");
  const activeAlters = useMemo(
    () => alterSorter.sort(alters.filter((a) => !a.is_archived)),
    [alters, alterSorter]
  );
  const formatAlter = useAlterLabel();
  // "Who's fronting" list view: flat search list vs the standard
  // by-subsystem/group tree (AlterTreeSelect).
  const [frontTreeView, setFrontTreeView] = useState(false);

  // Most-recent PRIOR check-in, for the "last check-in" hint in the header.
  const { data: allCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list(),
    enabled: isOpen,
  });
  const lastCheckInAt = useMemo(() => {
    let latest = 0;
    for (const c of allCheckIns) {
      if (isEditing && c.id === editingEntry?.id) continue; // ignore the one being edited
      const t = c.timestamp ? new Date(c.timestamp).getTime() : 0;
      if (t > latest) latest = t;
    }
    return latest || null;
  }, [allCheckIns, isEditing, editingEntry]);



  const toggleSection = (id) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setCurrentSectionId(id);
    if (id === "fronting") setHadFrontingOpen(true);
  };

  // Bottom prev/next arrows: close the current section, open the adjacent one
  // in PILLS order, and scroll it into view. Other manually-opened sections
  // are left as-is (step-one-at-a-time, not a strict wizard).
  const goToSection = (dir) => {
    const steps = visiblePills.length ? visiblePills : PILLS;
    const idx = steps.findIndex((p) => p.id === currentSectionId);
    const base = idx < 0 ? 0 : idx;
    const nextIdx = base + dir;
    if (nextIdx < 0 || nextIdx >= steps.length) return;
    const curId = steps[base].id;
    const nextId = steps[nextIdx].id;
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.delete(curId);
      next.add(nextId);
      return next;
    });
    if (nextId === "fronting") setHadFrontingOpen(true);
    setCurrentSectionId(nextId);
    setTimeout(() => sectionRefs.current[nextId]?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  useEffect(() => {
    if (isOpen) {
      // Edit mode: pre-fill from the EmotionCheckIn record and open the
      // sections that actually have data so the user can see what
      // they're editing without expanding anything.
      if (editingEntry) {
        setEntryTime(toDatetimeLocal(editingEntry.timestamp));
        setSelectedEmotions(editingEntry.emotions || []);
        setEmotionAlters(editingEntry.emotion_alters && typeof editingEntry.emotion_alters === "object" ? editingEntry.emotion_alters : {});
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
              alter_ids: Array.isArray(r.fronting_alter_ids) ? r.fronting_alter_ids : null,
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
        seedSymptomDefaults().then(() => queryClient.invalidateQueries({ queryKey: ["symptoms"] })).catch(() => {});
        return;
      }
      setEntryTime(toDatetimeLocal(retroTimestamp));
      // When opened targeting a specific section (e.g. a quick action for
      // Location), open ONLY that section — don't also pop Feeling open.
      // Respect the user's enabled-sections config: never open a hidden one.
      const enabled = enabledCheckinSectionIds(ssList?.[0]);
      const target = initialSection && enabled.includes(initialSection) ? initialSection : (enabled[0] || "feeling");
      setOpenSections(new Set([target]));
      setCurrentSectionId(target);
      if (initialSection === "fronting") setHadFrontingOpen(true);
      // Load current active sessions to pre-populate fronting state
      base44.entities.FrontingSession.filter({ is_active: true }).then((active) => {
        const newModel = active.filter(s => s.alter_id);
        // Each fronter's CURRENT level — the default "who feels this" can
        // be limited to one level (Manage Check-In → Feelings).
        setSessionLevelById(Object.fromEntries(newModel.map((s) => [s.alter_id, getSessionLevel(s, levelCfg)?.id || null])));
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
      seedSymptomDefaults().then(() => queryClient.invalidateQueries({ queryKey: ["symptoms"] })).catch(() => {});
    } else {
      resetForm();
    }
  }, [isOpen]);

  // Contacts — EDIT mode seeds from the record's own contact_ids (saved
  // since v0.222.x so the Check-In Log can show who you were with);
  // create mode (and older records without the field) still mirrors the
  // live ContactEncounter sessions.
  useEffect(() => {
    if (!isOpen) return;
    if (isEditing && Array.isArray(editingEntry?.contact_ids)) {
      setSelectedContactIds(editingEntry.contact_ids);
      initialContactIdsRef.current = editingEntry.contact_ids;
      return;
    }
    getActiveEncounters().then((active) => {
      const ids = active.map((e) => e.contact_id);
      setSelectedContactIds(ids);
      initialContactIdsRef.current = ids;
    }).catch(() => {});
  }, [isOpen, isEditing, editingEntry]);

  const resetForm = () => {
    setSelectedEmotions([]);
    setEmotionAlters({});
    setHoldEmotion(null);
    setSessionLevelById({});
    setPrimaryId("");
    setCoFronterIds([]);
    setAlterSearch("");
    setSelectedContactIds([]);
    initialContactIdsRef.current = [];
    setSelectedActivityCategories([]);
    setActivityDetails({});
    setTimeTargetId(null);
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
    setSliderValue(null);
    setShowSliderPicker(false);
    setCurrentSectionId("feeling");
  };

  // ── Draft autosave — a half-filled check-in survives an accidental close /
  // app switch and restores on the next open. Create-mode only (edits pre-fill
  // from the record). Fronting state is deliberately NOT drafted: it mirrors
  // the LIVE sessions and restoring a stale front would be wrong. Declared
  // AFTER the isOpen effect above so restore runs after the open-reset.
  const draftSnapshot = useMemo(() => ({
    selectedEmotions, sliderValue, note, diaryData,
    selectedActivityCategories, activityDetails,
    journalSwitch, isTriggeredSwitch, triggerCategory, triggerLabel,
    locationName, locationCategory, locationLat, locationLng,
    entryTime, emotionAlters,
  }), [selectedEmotions, sliderValue, note, diaryData, selectedActivityCategories, activityDetails,
    journalSwitch, isTriggeredSwitch, triggerCategory, triggerLabel,
    locationName, locationCategory, locationLat, locationLng, entryTime, emotionAlters]);
  const { clearDraft } = useFormDraft("symphony_draft_quickcheckin_v1", draftSnapshot, {
    active: !!isOpen && !isEditing,
    isEmpty: (s) =>
      !(s.selectedEmotions || []).length &&
      s.sliderValue == null &&
      !s.note?.trim() &&
      !Object.keys(s.diaryData || {}).length &&
      !(s.selectedActivityCategories || []).length &&
      !s.locationName?.trim() &&
      !s.triggerLabel?.trim(),
    onRestore: (d) => {
      if (Array.isArray(d.selectedEmotions)) setSelectedEmotions(d.selectedEmotions);
      if (d.emotionAlters && typeof d.emotionAlters === "object") setEmotionAlters(d.emotionAlters);
      if (d.sliderValue !== undefined) setSliderValue(d.sliderValue);
      if (typeof d.note === "string") setNote(d.note);
      if (d.diaryData && typeof d.diaryData === "object") setDiaryData(d.diaryData);
      if (Array.isArray(d.selectedActivityCategories)) setSelectedActivityCategories(d.selectedActivityCategories);
      if (d.activityDetails && typeof d.activityDetails === "object") setActivityDetails(d.activityDetails);
      if (typeof d.journalSwitch === "boolean") setJournalSwitch(d.journalSwitch);
      if (typeof d.isTriggeredSwitch === "boolean") setIsTriggeredSwitch(d.isTriggeredSwitch);
      if (typeof d.triggerCategory === "string") setTriggerCategory(d.triggerCategory);
      if (typeof d.triggerLabel === "string") setTriggerLabel(d.triggerLabel);
      if (typeof d.locationName === "string") setLocationName(d.locationName);
      if (typeof d.locationCategory === "string") setLocationCategory(d.locationCategory);
      if (d.locationLat !== undefined) setLocationLat(d.locationLat);
      if (d.locationLng !== undefined) setLocationLng(d.locationLng);
      if (typeof d.entryTime === "string" && d.entryTime) setEntryTime(d.entryTime);
    },
  });

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

  // Note → fronting: an alter who SIGNPOSTS in the quick note ("-kyo")
  // is added to the fronting selection automatically (owner ask), so the
  // check-in records them and the live front picks them up on save. A
  // one-way ratchet: we only ever ADD — deleting the signpost text (or
  // an early unique-prefix match while still typing a longer name) never
  // kicks anyone out; the chips' X does that, and an id the user removed
  // is remembered so the same signpost doesn't re-add them.
  const appliedSignpostIdsRef = useRef(new Set());
  useEffect(() => {
    if (!isOpen) { appliedSignpostIdsRef.current = new Set(); return undefined; }
    const t = setTimeout(() => {
      let authors = [];
      try { authors = parseSignpostAuthors(note || "", alters); } catch { return; }
      const fresh = authors
        .map((a) => a?.id)
        .filter((id) => id && !selectedAlterIds.has(id) && !appliedSignpostIdsRef.current.has(id));
      if (!fresh.length) return;
      fresh.forEach((id) => appliedSignpostIdsRef.current.add(id));
      setCoFronterIds((prev) => [...prev, ...fresh.filter((id) => !prev.includes(id) && id !== primaryId)]);
      setHadFrontingOpen(true);
    }, 500);
    return () => clearTimeout(t);
  }, [note, isOpen, alters, selectedAlterIds, primaryId]);

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

  // ── Hold-and-slide level rail ──────────────────────────────────────
  // The same gesture as every other {front} surface. Levels are kept per
  // alter in the local draft and written as front_level on save; the top
  // level maps to is_primary so the pre-levels model still holds.
  const levelCfg = useFrontLevels();
  const [levelById, setLevelById] = useState({});
  const pickLevel = (alterId, levelId) => {
    setLevelById((prev) => ({ ...prev, [alterId]: levelId }));
    const isTop = levelId && levelId === levelCfg.levels?.[0]?.id;
    if (isTop) { setAsPrimary(alterId); return; }
    // A lower level means "here, but not primary".
    setPrimaryId((p) => (p === alterId ? "" : p));
    setCoFronterIds((prev) => (prev.includes(alterId) ? prev : [...prev, alterId]));
  };
  const dropAlter = (alterId) => {
    setLevelById((prev) => { const n = { ...prev }; delete n[alterId]; return n; });
    setPrimaryId((p) => (p === alterId ? "" : p));
    setCoFronterIds((prev) => prev.filter((x) => x !== alterId));
  };
  // Who an emotion belongs to when the user hasn't said otherwise: every
  // fronter in this check-in, or only those at the level chosen in Manage
  // Check-In → Feelings (falls back to everyone if nobody is at it).
  const emotionDefaultSetting = emotionAttributionDefault(pickPrimarySystemSettings(ssList) || ssList?.[0], levelCfg);
  const defaultEmotionIds = useMemo(() => defaultEmotionAlterIds({
    fronterIds: selectedAlters,
    setting: emotionDefaultSetting,
    levelOf: (id) => levelById[id] || sessionLevelById[id]
      || (id === primaryId ? levelCfg.levels?.[0]?.id : (levelCfg.levels?.[1] || levelCfg.levels?.[0])?.id),
  }), [selectedAlters, emotionDefaultSetting, levelById, sessionLevelById, primaryId, levelCfg]);
  const alterColorById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a.color || "#8b5cf6"])), [alters]);
  // Dots only when an emotion's people differ from the default.
  const emotionDots = useCallback((label) => {
    const ids = emotionAlters[label];
    if (!Array.isArray(ids)) return null;
    if (ids.length === 0) return "nobody";
    const def = new Set(defaultEmotionIds);
    if (ids.length === def.size && ids.every((id) => def.has(id))) return null;
    return ids.map((id) => alterColorById[id]).filter(Boolean);
  }, [emotionAlters, defaultEmotionIds, alterColorById]);
  const holdEmotionOpen = useCallback((label) => {
    setSelectedEmotions((prev) => (prev.includes(label) ? prev : [...prev, label]));
    setHoldEmotion(label);
  }, []);
  const emotionHoldAria = useCallback((label, selected) =>
    `${selected ? "Remove" : "Add"} ${label}. Hold to choose which ${terms.alters} feel it.`, [terms.alters]);
  // Emotions with no explicit assignment are written with the default when
  // the default isn't simply "everyone in the check-in" — readers treat a
  // missing entry as all of fronting_alter_ids.
  const resolvedEmotionAlters = () => {
    const out = {};
    const defaultIsEveryone = defaultEmotionIds.length === selectedAlters.length;
    for (const label of selectedEmotions) {
      const ids = emotionAlters[label];
      if (Array.isArray(ids)) out[label] = ids; /* [] kept: explicit "nobody" */
      else if (!defaultIsEveryone) out[label] = defaultEmotionIds;
    }
    return out;
  };
  const suppressRowTap = useRef(0);
  // Drag right on a row = the alter's options menu (unified grammar).
  const rowOptionsMenu = useFrontOptionsMenu((id) => activeAlters.find((a) => a.id === id) || null);
  const { rail: levelRail, getHoldProps } = useHoldDragLevel({
    cfg: levelCfg,
    onCommit: (alterId, levelId) => { suppressRowTap.current = Date.now() + 400; pickLevel(alterId, levelId); },
    onRemove: (alterId) => { suppressRowTap.current = Date.now() + 400; dropAlter(alterId); },
    onOptions: (alterId) => { suppressRowTap.current = Date.now() + 400; rowOptionsMenu.openOptions(alterId); },
  });
  const railAlter = levelRail ? (activeAlters.find((a) => a.id === levelRail.alterId) || null) : null;
  const guardedToggle = (id) => {
    if (levelRail || Date.now() < suppressRowTap.current) return;
    toggleAlter(id);
  };

  // Bulk add/remove for the by-subsystem/group tree view's "+ all / − all"
  // and "Select all / Clear all". Keeps primary separate; seeds one when none.
  const setManyFronters = (arr, on) => {
    const ids = arr.map((a) => a.id);
    if (!ids.length) return;
    setCoFronterIds((prev) => {
      const s = new Set(prev);
      for (const id of ids) { if (on) s.add(id); else s.delete(id); }
      return [...s];
    });
    if (on) setPrimaryId((p) => p || ids[0] || "");
    else setPrimaryId((p) => (ids.includes(p) ? "" : p));
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

  // Start/stop an activity as an ACTIVE session (mirrors the symptom "+"
  // affordance). Starting opens an open-ended session that logs an Activity
  // when ended; ending logs it now. Active activities are skipped by the
  // stamp-on-save path below so they're never double-logged.
  const toggleActiveActivity = async (cat) => {
    const existing = getActiveActivities().find((a) => a.categoryId === cat.id);
    if (existing) {
      await endAndLogActiveActivity(existing.id);
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast.success(`${cat.name} ended & logged`);
    } else {
      addActiveActivity({
        categoryId: cat.id,
        name: cat.name,
        color: cat.color || null,
        startTime: new Date().toISOString(),
        alterIds: selectedAlters,
        notes: activityDetails[cat.id]?.note?.trim() || "",
      });
      toast.success(`${cat.name} set to active`);
    }
  };

  const handleSaveActivities = async (timestamp, sharedNote = null) => {
    let sharedNoteRecorded = false;
    if (selectedActivityCategories.length === 0) return;
    const catById = Object.fromEntries(activityCategories.map((c) => [c.id, c]));
    // Skip any activity that's currently running as an active session — that
    // session logs its own Activity on end, so stamping here would double-log.
    const activeCatIds = new Set(getActiveActivities().map((a) => a.categoryId));
    for (const catId of selectedActivityCategories) {
      if (activeCatIds.has(catId)) continue;
      const cat = catById[catId];
      const d = activityDetails[catId] || {};
      const dur = d.duration || activityDuration;
      // A range drawn on the day strip pins the activity's own start; the
      // rest keep the check-in's time as before.
      const startAt = d.start && !Number.isNaN(new Date(d.start).getTime()) ? new Date(d.start).toISOString() : timestamp;
      // Per-activity note through the shared pipeline; the shared note
      // (already prepared by the caller) is reused as-is and its mentions
      // are logged once, on the first activity that carries it.
      let noteVal = "";
      let preparedActivity = null;
      if ((d.note || "").trim()) {
        preparedActivity = await prepareAuthoredText(d.note.trim(), { alters, terms, surfaceLabel: "activity note" });
        if (preparedActivity === null) continue;
        noteVal = preparedActivity.content;
      } else if (sharedNote) {
        noteVal = sharedNote.content;
        if (!sharedNoteRecorded) { preparedActivity = sharedNote; sharedNoteRecorded = true; }
      }
      const created = await base44.entities.Activity.create({
        timestamp: startAt,
        activity_name: cat?.name || catId,
        activity_category_ids: [catId],
        duration_minutes: dur ? parseInt(dur) : null,
        fronting_alter_ids: selectedAlters,
        ...(preparedActivity?.authorIds?.length ? { author_alter_ids: preparedActivity.authorIds } : {}),
        // Emotions are NOT copied onto the activity — they live on the
        // EmotionCheckIn this same save creates (the source of truth). Stamping
        // them here duplicated them onto every activity and made them appear to
        // "extend" when an activity was lengthened. The day view reads emotions
        // from the check-in, not the activity.
        notes: noteVal || null,
      });
      if (preparedActivity) {
        await recordAuthoredText({ ...preparedActivity, alters, sourceType: "activity", sourceId: created?.id, sourceLabel: "Activity note", navigatePath: `/activities?date=${format(new Date(startAt), "yyyy-MM-dd")}${created?.id ? `&highlight=${created.id}` : ""}` });
      }
    }
  };

  // Diff selectedContactIds against whoever was active when the modal opened
  // and start/end ContactEncounter sessions for the difference. Both helper
  // functions already guard against double-start / missing-session no-ops.
  const commitContactChanges = async () => {
    const initialSet = new Set(initialContactIdsRef.current);
    const nextSet = new Set(selectedContactIds);
    let changed = false;
    for (const id of nextSet) {
      if (!initialSet.has(id)) { await startEncounter(id); changed = true; }
    }
    for (const id of initialSet) {
      if (!nextSet.has(id)) { await endEncounterForContact(id); changed = true; }
    }
    if (changed) queryClient.invalidateQueries({ queryKey: ["contactEncounters"] });
  };

  const handleSubmit = async () => {
    if (savingRef.current) return; // re-entry guard (see savingRef above)
    const symptomCheckIns = symptomGetterRef.current ? symptomGetterRef.current() : [];
    // Fold in the Feeling-section slider, unless the user already logged that
    // same symptom in the Symptoms / Habits section (avoid double-logging).
    if (sliderEnabled && sliderValue != null && effectiveSliderSymptomId &&
        !symptomCheckIns.some((s) => s.symptom_id === effectiveSliderSymptomId)) {
      symptomCheckIns.push({ symptom_id: effectiveSliderSymptomId, severity: sliderValue });
    }
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

    savingRef.current = true;
    setSaving(true);
    try {
      // Shared text pipeline for the notes: ~commands run, "/w" whispers peel
      // recipients, "-name" signposts are stripped (the effect above already
      // added them to the selection), and @mentions are logged once the
      // record exists. A malformed command blocks the save.
      let preparedNote, preparedActivityNote = null;
      try {
        preparedNote = await prepareAuthoredText(note, { alters, terms, surfaceLabel: "check-in note" });
        if (activityNote.trim()) preparedActivityNote = await prepareAuthoredText(activityNote.trim(), { alters, terms, surfaceLabel: "activity note" });
      } catch (e) { if (isLogCommandError(e)) { toast.error(e.message); return; } throw e; }
      // null = the user backed out of a whisper warning. The activity note
      // is only prepared when there is one — an absent note is not a back-out.
      if (preparedNote === null || (activityNote.trim() && preparedActivityNote === null)) return;
      const noteOut = preparedNote.content;

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
        // a new one if the noteOut crossed the threshold mid-edit, or
        // detach the link if the noteOut shrank below the threshold.
        const trimmedNote = noteOut.trim();
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
          // Always write the map on edit (empty object clears removed
          // overrides — an edit is an explicit re-statement of the record).
          emotion_alters: resolvedEmotionAlters(),
          note: noteForCheckIn,
          journal_entry_id: journalEntryId,
          // Like emotion_alters above: an edit is an explicit re-statement,
          // so the company list is always written (empty clears it).
          contact_ids: selectedContactIds,
        });
        await recordAuthoredText({ ...preparedNote, alters, sourceType: "checkin", sourceId: editingEntry.id, sourceLabel: "Check-in note", navigatePath: `/checkin-log?id=${editingEntry.id}` });
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
                fronting_alter_ids: sc.alter_ids ?? selectedAlters,
              });
            }
          }
          for (const sc of symptomCheckIns) {
            if (existingBySymptomId.has(sc.symptom_id)) continue;
            await base44.entities.SymptomCheckIn.create({
              symptom_id: sc.symptom_id,
              severity: sc.severity,
              timestamp: now,
              fronting_alter_ids: sc.alter_ids ?? selectedAlters,
              check_in_id: editingEntry.id,
            });
          }
        } catch (e) {
          // Non-fatal — the emotion edit still saved.
           
          console.warn("Symptom edit propagation failed", e);
        }
        // Activities/diary/location added during edit are new records —
        // the modal doesn't pre-load existing activities/diary/locations,
        // so anything in these fields was added by the user this session.
        // Create them as fresh rows (linked by timestamp proximity, same
        // as the create-path). Issue #229: previously these were silently
        // dropped in edit mode, leaving the user thinking they'd saved.
        if (selectedActivityCategories.length > 0) {
          await handleSaveActivities(now, preparedActivityNote);
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
            notes: trimmedNote ? { optional: trimmedNote } : null,
            custom_groups: extraDiaryGroups(diaryData),
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
      await commitContactChanges();
        queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
        queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
        queryClient.invalidateQueries({ queryKey: ["timeline"] });
        queryClient.invalidateQueries({ queryKey: ["currentSymptoms"] });
        onClose();
        return;
      }

      // Pass `now` so retroactive check-ins stamp the activity at the
      // back-dated time, not the current wall clock.
      await handleSaveActivities(now, preparedActivityNote);

      // Fronting sync — if fronting section was opened at any point (even if later collapsed).
      // EDIT MODE gates on frontingActuallyChanged instead: the section seeds
      // from the OLD entry's recorded fronters, so an unrelated edit (fixing a
      // typo in yesterday's noteOut) used to reconcile the LIVE front back to that
      // historical list — silently ending whoever is fronting today. Only a
      // deliberate change to the fronter selection touches live sessions now.
      if (isEditing ? frontingActuallyChanged : (hadFrontingOpen || openSections.has("fronting"))) {
        // ONE implementation of "set the front": the same helper the Set
        // Fronters sheet uses — batched writes (one save, not one per
        // session), level-derived primary, trigger metadata, and the
        // friends push. This modal used to carry its own fork of the diff
        // that did none of those.
        const { firstSessionId } = await applyFrontSelection({
          selections: [...selectedAlterIds].map((id) => ({ alterId: id, isPrimary: id === primaryId, level: levelById[id] })),
          triggered: isTriggeredSwitch && triggerCategory ? { category: triggerCategory, label: triggerLabel } : null,
          levelsEnabled: levelCfg.enabled,
          levelCfg,
          alters: alters,
          terms,
          queryClient,
        });
        setNewSessionId(firstSessionId);
      }

      // EmotionCheckIn
      let checkInId = null;
      if (selectedEmotions.length > 0 || noteOut.trim() || selectedAlters.length > 0) {
        const wordCount = noteOut ? noteOut.trim().split(/\s+/).filter(Boolean).length : 0;
        let journalEntryId = null;
        if (noteOut && wordCount > 50) {
          const entry = await base44.entities.JournalEntry.create({
            title: `Check-in - ${new Date(now).toLocaleDateString()}`,
            content: noteOut,
            entry_type: "personal",
            tags: ["checkin"],
            folder: "Check-In Journals",
            created_date: now,
          });
          journalEntryId = entry.id;
        }
        // Per-emotion assignment overrides (only for still-selected emotions
        // with a non-empty explicit assignment — everything else inherits).
        const cleanEmotionAlters = resolvedEmotionAlters();
        const checkIn = await base44.entities.EmotionCheckIn.create({
          timestamp: now,
          emotions: selectedEmotions,
          fronting_alter_ids: selectedAlters,
          ...(Object.keys(cleanEmotionAlters).length > 0 ? { emotion_alters: cleanEmotionAlters } : {}),
          // Company rides on the record so the Check-In Log can show it —
          // the live ContactEncounter sessions are managed separately in
          // commitContactChanges.
          ...(selectedContactIds.length > 0 ? { contact_ids: selectedContactIds } : {}),
          note: wordCount <= 50 ? noteOut : noteOut.substring(0, 300) + "...",
          journal_entry_id: journalEntryId
        });
        checkInId = checkIn?.id || null;
        queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
        await recordAuthoredText({ ...preparedNote, alters, sourceType: "checkin", sourceId: checkInId, sourceLabel: "Check-in note", navigatePath: checkInId ? `/checkin-log?id=${checkInId}` : "/checkin-log" });
      }

      // SymptomCheckIns — each row records WHO it belongs to: the per-item
      // assignment when set, else the check-in's fronters. (Previously
      // symptom check-ins carried no attribution at all — the per-alter
      // symptom analytics were silently empty.)
      for (const sc of symptomCheckIns) {
        await base44.entities.SymptomCheckIn.create({
          symptom_id: sc.symptom_id,
          timestamp: now,
          severity: sc.severity,
          fronting_alter_ids: sc.alter_ids ?? selectedAlters,
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
          notes: noteOut.trim() ? { optional: noteOut.trim() } : null,
          custom_groups: extraDiaryGroups(diaryData),
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

      await commitContactChanges();

      // Everything saved — the draft must never "restore" a posted check-in.
      clearDraft();
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
      savingRef.current = false;
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
              <Button onClick={() => {
                setShowGroundingPrompt(false); onClose();
                // Carry what was just logged into the grounding flow: the
                // state check opens with matching states PRE-SELECTED
                // instead of dumping the user at the entry screen to
                // re-answer what they already told us.
                const states = mapEmotionsToGroundingStates(
                  selectedEmotions.filter((e) => isDistressingEmotion(e)),
                  { triggeredSwitch: isTriggeredSwitch }
                );
                navigate(states.length ? `/grounding?states=${states.join(",")}` : "/grounding");
              }} className="flex-1">
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
              {/* Far from the close X on purpose — side by side, a slightly
                  off tap on "manage" closed the whole check-in. */}
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => { onClose(); navigate("/manage-checkin"); }}
                  aria-label="Open check-in manager"
                  title="Open check-in manager"
                  className="p-1.5 -my-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              )}
              <span className="flex-1">{isEditing ? "Edit Check-In" : "Quick Check-In"}</span>
              <span className="w-6 flex-shrink-0" aria-hidden />
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 pt-1 flex-wrap">
              <input
                type="datetime-local"
                aria-label="Check-in date and time"
                value={entryTime}
                onChange={e => setEntryTime(e.target.value)}
                className="h-7 px-2 rounded-md border border-input bg-background text-xs text-foreground"
              />
              {!isEditing && lastCheckInAt && (
                <span className="text-[0.6875rem] text-muted-foreground">
                  Last check-in {formatDistanceToNow(new Date(lastCheckInAt), { addSuffix: true })}
                </span>
              )}
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
            {visiblePills.map((pill) => {
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
          <div ref={(el) => (sectionRefs.current.feeling = el)} className="border border-border/50 rounded-xl p-3">
              <div className="flex gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-sm font-medium">How are you feeling?</p>
                  {/* The quick base moods (Good / Neutral / Bad) are the colourful
                      valence buttons inside EmotionWheelPicker now — tapping one
                      adds it as a selected emotion AND opens it for specifics, so
                      a separate mood row would be redundant. */}
                  <EmotionWheelPicker
                  selectedEmotions={selectedEmotions}
                  onToggle={(label) => setSelectedEmotions((prev) => prev.includes(label) ? prev.filter((e) => e !== label) : [...prev, label])}
                  customEmotions={customEmotions}
                  onAddCustom={(label, category) => addCustomEmotionMutation.mutate({ label, category })}
                  onEmotionHold={alters.length > 0 ? holdEmotionOpen : null}
                  emotionDots={emotionDots}
                  holdAriaLabel={emotionHoldAria} />
                  <AlterAssignPopup
                    open={!!holdEmotion}
                    onOpenChange={(o) => { if (!o) setHoldEmotion(null); }}
                    title={holdEmotion ? `Who feels ${holdEmotion}?` : null}
                    alters={alters}
                    value={holdEmotion ? (emotionAlters[holdEmotion] ?? null) : null}
                    defaultIds={defaultEmotionIds}
                    onChange={(ids) => setEmotionAlters((prev) => {
                      const next = { ...prev };
                      if (ids === null) delete next[holdEmotion]; else next[holdEmotion] = ids;
                      return next;
                    })} />
                </div>

                {/* Side rating — defaults to Energy level; tap the label to
                    track any other rating-type symptom/habit. 0–5, untouched
                    logs nothing. Merged into the symptom check-ins on save. */}
                {sliderEnabled && (
                <div className="flex flex-col items-center gap-1.5 pl-2.5 border-l border-border/40 flex-shrink-0">
                  <button type="button" onClick={() => setShowSliderPicker(true)}
                    aria-label={`Rating tracks ${sliderSymptom?.label || "Energy"} — change`}
                    className="text-[0.625rem] font-medium text-muted-foreground hover:text-foreground max-w-[3.75rem] truncate leading-tight text-center flex items-center gap-0.5">
                    {sliderSymptom?.label || "Energy"}<ChevronRight className="w-2.5 h-2.5 rotate-90 flex-shrink-0" />
                  </button>
                  <RatingMeter
                    value={sliderValue}
                    onChange={setSliderValue}
                    color={sliderSymptom?.color || "#F59E0B"}
                    label={`${sliderSymptom?.label || "Energy"} rating`}
                  />
                </div>
                )}
              </div>
            </div>
          }

          {/* Fronting */}
          {openSections.has("fronting") &&
          <div ref={(el) => (sectionRefs.current.fronting = el)} className="border border-border/50 rounded-xl p-3 space-y-2">
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
                        <button onClick={() => setAsPrimary(id)} className="hover:underline" aria-label={id === primaryId ? `${a.name} is primary — click to demote` : `Set ${a.name} as primary`}>{formatAlter(a)}</button>
                        <button onClick={() => toggleAlter(id)} aria-label={`Remove ${a.name}`} className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground flex-1">
                  {frontTreeView
                    ? <>Browse by subsystem / group. Tap to toggle; set <Star className="inline w-3 h-3 text-amber-500 fill-amber-500" /> Primary using the chips above.</>
                    : <>Tap to toggle · hold and slide to pick a level · <Star className="inline w-3 h-3 text-amber-500 fill-amber-500" /> sets Primary</>}
                </p>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!frontTreeView && <AlterSortToggle sorter={alterSorter} />}
                  <div className="flex gap-1 bg-muted/50 rounded-md p-0.5" role="group" aria-label="View mode">
                    <button type="button" onClick={() => setFrontTreeView(false)} aria-label="Flat list" aria-pressed={!frontTreeView}
                      className={`p-1.5 rounded transition-colors ${!frontTreeView ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                      <List className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setFrontTreeView(true)} aria-label="By subsystem or group" aria-pressed={frontTreeView}
                      className={`p-1.5 rounded transition-colors ${frontTreeView ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                      <FolderTree className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              {frontTreeView ? (
                <AlterTreeSelect
                  alters={activeAlters}
                  groups={groups}
                  isSelected={(id) => selectedAlterIds.has(id)}
                  onToggle={(a) => toggleAlter(a.id)}
                  onSetMany={setManyFronters}
                  maxHeight="40vh"
                />
              ) : (
                <>
                  <Input placeholder={`Search ${terms.alters}...`} value={alterSearch}
                    onChange={(e) => setAlterSearch(e.target.value)} className="text-sm" />
                  {/* Tall enough to actually browse a system — the old
                      max-h-40 showed ~3 rows and made this feel like a
                      keyhole (owner report). */}
                  <div className="max-h-[45vh] overflow-y-auto overscroll-contain space-y-1">
                    {activeAlters
                      .filter(a => !alterSearch || a.name.toLowerCase().includes(alterSearch.toLowerCase()) || a.alias?.toLowerCase().includes(alterSearch.toLowerCase()))
                      .map(a => (
                        <FrontPickRow
                          key={a.id}
                          alter={a}
                          isSelected={selectedAlterIds.has(a.id)}
                          isPrimary={primaryId === a.id}
                          levelId={levelById[a.id] || (primaryId === a.id ? levelCfg.levels?.[0]?.id : null)}
                          holdProps={getHoldProps(a.id, levelById[a.id] || null)}
                          onToggle={() => guardedToggle(a.id)}
                          onSetPrimary={() => setAsPrimary(a.id)}
                        />
                      ))}
                  </div>
                  {/* The shared level rail — same hold-and-slide as the
                      {front} sheet, alter bar and {alter} pages. */}
                  {rowOptionsMenu.node}
                  <FrontLevelRail rail={levelRail} cfg={levelCfg} withRemove
                    alterName={railAlter ? (railAlter.name || "") : ""} />
                </>
              )}
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
          <div ref={(el) => (sectionRefs.current.activity = el)} className="border border-border/50 rounded-xl p-3 flex gap-2 items-start">
            <div className="flex-1 min-w-0 space-y-2">
              <ActivityPillSelector selectedActivities={selectedActivityCategories}
            onActivityChange={setSelectedActivityCategories}
            allowCreate={false}
            duration={activityDuration} onDurationChange={setActivityDuration} />

              {/* Selected activities — each can be set ACTIVE now (+ / − like a
                  symptom) and gets minimal inline detail pills (duration + note)
                  so you can log details without opening the Activity Tracker. */}
              {selectedActivityCategories.length > 0 && (
                <div className="space-y-1.5">
                  {selectedActivityCategories.map((catId) => {
                    const cat = activityCategories.find((c) => c.id === catId);
                    if (!cat) return null;
                    const isActive = activeActs.some((a) => a.categoryId === catId);
                    const d = activityDetails[catId] || {};
                    const open = expandedActId === catId;
                    const color = cat.color || "#8b5cf6";
                    const setDetail = (patch) => setActivityDetails((s) => ({ ...s, [catId]: { ...s[catId], ...patch } }));
                    return (
                      <div key={catId} className="rounded-lg border bg-muted/10"
                        style={{ borderColor: catId === (selectedActivityCategories.includes(timeTargetId) ? timeTargetId : selectedActivityCategories[selectedActivityCategories.length - 1]) ? `${color}99` : "hsl(var(--border) / 0.5)" }}>
                        <div className="flex items-center gap-2 px-2.5 py-1.5">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <button type="button" onClick={() => { setExpandedActId(open ? null : catId); setTimeTargetId(catId); }}
                            className="flex-1 min-w-0 text-left text-sm font-medium truncate flex items-center gap-1.5">
                            {cat.name}
                            {(d.duration || d.note) && <SlidersHorizontal className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                          </button>
                          {isActive && <span className="text-[0.5625rem] uppercase tracking-wide font-semibold text-emerald-500 flex-shrink-0">Active</span>}
                          <button
                            type="button"
                            onClick={() => toggleActiveActivity(cat)}
                            title={isActive ? "End & log this activity" : "Set active now"}
                            aria-label={isActive ? `End ${cat.name}` : `Set ${cat.name} active`}
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border transition-all"
                            style={{ borderColor: isActive ? color : "hsl(var(--border))", backgroundColor: isActive ? color : "transparent", color: isActive ? "#fff" : color }}
                          >
                            {isActive ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          </button>
                        </div>
                        {d.start && !Number.isNaN(new Date(d.start).getTime()) && (() => {
                          const st = new Date(d.start);
                          const en = new Date(st.getTime() + (parseInt(d.duration) || 0) * 60000);
                          return (
                            <div className="flex items-center gap-1.5 px-2.5 pb-1.5 -mt-0.5">
                              <span className="text-[0.6875rem] tabular-nums px-2 py-0.5 rounded-full border"
                                style={{ borderColor: `${color}66`, color }}>
                                {format(st, "HH:mm")}–{format(en, "HH:mm")}
                              </span>
                              <button type="button" onClick={() => setDetail({ start: null })}
                                aria-label={`Clear the time for ${cat.name}`} title="Use the check-in time instead"
                                className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/50">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })()}
                        {open && (
                          <div className="px-2.5 pb-2 pt-1 space-y-1.5 border-t border-border/40">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-[0.625rem] text-muted-foreground uppercase tracking-wide mr-0.5">Duration</span>
                              {["5", "15", "30", "60", "90"].map((m) => (
                                <button key={m} type="button"
                                  onClick={() => setDetail({ duration: d.duration === m ? "" : m })}
                                  className={`text-[0.6875rem] px-2 py-0.5 rounded-full border transition-colors ${d.duration === m ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/40"}`}>
                                  {m}m
                                </button>
                              ))}
                              <input type="number" min="0" inputMode="numeric" placeholder="min" value={d.duration || ""}
                                onChange={(e) => setDetail({ duration: e.target.value })}
                                className="w-14 h-6 px-1.5 text-[0.6875rem] rounded border border-border/60 bg-background" />
                            </div>
                            <input type="text" placeholder="Note for this activity (optional)" value={d.note || ""}
                              onChange={(e) => setDetail({ note: e.target.value })}
                              className="w-full h-7 px-2 text-xs rounded border border-border/60 bg-background" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <MentionTextarea
                signposts
                placeholder="General note for these activities... (optional)"
                value={activityNote}
                onChange={setActivityNote}
                alters={alters}
                signposts
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
            {/* The planner's day view, thin, on the right edge: hold and
                drag on it to set when the targeted activity happened. */}
            {selectedActivityCategories.length > 0 && (() => {
              const day = entryTime ? new Date(entryTime) : new Date();
              const targetId = selectedActivityCategories.includes(timeTargetId)
                ? timeTargetId
                : selectedActivityCategories[selectedActivityCategories.length - 1];
              const target = activityCategories.find((c) => c.id === targetId);
              const pending = selectedActivityCategories.map((catId) => {
                const cat = activityCategories.find((c) => c.id === catId);
                const d = activityDetails[catId] || {};
                const start = d.start ? new Date(d.start) : null;
                return {
                  id: catId,
                  name: cat?.name || "Activity",
                  color: cat?.color || "#8b5cf6",
                  start: start && !Number.isNaN(start.getTime()) ? start : null,
                  minutes: parseInt(d.duration) || 30,
                  focused: catId === targetId,
                };
              });
              return (
                <div className="w-[6.5rem] flex-shrink-0 space-y-1">
                  <p className="text-[0.625rem] leading-tight text-muted-foreground">
                    Hold &amp; drag to time{" "}
                    <span className="font-semibold" style={{ color: target?.color || undefined }}>{target?.name || "it"}</span>
                  </p>
                  <ActivityTimeStrip
                    day={day}
                    pending={pending}
                    categoryColor={(id) => activityCategories.find((c) => c.id === id)?.color}
                    onFocus={(id) => setTimeTargetId(id)}
                    onPick={(id, start, minutes) => {
                      setTimeTargetId(id);
                      setActivityDetails((s) => ({ ...s, [id]: { ...s[id], start: start.toISOString(), duration: String(minutes) } }));
                    }}
                  />
                </div>
              );
            })()}
          </div>
          }

          {/* Symptoms / Habits */}
          {openSections.has("symptoms") &&
          <div ref={(el) => (sectionRefs.current.symptoms = el)} className="border border-border/50 rounded-xl p-3">
              <SymptomsSection
                onCheckInsReady={(getter) => {symptomGetterRef.current = getter;}}
                initialChecked={initialSymptomChecks}
                alters={alters}
                assignDefaultIds={selectedAlters}
              />
            </div>
          }

          {/* Diary */}
          {openSections.has("diary") &&
          <div ref={(el) => (sectionRefs.current.diary = el)} className="border border-border/50 rounded-xl p-3 space-y-2">
              <p className="text-sm font-medium">Check-In Log</p>
              <DiarySection data={diaryData} onChange={(groupKey, value) => setDiaryData((prev) => ({ ...prev, [groupKey]: value }))} />
            </div>
          }

          {/* Note */}
          {openSections.has("note") &&
          <div ref={(el) => (sectionRefs.current.note = el)} className="border border-border/50 rounded-xl p-3 space-y-2">
              <p className="text-sm font-medium">Quick note <span className="text-muted-foreground font-normal">(over 50 words → journal)</span></p>
              {/* Same @mention / -signpost input as every other note box.
                  A signposted {alter} is added to the fronting selection
                  automatically (the effect near the fronting state). */}
              <MentionTextarea
                value={note}
                onChange={setNote}
                alters={alters}
                signposts
                rows={3}
                placeholder="Optional note… @ to mention, -name to signpost"
                className="w-full rounded-lg border border-input bg-background text-xs p-2"
              />
              {note &&
            <p className="text-xs text-muted-foreground">
                  {note.trim().split(/\s+/).filter(Boolean).length} / 50 words
                  {note.trim().split(/\s+/).filter(Boolean).length > 50 && " · will save as journal entry"}
                </p>
            }
            </div>
          }

          {/* Company (who are you with) */}
          {openSections.has("contacts") &&
          <div ref={(el) => (sectionRefs.current.contacts = el)} className="border border-border/50 rounded-xl p-3 space-y-2">
              <p className="text-sm font-medium">Company</p>
              <ContactMultiSelectList selectedContactIds={selectedContactIds} onChange={setSelectedContactIds} />
            </div>
          }

          {/* Location */}
          {openSections.has("location") && (
            <div ref={(el) => (sectionRefs.current.location = el)} className="border border-border/50 rounded-xl p-3 space-y-3">
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

        {/* Bottom section nav — close the current section, open the previous /
            next one in order. Other manually-opened sections stay put. */}
        {(() => {
          const cIdx = PILLS.findIndex((p) => p.id === currentSectionId);
          const labelFor = (p) => (p?.id === "fronting" ? terms.Fronting : p?.label);
          const prevP = cIdx > 0 ? PILLS[cIdx - 1] : null;
          const nextP = cIdx >= 0 && cIdx < PILLS.length - 1 ? PILLS[cIdx + 1] : null;
          return (
            <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50 bg-card">
              <Button variant="ghost" size="sm" disabled={!prevP} onClick={() => goToSection(-1)} className="gap-1 text-xs min-w-0 flex-1 justify-start">
                <ChevronLeft className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{prevP ? labelFor(prevP) : "Prev"}</span>
              </Button>
              <span className="text-[0.6875rem] font-medium text-muted-foreground truncate px-1 flex-shrink-0">{cIdx >= 0 ? labelFor(PILLS[cIdx]) : ""}</span>
              <Button variant="ghost" size="sm" disabled={!nextP} onClick={() => goToSection(1)} className="gap-1 text-xs min-w-0 flex-1 justify-end">
                <span className="truncate">{nextP ? labelFor(nextP) : "Next"}</span> <ChevronRight className="w-4 h-4 flex-shrink-0" />
              </Button>
            </div>
          );
        })()}

        {/* Slider symptom picker — pick which rating symptom/habit the
            Feeling-section side slider tracks. */}
        {showSliderPicker && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSliderPicker(false)}>
            <div className="bg-card border border-border rounded-xl w-full max-w-xs max-h-[70vh] overflow-y-auto p-3 space-y-1" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-medium px-1 pb-1">Side rating tracks…</p>
              {ratingSymptoms.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1 py-2">
                  No rating-type symptoms or habits yet. Add one with type “Rating” in the Symptoms / Habits section and it'll show up here.
                </p>
              ) : (
                ratingSymptoms.map((s) => (
                  <button key={s.id} type="button" onClick={() => chooseSliderSymptom(s.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${s.id === effectiveSliderSymptomId ? "bg-primary/10 text-foreground" : "hover:bg-muted/50 text-muted-foreground"}`}>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color || "#8b5cf6" }} />
                    <span className="flex-1 truncate">{s.label}</span>
                    {s.category === "habit" && <span className="text-[0.5625rem] uppercase tracking-wide text-muted-foreground flex-shrink-0">Habit</span>}
                  </button>
                ))
              )}
              <button type="button"
                onClick={() => { writeQuickCheckinSliderEnabled(false); setSliderEnabled(false); setSliderValue(null); setShowSliderPicker(false); }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted/50 border-t border-border/40 mt-1">
                Turn off the side rating
              </button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
    </>
  );
}