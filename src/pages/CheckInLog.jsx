import React, { useState, useMemo, useEffect, useRef } from "react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44, localEntities } from "@/api/base44Client";
import { motion } from "framer-motion";
import { format, parseISO, startOfDay } from "date-fns";
import { Clock, ChevronDown, ChevronRight, Heart, Trash2, BarChart2, ChevronLeft, MapPin, SlidersHorizontal, Pencil, X } from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import DiaryAnalyticsSummary from "@/components/diary/DiaryAnalyticsSummary";
import QuickCheckInModal from "@/components/emotions/QuickCheckInModal";
import { getCategoryMeta } from "@/lib/locationCategories";
import { extractPerAlterEntries } from "@/lib/perAlterSessionEntries";
import PerAlterEntryEditor from "@/components/fronting/PerAlterEntryEditor";
import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";

// Long-press / double-click helper for re-opening a check-in in the
// Quick Check-In modal so the user can fix mistakes after the fact.
// Double-click is awkward on touch; touch users get a ~500ms hold
// instead. Mouse users get the standard double-click. We move-cancel
// to avoid hijacking scrolls.
function useEditPress(onEdit) {
  const timerRef = useRef(null);
  const startRef = useRef({ x: 0, y: 0 });
  const cancel = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };
  useEffect(() => cancel, []);
  return {
    onDoubleClick: (e) => { e.preventDefault(); onEdit(); },
    onTouchStart: (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onEdit();
      }, 500);
    },
    onTouchMove: (e) => {
      if (!timerRef.current || !e.touches || e.touches.length === 0) return;
      const dx = e.touches[0].clientX - startRef.current.x;
      const dy = e.touches[0].clientY - startRef.current.y;
      if (dx * dx + dy * dy > 100) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };
}
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

// User-controllable filter for what shows in the Check-In Log. Stored in
// localStorage so the choice persists across sessions. All toggles default
// to ON — disabling one only hides that entry type from THIS view (it does
// not stop the data from being recorded or appear anywhere else, e.g. the
// Timeline page).
const DEFAULT_DISPLAY = {
  checkIns: true,
  statusNotes: true,
  symptoms: true,
  activities: true,
  locations: true,
  perAlter: true,
  diary: true,
};
const DISPLAY_STORAGE_KEY = "symphony_checkin_log_display";

function useDisplaySettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(DISPLAY_STORAGE_KEY);
      if (raw) return { ...DEFAULT_DISPLAY, ...JSON.parse(raw) };
    } catch { /* fall through to defaults */ }
    return DEFAULT_DISPLAY;
  });
  useEffect(() => {
    try { localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(settings)); }
    catch { /* localStorage full or disabled — non-fatal */ }
  }, [settings]);
  return [settings, setSettings];
}

const EMOTION_COLORS = [
  "#f43f5e","#ec4899","#a855f7","#3b82f6","#14b8a6",
  "#22c55e","#f59e0b","#ef4444","#8b5cf6","#06b6d4",
  "#f97316","#84cc16","#e11d48","#7c3aed","#0891b2",
];
function emotionColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return EMOTION_COLORS[h % EMOTION_COLORS.length];
}

function EmotionPill({ em }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-white text-xs font-medium"
      style={{ backgroundColor: emotionColor(em) }}>
      {em}
    </span>
  );
}

function RatingBar({ label, value, max = 5, isPositive = false }) {
  if (value === undefined || value === null) return null;
  const color = isPositive ? "bg-green-500" : "bg-primary";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-0.5">
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} className={`w-4 h-4 rounded text-[0.5625rem] flex items-center justify-center font-medium ${
            i < value ? `${color} text-white` : "bg-muted text-muted-foreground"
          }`}>{i + 1}</div>
        ))}
      </div>
    </div>
  );
}

function DiaryDataSection({ diaryCard }) {
  if (!diaryCard) return null;
  const urges = diaryCard.urges || {};
  const bm = diaryCard.body_mind || {};
  const med = diaryCard.medication_safety || {};
  const notes = diaryCard.notes || {};

  const hasUrges = Object.values(urges).some(v => v !== undefined && v !== null);
  const hasBodyMind = Object.values(bm).some(v => v !== undefined && v !== null);
  const hasSkills = diaryCard.skills_practiced !== undefined && diaryCard.skills_practiced !== null;
  const hasMed = Object.values(med).some(v => v !== undefined && v !== null);
  const hasNotes = !!(notes.what || notes.judgments || notes.optional);

  if (!hasUrges && !hasBodyMind && !hasSkills && !hasMed && !hasNotes) return null;

  return (
    <div className="space-y-2 mt-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Check-In Log Data</p>

      {hasUrges && (
        <div className="space-y-1.5 p-2.5 rounded-lg bg-muted/30 border border-border/30">
          <p className="text-xs font-medium text-muted-foreground">⚠️ Urges</p>
          <RatingBar label="Suicidal urges" value={urges.suicidal} />
          <RatingBar label="Self-harm urges" value={urges.self_harm} />
          <RatingBar label="Alcohol / drugs" value={urges.alcohol_drugs} />
        </div>
      )}

      {hasBodyMind && (
        <div className="space-y-1.5 p-2.5 rounded-lg bg-muted/30 border border-border/30">
          <p className="text-xs font-medium text-muted-foreground">🧠 Body + Mind</p>
          <RatingBar label="Emotional misery" value={bm.emotional_misery} />
          <RatingBar label="Physical misery" value={bm.physical_misery} />
          <RatingBar label="Joy" value={bm.joy} isPositive />
        </div>
      )}

      {(hasSkills || hasMed) && (
        <div className="space-y-1.5 p-2.5 rounded-lg bg-muted/30 border border-border/30">
          <p className="text-xs font-medium text-muted-foreground">🛠️ Skills + Safety</p>
          {hasSkills && <RatingBar label="Skills practiced" value={diaryCard.skills_practiced} max={7} isPositive />}
          {med.rx_meds_taken !== undefined && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">💊 Rx meds taken</span>
              <span className={med.rx_meds_taken ? "text-green-500 font-medium" : "text-muted-foreground"}>
                {med.rx_meds_taken ? "Yes" : "No"}
              </span>
            </div>
          )}
          {med.self_harm_occurred !== undefined && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">✏️ Self-harm occurred</span>
              <span className={med.self_harm_occurred ? "text-destructive font-medium" : "text-muted-foreground"}>
                {med.self_harm_occurred ? "Yes" : "No"}
              </span>
            </div>
          )}
          {med.substances_count !== undefined && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">🍺 Substances</span>
              <span>{med.substances_count}</span>
            </div>
          )}
        </div>
      )}

      {hasNotes && (
        <div className="space-y-1.5 p-2.5 rounded-lg bg-muted/30 border border-border/30">
          <p className="text-xs font-medium text-muted-foreground">📝 Notes</p>
          {notes.what && <p className="text-xs text-foreground"><span className="text-muted-foreground">What happened: </span>{notes.what}</p>}
          {notes.judgments && <p className="text-xs text-foreground"><span className="text-muted-foreground">Judgments: </span>{notes.judgments}</p>}
          {notes.optional && <p className="text-xs text-foreground">{notes.optional}</p>}
        </div>
      )}
    </div>
  );
}

