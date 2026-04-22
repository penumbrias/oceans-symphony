import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseDate } from "@/lib/dateUtils";
import { startOfDay, endOfDay, format } from "date-fns";

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

export default function DailyTallyPanel({
  day, sessions, activities, emotions, journals, alters,
  checkIns = [], tasks = [], symptoms = [], symptomSessions = [],
}) {
  const navigate = useNavigate();
  const dayStart = useMemo(() => startOfDay(day), [day]);
  const dayEnd = useMemo(() => endOfDay(day), [day]);

  const [showAllActivities, setShowAllActivities] = useState(false);
  const [showAllStatuses, setShowAllStatuses] = useState(false);

  // Emotion tally
  const emotionTally = useMemo(() => {
    const tally = {};
    emotions.forEach((e) => {
      const t = parseDate(e.timestamp);
      if (t >= dayStart && t <= dayEnd) {
        (e.emotions || []).forEach((em) => { tally[em] = (tally[em] || 0) + 1; });
      }
    });
    return Object.entries(tally).sort((a, b) => b[1] - a[1]);
  }, [emotions, dayStart, dayEnd]);

  // Fronter tally
  const fronterTally = useMemo(() => {
    const tally = {};
    sessions.forEach((s) => {
      const start = parseDate(s.start_time);
      const end = s.end_time ? parseDate(s.end_time) : new Date();
      const sessionStart = Math.max(start, dayStart);
      const sessionEnd = Math.min(end, dayEnd);
      if (sessionStart < sessionEnd) {
        const mins = Math.round((sessionEnd - sessionStart) / 60000);
        if (s.alter_id) {
          if (!tally[s.alter_id]) tally[s.alter_id] = 0;
          tally[s.alter_id] += mins;
        } else {
          const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
          ids.forEach((id) => { if (!tally[id]) tally[id] = 0; tally[id] += mins; });
        }
      }
    });
    return Object.entries(tally)
      .map(([alterId, mins]) => ({ alterId, mins, alter: (alters || []).find((a) => a.id === alterId) }))
      .sort((a, b) => b.mins - a.mins);
  }, [sessions, dayStart, dayEnd, alters]);

  const switchCount = useMemo(() => {
    return sessions.filter((s) => {
      const start = parseDate(s.start_time);
      return start >= dayStart && start <= dayEnd;
    }).length;
  }, [sessions, dayStart, dayEnd]);

  const journalCount = useMemo(() => {
    return journals.filter((j) => {
      const t = parseDate(j.created_date);
      return t >= dayStart && t <= dayEnd;
    }).length;
  }, [journals, dayStart, dayEnd]);

  const systemCheckInCount = useMemo(() => {
    return checkIns.filter((c) => {
      const t = parseDate(c.created_date);
      return t >= dayStart && t <= dayEnd;
    }).length;
  }, [checkIns, dayStart, dayEnd]);

  const quickCheckInCount = useMemo(() => {
    return emotions.filter((e) => {
      const t = parseDate(e.timestamp);
      return t >= dayStart && t <= dayEnd;
    }).length;
  }, [emotions, dayStart, dayEnd]);

  const checkInCount = systemCheckInCount + quickCheckInCount;

  const taskStats = useMemo(() => {
    const dayTasks = tasks.filter((t) => {
      const created = parseDate(t.created_date);
      const completed = t.completed && t.completed_date ? parseDate(t.completed_date) : null;
      return (created >= dayStart && created <= dayEnd) || (completed && completed >= dayStart && completed <= dayEnd);
    });
    const completedCount = dayTasks.filter((t) => t.completed && parseDate(t.completed_date) >= dayStart && parseDate(t.completed_date) <= dayEnd).length;
    const createdCount = dayTasks.filter((t) => parseDate(t.created_date) >= dayStart && parseDate(t.created_date) <= dayEnd).length;
    return { created: createdCount, completed: completedCount };
  }, [tasks, dayStart, dayEnd]);

  // Unique activities
  const uniqueActivities = useMemo(() => {
    const dayActs = activities.filter((a) => {
      const t = parseDate(a.timestamp);
      return t >= dayStart && t <= dayEnd;
    });
    return [...new Set(dayActs.map((a) => a.activity_name))];
  }, [activities, dayStart, dayEnd]);

  // Custom status notes from emotions
  const customStatuses = useMemo(() => {
    const statuses = [];
    emotions.forEach((e) => {
      const t = parseDate(e.timestamp);
      if (t < dayStart || t > dayEnd) return;
      if (!e.note || !e.note.trim()) return;
      try {
        const parsed = JSON.parse(e.note);
        if (Array.isArray(parsed)) {
          parsed.forEach(n => { if (n.text?.trim()) statuses.push(n.text.trim()); });
        } else {
          statuses.push(e.note.trim());
        }
      } catch {
        statuses.push(e.note.trim());
      }
    });
    return statuses;
  }, [emotions, dayStart, dayEnd]);

  // Active symptom sessions this day
  const activeSymptoms = useMemo(() => {
    const symptomMap = {};
    symptoms.forEach(s => { symptomMap[s.id] = s; });
    const seen = new Set();
    const result = [];
    symptomSessions.forEach(ss => {
      const start = parseDate(ss.start_time);
      const end = ss.end_time ? parseDate(ss.end_time) : new Date();
      const sessionStart = Math.max(start, dayStart);
      const sessionEnd = Math.min(end, dayEnd);
      if (sessionStart < sessionEnd && !seen.has(ss.symptom_id)) {
        seen.add(ss.symptom_id);
        const symptom = symptomMap[ss.symptom_id];
        if (symptom) result.push(symptom);
      }
    });
    return result;
  }, [symptomSessions, symptoms, dayStart, dayEnd]);

  const ACTIVITY_INITIAL = 4;
  const STATUS_INITIAL = 3;

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border/40 space-y-3 text-xs">

      {/* Row 1: Activities + Switches/Fronters */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-muted-foreground font-medium mb-1">Activities</p>
          <div className="flex flex-wrap gap-1">
            {uniqueActivities.length > 0 ? (
              <>
                {(showAllActivities ? uniqueActivities : uniqueActivities.slice(0, ACTIVITY_INITIAL)).map((name) => (
                  <div key={name} className="px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium text-xs">
                    {name}
                  </div>
                ))}
                {uniqueActivities.length > ACTIVITY_INITIAL && (
                  <button
                    onClick={() => setShowAllActivities(v => !v)}
                    className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-xs hover:bg-muted/80 transition-colors">
                    {showAllActivities ? "Less" : `+${uniqueActivities.length - ACTIVITY_INITIAL} more`}
                  </button>
                )}
              </>
            ) : (
              <span className="text-muted-foreground italic">None</span>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col items-center justify-start">
            <p className="text-muted-foreground font-medium text-xs mb-1">Switches</p>
            <p className="text-2xl font-bold text-primary">{switchCount}</p>
          </div>
          <div className="flex-1">
            <p className="text-muted-foreground font-medium mb-1">Fronters</p>
            <div className="space-y-0.5">
              {fronterTally.length > 0 ? (
                fronterTally.map(({ alter, mins }) => (
                  <div key={alter?.id || mins} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: alter?.color || "#9333ea" }} />
                    <span className="truncate text-xs">{alter?.name || "Unknown"}</span>
                    <span className="text-muted-foreground text-xs">{Math.round(mins / 60)}h</span>
                  </div>
                ))
              ) : (
                <span className="text-muted-foreground italic">None</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Emotions + Check-ins */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-muted-foreground font-medium mb-1">Emotions</p>
          <div className="flex flex-wrap gap-1">
            {emotionTally.length > 0 ? (
              emotionTally.slice(0, 5).map(([em, count]) => (
                <div key={em} className="px-1.5 py-0.5 rounded text-white font-medium text-xs flex items-center gap-1"
                  style={{ backgroundColor: emotionColor(em) }}>
                  {em} <span className="opacity-80">×{count}</span>
                </div>
              ))
            ) : (
              <span className="text-muted-foreground italic">None</span>
            )}
          </div>
        </div>

        <div>
          <p className="text-muted-foreground font-medium mb-1">Check-ins</p>
          <div className="space-y-0.5">
            {quickCheckInCount > 0 && (
              <p className="text-xs"><span className="font-semibold">{quickCheckInCount}</span> <span className="text-muted-foreground">quick</span></p>
            )}
            {systemCheckInCount > 0 && (
              <p className="text-xs"><span className="font-semibold">{systemCheckInCount}</span> <span className="text-muted-foreground">system</span></p>
            )}
            {checkInCount === 0 && <span className="text-muted-foreground italic">None</span>}
          </div>
        </div>
      </div>

      {/* Row 3: Symptoms + Custom Statuses */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-muted-foreground font-medium mb-1">Symptoms</p>
          <div className="flex flex-wrap gap-1">
            {activeSymptoms.length > 0 ? (
              activeSymptoms.map((s) => (
                <div key={s.id} className="px-1.5 py-0.5 rounded text-white font-medium text-xs"
                  style={{ backgroundColor: s.color || "#8b5cf6" }}>
                  {s.label}
                </div>
              ))
            ) : (
              <span className="text-muted-foreground italic">None</span>
            )}
          </div>
        </div>

        <div>
          <p className="text-muted-foreground font-medium mb-1">💬 Custom Statuses</p>
          {customStatuses.length > 0 ? (
            <div className="space-y-1">
              {(showAllStatuses ? customStatuses : customStatuses.slice(0, STATUS_INITIAL)).map((text, i) => (
                <p key={i} className="text-xs text-foreground leading-tight line-clamp-2 border-l-2 border-primary/40 pl-1.5">
                  {text}
                </p>
              ))}
              {customStatuses.length > STATUS_INITIAL && (
                <button
                  onClick={() => setShowAllStatuses(v => !v)}
                  className="text-xs text-primary hover:underline transition-colors">
                  {showAllStatuses ? "Show less" : `+${customStatuses.length - STATUS_INITIAL} more`}
                </button>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground italic">None</span>
          )}
        </div>
      </div>

      {/* Row 4: Entries */}
      <div>
        <p className="text-muted-foreground font-medium mb-1">Entries</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {journalCount > 0 && (
            <button onClick={() => navigate(`/journals`)} className="text-primary hover:underline text-left">
              {journalCount} journal{journalCount !== 1 ? "s" : ""}
            </button>
          )}
          {quickCheckInCount > 0 && (
            <button onClick={() => navigate(`/checkin-log?date=${format(dayStart, 'yyyy-MM-dd')}`)} className="text-primary hover:underline text-left">
              {quickCheckInCount} quick check-in{quickCheckInCount !== 1 ? "s" : ""}
            </button>
          )}
          {systemCheckInCount > 0 && (
            <button onClick={() => navigate(`/system-checkin`)} className="text-primary hover:underline text-left">
              {systemCheckInCount} system check-in{systemCheckInCount !== 1 ? "s" : ""}
            </button>
          )}
          {taskStats.created > 0 && (
            <button onClick={() => navigate(`/todo`)} className="text-primary hover:underline text-left">
              {taskStats.completed}/{taskStats.created} to-do{taskStats.created !== 1 ? "s" : ""}
            </button>
          )}
          {journalCount === 0 && quickCheckInCount === 0 && systemCheckInCount === 0 && taskStats.created === 0 && (
            <span className="text-muted-foreground italic">None</span>
          )}
        </div>
      </div>

    </div>
  );
}