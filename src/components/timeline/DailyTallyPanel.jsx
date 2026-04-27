import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseDate } from "@/lib/dateUtils";
import { startOfDay, endOfDay, format } from "date-fns";
import { ChevronRight, BookOpen, Heart, Activity, MessageSquare, CheckSquare, Zap, Users } from "lucide-react";

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
function fmtMins(mins) {
  if (mins >= 60) return `${Math.round(mins / 60)}h`;
  return `${mins}m`;
}
function fmtTime(date) {
  return format(date, "h:mm a");
}

const TYPE_META = {
  journal:        { icon: BookOpen,      color: "#8b5cf6", label: "Journal" },
  checkin:        { icon: Heart,         color: "#f43f5e", label: "Check-In" },
  system_checkin: { icon: Users,         color: "#3b82f6", label: "System Check-In" },
  activity:       { icon: Activity,      color: "#22c55e", label: "Activity" },
  bulletin:       { icon: MessageSquare, color: "#f59e0b", label: "Bulletin" },
  task:           { icon: CheckSquare,   color: "#14b8a6", label: "Task" },
  symptom:        { icon: Zap,           color: "#ec4899", label: "Symptom" },
};

export default function DailyTallyPanel({
  day, sessions, activities, emotions, journals, alters,
  checkIns = [], tasks = [], symptoms = [], symptomSessions = [],
  bulletins = [], categories = [],
}) {
  const navigate = useNavigate();
  const dayStart = useMemo(() => startOfDay(day), [day]);
  const dayEnd = useMemo(() => endOfDay(day), [day]);
  const inDay = (d) => d >= dayStart && d <= dayEnd;

  const [frontingView, setFrontingView] = useState("total");

  const catMap = useMemo(() => Object.fromEntries((categories || []).map(c => [c.id, c])), [categories]);

  // ── Summary data ──────────────────────────────────────────────────────────
  const switchCount = useMemo(() => sessions.filter(s => inDay(parseDate(s.start_time))).length, [sessions, dayStart, dayEnd]);

  const fronterTally = useMemo(() => {
    const tally = {};
    sessions.forEach((s) => {
      const start = parseDate(s.start_time);
      const end = s.end_time ? parseDate(s.end_time) : new Date();
      const clampStart = Math.max(start, dayStart);
      const clampEnd = Math.min(end, dayEnd);
      if (clampStart >= clampEnd) return;
      const mins = Math.round((clampEnd - clampStart) / 60000);
      if (s.alter_id) {
        if (!tally[s.alter_id]) tally[s.alter_id] = { total: 0, primary: 0, cofronting: 0 };
        tally[s.alter_id].total += mins;
        if (s.is_primary) tally[s.alter_id].primary += mins;
        else tally[s.alter_id].cofronting += mins;
      } else {
        const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
        ids.forEach((id) => {
          if (!tally[id]) tally[id] = { total: 0, primary: 0, cofronting: 0 };
          tally[id].total += mins;
          if (s.primary_alter_id === id) tally[id].primary += mins;
          else tally[id].cofronting += mins;
        });
      }
    });
    return Object.entries(tally)
      .map(([alterId, times]) => ({ alterId, ...times, alter: (alters || []).find(a => a.id === alterId) }))
      .sort((a, b) => b.total - a.total);
  }, [sessions, dayStart, dayEnd, alters]);

  const emotionTally = useMemo(() => {
    const tally = {};
    emotions.filter(e => inDay(parseDate(e.timestamp))).forEach(e => {
      (e.emotions || []).forEach(em => { tally[em] = (tally[em] || 0) + 1; });
    });
    return Object.entries(tally).sort((a, b) => b[1] - a[1]);
  }, [emotions, dayStart, dayEnd]);

  // ── Chronological entry log ───────────────────────────────────────────────
  const dayEntries = useMemo(() => {
    const entries = [];

    journals.forEach(j => {
      const t = parseDate(j.created_date);
      if (!inDay(t)) return;
      entries.push({
        time: t, type: "journal", id: j.id,
        title: j.title || "Journal Entry",
        subtitle: j.entry_type ? `${j.entry_type} · ${j.folder || ""}`.replace(/ · $/, "") : "",
        route: `/journals?id=${j.id}`,
      });
    });

    emotions.forEach(e => {
      const t = parseDate(e.timestamp);
      if (!inDay(t)) return;
      const emotionList = (e.emotions || []).slice(0, 4).join(", ");
      entries.push({
        time: t, type: "checkin", id: e.id,
        title: "Quick Check-In",
        subtitle: emotionList || (e.note ? e.note.slice(0, 60) : "No emotions logged"),
        route: `/checkin-log?id=${e.id}`,
      });
    });

    checkIns.forEach(c => {
      const t = parseDate(c.created_date);
      if (!inDay(t)) return;
      entries.push({
        time: t, type: "system_checkin", id: c.id,
        title: "System Check-In",
        subtitle: c.title || "",
        route: `/system-checkin`,
      });
    });

    activities.forEach(a => {
      const t = parseDate(a.timestamp);
      if (!inDay(t)) return;
      const catNames = (a.activity_category_ids || []).map(id => catMap[id]?.name).filter(Boolean).join(", ");
      entries.push({
        time: t, type: "activity", id: a.id,
        title: a.activity_name || catNames || "Activity",
        subtitle: [
          a.duration_minutes ? `${a.duration_minutes} min` : "",
          a.notes?.slice(0, 50),
        ].filter(Boolean).join(" · ") || "",
        route: `/activities`,
      });
    });

    bulletins.forEach(b => {
      const t = parseDate(b.created_date);
      if (!inDay(t)) return;
      entries.push({
        time: t, type: "bulletin", id: b.id,
        title: b.title || "Bulletin",
        subtitle: b.content?.slice(0, 70) || "",
        route: `/bulletin/${b.id}`,
      });
    });

    tasks.filter(t => inDay(parseDate(t.created_date))).forEach(t => {
      entries.push({
        time: parseDate(t.created_date), type: "task", id: t.id,
        title: t.title || "Task",
        subtitle: t.completed ? "✓ Completed" : "In progress",
        route: `/todo`,
      });
    });

    // Unique symptom sessions starting this day
    const seenSymptoms = new Set();
    const symptomMap = Object.fromEntries((symptoms || []).map(s => [s.id, s]));
    symptomSessions.forEach(ss => {
      const t = parseDate(ss.start_time);
      if (!inDay(t) || seenSymptoms.has(ss.symptom_id)) return;
      seenSymptoms.add(ss.symptom_id);
      const sym = symptomMap[ss.symptom_id];
      entries.push({
        time: t, type: "symptom", id: ss.id,
        title: sym?.name || sym?.label || "Symptom",
        subtitle: ss.end_time ? `Ended ${fmtTime(parseDate(ss.end_time))}` : "Ongoing",
        route: null,
      });
    });

    return entries.sort((a, b) => a.time - b.time);
  }, [journals, emotions, checkIns, activities, bulletins, tasks, symptomSessions, symptoms, catMap, dayStart, dayEnd]);

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border/40 space-y-4 text-xs">

      {/* ── Fronting summary ── */}
      {fronterTally.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-muted-foreground font-medium">Fronting</p>
            <span className="text-muted-foreground">·</span>
            <span className="font-semibold text-primary">{switchCount} switch{switchCount !== 1 ? "es" : ""}</span>
            <div className="flex gap-0.5 bg-muted/40 rounded-full p-0.5 ml-auto">
              {[{ id: "total", label: "All" }, { id: "primary", label: "⭐" }, { id: "cofronting", label: "co" }].map(opt => (
                <button key={opt.id} onClick={() => setFrontingView(opt.id)}
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium transition-colors ${frontingView === opt.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {fronterTally
              .filter(({ primary, cofronting }) => {
                if (frontingView === "primary") return primary > 0;
                if (frontingView === "cofronting") return cofronting > 0;
                return true;
              })
              .map(({ alter, alterId, total, primary, cofronting }) => {
                const mins = frontingView === "primary" ? primary : frontingView === "cofronting" ? cofronting : total;
                return (
                  <div key={alterId} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: alter?.color || "#9333ea" }} />
                    <span className="text-xs">{alter?.name || "Unknown"}</span>
                    <span className="text-muted-foreground text-xs">{fmtMins(mins)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Emotion chips ── */}
      {emotionTally.length > 0 && (
        <div>
          <p className="text-muted-foreground font-medium mb-1.5">Emotions</p>
          <div className="flex flex-wrap gap-1">
            {emotionTally.slice(0, 6).map(([em, count]) => (
              <span key={em} className="px-1.5 py-0.5 rounded text-white font-medium text-xs flex items-center gap-1"
                style={{ backgroundColor: emotionColor(em) }}>
                {em}{count > 1 && <span className="opacity-75">×{count}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Day log ── */}
      <div>
        <p className="text-muted-foreground font-medium mb-1.5">Day Log <span className="font-normal text-muted-foreground/60">({dayEntries.length})</span></p>
        {dayEntries.length === 0 ? (
          <p className="text-muted-foreground italic">No entries recorded</p>
        ) : (
          <div className="space-y-0.5">
            {dayEntries.map((entry) => {
              const meta = TYPE_META[entry.type];
              const Icon = meta?.icon;
              const isClickable = !!entry.route;
              const Row = isClickable ? "button" : "div";
              return (
                <Row
                  key={`${entry.type}-${entry.id}`}
                  onClick={isClickable ? () => navigate(entry.route) : undefined}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                    isClickable ? "hover:bg-muted/50 cursor-pointer active:bg-muted/70" : ""
                  }`}
                >
                  <span className="text-[10px] text-muted-foreground/60 w-14 flex-shrink-0 tabular-nums">
                    {fmtTime(entry.time)}
                  </span>
                  {Icon && (
                    <span className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${meta.color}25` }}>
                      <Icon className="w-3 h-3" style={{ color: meta.color }} />
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground truncate block leading-tight">{entry.title}</span>
                    {entry.subtitle && (
                      <span className="text-muted-foreground text-[10px] truncate block leading-tight">{entry.subtitle}</span>
                    )}
                  </div>
                  {isClickable && <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />}
                </Row>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