function CheckInCard({ checkIn, altersById, symptomsById, symptomCheckIns, activities, locations, diaryCard, highlighted, onDelete, onEdit, display = DEFAULT_DISPLAY }) {
  const ts = parseISO(checkIn.timestamp);
  const timeStr = format(ts, "h:mm a");
  const emotions = checkIn.emotions || [];
  const fronters = (checkIn.fronting_alter_ids || []).map(id => altersById[id]).filter(Boolean);
  // Inline note editor — lets the user fix typos in the quick check-in
  // note without re-doing the whole check-in. State scoped to this card.
  const queryClientForNote = useQueryClient();

  // Long notes (>50 words at save-time) live on a JournalEntry; the
  // EmotionCheckIn only holds a 300-char preview ending in "…". Fetch
  // the linked entry so the user reads/edits the FULL text rather than
  // a truncated stub.
  const { data: linkedJournal } = useQuery({
    queryKey: ["journalEntry", checkIn.journal_entry_id],
    queryFn: () => base44.entities.JournalEntry.filter({ id: checkIn.journal_entry_id }).then(rs => rs?.[0] || null),
    enabled: !!checkIn.journal_entry_id,
  });
  const note = linkedJournal?.content || checkIn.note;

  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note || "");
  const [savingNote, setSavingNote] = useState(false);
  useEffect(() => { setNoteDraft(note || ""); }, [note]);
  const handleSaveNote = async () => {
    const next = noteDraft.trim();
    setSavingNote(true);
    try {
      // Mirror the QuickCheckInModal create-path: long notes go in a
      // JournalEntry, the EmotionCheckIn holds a 300-char preview +
      // journal_entry_id. Keeps the two in sync when edited inline.
      const wc = next ? next.split(/\s+/).filter(Boolean).length : 0;
      let journalEntryId = checkIn.journal_entry_id || null;
      if (next && wc > 50) {
        if (journalEntryId) {
          try {
            await base44.entities.JournalEntry.update(journalEntryId, { content: next });
          } catch {
            const j = await base44.entities.JournalEntry.create({
              title: `Check-in - ${format(ts, "P")}`,
              content: next,
              entry_type: "personal",
              tags: ["checkin"],
              folder: "Check-In Journals",
              created_date: checkIn.timestamp,
            });
            journalEntryId = j.id;
          }
        } else {
          const j = await base44.entities.JournalEntry.create({
            title: `Check-in - ${format(ts, "P")}`,
            content: next,
            entry_type: "personal",
            tags: ["checkin"],
            folder: "Check-In Journals",
            created_date: checkIn.timestamp,
          });
          journalEntryId = j.id;
        }
      }
      const noteForCheckIn = next
        ? (wc <= 50 ? next : next.substring(0, 300) + "...")
        : null;
      await base44.entities.EmotionCheckIn.update(checkIn.id, {
        note: noteForCheckIn,
        journal_entry_id: journalEntryId,
      });
      queryClientForNote.invalidateQueries({ queryKey: ["emotionCheckIns"] });
      queryClientForNote.invalidateQueries({ queryKey: ["journalEntry", journalEntryId] });
      queryClientForNote.invalidateQueries({ queryKey: ["journalEntries"] });
      setEditingNote(false);
    } catch (e) { toast.error(e.message || "Failed to save"); }
    finally { setSavingNote(false); }
  };

  const ciTime = ts.getTime();
  const TWO_MIN = 2 * 60 * 1000;

  // Only show symptoms that were part of this specific check-in (linked by check_in_id)
  const mySymptomCheckIns = symptomCheckIns.filter(sc => sc.check_in_id === checkIn.id);

  const myActivities = activities.filter(act => {
    try { return Math.abs(new Date(act.timestamp).getTime() - ciTime) < TWO_MIN; }
    catch { return false; }
  });

  const myLocations = locations.filter(loc => {
    try { return Math.abs(new Date(loc.timestamp).getTime() - ciTime) < TWO_MIN; }
    catch { return false; }
  });

  const ref = useRef(null);
  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  // Double-click (mouse) or long-press (touch) reopens this check-in in
  // the Quick Check-In modal so the user can fix things post-hoc.
  const editPress = useEditPress(() => onEdit?.(checkIn));

  return (
    <div
      ref={ref}
      id={`checkin-${checkIn.id}`}
      {...editPress}
      title="Double-click or long-press to edit"
      className={`px-4 py-3 space-y-2.5 transition-all duration-500 group/checkin ${highlighted ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-muted/10"}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3 flex-shrink-0" />
          <span>{timeStr}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onEdit?.(checkIn); }}
            aria-label="Edit check-in"
            title="Edit check-in">
            <Pencil className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={(e) => { e.stopPropagation(); onDelete(checkIn.id); }}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {emotions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {emotions.map(em => <EmotionPill key={em} em={em} />)}
        </div>
      )}

      {fronters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {fronters.map(a => (
            <span key={a.id} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-muted border border-border/50">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#8b5cf6" }} />
              {a.alias || a.name}
            </span>
          ))}
        </div>
      )}

      {display.symptoms && mySymptomCheckIns.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {mySymptomCheckIns.map((sc, i) => {
            const symptom = symptomsById[sc.symptom_id];
            const color = symptom?.color || "#8b5cf6";
            return (
              <span key={i} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border text-foreground"
                style={{ backgroundColor: `${color}33`, borderColor: `${color}99` }}>
                {symptom?.label || "Symptom"}{sc.severity != null ? ` · ${sc.severity}/5` : ""}
              </span>
            );
          })}
        </div>
      )}

      {display.activities && myActivities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {myActivities.map((act, i) => (
            <span key={i} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              ⚡ {act.activity_name}{act.duration_minutes ? ` · ${act.duration_minutes}m` : ""}
            </span>
          ))}
        </div>
      )}

      {display.locations && myLocations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {myLocations.map((loc, i) => {
            const meta = getCategoryMeta(loc.category);
            return (
              <div key={i} className="flex flex-col gap-0.5">
                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 self-start">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  {loc.name || meta?.label || "Location"}
                </span>
                {loc.latitude != null && loc.longitude != null && (
                  <a
                    href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[0.6875rem] text-blue-400 hover:text-blue-300 underline self-start"
                  >
                    {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)} ↗
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick-check-in note: editable inline so typos are fixable
          without re-doing the check-in. Hidden until the user opens
          the editor when no note exists yet (a small + button). */}
      {editingNote ? (
        <div className="space-y-1.5">
          <textarea
            autoFocus
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setNoteDraft(note || ""); setEditingNote(false); }
            }}
            rows={3}
            placeholder="Note for this check-in…"
            className="w-full bg-background border border-border/60 rounded-md px-2 py-1.5 text-sm"
          />
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={handleSaveNote} loading={savingNote}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setNoteDraft(note || ""); setEditingNote(false); }}>Cancel</Button>
          </div>
        </div>
      ) : note ? (
        <div className="flex items-start gap-2 group">
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed flex-1">{note}</p>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground flex-shrink-0"
            onClick={() => setEditingNote(true)}
            aria-label="Edit note"
            title="Edit note"
          >
            <Pencil className="w-3 h-3" />
          </Button>
        </div>
      ) : null}

      {checkIn.journal_entry_id && (
        <p className="text-xs text-primary italic">📓 Extended note saved as journal entry</p>
      )}

      {display.diary && <DiaryDataSection diaryCard={diaryCard} />}
    </div>
  );
}

function DayTotals({ checkIns, altersById, symptomCheckIns, symptomsById, activities, locations, statusNotes = [], diaryCards = [], perAlterEntries = [], totalEntryCount, display = DEFAULT_DISPLAY }) {
  // Emotions and fronters are surfaced from EmotionCheckIn records — both
  // get hidden when the user has the "Check-ins" toggle off, since that's
  // their parent entry type.
  // Day total emotions come from EmotionCheckIn only — per-alter
  // session emotions live in the PER-ALTER strip below where they're
  // attributed to the specific alter, so we don't double-count them
  // in the main day-total chips.
  const allEmotions = useMemo(() => {
    if (!display.checkIns) return [];
    const tally = {};
    checkIns.forEach(ci => (ci.emotions || []).forEach(em => { tally[em] = (tally[em] || 0) + 1; }));
    return Object.entries(tally).sort((a, b) => b[1] - a[1]);
  }, [checkIns, display.checkIns]);

  const allFronterIds = useMemo(() =>
    display.checkIns ? [...new Set(checkIns.flatMap(ci => ci.fronting_alter_ids || []))] : [],
    [checkIns, display.checkIns]
  );
  const fronters = allFronterIds.map(id => altersById[id]).filter(Boolean);

  // De-duplicate symptoms by symptom_id, keeping highest severity.
  // Includes both SymptomCheckIn records AND per-alter symptoms
  // embedded in FrontingSession's session_symptoms JSON — otherwise
  // alter-specific symptoms vanish from the day total even though
  // they ARE part of the day.
  // Day total symptoms come from SymptomCheckIn only — per-alter
  // session_symptoms appear in the PER-ALTER strip below, attributed
  // to the alter that logged them.
  const allSymptoms = useMemo(() => {
    if (!display.symptoms) return [];
    const seen = {};
    symptomCheckIns.forEach(sc => {
      const prev = seen[sc.symptom_id];
      if (!prev || (sc.severity ?? -1) > (prev.severity ?? -1)) seen[sc.symptom_id] = sc;
    });
    return Object.values(seen);
  }, [symptomCheckIns, display.symptoms]);

  const allActivities = display.activities ? [...new Set(activities.map(a => a.activity_name))] : [];

  // Aggregate diary data across all diary cards for the day
  const diaryAggregate = useMemo(() => {
    if (!display.diary) return null;
    if (!diaryCards.length) return null;
    const joyVals = [], skillsVals = [], suicidalVals = [], selfHarmVals = [];
    const emotionalMiseryVals = [], physicalMiseryVals = [];
    let rxTaken = false, selfHarmOccurred = false;
    diaryCards.forEach(dc => {
      const bm = dc.body_mind || {};
      const urges = dc.urges || {};
      const med = dc.medication_safety || {};
      if (bm.joy != null) joyVals.push(bm.joy);
      if (bm.emotional_misery != null) emotionalMiseryVals.push(bm.emotional_misery);
      if (bm.physical_misery != null) physicalMiseryVals.push(bm.physical_misery);
      if (dc.skills_practiced != null) skillsVals.push(dc.skills_practiced);
      // Urges: use max — safety-relevant, want to surface worst value across the day
      if (urges.suicidal != null) suicidalVals.push(urges.suicidal);
      if (urges.self_harm != null) selfHarmVals.push(urges.self_harm);
      if (med.rx_meds_taken) rxTaken = true;
      if (med.self_harm_occurred) selfHarmOccurred = true;
    });
    const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
    const max = (arr) => arr.length ? Math.max(...arr) : null;
    return {
      avgJoy: avg(joyVals),
      avgSkills: avg(skillsVals),
      avgEmotionalMisery: avg(emotionalMiseryVals),
      avgPhysicalMisery: avg(physicalMiseryVals),
      maxSuicidal: max(suicidalVals),
      maxSelfHarm: max(selfHarmVals),
      count: diaryCards.length,
      rxTaken,
      selfHarmOccurred,
    };
  }, [diaryCards, display.diary]);

  // After the display filter is applied, the per-row visibility uses the
  // local arrays above (which are already empty when their toggle is off),
  // while the standalone-feed arrays (locations, statusNotes, perAlterEntries)
  // still arrive populated — short-circuit those here.
  const visibleLocations = display.locations ? locations : [];
  const visibleStatusNotes = display.statusNotes ? statusNotes : [];
  const visiblePerAlterEntries = display.perAlter ? perAlterEntries : [];

  const isEmpty = allEmotions.length === 0 && fronters.length === 0 && allSymptoms.length === 0
    && allActivities.length === 0 && visibleLocations.length === 0 && visibleStatusNotes.length === 0 && !diaryAggregate
    && visiblePerAlterEntries.length === 0;
  if (isEmpty) return null;

  const entryCount = totalEntryCount ?? checkIns.length;

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border/30 space-y-2.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Day Total · {entryCount} entr{entryCount !== 1 ? "ies" : "y"}
        {diaryCards.length > 0 && ` · diary logged`}
      </p>

      {allEmotions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allEmotions.map(([em, count]) => (
            <span key={em} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs font-medium"
              style={{ backgroundColor: emotionColor(em) }}>
              {em} {count > 1 && <span className="opacity-80">×{count}</span>}
            </span>
          ))}
        </div>
      )}

      {fronters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {fronters.map(a => (
            <span key={a.id} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-muted border border-border/50">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#8b5cf6" }} />
              {a.alias || a.name}
            </span>
          ))}
        </div>
      )}

      {allSymptoms.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allSymptoms.map((sc, i) => {
            const symptom = symptomsById[sc.symptom_id];
            const label = symptom?.label || "?";
            const color = symptom?.color || "#8b5cf6";
            return (
              <span key={i} className="text-xs px-1.5 py-0.5 rounded-full border text-foreground"
                style={{ backgroundColor: `${color}33`, borderColor: `${color}99` }}>
                {label}{sc.severity != null ? ` · ${sc.severity}/5` : ""}
              </span>
            );
          })}
        </div>
      )}

      {allActivities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allActivities.map((name, i) => (
            <span key={i} className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              ⚡ {name}
            </span>
          ))}
        </div>
      )}

      {visiblePerAlterEntries.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground font-semibold">Per-alter</p>
          <div className="space-y-2">
            {(() => {
              // Bucket entries by alter so each alter shows once with
              // the name as a label and every emotion / symptom / note
              // they logged rendered as its own colored pill.
              const byAlter = new Map();
              for (const e of visiblePerAlterEntries) {
                if (!byAlter.has(e.alterId)) byAlter.set(e.alterId, []);
                byAlter.get(e.alterId).push(e);
              }
              return [...byAlter.entries()].map(([alterId, entries]) => {
                const alter = altersById[alterId];
                const color = alter?.color || "#8b5cf6";
                const name = alter?.alias || alter?.name || "?";
                const pills = [];
                for (const e of entries) {
                  if (e.kind === "note") {
                    pills.push({ kind: "note", key: `n-${e.id}`, text: `💬 ${e.payload.text}` });
                  } else if (e.kind === "emotion") {
                    const labels = Array.isArray(e.payload?.labels) && e.payload.labels.length > 0
                      ? e.payload.labels
                      : (e.payload?.label ? [e.payload.label] : []);
                    labels.forEach((l, i) => pills.push({ kind: "emotion", key: `e-${e.id}-${i}`, text: l, em: l }));
                  } else if (e.kind === "symptom") {
                    const syms = Array.isArray(e.payload?.items) && e.payload.items.length > 0
                      ? e.payload.items
                      : [e.payload].filter(Boolean);
                    syms.forEach((s, i) => pills.push({
                      kind: "symptom",
                      key: `s-${e.id}-${i}`,
                      text: `${s.label}${s.value !== undefined && s.value !== null && s.value !== true ? ` · ${s.value}` : ""}`,
                    }));
                  }
                }
                return (
                  <div key={alterId} className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[0.75rem] font-semibold" style={{ color }}>{name}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {pills.map((p) => {
                        if (p.kind === "emotion") {
                          return (
                            <span key={p.key} className="text-xs px-1.5 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: emotionColor(p.em) }}>
                              {p.text}
                            </span>
                          );
                        }
                        return (
                          <span
                            key={p.key}
                            className="text-xs px-1.5 py-0.5 rounded-full border text-foreground"
                            style={{ backgroundColor: `${color}33`, borderColor: `${color}99` }}
                          >
                            {p.text}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {visibleLocations.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {visibleLocations.map((loc, i) => {
            const meta = getCategoryMeta(loc.category);
            return (
              <span key={i} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                {loc.name || meta?.label || "Location"}
              </span>
            );
          })}
        </div>
      )}

      {diaryAggregate && (
        <div className="flex flex-wrap gap-1">
          {diaryAggregate.avgJoy != null && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20">
              😊 Joy {diaryAggregate.avgJoy}/5{diaryAggregate.count > 1 ? " avg" : ""}
            </span>
          )}
          {diaryAggregate.avgEmotionalMisery != null && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20">
              😔 Emotional misery {diaryAggregate.avgEmotionalMisery}/5{diaryAggregate.count > 1 ? " avg" : ""}
            </span>
          )}
          {diaryAggregate.avgPhysicalMisery != null && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 border border-orange-500/20">
              🩻 Physical misery {diaryAggregate.avgPhysicalMisery}/5{diaryAggregate.count > 1 ? " avg" : ""}
            </span>
          )}
          {diaryAggregate.avgSkills != null && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
              🛠️ Skills {diaryAggregate.avgSkills}/7{diaryAggregate.count > 1 ? " avg" : ""}
            </span>
          )}
          {diaryAggregate.maxSuicidal != null && diaryAggregate.maxSuicidal > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20">
              ⚠️ Suicidal urges {diaryAggregate.maxSuicidal}/5{diaryAggregate.count > 1 ? " peak" : ""}
            </span>
          )}
          {diaryAggregate.maxSelfHarm != null && diaryAggregate.maxSelfHarm > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 border border-orange-500/20">
              ⚠️ Self-harm urges {diaryAggregate.maxSelfHarm}/5{diaryAggregate.count > 1 ? " peak" : ""}
            </span>
          )}
          {diaryAggregate.rxTaken && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 border border-purple-500/20">
              💊 Meds taken
            </span>
          )}
          {diaryAggregate.selfHarmOccurred && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20">
              ✏️ Self-harm occurred
            </span>
          )}
        </div>
      )}

      {visibleStatusNotes.length > 0 && (
        <div className="space-y-0.5">
          {visibleStatusNotes.map((sn, i) => (
            <p key={i} className="text-xs text-foreground/70 italic">💬 {sn.note}</p>
          ))}
        </div>
      )}

    </div>
  );
}

function StandaloneEntry({ timestamp, children, actions }) {
  const timeStr = format(new Date(timestamp), "h:mm a");
  return (
    <div className="px-4 py-2.5 hover:bg-muted/10">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3 flex-shrink-0" />
          <span>{timeStr}</span>
        </div>
        {actions ? <div className="flex-shrink-0">{actions}</div> : null}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function useArmedDelete(onConfirm) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const trigger = async () => {
    if (!armed) {
      setArmed(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    clearTimeout(timerRef.current);
    setArmed(false);
    await onConfirm();
  };
  return { armed, trigger };
}

function RowActions({ onEdit, onDelete, armed, editLabel = "Edit", deleteLabel = "Delete" }) {
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      {onEdit && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          aria-label={editLabel}
          title={editLabel}
          className="text-muted-foreground hover:text-foreground p-1 rounded-md"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label={armed ? "Tap again to delete" : deleteLabel}
          title={armed ? "Tap again to confirm" : deleteLabel}
          className={`p-1 rounded-md transition-colors ${
            armed ? "bg-destructive/15 text-destructive ring-1 ring-destructive/40" : "text-muted-foreground hover:text-destructive"
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {armed && <span className="ml-1 text-[0.625rem] uppercase tracking-wide font-semibold">Confirm</span>}
        </button>
      )}
    </div>
  );
}

