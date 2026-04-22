import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { format, parseISO, startOfDay } from "date-fns";
import { Clock, ChevronDown, ChevronRight, Heart } from "lucide-react";
import { useSearchParams } from "react-router-dom";

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

function CheckInCard({ checkIn, altersById, highlighted }) {
  const ts = parseISO(checkIn.timestamp);
  const timeStr = format(ts, "h:mm a");
  const emotions = checkIn.emotions || [];
  const note = checkIn.note;
  const fronters = (checkIn.fronting_alter_ids || []).map(id => altersById[id]).filter(Boolean);
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
      className={`px-4 py-3 space-y-2 transition-all duration-500 ${highlighted ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-muted/10"}`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="w-3 h-3 flex-shrink-0" />
        <span>{timeStr}</span>
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

      {note && (
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{note}</p>
      )}
    </div>
  );
}

function DayTotals({ checkIns, altersById }) {
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

  const allNotes = checkIns.filter(ci => ci.note).map(ci => ci.note);

  if (allEmotions.length === 0 && fronters.length === 0 && allNotes.length === 0) return null;

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border/30 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Day Total · {checkIns.length} check-in{checkIns.length !== 1 ? "s" : ""}</p>

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
    </div>
  );
}

function DayGroup({ date, checkIns, altersById, highlightId, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const dateObj = parseISO(date + "T12:00:00");

  // Auto-expand if the highlighted entry is in this group
  useEffect(() => {
    if (highlightId && checkIns.some(ci => ci.id === highlightId)) {
      setExpanded(true);
    }
  }, [highlightId, checkIns]);

  const allEmotions = [...new Set(checkIns.flatMap(ci => ci.emotions || []))];

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
              {allEmotions.length > 0 && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {allEmotions.slice(0, 4).join(", ")}{allEmotions.length > 4 ? ` +${allEmotions.length - 4}` : ""}
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
          {checkIns.map(ci => (
            <CheckInCard
              key={ci.id}
              checkIn={ci}
              altersById={altersById}
              highlighted={ci.id === highlightId}
            />
          ))}
          <DayTotals checkIns={checkIns} altersById={altersById} />
        </div>
      )}
    </div>
  );
}

export default function CheckInLog() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("id");

  const { data: checkIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list("-timestamp"),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const altersById = useMemo(() => Object.fromEntries(alters.map(a => [a.id, a])), [alters]);

  // Group by date (local date from timestamp)
  const byDate = useMemo(() => {
    const grouped = {};
    checkIns.forEach(ci => {
      const dateKey = format(startOfDay(parseISO(ci.timestamp)), "yyyy-MM-dd");
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(ci);
    });
    // Sort entries within each day by timestamp ascending
    Object.values(grouped).forEach(arr => arr.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  }, [checkIns]);

  // Find which date the highlight belongs to
  const highlightDate = useMemo(() => {
    if (!highlightId) return null;
    const ci = checkIns.find(c => c.id === highlightId);
    if (!ci) return null;
    return format(startOfDay(parseISO(ci.timestamp)), "yyyy-MM-dd");
  }, [highlightId, checkIns]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold">Check-In Log</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{checkIns.length} check-in{checkIns.length !== 1 ? "s" : ""}</p>
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
              highlightId={highlightId}
              defaultExpanded={date === highlightDate || (!highlightId && date === byDate[0]?.[0])}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}