import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { parseDate } from "@/lib/dateUtils";
import { Plus, Eye, EyeOff, Settings, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import ActivityCustomizationMenu from "@/components/activities/ActivityCustomizationMenu";

const LS_ROW_H      = "symphony_act_row_h";
const LS_COL_W      = "symphony_act_col_w";
const LS_INTERVAL   = "symphony_act_interval";
const LS_WEEK_START = "symphony_act_week_start";
const LS_TIME_FMT   = "symphony_act_time_fmt";
const LS_TICK_MODE  = "symphony_act_tick_mode";

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

const HEADER_H = 56;
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

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
function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}
function formatSlotLabel(hour, minute, fmt) {
  if (fmt === "24") {
    return minute === 0
      ? `${String(hour).padStart(2, "0")}:00`
      : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const period = hour < 12 ? "am" : "pm";
  const h = hour % 12 || 12;
  return minute === 0
    ? `${h}${period}`
    : `${h}:${String(minute).padStart(2, "0")}${period}`;
}
function shouldUseTicks(rowH, tickMode, interval) {
  if (interval === 60) return false;
  if (tickMode === "always") return true;
  if (tickMode === "never") return false;
  return rowH <= 14;
}

export default function ActivityWeeklyGrid({
  weekDays,
  activities,
  alters = [],
  frontingHistory = [],
  onTimeRangeSelect,
  onActivityClick,
  addMode = false,
  onToggleAddMode,
  highlightActivityId = null,
  onWeekStartChange,
}) {
  const [rowH,         setRowH]         = useState(() => lsGet(LS_ROW_H,      40));
  const [colW,         setColW]         = useState(() => lsGet(LS_COL_W,      110));
  const [interval,     setInterval]     = useState(() => lsGet(LS_INTERVAL,   60));
  const [weekStartsOn, setWeekStartsOn] = useState(() => lsGet(LS_WEEK_START, 0));
  const [timeFmt,      setTimeFmt]      = useState(() => lsGet(LS_TIME_FMT,   "24"));
  const [tickMode,     setTickMode]     = useState(() => lsGet(LS_TICK_MODE,  "auto"));

  const [showAlters,     setShowAlters]     = useState(false);
  const [showEmotions,   setShowEmotions]   = useState(false);
  const [showCustomMenu, setShowCustomMenu] = useState(false);
  const [showSettings,   setShowSettings]   = useState(false);
  const [expandedCells,  setExpandedCells]  = useState(new Set());
  const [pendingStart,   setPendingStart]   = useState(null);
  const lastTapRef = useRef({ key: "", time: 0 });

  useEffect(() => { lsSet(LS_ROW_H,      rowH);         }, [rowH]);
  useEffect(() => { lsSet(LS_COL_W,      colW);         }, [colW]);
  useEffect(() => { lsSet(LS_INTERVAL,   interval);     }, [interval]);
  useEffect(() => { lsSet(LS_WEEK_START, weekStartsOn); }, [weekStartsOn]);
  useEffect(() => { lsSet(LS_TIME_FMT,   timeFmt);      }, [timeFmt]);
  useEffect(() => { lsSet(LS_TICK_MODE,  tickMode);     }, [tickMode]);

  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list(),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });
  const catById = useMemo(() => {
    const m = {};
    categories.forEach(c => { m[c.id] = c; });
    return m;
  }, [categories]);

  const slots = useMemo(() => {
    const s = [];
    ALL_HOURS.forEach(h => {
      for (let m = 0; m < 60; m += interval) {
        s.push({ hour: h, minute: m });
      }
    });
    return s;
  }, [interval]);

  const getActivityColor = useCallback((act) => {
    for (const id of (act.activity_category_ids || [])) {
      const cat = catById[id];
      if (cat?.color) return cat.color;
    }
    return act.color || "hsl(var(--primary))";
  }, [catById]);

  const getActivitiesForSlot = useCallback((date, hour, minute) => {
    const slotStart = new Date(date);
    slotStart.setHours(hour, minute, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + interval * 60 * 1000);
    const timed = [], logged = [];
    activities.forEach(a => {
      const actStart = parseDate(a.timestamp);
      if (a.duration_minutes) {
        const actEnd = new Date(actStart.getTime() + a.duration_minutes * 60 * 1000);
        if (actStart < slotEnd && actEnd > slotStart) timed.push(a);
      } else {
        if (actStart >= slotStart && actStart < slotEnd) logged.push(a);
      }
    });
    return { timed, logged };
  }, [activities, interval]);

  const isFirstSlotForActivity = useCallback((act, date, hour, minute) => {
    const actStart = parseDate(act.timestamp);
    const slotStart = new Date(date);
    slotStart.setHours(hour, minute, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + interval * 60 * 1000);
    return actStart >= slotStart && actStart < slotEnd;
  }, [interval]);

  const isLastSlotForActivity = useCallback((act, date, hour, minute) => {
    const actEnd = new Date(parseDate(act.timestamp).getTime() + act.duration_minutes * 60 * 1000);
    const slotEnd = new Date(date);
    slotEnd.setHours(hour, minute, 0, 0);
    slotEnd.setTime(slotEnd.getTime() + interval * 60 * 1000);
    return actEnd <= slotEnd;
  }, [interval]);

  const getAlterIdsForSlot = useCallback((date, hour, minute) => {
    const slotStart = new Date(date);
    slotStart.setHours(hour, minute, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + interval * 60 * 1000);
    const ids = new Set();
    frontingHistory.forEach(s => {
      const start = parseDate(s.start_time);
      const end = s.end_time ? parseDate(s.end_time) : new Date();
      if (start < slotEnd && end > slotStart) {
 if (s.alter_id) {
      ids.add(s.alter_id);
    } else {
      if (s.primary_alter_id) ids.add(s.primary_alter_id);
      (s.co_fronter_ids || []).forEach(id => ids.add(id));
    }
  }
});
    return [...ids];
  }, [frontingHistory, interval]);