function SymptomUpdateEntry({ sc, symptomsById }) {
  const qc = useQueryClient();
  const symptom = symptomsById[sc.symptom_id];
  const color = symptom?.color || "#8b5cf6";
  const [editing, setEditing] = useState(false);
  const [severity, setSeverity] = useState(sc.severity ?? null);
  const [saving, setSaving] = useState(false);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["symptomCheckIns"] });
    qc.invalidateQueries({ queryKey: ["timeline"] });
    qc.invalidateQueries({ queryKey: ["currentSymptoms"] });
  };

  const { armed, trigger: handleDelete } = useArmedDelete(async () => {
    try {
      await base44.entities.SymptomCheckIn.delete(sc.id);
      invalidateAll();
      toast.success("Symptom deleted");
    } catch (e) { toast.error(e.message || "Failed to delete"); }
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.SymptomCheckIn.update(sc.id, { severity });
      invalidateAll();
      setEditing(false);
    } catch (e) { toast.error(e.message || "Failed to save"); }
    finally { setSaving(false); }
  };

  return (
    <StandaloneEntry
      timestamp={sc.timestamp}
      actions={!editing && (
        <RowActions
          onEdit={() => setEditing(true)}
          onDelete={handleDelete}
          armed={armed}
          editLabel="Edit severity"
          deleteLabel="Delete symptom entry"
        />
      )}
    >
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border flex-shrink-0 text-foreground"
        style={{ backgroundColor: `${color}33`, borderColor: `${color}99` }}>
        {symptom?.label || "Symptom"}{!editing && sc.severity != null ? ` · ${sc.severity}/5` : ""}
      </span>
      {editing && (
        <>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSeverity(n)}
                className={`w-5 h-5 text-[0.625rem] font-semibold rounded-md border transition-colors ${
                  severity === n ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSeverity(null)}
              className={`px-1.5 h-5 text-[0.625rem] rounded-md border transition-colors ${
                severity == null ? "bg-muted text-foreground border-border" : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              None
            </button>
          </div>
          <button type="button" onClick={handleSave} disabled={saving} className="text-xs px-2 py-0.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Save</button>
          <button type="button" onClick={() => { setSeverity(sc.severity ?? null); setEditing(false); }} className="text-xs px-2 py-0.5 rounded-md border border-border/60 text-muted-foreground hover:text-foreground">Cancel</button>
        </>
      )}
    </StandaloneEntry>
  );
}

