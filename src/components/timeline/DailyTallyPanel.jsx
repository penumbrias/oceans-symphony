import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseDate } from "@/lib/dateUtils";
import { startOfDay, endOfDay, format } from "date-fns";
import { ChevronRight } from "lucide-react";

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

function SectionLabel({ children }) {
  return <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{children}</p>;
}

function NavRow({ label, sublabel, route, navigate }) {
  return (
    <button
      onClick={() => navigate(route)}
      className="w-full flex items-center gap-1 text-left hover:bg-muted/40 px-1.5 py-0.5 rounded transition-colors -mx-1.5"
    >
      <span className="text-xs text-foreground truncate flex-1">{label}</span>
      {sublabel && <span className="text-[10px] text-muted-foreground flex-shrink-0">{sublabel}</span>}
      <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
    </button>
  );
}

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

  // ── Fronting ─────────────────────────────────────────────────────────────
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

  // ── Activities ────────────────────────────────────────────────────────────
  const dayActivities = useMemo(() =>
    activities.filter(a => inDay(parseDate(a.timestamp)))
  , [activities, dayStart, dayEnd]);

  // ── Emotions ──────────────────────────────────────────────────────────────
  const emotionTally = useMemo(() => {
    const tally = {};
    emotions.filter(e => inDay(parseDate(e.timestamp))).forEach(e => {
      (e.emotions || []).forEach(em => { tally[em] = (tally[em] || 0) + 1; });
    });
    return Object.entries(tally).sort((a, b) => b[1] - a[1]);
  }, [emotions, dayStart, dayEnd]);

  const dayEmotions = useMemo(() => emotions.filter(e => inDay(parseDate(e.timestamp))), [emotions, dayStart, dayEnd]);
  const dayCheckIns = useMemo(() => checkIns.filter(c => inDay(parseDate(c.created_date))), [checkIns, dayStart, dayEnd]);

  // ── Journals ──────────────────────────────────────────────────────────────
  const dayJournals = useMemo(() => journals.filter(j => inDay(parseDate(j.created_date))), [journals, dayStart, dayEnd]);

  // ── Bulletins ─────────────────────────────────────────────────────────────
  const dayBulletins = useMemo(() => bulletins.filter(b => inDay(parseDate(b.created_date))), [bulletins, dayStart, dayEnd]);

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const dayTasks = useMemo(() => tasks.filter(t => inDay(parseDate(t.created_date))), [tasks, dayStart, dayEnd]);

  // ── Symptoms ──────────────────────────────────────────────────────────────
  const symptomMap = useMemo(() => Object.fromEntries((symptoms || []).map(s => [s.id, s])), [symptoms]);
  const daySymptomSessions = useMemo(() => {
    const seen = new Set();
    return symptomSessions.filter(ss => {
      const t = parseDate(ss.start_time);
      if (!inDay(t) || seen.has(ss.symptom_id)) return false;
      seen.add(ss.symptom_id);
      return true;
    });
  }, [symptomSessions, dayStart, dayEnd]);

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border/40 text-xs space-y-3">

      {/* ── Row 1: Activities | Switches | Fronting ── */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3">

        {/* Activities */}
        <div>
          <SectionLabel>Activities</SectionLabel>
          {dayActivities.length === 0 ? (
            <p className="text-muted-foreground italic">None</p>
          ) : (
            <div className="space-y-0.5">
              {dayActivities.map(a => {
                const catNames = (a.activity_category_ids || []).map(id => catMap[id]?.name).filter(Boolean).join(", ");
                const name = a.activity_name || catNames || "Activity";
                const sub = a.duration_minutes ? `${a.duration_minutes}m` : "";
                return <NavRow key={a.id} label={name} sublabel={sub} route="/activities" navigate={navigate} />;
              })}
            </div>
          )}
        </div>

        {/* Switches */}
        <div className="text-center flex flex-col items-center pt-0.5">
          <SectionLabel>Switches</SectionLabel>
          <span className="text-3xl font-bold text-primary leading-none">{switchCount}</span>
        </div>

        {/* Fronting */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <SectionLabel>Fronters</SectionLabel>
            <div className="flex gap-0.5 bg-muted/40 rounded-full p-0.5">
              {[{ id: "total", label: "All" }, { id: "primary", label: "⭐" }, { id: "cofronting", label: "co" }].map(opt => (
                <button key={opt.id} onClick={() => setFrontingView(opt.id)}
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium transition-colors ${frontingView === opt.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {fronterTally.length === 0 ? (
            <p className="text-muted-foreground italic">None</p>
          ) : (
            <div className="space-y-0.5">
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
                      <span className="flex-1 truncate">{alter?.name || "Unknown"}</span>
                      <span className="text-muted-foreground tabular-nums">{fmtMins(mins)}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* ── Emotions ── */}
      <div>
        <SectionLabel>Emotions</SectionLabel>
        {emotionTally.length === 0 ? (
          <p className="text-muted-foreground italic">None</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {emotionTally.slice(0, 8).map(([em, count]) => (
              <span key={em} className="px-1.5 py-0.5 rounded text-white font-medium text-xs flex items-center gap-1"
                style={{ backgroundColor: emotionColor(em) }}>
                {em}{count > 1 && <span className="opacity-75">×{count}</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Row 2: Check-ins | Symptoms ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <SectionLabel>Check-ins</SectionLabel>
          {dayEmotions.length === 0 && dayCheckIns.length === 0 ? (
            <p className="text-muted-foreground italic">None</p>
          ) : (
            <div className="space-y-0.5">
              {dayEmotions.length > 0 && (
                <NavRow label={`${dayEmotions.length} quick`} route="/checkin-log" navigate={navigate} />
              )}
              {dayCheckIns.length > 0 && (
                <NavRow label={`${dayCheckIns.length} system`} route="/system-checkin" navigate={navigate} />
              )}
            </div>
          )}
        </div>
        <div>
          <SectionLabel>Symptoms</SectionLabel>
          {daySymptomSessions.length === 0 ? (
            <p className="text-muted-foreground italic">None</p>
          ) : (
            <div className="space-y-0.5">
              {daySymptomSessions.map(ss => {
                const sym = symptomMap[ss.symptom_id];
                const name = sym?.name || sym?.label || "Symptom";
                const sub = ss.end_time ? `ended ${format(parseDate(ss.end_time), "h:mm a")}` : "ongoing";
                return (
                  <p key={ss.id} className="text-xs text-foreground">
                    {name} <span className="text-muted-foreground">· {sub}</span>
                  </p>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Journals ── */}
      {dayJournals.length > 0 && (
        <div>
          <SectionLabel>Journals</SectionLabel>
          <div className="space-y-0.5">
            {dayJournals.map(j => (
              <NavRow
                key={j.id}
                label={j.title || "Journal Entry"}
                sublabel={j.entry_type || ""}
                route={`/journals?id=${j.id}`}
                navigate={navigate}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Tasks | Bulletins ── */}
      {(dayTasks.length > 0 || dayBulletins.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {dayTasks.length > 0 && (
            <div>
              <SectionLabel>Tasks</SectionLabel>
              <NavRow
                label={`${dayTasks.filter(t => t.completed).length}/${dayTasks.length} done`}
                route="/todo"
                navigate={navigate}
              />
            </div>
          )}
          {dayBulletins.length > 0 && (
            <div>
              <SectionLabel>Bulletins</SectionLabel>
              <div className="space-y-0.5">
                {dayBulletins.map(b => (
                  <NavRow key={b.id} label={b.title || "Bulletin"} route={`/bulletin/${b.id}`} navigate={navigate} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
