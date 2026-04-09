import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { parseDate } from "@/lib/dateUtils";
import { Plus, Eye, EyeOff, Settings, X, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import ActivityCustomizationMenu from "@/components/activities/ActivityCustomizationMenu";

// ── Persistence helpers ──────────────────────────────────────────────────────
const LS_ROW_H    = "symphony_act_row_h";
const LS_COL_W    = "symphony_act_col_w";
const LS_INTERVAL = "symphony_act_interval";

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── Constants ────────────────────────────────────────────────────────────────
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

// ── Main component ───────────────────────────────────────────────────────────
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
}) {
  // Persisted display settings
  const [rowH,      setRowH]      = useState(() => lsGet(LS_ROW_H,    40));
  const [colW,      setColW]      = useState(() => lsGet(LS_COL_W,    110));
  const [interval,  setInterval]  = useState(() => lsGet(LS_INTERVAL, 60));  // 15|30|60

  const [showAlters,     setShowAlters]     = useState(false);
  const [showEmotions,   setShowEmotions]   = useState(false);
  const [showCustomMenu, setShowCustomMenu] = useState(false);
  const [showSettings,   setShowSettings]   = useState(false);
  const [expandedCells,  setExpandedCells]  = useState(new Set());
  const [pendingStart,   setPendingStart]   = useState(null);
  const lastTapRef = useRef({ key: "", time: 0 });

  // Persist on change
  useEffect(() => { lsSet(LS_ROW_H,    rowH);     }, [rowH]);
  useEffect(() => { lsSet(LS_COL_W,    colW);     }, [colW]);
  useEffect(() => { lsSet(LS_INTERVAL, interval); }, [interval]);

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

  // ── Time slots based on interval ──────────────────────────────────────────
  // Each slot: { hour, minute, slotIndex }
  const slots = useMemo(() => {
    const s = [];
    ALL_HOURS.forEach(h => {
      for (let m = 0; m < 60; m += interval) {
        s.push({ hour: h, minute: m, label: `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}` });
      }
    });
    return s;
  }, [interval]);

  const slotsPerHour = 60 / interval;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getActivityColor = useCallback((act) => {
    for (const id of (act.activity_category_ids || [])) {
      const cat = catById[id];
      if (cat?.color) return cat.color;
    }
    return act.color || "hsl(var(--primary))";
  }, [catById]);

  const activityCatKeys = useCallback((act) => {
    return (act.activity_category_ids || []).join(",") || act.activity_name || "";
  }, []);

  // For a given slot, return { timed: Activity[], logged: Activity[] }
  const getActivitiesForSlot = useCallback((date, hour, minute) => {
    const slotStart = new Date(date);
    slotStart.setHours(hour, minute, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + interval * 60 * 1000);

    const timed = [];
    const logged = [];

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

  // Is this the FIRST slot where a timed activity appears?
  const isFirstSlotForActivity = useCallback((act, date, hour, minute) => {
    const actStart = parseDate(act.timestamp);
    const slotStart = new Date(date);
    slotStart.setHours(hour, minute, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + interval * 60 * 1000);
    return actStart >= slotStart && actStart < slotEnd;
  }, [interval]);

  // Is this the LAST slot for a timed activity?
  const isLastSlotForActivity = useCallback((act, date, hour, minute) => {
    const actStart = parseDate(act.timestamp);
    const actEnd = new Date(actStart.getTime() + act.duration_minutes * 60 * 1000);
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
        if (s.primary_alter_id) ids.add(s.primary_alter_id);
        (s.co_fronter_ids || []).forEach(id => ids.add(id));
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
    return [...new Set(all)];
  }, [emotionCheckIns, interval]);

  const getDayStats = useCallback((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const dayActs = activities.filter(a => format(parseDate(a.timestamp), "yyyy-MM-dd") === dateStr);
    return {
      count: dayActs.length,
      duration: dayActs.reduce((s, a) => s + (a.duration_minutes || 0), 0),
    };
  }, [activities]);

  const slotKey = (date, hour, minute) => `${format(date, "yyyy-MM-dd")}-${hour}-${minute}`;

  // ── Tap handler ────────────────────────────────────────────────────────────
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

    if (addMode) {
      if (!pendingStart) {
        setPendingStart({ date, hour, minute });
      } else {
        const startH = pendingStart.hour + pendingStart.minute / 60;
        const endH   = hour + minute / 60;
        const [sH, eH] = startH <= endH
          ? [pendingStart.hour, hour]
          : [hour, pendingStart.hour];
        onTimeRangeSelect(pendingStart.date, sH, eH);
        setPendingStart(null);
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Controls row */}
      <div className="flex flex-wrap gap-1.5 justify-end items-center">
        <Button variant={addMode ? "default" : "outline"} size="sm" onClick={handleToggleAddMode} className="gap-1.5 h-7 px-2 text-xs">
          {addMode ? <><X className="w-3 h-3" />Cancel</> : <><Plus className="w-3 h-3" />Add</>}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowEmotions(v => !v)} className="gap-1.5 h-7 px-2 text-xs">
          {showEmotions ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {showEmotions ? "Emotions" : "Emotions"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowAlters(v => !v)} className="gap-1.5 h-7 px-2 text-xs">
          {showAlters ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          Alters
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowSettings(v => !v)} className="gap-1.5 h-7 px-2 text-xs">
          <Settings className="w-3 h-3" /> View
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowCustomMenu(true)} className="h-7 px-2 text-xs">
          Customize
        </Button>
      </div>

      {/* Display settings panel */}
      {showSettings && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-3 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">Row height</span>
              <input type="range" min={28} max={80} step={4} value={rowH}
                onChange={e => setRowH(Number(e.target.value))}
                className="w-24 accent-primary" />
              <span className="text-muted-foreground w-6">{rowH}px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">Col width</span>
              <input type="range" min={20} max={200} step={10} value={colW}
                onChange={e => setColW(Number(e.target.value))}
                className="w-24 accent-primary" />
              <span className="text-muted-foreground w-10">{colW}px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">Interval</span>
              {[15, 30, 60].map(iv => (
                <button key={iv} onClick={() => setInterval(iv)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    interval === iv ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}>
                  {iv === 60 ? "1h" : `${iv}m`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {addMode && (
        <div className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-xs text-primary font-medium">
          {pendingStart
            ? `Start: ${String(pendingStart.hour).padStart(2,"0")}:${String(pendingStart.minute).padStart(2,"0")} — tap end cell`
            : "Tap start cell, then end cell"}
        </div>
      )}

      {showCustomMenu && <ActivityCustomizationMenu onClose={() => setShowCustomMenu(false)} />}

      {/* Grid */}
      <div className="border border-border rounded-lg overflow-hidden flex" style={{ maxWidth: "100vw" }}>
        {/* Fixed time column */}
        <div className="flex-shrink-0 bg-muted border-r border-border flex flex-col z-10">
          <div style={{ height: HEADER_H, minHeight: HEADER_H }} className="border-b border-border" />
          {slots.map(({ hour, minute, label }) => (
            <div
              key={label}
              className="px-1.5 text-right border-b border-border/40 flex items-center justify-end flex-shrink-0 whitespace-nowrap"
              style={{ height: rowH, minHeight: rowH, fontSize: 10, color: "hsl(var(--muted-foreground))" }}
            >
              {/* Only show label at top of hour or for fine intervals */}
              {(minute === 0 || interval <= 30)
                ? <span className={minute === 0 ? "font-semibold" : "opacity-60"}>{label}</span>
                : null}
            </div>
          ))}
        </div>

        {/* Scrollable days */}
        <div className="overflow-x-auto flex-1">
          <div style={{ minWidth: weekDays.length * colW }}>
            {/* Day headers */}
            <div className="grid bg-card border-b border-border sticky top-0 z-10"
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
                      <div className="text-xs text-primary/80" style={{ fontSize: 9 }}>
                        {stats.count}{stats.duration > 0 ? ` · ${Math.round(stats.duration / 60)}h` : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Slot rows */}
            {slots.map(({ hour, minute, label }) => (
              <div key={label} className="grid"
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

                  // Determine border-bottom: hide if a timed activity continues into next slot
                  const timedContinues = timed.some(a => !isLastSlotForActivity(a, date, hour, minute));

                  // Logged pills that are NOT same-category as any timed activity (those get merged visually)
                  const loggedToShow = logged.filter(pill => {
                    const pillCats = new Set(pill.activity_category_ids || []);
                    return !timed.some(t =>
                      (t.activity_category_ids || []).some(c => pillCats.has(c))
                    );
                  });
                  // Logged pills that ARE same-category as a timed block (merge: just show extra emotions/alters)
                  const loggedMerged = logged.filter(pill => {
                    const pillCats = new Set(pill.activity_category_ids || []);
                    return timed.some(t =>
                      (t.activity_category_ids || []).some(c => pillCats.has(c))
                    );
                  });

                  // Merged emotions from merged pills
                  const mergedEmotions = [...new Set(loggedMerged.flatMap(p => p.emotions || []))];
                  const mergedAlterIds = [...new Set(loggedMerged.flatMap(p => p.fronting_alter_ids || []))];

                  const hasContent = timed.length > 0 || logged.length > 0;
                  const showLabel = timed.some(a => isFirstSlotForActivity(a, date, hour, minute));

                  return (
                    <button
                      key={key}
                      onClick={() => handleCellTap(date, hour, minute)}
                      className={`border-r border-border/40 relative flex flex-col items-start justify-start overflow-hidden cursor-pointer transition-colors group
                        ${timedContinues ? "" : "border-b border-border/40"}
                        ${!hasContent && addMode ? "hover:bg-primary/10" : ""}
                        ${!hasContent && !addMode ? "hover:bg-muted/20" : ""}
                        ${isExpanded ? "z-10" : ""}
                      `}
                      style={{
                        minHeight: rowH,
                        height: isExpanded ? "auto" : rowH,
                        userSelect: "none",
                      }}
                    >
                      {/* Highlight ring */}
                      {highlightActivityId && timed.some(a => a.id === highlightActivityId) && (
                        <div className="absolute inset-0 ring-2 ring-yellow-400 ring-inset pointer-events-none z-20 animate-pulse" />
                      )}
                      {isPending && (
                        <div className="absolute inset-0 ring-2 ring-primary ring-inset pointer-events-none z-20" />
                      )}

                      {/* Timed activity background fills */}
                      {timed.length > 0 && (
                        <div className="absolute inset-0 flex">
                          {timed.map(a => (
                            <div key={a.id} className="flex-1 h-full" style={{ backgroundColor: getActivityColor(a) }} />
                          ))}
                        </div>
                      )}

                      {/* Content layer */}
                      <div className="relative z-10 w-full h-full flex flex-col">
                        {/* Timed activity label — only in first slot */}
                        {timed.length > 0 && showLabel && (
                          <div className={`px-1 pt-0.5 w-full ${isExpanded ? "" : "overflow-hidden"}`}
                            style={{ maxHeight: isExpanded ? "none" : rowH - 2 }}>
                            <div className="font-semibold text-white drop-shadow leading-tight"
                              style={{ fontSize: Math.max(9, Math.min(11, rowH / 4)) }}>
                              {truncate(timed.map(a => a.activity_name).join(" + "), colW / 7)}
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

                        {/* Emotions from timed slot */}
                        {timed.length > 0 && showEmotions && (emotions.length > 0 || mergedEmotions.length > 0) && (
                          <div className="flex flex-wrap gap-0.5 px-1 mt-0.5">
                            {[...new Set([...emotions, ...mergedEmotions])].slice(0, isExpanded ? 20 : 3).map((em, i) => (
                              <span key={i} className="px-0.5 rounded-full text-white font-medium"
                                style={{ fontSize: 7, backgroundColor: emotionColor(em) }}>
                                {isExpanded ? em : em.charAt(0).toUpperCase() + em.slice(1, 3)}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Alter dots for timed slot */}
                        {timed.length > 0 && showAlters && (alterIds.length > 0 || mergedAlterIds.length > 0) && (
                          <div className="flex gap-0.5 flex-wrap px-1 mt-0.5">
                            {[...new Set([...alterIds, ...mergedAlterIds])].slice(0, isExpanded ? 12 : 4).map(alterId => {
                              const alter = alters.find(a => a.id === alterId);
                              return (
                                <div key={alterId}
                                  className="rounded-full border border-white/50 overflow-hidden flex items-center justify-center flex-shrink-0"
                                  style={{
                                    width: isExpanded ? 14 : 10,
                                    height: isExpanded ? 14 : 10,
                                    backgroundColor: alter?.color || "rgba(255,255,255,0.3)"
                                  }}
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

                        {/* Empty cell: show alter dots from fronting history */}
                        {timed.length === 0 && alterIds.length > 0 && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 p-0.5">
                            {showAlters
                              ? alterIds.slice(0, 3).map(alterId => {
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
                                })
                              : (
                                <div className="flex gap-0.5 flex-wrap justify-center">
                                  {alterIds.slice(0, 4).map(alterId => {
                                    const alter = alters.find(a => a.id === alterId);
                                    return <div key={alterId} className="w-1 h-1 rounded-full" style={{ backgroundColor: alter?.color || "hsl(var(--muted-foreground))" }} />;
                                  })}
                                </div>
                              )
                            }
                          </div>
                        )}

                        {/* Logged pills (no duration, not same-cat as timed) */}
                        {loggedToShow.length > 0 && (
                          <div className={`flex flex-col gap-0.5 w-full ${timed.length > 0 ? "mt-0.5 px-0.5" : "p-0.5"}`}>
                            {loggedToShow.map(pill => {
                              const color = getActivityColor(pill);
                              const pillAlters = (pill.fronting_alter_ids || [])
                                .map(id => alters.find(a => a.id === id)).filter(Boolean);
                              const pillEmotions = pill.emotions || [];
                              const pillTime = parseDate(pill.timestamp);
                              const minuteOffset = pillTime.getMinutes() % interval;
                              const pct = minuteOffset / interval;

                              return (
                                <div
                                  key={pill.id}
                                  className="rounded-full flex items-center gap-0.5 px-1 text-white font-medium flex-shrink-0 overflow-hidden"
                                  style={{
                                    backgroundColor: color,
                                    fontSize: 8,
                                    height: Math.max(10, rowH * 0.28),
                                    marginTop: pct > 0 ? `${pct * rowH}px` : 0,
                                    maxWidth: "100%",
                                  }}
                                  title={pill.activity_name}
                                >
                                  <span className="truncate">{truncate(pill.activity_name, colW / 9)}</span>
                                  {showAlters && pillAlters.slice(0, 2).map(a => (
                                    <div key={a.id}
                                      className="w-3 h-3 rounded-full border border-white/50 flex-shrink-0 overflow-hidden"
                                      style={{ backgroundColor: a.color || "#fff" }}>
                                      {a.avatar_url
                                        ? <img src={a.avatar_url} className="w-full h-full object-cover" />
                                        : <span style={{ fontSize: 5 }} className="flex items-center justify-center h-full font-bold">{a.name?.charAt(0)}</span>
                                      }
                                    </div>
                                  ))}
                                  {showEmotions && pillEmotions.slice(0, 1).map((em, i) => (
                                    <span key={i} className="w-2 h-2 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: emotionColor(em) }} title={em} />
                                  ))}
                                  {/* Fallback dot if too small */}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Add mode hint */}
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