function ActivityEntry({ act }) {
  return (
    <StandaloneEntry timestamp={act.timestamp}>
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
        ⚡ {act.activity_name}{act.duration_minutes ? ` · ${act.duration_minutes}m` : ""}
      </span>
    </StandaloneEntry>
  );
}

function LocationEntry({ loc }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const meta = getCategoryMeta(loc.category);
  const { armed, trigger: handleDelete } = useArmedDelete(async () => {
    try {
      await localEntities.Location.delete(loc.id);
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["timeline"] });
      toast.success("Location deleted");
    } catch (e) { toast.error(e.message || "Failed to delete"); }
  });

  return (
    <StandaloneEntry
      timestamp={loc.timestamp}
      actions={(
        <RowActions
          onEdit={() => navigate("/location-history")}
          onDelete={handleDelete}
          armed={armed}
          editLabel="Open Location History to edit"
          deleteLabel="Delete location"
        />
      )}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 self-start">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          {loc.name || meta?.label || "Location"}
        </span>
        {loc.latitude != null && loc.longitude != null && (
          <a
            href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[0.6875rem] text-blue-400 hover:text-blue-300 underline self-start"
          >
            {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)} ↗
          </a>
        )}
      </div>
    </StandaloneEntry>
  );
}

function StatusNoteEntry({ sn }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sn.note || "");
  const [saving, setSaving] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const disarmRef = useRef(null);
  useEffect(() => () => clearTimeout(disarmRef.current), []);

  const handleSave = async () => {
    const next = draft.trim();
    if (!next) { toast.error("Status can't be empty"); return; }
    setSaving(true);
    try {
      await localEntities.StatusNote.update(sn.id, { note: next });
      qc.invalidateQueries({ queryKey: ["statusNotes"] });
      setEditing(false);
    } catch (e) { toast.error(e.message || "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      clearTimeout(disarmRef.current);
      disarmRef.current = setTimeout(() => setDeleteArmed(false), 4000);
      return;
    }
    clearTimeout(disarmRef.current);
    setDeleteArmed(false);
    try {
      await localEntities.StatusNote.delete(sn.id);
      qc.invalidateQueries({ queryKey: ["statusNotes"] });
      toast.success("Status deleted");
    } catch (e) { toast.error(e.message || "Failed to delete"); }
  };

  return (
    <StandaloneEntry timestamp={sn.timestamp}>
      {editing ? (
        <div className="flex-1 w-full flex flex-col gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleSave(); }
              if (e.key === "Escape") { setDraft(sn.note || ""); setEditing(false); }
            }}
            className="w-full bg-background border border-border/60 rounded-md px-2 py-1 text-sm"
            placeholder="Edit status…"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-xs px-2 py-0.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setDraft(sn.note || ""); setEditing(false); }}
              className="text-xs px-2 py-0.5 rounded-md border border-border/60 text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-start gap-2">
          <span className="text-sm text-foreground/80 italic flex-1">💬 {sn.note}</span>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit status"
              title="Edit"
              className="text-muted-foreground hover:text-foreground p-1 rounded-md"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              aria-label={deleteArmed ? "Tap again to delete" : "Delete status"}
              title={deleteArmed ? "Tap again to confirm" : "Delete"}
              className={`p-1 rounded-md transition-colors ${
                deleteArmed ? "bg-destructive/15 text-destructive ring-1 ring-destructive/40" : "text-muted-foreground hover:text-destructive"
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleteArmed && <span className="ml-1 text-[0.625rem] uppercase tracking-wide font-semibold">Confirm</span>}
            </button>
          </div>
        </div>
      )}
    </StandaloneEntry>
  );
}

// One entry from a FrontingSession's per-alter note / emotion / symptom
// array. Edit opens the same full Note/Emotions/Symptoms/Trigger
// editor the dashboard uses, so what's shown is exactly what's
// editable — no awkward inline X-the-pill mini-editors. Delete still
// wipes the relevant payload (per-index for notes, wholesale for
// emotion/symptom groups).
function PerAlterEntry({ entry, altersById }) {
  const qc = useQueryClient();
  const alter = altersById[entry.alterId];
  const color = alter?.color || "#8b5cf6";
  const name = alter?.alias || alter?.name || "Unknown";
  const [editorOpen, setEditorOpen] = useState(false);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["frontingSessions"] });
    qc.invalidateQueries({ queryKey: ["activeFront"] });
    qc.invalidateQueries({ queryKey: ["frontHistory"] });
    qc.invalidateQueries({ queryKey: ["timeline"] });
  };

  const { armed, trigger: handleDelete } = useArmedDelete(async () => {
    try {
      const session = await base44.entities.FrontingSession.filter({ id: entry.sessionId }).then(rs => rs?.[0]);
      if (!session) return;
      if (entry.kind === "note") {
        const arr = JSON.parse(session.note || "[]");
        const targetIdx = Number((entry.id.match(/-(\d+)$/) || [])[1]);
        const next = Array.isArray(arr) ? arr.filter((_, i) => i !== targetIdx) : [];
        await base44.entities.FrontingSession.update(session.id, { note: JSON.stringify(next) });
      } else if (entry.kind === "emotion") {
        await base44.entities.FrontingSession.update(session.id, { session_emotions: JSON.stringify([]) });
      } else if (entry.kind === "symptom") {
        await base44.entities.FrontingSession.update(session.id, { session_symptoms: JSON.stringify([]) });
      }
      invalidateAll();
      toast.success("Deleted");
    } catch (e) { toast.error(e.message || "Failed to delete"); }
  });

  const AlterChip = () => (
    <span className="flex items-center gap-1 text-[0.6875rem] px-1.5 py-0.5 rounded-full bg-muted/40 border border-border/40 flex-shrink-0">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );

  const actions = (
    <RowActions
      onEdit={() => setEditorOpen(true)}
      onDelete={handleDelete}
      armed={armed}
      editLabel="Edit"
      deleteLabel="Delete this per-alter entry"
    />
  );

  const editorPortal = (
    <PerAlterEntryEditor
      isOpen={editorOpen}
      onClose={() => setEditorOpen(false)}
      entry={entry}
      alter={alter}
      focusKind={entry.kind}
    />
  );

  if (entry.kind === "note") {
    return (
      <>
        <StandaloneEntry timestamp={entry.ts} actions={actions}>
          <div className="flex items-start gap-2 min-w-0 w-full">
            <AlterChip />
            <span className="text-sm text-foreground/80 min-w-0">💬 {entry.payload.text}</span>
          </div>
        </StandaloneEntry>
        {editorPortal}
      </>
    );
  }
  if (entry.kind === "emotion") {
    const labels = Array.isArray(entry.payload?.labels) && entry.payload.labels.length > 0
      ? entry.payload.labels
      : (entry.payload?.label ? [entry.payload.label] : []);
    return (
      <>
        <StandaloneEntry timestamp={entry.ts} actions={actions}>
          <div className="flex items-center gap-2 flex-wrap">
            <AlterChip />
            {labels.map((em, i) => <EmotionPill key={`${em}-${i}`} em={em} />)}
          </div>
        </StandaloneEntry>
        {editorPortal}
      </>
    );
  }
  // symptom
  const items = Array.isArray(entry.payload?.items) && entry.payload.items.length > 0
    ? entry.payload.items
    : [entry.payload].filter(Boolean);
  return (
    <>
      <StandaloneEntry timestamp={entry.ts} actions={actions}>
        <div className="flex items-center gap-2 flex-wrap">
          <AlterChip />
          {items.map((sym, i) => (
            <span
              key={`${sym.label || sym.id || i}`}
              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border text-foreground"
              style={{ backgroundColor: `${color}33`, borderColor: `${color}99` }}
            >
              {sym.label}{sym.value !== undefined && sym.value !== null && sym.value !== true ? ` · ${sym.value}` : ""}
            </span>
          ))}
        </div>
      </StandaloneEntry>
      {editorPortal}
    </>
  );
}

function DayGroup({ date, checkIns, altersById, symptomsById, allSymptomCheckIns, allActivities, allLocations, allStatusNotes, perAlterEntries, diaryCardsByDate, highlightId, defaultExpanded, onDelete, onEdit, display = DEFAULT_DISPLAY }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const dateObj = parseISO(date + "T12:00:00");

  useEffect(() => {
    if (highlightId && checkIns.some(ci => ci.id === highlightId)) {
      setExpanded(true);
    }
  }, [highlightId, checkIns]);

  const allEmotions = [...new Set(checkIns.flatMap(ci => ci.emotions || []))];

  // Use date-based filtering so quick-action symptoms (no check_in_id) are included
  const daySymptomCheckIns = allSymptomCheckIns.filter(sc => {
    try { return format(new Date(sc.timestamp), "yyyy-MM-dd") === date; }
    catch { return false; }
  });

  // Standalone symptom updates (no check_in_id = logged outside a formal check-in)
  const standaloneSymptomCheckIns = daySymptomCheckIns.filter(sc => !sc.check_in_id);

  const dayActivities = allActivities.filter(act => {
    try { return format(new Date(act.timestamp), "yyyy-MM-dd") === date; }
    catch { return false; }
  });

  const dayLocations = (allLocations || []).filter(loc => {
    try { return format(new Date(loc.timestamp), "yyyy-MM-dd") === date; }
    catch { return false; }
  });

  const dayStatusNotes = (allStatusNotes || []).filter(sn => {
    try { return format(new Date(sn.timestamp), "yyyy-MM-dd") === date; }
    catch { return false; }
  });

  // Per-alter session entries (notes / emotions / symptoms surfaced from
  // FrontingSession). Read-only — drawn straight from the session records.
  const dayPerAlterEntries = (perAlterEntries || []).filter(e => {
    try { return format(new Date(e.ts), "yyyy-MM-dd") === date; }
    catch { return false; }
  });

  // Activities/locations within ±2min of a check-in are shown inside that CheckInCard.
  // Anything outside that window appears as its own standalone entry.
  const checkInTimes = checkIns.map(ci => new Date(ci.timestamp).getTime());
  const TWO_MIN = 2 * 60 * 1000;
  const nearCheckIn = (ts) => checkInTimes.length > 0 && checkInTimes.some(t => Math.abs(ts - t) < TWO_MIN);
  const standaloneActivities = dayActivities.filter(act => !nearCheckIn(new Date(act.timestamp).getTime()));
  const standaloneLocations = dayLocations.filter(loc => !nearCheckIn(new Date(loc.timestamp).getTime()));

  const dayDiaryCards = diaryCardsByDate[date] || [];

  // Apply the user's display toggles. Once every entry type for a day is
  // hidden we render nothing (the day's row would otherwise be confusing
  // with an empty summary + 0 count).
  const visibleCheckIns = display.checkIns ? checkIns : [];
  const visibleStandaloneSymptoms = display.symptoms ? standaloneSymptomCheckIns : [];
  const visibleStandaloneActivities = display.activities ? standaloneActivities : [];
  const visibleStandaloneLocations = display.locations ? standaloneLocations : [];
  const visibleStatusNotes = display.statusNotes ? dayStatusNotes : [];
  const visiblePerAlter = display.perAlter ? dayPerAlterEntries : [];
  const visibleDiaryCards = display.diary ? dayDiaryCards : [];

  // Summary chips on the collapsed day header — reflect the filtered view.
  const summaryParts = [];
  if (display.checkIns && allEmotions.length > 0) summaryParts.push(allEmotions.slice(0, 3).join(", ") + (allEmotions.length > 3 ? ` +${allEmotions.length - 3}` : ""));
  if (display.symptoms && daySymptomCheckIns.length > 0) summaryParts.push(`${daySymptomCheckIns.length} symptom${daySymptomCheckIns.length !== 1 ? "s" : ""}`);
  if (display.activities && dayActivities.length > 0) summaryParts.push(`${dayActivities.length} activit${dayActivities.length !== 1 ? "ies" : "y"}`);
  if (display.locations && dayLocations.length > 0) summaryParts.push(`${dayLocations.length} location${dayLocations.length !== 1 ? "s" : ""}`);
  if (display.diary && dayDiaryCards.length > 0) summaryParts.push("diary logged");
  if (display.perAlter && dayPerAlterEntries.length > 0) summaryParts.push(`${dayPerAlterEntries.length} per-alter`);

  const totalVisibleEntries =
    visibleCheckIns.length +
    visibleStandaloneSymptoms.length +
    visibleStandaloneActivities.length +
    visibleStandaloneLocations.length +
    visibleStatusNotes.length +
    visiblePerAlter.length;
  if (totalVisibleEntries === 0 && visibleDiaryCards.length === 0) return null;

  return (
    <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left px-4 py-3 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Heart className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-sm">{format(dateObj, "EEEE, MMMM d, yyyy")}</p>
              {summaryParts.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {summaryParts.join(" · ")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-muted-foreground">{totalVisibleEntries} entr{totalVisibleEntries !== 1 ? "ies" : "y"}</span>
            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
        </div>
      </button>

      {/* Day Total summary — always visible (even when the day is collapsed)
          so users can scan chips/aggregates without having to expand every
          row. The per-entry list below is what stays gated by `expanded`. */}
      <DayTotals
        checkIns={visibleCheckIns}
        altersById={altersById}
        symptomCheckIns={daySymptomCheckIns}
        symptomsById={symptomsById}
        activities={dayActivities}
        locations={dayLocations}
        statusNotes={visibleStatusNotes}
        diaryCards={visibleDiaryCards}
        perAlterEntries={visiblePerAlter}
        totalEntryCount={totalVisibleEntries + visibleDiaryCards.length}
        display={display}
      />

      {expanded && (
        <div className="border-t border-border/30 divide-y divide-border/20">
          {[
            ...visibleCheckIns.map(ci => ({ kind: "checkin", data: ci, ts: new Date(ci.timestamp).getTime() })),
            ...visibleStandaloneSymptoms.map(sc => ({ kind: "symptom", data: sc, ts: new Date(sc.timestamp).getTime() })),
            ...visibleStandaloneActivities.map(act => ({ kind: "activity", data: act, ts: new Date(act.timestamp).getTime() })),
            ...visibleStandaloneLocations.map(loc => ({ kind: "location", data: loc, ts: new Date(loc.timestamp).getTime() })),
            ...visibleStatusNotes.map(sn => ({ kind: "status", data: sn, ts: new Date(sn.timestamp).getTime() })),
            ...visiblePerAlter.map(e => ({ kind: "per-alter", data: e, ts: new Date(e.ts).getTime() })),
          ].sort((a, b) => a.ts - b.ts).map((entry, i) => {
            if (entry.kind === "symptom") {
              return <SymptomUpdateEntry key={`sym-${entry.data.id || i}`} sc={entry.data} symptomsById={symptomsById} />;
            }
            if (entry.kind === "activity") {
              return <ActivityEntry key={`act-${entry.data.id || i}`} act={entry.data} />;
            }
            if (entry.kind === "location") {
              return <LocationEntry key={`loc-${entry.data.id || i}`} loc={entry.data} />;
            }
            if (entry.kind === "status") {
              return <StatusNoteEntry key={`sn-${entry.data.id || i}`} sn={entry.data} />;
            }
            if (entry.kind === "per-alter") {
              return <PerAlterEntry key={entry.data.id} entry={entry.data} altersById={altersById} />;
            }
            const ci = entry.data;
            const matchedDiaryCard = visibleDiaryCards.find(dc => {
              try {
                return Math.abs(new Date(dc.created_date).getTime() - new Date(ci.timestamp).getTime()) < 5 * 60 * 1000;
              } catch { return false; }
            });
            return (
              <CheckInCard
                key={ci.id}
                checkIn={ci}
                altersById={altersById}
                symptomsById={symptomsById}
                symptomCheckIns={allSymptomCheckIns}
                activities={dayActivities}
                locations={dayLocations}
                diaryCard={matchedDiaryCard || null}
                highlighted={ci.id === highlightId}
                onDelete={onDelete}
                onEdit={onEdit}
                display={display}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CheckInLog() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState("list");
  const [display, setDisplay] = useDisplaySettings();
  const [editingCheckIn, setEditingCheckIn] = useState(null);
  const highlightId = searchParams.get("id");
  const dateParam = searchParams.get("date");

  const toggleDisplay = (key) => (next) => setDisplay((prev) => ({ ...prev, [key]: !!next }));
  const allOn = Object.values(display).every(Boolean);
  const allOff = Object.values(display).every((v) => !v);

  const { data: checkIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list("-timestamp"),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  const { data: symptomCheckIns = [] } = useQuery({
    queryKey: ["symptomCheckIns"],
    queryFn: () => base44.entities.SymptomCheckIn.list("-timestamp", 500),
  });

  const { data: rawActivities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list("-timestamp", 500),
  });
  // Hide STILL-SCHEDULED future plans from the Check-In Log — they're
  // upcoming events, not logged history. Plans that have been resolved
  // (done / partial / skipped / cancelled) belong here because they
  // reflect what actually happened. Plans still flagged as "scheduled"
  // whose time has already passed (unresolved) also show — they're
  // exactly what the log is for.
  const activities = useMemo(() => {
    const now = Date.now();
    return rawActivities.filter(a => {
      const status = statusFor(a);
      if (status !== ACTIVITY_STATUSES.SCHEDULED) return true;
      try { return new Date(a.timestamp).getTime() <= now; }
      catch { return true; }
    });
  }, [rawActivities]);

  const { data: diaryCards = [] } = useQuery({
    queryKey: ["diaryCards"],
    queryFn: () => base44.entities.DiaryCard.list("-created_date", 500),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => localEntities.Location.list(),
  });

  const { data: statusNotes = [] } = useQuery({
    queryKey: ["statusNotes"],
    queryFn: () => localEntities.StatusNote.list(),
  });

  const { data: frontingSessions = [] } = useQuery({
    queryKey: ["frontingSessions"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 500),
  });

  const altersById = useMemo(() => Object.fromEntries(alters.map(a => [a.id, a])), [alters]);
  const symptomsById = useMemo(() => Object.fromEntries(symptoms.map(s => [s.id, s])), [symptoms]);
  const perAlterEntries = useMemo(() => extractPerAlterEntries(frontingSessions), [frontingSessions]);

  const diaryCardsByDate = useMemo(() => {
    const grouped = {};
    diaryCards.forEach(dc => {
      const d = dc.date || (dc.created_date ? format(new Date(dc.created_date), "yyyy-MM-dd") : null);
      if (!d) return;
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(dc);
    });
    return grouped;
  }, [diaryCards]);

  const byDate = useMemo(() => {
    const checkInsByDate = {};
    checkIns.forEach(ci => {
      const d = format(startOfDay(parseISO(ci.timestamp)), "yyyy-MM-dd");
      if (!checkInsByDate[d]) checkInsByDate[d] = [];
      checkInsByDate[d].push(ci);
    });

    // Collect dates from all standalone data so days with no formal check-in still appear
    const allDates = new Set(Object.keys(checkInsByDate));
    const addDate = (ts) => { try { allDates.add(format(new Date(ts), "yyyy-MM-dd")); } catch {} };
    symptomCheckIns.filter(sc => !sc.check_in_id).forEach(sc => addDate(sc.timestamp));
    activities.forEach(act => addDate(act.timestamp));
    locations.forEach(loc => addDate(loc.timestamp));
    statusNotes.forEach(sn => addDate(sn.timestamp));
    perAlterEntries.forEach(e => addDate(e.ts));

    const result = [...allDates].map(date => {
      const cis = checkInsByDate[date] || [];
      cis.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      return [date, cis];
    });
    return result.sort(([a], [b]) => b.localeCompare(a));
  }, [checkIns, symptomCheckIns, activities, locations, statusNotes, perAlterEntries]);

  const highlightDate = useMemo(() => {
    if (dateParam) return dateParam;
    if (!highlightId) return null;
    const ci = checkIns.find(c => c.id === highlightId);
    if (!ci) return null;
    return format(startOfDay(parseISO(ci.timestamp)), "yyyy-MM-dd");
  }, [highlightId, dateParam, checkIns]);

  const handleDelete = async (checkInId) => {
    if (!(await confirm("Delete this check-in?"))) return;
    // Cascade: also remove any SymptomCheckIns logged alongside this
    // check-in so the symptom doesn't outlive the parent on the
    // timeline. (Bug report: deleting a check-in left "emotional
    // hangover" / "rapid switching" symptoms stuck on the timeline.)
    try {
      const linkedSymptoms = await base44.entities.SymptomCheckIn.filter({ check_in_id: checkInId });
      for (const row of linkedSymptoms || []) {
        await base44.entities.SymptomCheckIn.delete(row.id);
      }
    } catch { /* non-fatal */ }
    await base44.entities.EmotionCheckIn.delete(checkInId);
    toast.success("🗑 Check-in deleted");
    queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
    queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
    queryClient.invalidateQueries({ queryKey: ["currentSymptoms"] });
  };

  const handleEdit = (ci) => setEditingCheckIn(ci);

  if (view === "analytics") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setView("list")} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="font-display text-2xl font-semibold">Log Analytics</h1>
            <p className="text-muted-foreground text-xs">Track patterns over time</p>
          </div>
        </div>
        <DiaryAnalyticsSummary
          cards={diaryCards}
          checkIns={checkIns}
          statusNotes={statusNotes}
          frontingSessions={frontingSessions}
          activities={activities}
        />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl font-semibold">Check-In Log</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {checkIns.length} check-in{checkIns.length !== 1 ? "s" : ""}
            {!allOn && <span className="ml-1.5">· filtered view</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-tour="checkin-log-display" className="gap-1.5">
                <SlidersHorizontal className="w-4 h-4" /> Display
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Show in log</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={display.checkIns} onCheckedChange={toggleDisplay("checkIns")}>
                Check-ins
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={display.statusNotes} onCheckedChange={toggleDisplay("statusNotes")}>
                Status notes
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={display.symptoms} onCheckedChange={toggleDisplay("symptoms")}>
                Symptoms
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={display.activities} onCheckedChange={toggleDisplay("activities")}>
                Activities
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={display.locations} onCheckedChange={toggleDisplay("locations")}>
                Locations
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={display.perAlter} onCheckedChange={toggleDisplay("perAlter")}>
                Per-alter entries
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={display.diary} onCheckedChange={toggleDisplay("diary")}>
                Diary data
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <button
                type="button"
                onClick={() => setDisplay(allOff ? DEFAULT_DISPLAY : Object.fromEntries(Object.keys(DEFAULT_DISPLAY).map((k) => [k, false])))}
                className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-sm"
              >
                {allOff ? "Show everything" : "Hide everything"}
              </button>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Analytics now uses every log source (check-ins, symptom
              check-ins, status notes, fronting-session entries, activities,
              diary cards) so we no longer gate the button on diary cards
              specifically. The component itself handles the empty-state
              for accounts with no data anywhere. */}
          <Button variant="outline" onClick={() => setView("analytics")} className="gap-1.5">
            <BarChart2 className="w-4 h-4" /> Analytics
          </Button>
        </div>
      </div>

      {byDate.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="text-4xl mb-3">💭</div>
          <p className="text-sm font-medium text-foreground mb-1">Nothing logged yet</p>
          <p className="text-xs text-muted-foreground">Use Quick Check-In to log emotions, symptoms, activities, and more.</p>
        </div>
      ) : allOff ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="text-4xl mb-3">🙈</div>
          <p className="text-sm font-medium text-foreground mb-1">Everything is hidden</p>
          <p className="text-xs text-muted-foreground">Open the Display menu in the top-right to choose which entry types appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {byDate.map(([date, entries]) => (
            <DayGroup
              key={date}
              date={date}
              checkIns={entries}
              altersById={altersById}
              symptomsById={symptomsById}
              allSymptomCheckIns={symptomCheckIns}
              allActivities={activities}
              allLocations={locations}
              allStatusNotes={statusNotes}
              perAlterEntries={perAlterEntries}
              diaryCardsByDate={diaryCardsByDate}
              highlightId={highlightId}
              defaultExpanded={date === highlightDate || (!highlightId && !dateParam && date === byDate[0]?.[0])}
              onDelete={handleDelete}
              onEdit={handleEdit}
              display={display}
            />
          ))}
        </div>
      )}

      {/* Reopen-for-edit modal: pre-fills the Quick Check-In form
          with the selected entry. Saving calls UPDATE (no duplicate). */}
      <QuickCheckInModal
        isOpen={!!editingCheckIn}
        onClose={() => setEditingCheckIn(null)}
        alters={alters}
        editingEntry={editingCheckIn}
      />
    </motion.div>
  );
}