const getEmotionsForSlot = useCallback((date, hour, minute) => {
    const slotStart = new Date(date);
    slotStart.setHours(hour, minute, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + interval * 60 * 1000);
    const all = [];
    emotionCheckIns.forEach(e => {
      const t = parseDate(e.timestamp);
      if (t >= slotStart && t < slotEnd) all.push(...(e.emotions || []));
    });
    activities.forEach(a => {
      const t = parseDate(a.timestamp);
      if (t >= slotStart && t < slotEnd && (a.emotions || []).length > 0) {
        all.push(...(a.emotions || []));
      }
    });
    return [...new Set(all)];
  }, [emotionCheckIns, activities, interval]);

  const getDayStats = useCallback((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const dayActs = activities.filter(a => format(parseDate(a.timestamp), "yyyy-MM-dd") === dateStr);
    return {
      count: dayActs.length,
      duration: dayActs.reduce((s, a) => s + (a.duration_minutes || 0), 0),
    };
  }, [activities]);

  const slotKey = (date, hour, minute) => `${format(date, "yyyy-MM-dd")}-${hour}-${minute}`;

  const handleCellTap = useCallback((date, hour, minute) => {
    const key = slotKey(date, hour, minute);
    const now = Date.now();
    const { timed, logged } = getActivitiesForSlot(date, hour, minute);
    const allActs = [...timed, ...logged];
    const isDouble = lastTapRef.current.key === key && now - lastTapRef.current.time < 350;
    lastTapRef.current = { key, time: now };

    if (isDouble) {
      if (allActs.length > 0) { onActivityClick?.(allActs); return; }
      if (!addMode) { onToggleAddMode?.(); setPendingStart({ date, hour, minute }); }
      return;
    }
    // In handleCellTap, replace the onTimeRangeSelect call:
if (addMode) {
  if (!pendingStart) {
    setPendingStart({ date, hour, minute });
  } else {
    const isSameCell =
  pendingStart.date.toDateString() === date.toDateString() &&
  pendingStart.hour === hour &&
  pendingStart.minute === minute;

if (isSameCell) {
  onTimeRangeSelect(date, hour, null, minute, null);
  setPendingStart(null);
} else {
  const startH = pendingStart.hour + pendingStart.minute / 60;
  const endH = hour + minute / 60;
  const isForward = startH <= endH;
  onTimeRangeSelect(
    pendingStart.date,
    isForward ? pendingStart.hour : hour,
    isForward ? hour : pendingStart.hour,
    isForward ? pendingStart.minute : minute,
    isForward ? minute : pendingStart.minute
  );
  setPendingStart(null);
}
  }
} else if (allActs.length > 0) {
      setExpandedCells(prev => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    }
  }, [addMode, pendingStart, getActivitiesForSlot, onTimeRangeSelect, onActivityClick, onToggleAddMode]);

  const handleToggleAddMode = () => { setPendingStart(null); onToggleAddMode?.(); };
  const handleSetWeekStart = (val) => { setWeekStartsOn(val); onWeekStartChange?.(val); };

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="flex flex-wrap gap-1.5 justify-end items-center">
        <Button variant={addMode ? "default" : "outline"} size="sm" onClick={handleToggleAddMode} className="gap-1.5 h-7 px-2 text-xs">
          {addMode ? <><X className="w-3 h-3" />Cancel</> : <><Plus className="w-3 h-3" />Add</>}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowEmotions(v => !v)} className="gap-1.5 h-7 px-2 text-xs">
          {showEmotions ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} Emotions
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowAlters(v => !v)} className="gap-1.5 h-7 px-2 text-xs">
          {showAlters ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} Alters
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowSettings(v => !v)} className="gap-1.5 h-7 px-2 text-xs">
          <Settings className="w-3 h-3" /> Display
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowCustomMenu(true)} className="h-7 px-2 text-xs">
          Manage Activities
        </Button>
      </div>

      {/* Display settings panel */}
      {showSettings && (
        <div className="rounded-lg border border-border bg-card p-3 text-xs">
          <div className="flex flex-wrap gap-x-5 gap-y-2.5 items-center">

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium whitespace-nowrap">Row height</span>
              <input type="range" min={6} max={80} step={2} value={rowH}
                onChange={e => setRowH(Number(e.target.value))}
                className="w-20 accent-primary" />
              <span className="text-muted-foreground w-7">{rowH}px</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium whitespace-nowrap">Col width</span>
              <input type="range" min={15} max={200} step={5} value={colW}
                onChange={e => setColW(Number(e.target.value))}
                className="w-20 accent-primary" />
              <span className="text-muted-foreground w-8">{colW}px</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium whitespace-nowrap">Interval</span>
              {[15, 30, 60].map(iv => (
                <button key={iv} onClick={() => setInterval(iv)}
                  className={`px-2 py-0.5 rounded font-medium transition-colors ${
                    interval === iv ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}>
                  {iv === 60 ? "1h" : `${iv}m`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium whitespace-nowrap">Sub-hour marks</span>
              {[{ label: "Labels", val: "never" }, { label: "Auto", val: "auto" }, { label: "Ticks", val: "always" }].map(({ label, val }) => (
                <button key={val} onClick={() => setTickMode(val)}
                  className={`px-2 py-0.5 rounded font-medium transition-colors ${
                    tickMode === val ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium whitespace-nowrap">Week starts</span>
              {[{ label: "Sun", val: 0 }, { label: "Mon", val: 1 }].map(({ label, val }) => (
                <button key={val} onClick={() => handleSetWeekStart(val)}
                  className={`px-2 py-0.5 rounded font-medium transition-colors ${
                    weekStartsOn === val ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium whitespace-nowrap">Time format</span>
              {[{ label: "24h", val: "24" }, { label: "AM/PM", val: "ampm" }].map(({ label, val }) => (
                <button key={val} onClick={() => setTimeFmt(val)}
                  className={`px-2 py-0.5 rounded font-medium transition-colors ${
                    timeFmt === val ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

          </div>
        </div>
      )}

      {addMode && (
        <div className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-xs text-primary font-medium">
          {pendingStart
            ? `Start: ${formatSlotLabel(pendingStart.hour, pendingStart.minute, timeFmt)} — tap end cell`
            : "Tap start cell, then end cell"}
        </div>
      )}

      {showCustomMenu && <ActivityCustomizationMenu onClose={() => setShowCustomMenu(false)} />}

      {/* Grid */}
      <div className="border border-border rounded-lg overflow-hidden flex" style={{ maxWidth: "100vw" }}>
        {/* Fixed time column */}
        <div className="flex-shrink-0 bg-muted border-r border-border flex flex-col z-10">
          <div style={{ height: HEADER_H, minHeight: HEADER_H }} className="border-b border-border" />
          {slots.map(({ hour, minute }) => {
            const useTicks = shouldUseTicks(rowH, tickMode, interval);
            return (
              <div
                key={`${hour}-${minute}`}
                className="px-1.5 text-right border-b border-border/40 flex items-center justify-end flex-shrink-0 whitespace-nowrap"
                style={{ height: rowH, minHeight: rowH, color: "hsl(var(--muted-foreground))" }}
              >
                {minute === 0 ? (
                  <span className="font-semibold" style={{ fontSize: Math.max(8, Math.min(10, rowH * 0.7)) }}>
                    {formatSlotLabel(hour, 0, timeFmt)}
                  </span>
                ) : useTicks ? (
                  <span style={{ fontSize: rowH <= 10 ? 7 : 9, lineHeight: 1, opacity: 0.6 }}>
                    {minute % 30 === 0 ? "·" : "−"}
                  </span>
                ) : (
                  interval <= 30 && (
                    <span className="opacity-50" style={{ fontSize: 8 }}>
                      {formatSlotLabel(hour, minute, timeFmt)}
                    </span>
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* Scrollable days */}
        <div className="overflow-x-auto flex-1">
          <div style={{ minWidth: weekDays.length * colW }}>
            {/* Day headers */}
            <div className="grid bg-card border-b border-border"
              style={{ gridTemplateColumns: `repeat(${weekDays.length}, ${colW}px)`, height: HEADER_H }}>
              {weekDays.map(date => {
                const stats = getDayStats(date);
                const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                return (
                  <div key={format(date, "yyyy-MM-dd")}
                    className={`p-1.5 text-center border-r border-border ${isToday ? "bg-primary/5" : ""}`}>
                    <div className="text-xs font-medium text-muted-foreground">{format(date, "EEE")}</div>
                    <div className={`text-base font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                      {format(date, "d")}
                    </div>
                    {stats.count > 0 && (
                      <div style={{ fontSize: 9 }} className="text-primary/80">
                        {stats.count}{stats.duration > 0 ? ` · ${Math.round(stats.duration / 60)}h` : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Slot rows */}
            {slots.map(({ hour, minute }) => (
              <div key={`${hour}-${minute}`} className="grid"
                style={{ gridTemplateColumns: `repeat(${weekDays.length}, ${colW}px)`, minHeight: rowH }}>
                {weekDays.map(date => {
                  const key = slotKey(date, hour, minute);
                  const { timed, logged } = getActivitiesForSlot(date, hour, minute);
                  const alterIds = getAlterIdsForSlot(date, hour, minute);
                  const emotions = getEmotionsForSlot(date, hour, minute);
                  const isExpanded = expandedCells.has(key);
                  const isPending = pendingStart &&
                    pendingStart.date.toDateString() === date.toDateString() &&
                    pendingStart.hour === hour && pendingStart.minute === minute;

                  const timedContinues = timed.some(a => !isLastSlotForActivity(a, date, hour, minute));
                  const loggedToShow = logged.filter(pill => {
                    const pillCats = new Set(pill.activity_category_ids || []);
                    return !timed.some(t => (t.activity_category_ids || []).some(c => pillCats.has(c)));
                  });
                  const loggedMerged = logged.filter(pill => {
                    const pillCats = new Set(pill.activity_category_ids || []);
                    return timed.some(t => (t.activity_category_ids || []).some(c => pillCats.has(c)));
                  });
                  const mergedEmotions = [...new Set(loggedMerged.flatMap(p => p.emotions || []))];
                  const mergedAlterIds = [...new Set(loggedMerged.flatMap(p => p.fronting_alter_ids || []))];
                  const hasContent = timed.length > 0 || logged.length > 0;
                  const showLabel = timed.some(a => isFirstSlotForActivity(a, date, hour, minute));

                  return (
                    <button
                      key={key}
                      onClick={() => handleCellTap(date, hour, minute)}
                        className={`border-r border-border/40 relative flex flex-col items-start justify-start overflow-visible cursor-pointer transition-colors group
                        ${timedContinues ? "" : "border-b border-border/40"}
                        ${!hasContent && addMode ? "hover:bg-primary/10" : ""}
                        ${!hasContent && !addMode ? "hover:bg-muted/20" : ""}
                        ${isExpanded ? "z-10" : ""}
                      `}
                      style={{ minHeight: rowH, height: isExpanded ? "auto" : rowH, userSelect: "none" }}
                    >
                      {highlightActivityId && timed.some(a => a.id === highlightActivityId) && (
                        <div className="absolute inset-0 ring-2 ring-yellow-400 ring-inset pointer-events-none z-20 animate-pulse" />
                      )}
                      {isPending && (
                        <div className="absolute inset-0 ring-2 ring-primary ring-inset pointer-events-none z-20" />
                      )}

                      {timed.length > 0 && (
                        <div className="absolute inset-0 flex">
                          {timed.map(a => (
                            <div key={a.id} className="flex-1 h-full" style={{ backgroundColor: getActivityColor(a) }} />
                          ))}
                        </div>
                      )}

                      <div className="relative z-10 w-full h-full flex flex-col">
                        {timed.length > 0 && showLabel && (
                          <div className={`px-1 pt-0.5 w-full ${isExpanded ? "" : "overflow-hidden"}`}
                            style={{ maxHeight: isExpanded ? "none" : rowH - 2 }}>
<div className="font-semibold text-white drop-shadow leading-tight flex items-center gap-0.5"
  style={{ fontSize: Math.max(9, Math.min(11, rowH / 4)) }}>
  {truncate(timed.map(a => a.activity_name).join(" + "), colW / 7)}
  {timed.some(a => a.notes) && (
    <span style={{ fontSize: Math.max(7, rowH * 0.22), opacity: 0.85, lineHeight: 1 }}>💭</span>
  )}
</div>
                            {isExpanded && (
                              <div className="text-white/90 space-y-0.5 mt-0.5" style={{ fontSize: 9 }}>
                                {timed.map(a => (
                                  <div key={a.id}>
                                    <span className="font-semibold">{a.activity_name}</span>
                                    {a.duration_minutes ? <span className="ml-1 opacity-80">{a.duration_minutes}m</span> : null}
                                    {a.notes ? <p className="italic opacity-80 leading-tight mt-0.5">{a.notes}</p> : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {showEmotions && (emotions.length > 0 || mergedEmotions.length > 0) && (
  <div className="flex flex-wrap gap-0.5 px-1 mt-0.5">
                            {[...new Set([...emotions, ...mergedEmotions])].slice(0, isExpanded ? 20 : 3).map((em, i) => (
                              <span key={i} className="px-0.5 rounded-full text-white font-medium"
                                style={{ fontSize: 7, backgroundColor: emotionColor(em) }}>
                                {isExpanded ? em : em.charAt(0).toUpperCase() + em.slice(1, 3)}
                              </span>
                            ))}
                          </div>
                        )}

                        {timed.length > 0 && showAlters && (alterIds.length > 0 || mergedAlterIds.length > 0) && (
                          <div className="flex gap-0.5 flex-wrap px-1 mt-0.5">
                            {[...new Set([...alterIds, ...mergedAlterIds])].slice(0, isExpanded ? 12 : 4).map(alterId => {
                              const alter = alters.find(a => a.id === alterId);
                              return (
                                <div key={alterId}
                                  className="rounded-full border border-white/50 overflow-hidden flex items-center justify-center flex-shrink-0"
                                  style={{ width: isExpanded ? 14 : 10, height: isExpanded ? 14 : 10, backgroundColor: alter?.color || "rgba(255,255,255,0.3)" }}
                                  title={alter?.name}>
                                  {alter?.avatar_url
                                    ? <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                                    : <span className="font-bold text-white" style={{ fontSize: 6 }}>{alter?.name?.charAt(0)?.toUpperCase()}</span>
                                  }
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {timed.length === 0 && alterIds.length > 0 && showAlters && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 p-0.5">
                            {alterIds.slice(0, 3).map(alterId => {
                              const alter = alters.find(a => a.id === alterId);
                              return (
                                <div key={alterId}
                                  className="rounded-full border border-border/60 flex items-center justify-center overflow-hidden"
                                  style={{ width: Math.min(rowH * 0.35, 18), height: Math.min(rowH * 0.35, 18), backgroundColor: alter?.color || "hsl(var(--muted-foreground))" }}
                                  title={alter?.name}>
                                  {alter?.avatar_url
                                    ? <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                                    : <span className="font-bold text-white" style={{ fontSize: 7 }}>{alter?.name?.charAt(0)?.toUpperCase() || "?"}</span>
                                  }
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {loggedToShow.length > 0 && (
                          <div className={`flex flex-col w-full ${timed.length > 0 ? "mt-0.5 px-0.5" : "p-0.5"} ${isExpanded ? "gap-1" : "gap-0.5"}`}
                            style={!isExpanded ? { height: rowH, overflow: "visible" } : {}}>
                            {(() => {
                              const count = loggedToShow.length;
                              const pillH = isExpanded ? "auto" : Math.min(Math.floor(rowH / count), 18);
                              const useCircles = !isExpanded && pillH < 14;
                              if (useCircles) {
                                return (
                                  <div className="flex flex-row items-center gap-0.5 flex-wrap px-0.5 h-full">
                                    {loggedToShow.map(pill => {
                                      const color = getActivityColor(pill);
                                      const size = Math.max(6, Math.min(rowH - 2, Math.floor((colW - 8) / count) - 2));
                                      const chars = Math.floor(size / 5.5);
                                      const label = chars >= 2 ? pill.activity_name?.slice(0, chars) : "";
                                      return (
                                        <div key={pill.id}
                                          className="rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold overflow-hidden"
                                          style={{ backgroundColor: color, height: size, minWidth: size, fontSize: Math.max(5, size * 0.5), paddingLeft: label ? 2 : 0, paddingRight: label ? 2 : 0 }}
                                          title={pill.activity_name}>
                                          {label}
                                          {pill.notes && <span style={{ fontSize: Math.max(4, size * 0.4), marginLeft: 1, opacity: 0.85 }}>💭</span>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              }
                              return loggedToShow.map(pill => {
                                const color = getActivityColor(pill);
                                const pillAlters = (pill.fronting_alter_ids || []).map(id => alters.find(a => a.id === id)).filter(Boolean);
                                const pillEmotions = pill.emotions || [];
                                const h = isExpanded ? undefined : Math.min(Math.max(10, pillH), 18);
                                const fs = isExpanded ? 9 : Math.max(7, Math.min(9, pillH * 0.6));
                                return (
                                  <div key={pill.id}
                                    className="rounded-full flex items-center gap-0.5 px-1 text-white font-medium flex-shrink-0 overflow-hidden w-full"
                                    style={{ backgroundColor: color, fontSize: fs, height: h, maxWidth: "100%", marginTop: 0 }}
                                    title={pill.activity_name}>
                                    <span className={isExpanded ? "" : "truncate"}>
                                      {isExpanded ? pill.activity_name : truncate(pill.activity_name, colW / 7)}
                                    </span>
                                    {pill.notes && <span style={{ fontSize: Math.max(6, fs * 0.85), marginLeft: 1 }}>💭</span>}
                                    {isExpanded && pill.notes && (
                                      <p className="text-white/80 italic text-xs ml-1">{pill.notes}</p>
                                    )}
                                    {showAlters && pillAlters.slice(0, isExpanded ? 6 : 2).map(a => (
                                      <div key={a.id} className="w-3 h-3 rounded-full border border-white/50 flex-shrink-0 overflow-hidden"
                                        style={{ backgroundColor: a.color || "#fff" }}>
                                        {a.avatar_url
                                          ? <img src={a.avatar_url} className="w-full h-full object-cover" />
                                          : <span style={{ fontSize: 5 }} className="flex items-center justify-center h-full font-bold">{a.name?.charAt(0)}</span>
                                        }
                                      </div>
                                    ))}
                                    {showEmotions && pillEmotions.slice(0, isExpanded ? 6 : 1).map((em, i) => (
                                      <span key={i} className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: emotionColor(em) }} title={em} />
                                    ))}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}

                        {addMode && !hasContent && (
                          <Plus className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity m-auto text-primary" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}