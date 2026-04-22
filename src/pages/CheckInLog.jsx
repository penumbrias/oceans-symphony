import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { format, parseISO, startOfDay } from "date-fns";
import { Clock, ChevronDown, ChevronRight, Heart, Trash2, BarChart2, ChevronLeft } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import DiaryAnalyticsSummary from "@/components/diary/DiaryAnalyticsSummary";

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
  const cl = diaryCard.checklist || {};
  const symptoms = cl.symptoms || {};
  const habits = cl.habits || {};

  const hasUrges = Object.values(urges).some(v => v !== undefined && v !== null);
  const hasBodyMind = Object.values(bm).some(v => v !== undefined && v !== null);
  const hasSkills = diaryCard.skills_practiced !== undefined && diaryCard.skills_practiced !== null;
  const hasMed = Object.values(med).some(v => v !== undefined && v !== null);
  const hasNotes = !!(notes.what || notes.judgments || notes.optional);
  const hasSymptoms = Object.keys(symptoms).length > 0 || Object.keys(habits).length > 0;

  if (!hasUrges && !hasBodyMind && !hasSkills && !hasMed && !hasNotes && !hasSymptoms) return null;

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

      {hasSymptoms && (
        <div className="space-y-1.5 p-2.5 rounded-lg bg-muted/30 border border-border/30">
          <p className="text-xs font-medium text-muted-foreground">🩺 Symptoms & Habits</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(symptoms).map(([key, val]) => (
              <span key={key} className="px-2 py-0.5 rounded-full text-xs bg-destructive/10 text-destructive border border-destructive/20">
                {key.replace(/_/g, " ")}{val !== true && val !== undefined ? ` · ${val}` : ""}
              </span>
            ))}
            {Object.entries(habits).map(([key, val]) => (
              <span key={key} className="px-2 py-0.5 rounded-full text-xs bg-green-500/10 text-green-600 border border-green-500/20">
                {key.replace(/_/g, " ")}{val !== true && val !== undefined ? ` · ${val}` : ""}
              </span>
            ))}
          </div>
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

function CheckInCard({ checkIn, altersById, symptomsById, symptomCheckIns, activities, diaryCard, highlighted, onDelete }) {
  const ts = parseISO(checkIn.timestamp);
  const timeStr = format(ts, "h:mm a");
  const emotions = checkIn.emotions || [];
  const note = checkIn.note;
  const fronters = (checkIn.fronting_alter_ids || []).map(id => altersById[id]).filter(Boolean);

  const mySymptomCheckIns = symptomCheckIns.filter(sc => sc.check_in_id === checkIn.id);
  const myActivities = activities.filter(act => {
    const actTime = new Date(act.timestamp).getTime();
    const ciTime = ts.getTime();
    return Math.abs(actTime - ciTime) < 2 * 60 * 1000;
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
            return (
              <span key={i} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border"
                style={{ backgroundColor: `${symptom?.color || "#8b5cf6"}15`, borderColor: `${symptom?.color || "#8b5cf6"}40`, color: symptom?.color || "#8b5cf6" }}>
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

function DayTotals({ checkIns, altersById, symptomCheckIns, symptomsById, activities }) {
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

  const allSymptoms = useMemo(() => {
    const seen = {};
    symptomCheckIns.forEach(sc => {
      if (!seen[sc.symptom_id] || (sc.severity > seen[sc.symptom_id].severity)) {
        seen[sc.symptom_id] = sc;
      }
    });
    return Object.values(seen);
  }, [symptomCheckIns]);

  const allActivities = [...new Set(activities.map(a => a.activity_name))];

  const isEmpty = allEmotions.length === 0 && fronters.length === 0 && allSymptoms.length === 0 && allActivities.length === 0;
  if (isEmpty) return null;

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border/30 space-y-2">
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
            return (
              <span key={i} className="text-xs px-1.5 py-0.5 rounded-full border"
                style={{ backgroundColor: `${symptom?.color || "#8b5cf6"}15`, borderColor: `${symptom?.color || "#8b5cf6"}40`, color: symptom?.color || "#8b5cf6" }}>
                {symptom?.label || "?"}
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
    </div>
  );
}

function DayGroup({ date, checkIns, altersById, symptomsById, allSymptomCheckIns, allActivities, diaryCardsByDate, highlightId, defaultExpanded, onDelete }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const dateObj = parseISO(date + "T12:00:00");

  useEffect(() => {
    if (highlightId && checkIns.some(ci => ci.id === highlightId)) {
      setExpanded(true);
    }
  }, [highlightId, checkIns]);

  const allEmotions = [...new Set(checkIns.flatMap(ci => ci.emotions || []))];

  const checkInIds = new Set(checkIns.map(ci => ci.id));
  const daySymptomCheckIns = allSymptomCheckIns.filter(sc => checkInIds.has(sc.check_in_id));

  const dayActivities = allActivities.filter(act => {
    try {
      return format(new Date(act.timestamp), "yyyy-MM-dd") === date;
    } catch { return false; }
  });

  const dayDiaryCards = diaryCardsByDate[date] || [];

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
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                {allEmotions.length > 0 && (
                  <p className="text-xs text-muted-foreground truncate">
                    {allEmotions.slice(0, 4).join(", ")}{allEmotions.length > 4 ? ` +${allEmotions.length - 4}` : ""}
                  </p>
                )}
                {daySymptomCheckIns.length > 0 && (
                  <p className="text-xs text-muted-foreground">· {daySymptomCheckIns.length} symptom{daySymptomCheckIns.length !== 1 ? "s" : ""}</p>
                )}
                {dayDiaryCards.length > 0 && (
                  <p className="text-xs text-muted-foreground">· diary logged</p>
                )}
              </div>
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
          {checkIns.map((ci) => {
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

  const altersById = useMemo(() => Object.fromEntries(alters.map(a => [a.id, a])), [alters]);
  const symptomsById = useMemo(() => Object.fromEntries(symptoms.map(s => [s.id, s])), [symptoms]);

  const diaryCardsByDate = useMemo(() => {
    const grouped = {};
    diaryCards.forEach(dc => {
      if (!grouped[dc.date]) grouped[dc.date] = [];
      grouped[dc.date].push(dc);
    });
    return grouped;
  }, [diaryCards]);

  const byDate = useMemo(() => {
    const grouped = {};
    checkIns.forEach(ci => {
      const dateKey = format(startOfDay(parseISO(ci.timestamp)), "yyyy-MM-dd");
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(ci);
    });
    Object.values(grouped).forEach(arr => arr.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  }, [checkIns]);

  const highlightDate = useMemo(() => {
    if (!highlightId) return null;
    const ci = checkIns.find(c => c.id === highlightId);
    if (!ci) return null;
    return format(startOfDay(parseISO(ci.timestamp)), "yyyy-MM-dd");
  }, [highlightId, checkIns]);

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

      {checkIns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="text-4xl mb-3">💭</div>
          <p className="text-sm font-medium text-foreground mb-1">No check-ins yet</p>
          <p className="text-xs text-muted-foreground">Use Quick Check-In to log your emotions and notes.</p>
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
              diaryCardsByDate={diaryCardsByDate}
              highlightId={highlightId}
              defaultExpanded={date === highlightDate || (!highlightId && date === byDate[0]?.[0])}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}