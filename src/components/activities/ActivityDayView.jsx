import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { format } from "date-fns";
import { ArrowLeft, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { parseDate } from "@/lib/dateUtils";
import {
  emotionColor,
  getActivityColor,
  getActivitiesForSlot,
  getAlterIdsForSlot,
  getEmotionsForSlot,
} from "./activityHelpers";

function EmotionPills({ emotions }) {
  if (!emotions || emotions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {emotions.map((em, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-white text-[10px] font-medium"
          style={{ backgroundColor: emotionColor(em) }}
        >
          {em}
        </span>
      ))}
    </div>
  );
}

function SymptomPills({ symptomIds, symptomsMap }) {
  if (!symptomIds || symptomIds.length === 0) return null;
  const symptoms = symptomIds.map(id => symptomsMap[id]).filter(Boolean);
  if (symptoms.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {symptoms.map(s => (
        <span
          key={s.id}
          className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border"
          style={{ borderColor: s.color || "#94a3b8", color: s.color || "#94a3b8", backgroundColor: (s.color || "#94a3b8") + "22" }}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

const INTERVAL = 60;
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h) {
  const period = h < 12 ? "am" : "pm";
  return `${h % 12 || 12}${period}`;
}

// Build segments: consecutive empty hours → one collapsed band; active hours → individual rows
function buildSegments(getSlotData) {
  const segments = [];
  let emptyBand = null;

  for (const hour of ALL_HOURS) {
    const data = getSlotData(hour);
    const isEmpty = data.timed.length === 0 && data.logged.length === 0;

    if (isEmpty) {
      if (!emptyBand) {
        emptyBand = { type: "empty", startHour: hour, endHour: hour };
      } else {
        emptyBand.endHour = hour;
      }
    } else {
      if (emptyBand) { segments.push(emptyBand); emptyBand = null; }
      segments.push({ type: "active", hour, data });
    }
  }
  if (emptyBand) segments.push(emptyBand);
  return segments;
}

function AlterAvatar({ alterId, alters }) {
  const alter = alters.find(a => a.id === alterId);
  const resolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);
  const [imgError, setImgError] = useState(false);
  return (
    <div
      className="w-5 h-5 rounded-full border-2 border-white/80 overflow-hidden flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: alter?.color || "#9333ea" }}
      title={alter?.name}
    >
      {resolvedUrl && !imgError
        ? <img src={resolvedUrl} alt={alter?.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
        : <span className="font-bold text-white" style={{ fontSize: 7 }}>{alter?.name?.charAt(0)?.toUpperCase() || "?"}</span>
      }
    </div>
  );
}

// Tall color block for timed activities
function ActivityBlock({ activity, getColor, alters, emotions, alterIds, symptomsMap }) {
  const color = getColor(activity);
  const allEmotions = [...new Set([...(activity.emotions || []), ...emotions])];
  return (
    <div
      className="rounded-lg overflow-hidden relative w-full"
      style={{ backgroundColor: color, minHeight: 72 }}
    >
      {alterIds.length > 0 && (
        <div className="absolute top-2 right-2 flex -space-x-1 z-10">
          {alterIds.slice(0, 4).map(id => <AlterAvatar key={id} alterId={id} alters={alters} />)}
        </div>
      )}
      <div className="p-3 pr-12">
        <p className="font-bold text-white text-base leading-snug break-words max-w-full">{activity.activity_name}</p>
        {activity.duration_minutes > 0 && (
          <p className="text-white/75 text-xs mt-0.5">{activity.duration_minutes}m</p>
        )}
        {activity.notes && (
          <p className="text-white/65 text-xs italic mt-1 leading-snug break-words">{activity.notes}</p>
        )}
        {allEmotions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {allEmotions.map((em, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-white text-[10px] font-medium bg-black/20">
                {em}
              </span>
            ))}
          </div>
        )}
        <SymptomPills symptomIds={activity.symptom_ids} symptomsMap={symptomsMap} />
      </div>
    </div>
  );
}

// Small colored pill for logged (no-duration) activities
function LoggedPill({ activity, getColor, alters = [], slotEmotions = [], slotAlterIds = [], symptomsMap = {} }) {
  const color = getColor(activity);
  const emotions = [...new Set([...(activity.emotions || []), ...slotEmotions])];
  const alterIds = [...new Set([...(activity.fronting_alter_ids || []), ...slotAlterIds])];
  return (
    <div className="flex flex-col gap-1">
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full self-start"
        style={{ backgroundColor: color }}
      >
        <span className="font-semibold text-white text-sm break-words">{activity.activity_name}</span>
        {alterIds.length > 0 && (
          <div className="flex -space-x-1">
            {alterIds.slice(0, 3).map(id => <AlterAvatar key={id} alterId={id} alters={alters} />)}
          </div>
        )}
      </div>
      {activity.notes && (
        <p className="text-xs text-muted-foreground italic leading-snug pl-1 break-words">{activity.notes}</p>
      )}
      {emotions.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-1">
          {emotions.map((em, i) => (
            <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-white text-[10px] font-medium" style={{ backgroundColor: emotionColor(em) }}>
              {em}
            </span>
          ))}
        </div>
      )}
      <SymptomPills symptomIds={activity.symptom_ids} symptomsMap={symptomsMap} />
    </div>
  );
}

export default function ActivityDayView({
  date,
  activities,
  alters = [],
  frontingHistory = [],
  onClose,
  onActivityClick,
  onTimeRangeSelect,
}) {
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list(),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });
  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });
  const symptomsMap = useMemo(() => {
    const m = {};
    symptoms.forEach(s => { m[s.id] = s; });
    return m;
  }, [symptoms]);

  const catById = useMemo(() => {
    const m = {};
    categories.forEach(c => { m[c.id] = c; });
    return m;
  }, [categories]);

  const dateStr = format(date, "yyyy-MM-dd");
  const isToday = dateStr === format(new Date(), "yyyy-MM-dd");

  const dayActivities = useMemo(() =>
    activities.filter(a => format(parseDate(a.timestamp), "yyyy-MM-dd") === dateStr),
    [activities, dateStr]
  );

  const totalDuration = useMemo(() =>
    dayActivities.reduce((s, a) => s + (a.duration_minutes || 0), 0),
    [dayActivities]
  );

  const getColor = useCallback((act) => getActivityColor(act, catById), [catById]);

  const getSlotData = useCallback((hour) => {
    const { timed, logged } = getActivitiesForSlot(date, hour, 0, INTERVAL, dayActivities);
    const hasActivities = timed.length > 0 || logged.length > 0;
    // Only attach alters/emotions to rows that actually have activities
    const alterIds = hasActivities ? getAlterIdsForSlot(date, hour, 0, INTERVAL, frontingHistory) : [];
    const emotions = hasActivities ? getEmotionsForSlot(date, hour, 0, INTERVAL, dayActivities, emotionCheckIns) : [];
    return { timed, logged, alterIds, emotions };
  }, [date, dayActivities, frontingHistory, emotionCheckIns]);

  const segments = useMemo(() => buildSegments(getSlotData), [getSlotData]);
  const allEmpty = dayActivities.length === 0;

  // Now line
  const [nowMins, setNowMins] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); });
  useEffect(() => {
    if (!isToday) return;
    const t = setInterval(() => { const n = new Date(); setNowMins(n.getHours() * 60 + n.getMinutes()); }, 60000);
    return () => clearInterval(t);
  }, [isToday]);
  const nowHour = isToday ? Math.floor(nowMins / 60) : null;

  // ESC to close
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Swipe-down to close — only when scrolled to top
  const touchStartY = useRef(null);
  const scrollRef = useRef(null);
  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e) => {
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const delta = e.changedTouches[0].clientY - (touchStartY.current ?? 0);
    if (scrollTop === 0 && delta > 80) onClose();
    touchStartY.current = null;
  };

  // Auto-scroll to current time or first activity
  const nowLineRef = useRef(null);
  const firstActivityRef = useRef(null);
  useEffect(() => {
    setTimeout(() => {
      if (isToday && nowLineRef.current) {
        nowLineRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
      } else if (firstActivityRef.current) {
        firstActivityRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }, 120);
  }, [isToday]);

  const handleAddNow = () => {
    const now = new Date();
    onTimeRangeSelect(date, now.getHours(), null, now.getMinutes(), null);
  };

  let firstActivitySet = false;

  return (
    <div
      className="fixed inset-0 bg-background z-50 flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-foreground leading-tight">{format(date, "EEEE, MMMM d")}</h2>
          <p className="text-xs text-muted-foreground">
            {allEmpty
              ? "No activities"
              : `${dayActivities.length} activit${dayActivities.length !== 1 ? "ies" : "y"}${totalDuration > 0 ? ` · ${Math.floor(totalDuration / 60)}h${totalDuration % 60 > 0 ? ` ${totalDuration % 60}m` : ""}` : ""}`
            }
          </p>
        </div>
        <Button size="sm" onClick={handleAddNow} className="gap-1.5 flex-shrink-0">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="pb-32">

          {/* Full-day empty state */}
          {allEmpty ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 px-8 text-center">
              <p className="text-muted-foreground text-sm">No activities logged for this day</p>
              <Button onClick={handleAddNow} className="gap-2">
                <Plus className="w-4 h-4" /> Log an activity
              </Button>
            </div>
          ) : (
            segments.map((seg) => {
              /* ── Collapsed empty band ── */
              if (seg.type === "empty") {
                const nowInBand = nowHour !== null && nowHour >= seg.startHour && nowHour <= seg.endHour;
                const label = seg.startHour === seg.endHour
                  ? `${formatHour(seg.startHour)} · no activities`
                  : `${formatHour(seg.startHour)} – ${formatHour(seg.endHour + 1)} · no activities`;

                return (
                  <div
                    key={`empty-${seg.startHour}`}
                    ref={nowInBand ? nowLineRef : null}
                    className="relative flex items-center border-t border-b border-border/20 bg-muted/10 cursor-pointer hover:bg-primary/5 transition-colors"
                    style={{ minHeight: 32 }}
                    onClick={() => onTimeRangeSelect(date, seg.startHour, null, 0, null)}
                  >
                    {/* Hour label column */}
                    <div className="w-14 flex-shrink-0 text-right pr-3 select-none"
                      style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", opacity: 0.45 }}>
                      {formatHour(seg.startHour)}
                    </div>
                    {/* Band text */}
                    <div className="flex-1 py-2">
                      <span className="text-xs text-muted-foreground/40 select-none">{label}</span>
                    </div>
                    {/* Now line inside empty band */}
                    {nowInBand && (
                      <div className="absolute left-0 right-0 pointer-events-none flex items-center z-10" style={{ top: "50%" }}>
                        <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0 ml-11" />
                        <div className="flex-1 h-0.5 bg-primary opacity-80" />
                      </div>
                    )}
                  </div>
                );
              }

              /* ── Active hour row ── */
              const { timed, logged, alterIds, emotions } = seg.data;
              const isCurrentHour = isToday && nowHour === seg.hour;
              const isFirstActivity = !firstActivitySet;
              if (isFirstActivity) firstActivitySet = true;

              return (
                <div
                  key={`active-${seg.hour}`}
                  ref={isCurrentHour ? nowLineRef : (isFirstActivity ? firstActivityRef : null)}
                  className={`relative flex border-t border-border/20 ${isCurrentHour ? "bg-primary/5" : ""}`}
                  style={{ minHeight: 80 }}
                >
                  {/* Now line */}
                  {isCurrentHour && (
                    <div
                      className="absolute left-0 right-0 pointer-events-none flex items-center z-10"
                      style={{ top: `${((nowMins % 60) / 60) * 100}%` }}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0 ml-11" />
                      <div className="flex-1 h-0.5 bg-primary opacity-80" />
                    </div>
                  )}

                  {/* Hour label column — fixed width, never floats over content */}
                  <div
                    className="w-14 flex-shrink-0 text-right pr-3 pt-3 select-none"
                    style={{
                      fontSize: 13,
                      fontWeight: isCurrentHour ? 700 : 500,
                      color: isCurrentHour ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {formatHour(seg.hour)}
                  </div>

                  {/* Content column */}
                  <div
                    className="flex-1 px-2 py-2 space-y-2 cursor-pointer"
                    onClick={() => {
                      const allActs = [...timed, ...logged];
                      if (allActs.length > 0) onActivityClick?.(allActs);
                      else onTimeRangeSelect(date, seg.hour, null, 0, null);
                    }}
                  >
                    {timed.map(a => (
                      <ActivityBlock
                        key={a.id}
                        activity={a}
                        getColor={getColor}
                        alters={alters}
                        emotions={emotions}
                        alterIds={alterIds}
                        symptomsMap={symptomsMap}
                      />
                    ))}
                    {logged.map(a => (
                      <LoggedPill key={a.id} activity={a} getColor={getColor} alters={alters} slotEmotions={emotions} slotAlterIds={alterIds} symptomsMap={symptomsMap} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Floating add button — above bottom nav */}
      <button
        onClick={handleAddNow}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center text-white z-20 hover:bg-primary/90 transition-colors"
        aria-label="Add activity"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}