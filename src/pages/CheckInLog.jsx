import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44, localEntities } from "@/api/base44Client";
import { motion } from "framer-motion";
import { format, parseISO, startOfDay } from "date-fns";
import { Clock, ChevronDown, ChevronRight, Heart, Trash2, BarChart2, ChevronLeft, MapPin } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import DiaryAnalyticsSummary from "@/components/diary/DiaryAnalyticsSummary";
import { getCategoryMeta } from "@/lib/locationCategories";

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
          <div key={i} className={`w-4 h-4 rounded text-[9px] flex items-center justify-center font-medium ${
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
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Daily Log Data</p>

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

function CheckInCard({ checkIn, altersById, symptomsById, symptomCheckIns, activities, locations, diaryCard, highlighted, onDelete }) {
  const ts = parseISO(checkIn.timestamp);
  const timeStr = format(ts, "h:mm a");
  const emotions = checkIn.emotions || [];
  const note = checkIn.note;
  const fronters = (checkIn.fronting_alter_ids || []).map(id => altersById[id]).filter(Boolean);

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

  return (
    <div
      ref={ref}
      id={`checkin-${checkIn.id}`}
      className={`px-4 py-3 space-y-2.5 transition-all duration-500 ${highlighted ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-muted/10"}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3 flex-shrink-0" />
          <span>{timeStr}</span>
        </div>
        <Button variant="ghost" size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(checkIn.id)}>
          <Trash2 className="w-3 h-3" />
        </Button>
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

      {mySymptomCheckIns.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {mySymptomCheckIns.map((sc, i) => {
            const symptom = symptomsById[sc.symptom_id];
            const color = symptom?.color || "#8b5cf6";
            return (
              <span key={i} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border"
                style={{ backgroundColor: `${color}15`, borderColor: `${color}40`, color }}>
                {symptom?.label || "Symptom"}{sc.severity != null ? ` · ${sc.severity}/5` : ""}
              </span>
            );
          })}
        </div>
      )}

      {myActivities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {myActivities.map((act, i) => (
            <span key={i} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              ⚡ {act.activity_name}{act.duration_minutes ? ` · ${act.duration_minutes}m` : ""}
            </span>
          ))}
        </div>
      )}

      {myLocations.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {myLocations.map((loc, i) => {
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

      {note && (
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{note}</p>
      )}

      {checkIn.journal_entry_id && (
        <p className="text-xs text-primary italic">📓 Extended note saved as journal entry</p>
      )}

      <DiaryDataSection diaryCard={diaryCard} />
    </div>
  );
}

function DayTotals({ checkIns, altersById, symptomCheckIns, symptomsById, activities, locations }) {
  const allEmotions = useMemo(() => {
    const tally = {};
    checkIns.forEach(ci => (ci.emotions || []).forEach(em => { tally[em] = (tally[em] || 0) + 1; }));
    return Object.entries(tally).sort((a, b) => b[1] - a[1]);
  }, [checkIns]);

  const allFronterIds = useMemo(() =>
    [...new Set(checkIns.flatMap(ci => ci.fronting_alter_ids || []))],
    [checkIns]
  );
  const fronters = allFronterIds.map(id => altersById[id]).filter(Boolean);

  // De-duplicate symptoms by symptom_id, keeping highest severity
  const allSymptoms = useMemo(() => {
    const seen = {};
    symptomCheckIns.forEach(sc => {
      const prev = seen[sc.symptom_id];
      if (!prev || (sc.severity ?? -1) > (prev.severity ?? -1)) seen[sc.symptom_id] = sc;
    });
    return Object.values(seen);
  }, [symptomCheckIns]);

  const allActivities = [...new Set(activities.map(a => a.activity_name))];

  const isEmpty = allEmotions.length === 0 && fronters.length === 0 && allSymptoms.length === 0
    && allActivities.length === 0 && locations.length === 0;
  if (isEmpty) return null;

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border/30 space-y-2.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Day Total · {checkIns.length} check-in{checkIns.length !== 1 ? "s" : ""}
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
            const color = symptom?.color || "#8b5cf6";
            return (
              <span key={i} className="text-xs px-1.5 py-0.5 rounded-full border"
                style={{ backgroundColor: `${color}15`, borderColor: `${color}40`, color }}>
                {symptom?.label || "?"}{sc.severity != null ? ` · ${sc.severity}/5` : ""}
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

      {locations.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {locations.map((loc, i) => {
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

    </div>
  );
}

function StandaloneEntry({ timestamp, children }) {
  const timeStr = format(new Date(timestamp), "h:mm a");
  return (
    <div className="px-4 py-2.5 hover:bg-muted/10">
      <div className="flex items-center gap-2 mb-1.5 text-xs text-muted-foreground">
        <Clock className="w-3 h-3 flex-shrink-0" />
        <span>{timeStr}</span>
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function SymptomUpdateEntry({ sc, symptomsById }) {
  const symptom = symptomsById[sc.symptom_id];
  const color = symptom?.color || "#8b5cf6";
  return (
    <StandaloneEntry timestamp={sc.timestamp}>
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border"
        style={{ backgroundColor: `${color}15`, borderColor: `${color}40`, color }}>
        {symptom?.label || "Symptom"}{sc.severity != null ? ` · ${sc.severity}/5` : ""}
      </span>
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
  const meta = getCategoryMeta(loc.category);
  return (
    <StandaloneEntry timestamp={loc.timestamp}>
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
        <MapPin className="w-3 h-3 flex-shrink-0" />
        {loc.name || meta?.label || "Location"}
      </span>
    </StandaloneEntry>
  );
}

function StatusNoteEntry({ sn }) {
  return (
    <StandaloneEntry timestamp={sn.timestamp}>
      <span className="text-sm text-foreground/80 italic">💬 {sn.note}</span>
    </StandaloneEntry>
  );
}

function DayGroup({ date, checkIns, altersById, symptomsById, allSymptomCheckIns, allActivities, allLocations, allStatusNotes, diaryCardsByDate, highlightId, defaultExpanded, onDelete }) {
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

  // Activities/locations within ±2min of a check-in are shown inside that CheckInCard.
  // Anything outside that window appears as its own standalone entry.
  const checkInTimes = checkIns.map(ci => new Date(ci.timestamp).getTime());
  const TWO_MIN = 2 * 60 * 1000;
  const nearCheckIn = (ts) => checkInTimes.length > 0 && checkInTimes.some(t => Math.abs(ts - t) < TWO_MIN);
  const standaloneActivities = dayActivities.filter(act => !nearCheckIn(new Date(act.timestamp).getTime()));
  const standaloneLocations = dayLocations.filter(loc => !nearCheckIn(new Date(loc.timestamp).getTime()));

  const dayDiaryCards = diaryCardsByDate[date] || [];

  const summaryParts = [];
  if (allEmotions.length > 0) summaryParts.push(allEmotions.slice(0, 3).join(", ") + (allEmotions.length > 3 ? ` +${allEmotions.length - 3}` : ""));
  if (daySymptomCheckIns.length > 0) summaryParts.push(`${daySymptomCheckIns.length} symptom${daySymptomCheckIns.length !== 1 ? "s" : ""}`);
  if (dayActivities.length > 0) summaryParts.push(`${dayActivities.length} activit${dayActivities.length !== 1 ? "ies" : "y"}`);
  if (dayLocations.length > 0) summaryParts.push(`${dayLocations.length} location${dayLocations.length !== 1 ? "s" : ""}`);
  if (dayDiaryCards.length > 0) summaryParts.push("diary logged");

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
            <span className="text-xs text-muted-foreground">{checkIns.length} check-in{checkIns.length !== 1 ? "s" : ""}</span>
            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/30 divide-y divide-border/20">
          {[
            ...checkIns.map(ci => ({ kind: "checkin", data: ci, ts: new Date(ci.timestamp).getTime() })),
            ...standaloneSymptomCheckIns.map(sc => ({ kind: "symptom", data: sc, ts: new Date(sc.timestamp).getTime() })),
            ...standaloneActivities.map(act => ({ kind: "activity", data: act, ts: new Date(act.timestamp).getTime() })),
            ...standaloneLocations.map(loc => ({ kind: "location", data: loc, ts: new Date(loc.timestamp).getTime() })),
            ...dayStatusNotes.map(sn => ({ kind: "status", data: sn, ts: new Date(sn.timestamp).getTime() })),
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
            const ci = entry.data;
            const matchedDiaryCard = dayDiaryCards.find(dc => {
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
              />
            );
          })}
          <DayTotals
            checkIns={checkIns}
            altersById={altersById}
            symptomCheckIns={daySymptomCheckIns}
            symptomsById={symptomsById}
            activities={dayActivities}
            locations={dayLocations}
          />
        </div>
      )}
    </div>
  );
}

export default function CheckInLog() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState("list");
  const highlightId = searchParams.get("id");
  const dateParam = searchParams.get("date");

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

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list("-timestamp", 500),
  });

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

  const altersById = useMemo(() => Object.fromEntries(alters.map(a => [a.id, a])), [alters]);
  const symptomsById = useMemo(() => Object.fromEntries(symptoms.map(s => [s.id, s])), [symptoms]);

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

    const result = [...allDates].map(date => {
      const cis = checkInsByDate[date] || [];
      cis.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      return [date, cis];
    });
    return result.sort(([a], [b]) => b.localeCompare(a));
  }, [checkIns, symptomCheckIns, activities, locations, statusNotes]);

  const highlightDate = useMemo(() => {
    if (dateParam) return dateParam;
    if (!highlightId) return null;
    const ci = checkIns.find(c => c.id === highlightId);
    if (!ci) return null;
    return format(startOfDay(parseISO(ci.timestamp)), "yyyy-MM-dd");
  }, [highlightId, dateParam, checkIns]);

  const handleDelete = async (checkInId) => {
    if (!confirm("Delete this check-in?")) return;
    await base44.entities.EmotionCheckIn.delete(checkInId);
    toast.success("🗑 Check-in deleted");
    queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
  };

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
        <DiaryAnalyticsSummary cards={diaryCards} />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Check-In Log</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{checkIns.length} check-in{checkIns.length !== 1 ? "s" : ""}</p>
        </div>
        {diaryCards.length > 0 && (
          <Button variant="outline" onClick={() => setView("analytics")} className="gap-1.5">
            <BarChart2 className="w-4 h-4" /> Analytics
          </Button>
        )}
      </div>

      {byDate.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="text-4xl mb-3">💭</div>
          <p className="text-sm font-medium text-foreground mb-1">Nothing logged yet</p>
          <p className="text-xs text-muted-foreground">Use Quick Check-In to log emotions, symptoms, activities, and more.</p>
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
              diaryCardsByDate={diaryCardsByDate}
              highlightId={highlightId}
              defaultExpanded={date === highlightDate || (!highlightId && !dateParam && date === byDate[0]?.[0])}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
