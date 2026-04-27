import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import AlterAvatarInline from "@/components/shared/AlterAvatar";
import { format, differenceInMinutes, startOfDay } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import DailyTallyPanel from "@/components/timeline/DailyTallyPanel";
import { parseDate } from "@/lib/dateUtils";
import { ChevronDown, ChevronUp, BarChart3, Heart, Activity, Users, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AlterSessionInfo, AlterSessionEdit } from "@/components/timeline/AlterSessionPopover";
import { SymptomBar, SymptomDetailModal } from "@/components/timeline/SymptomBar";
import { SymptomSessionPopup } from "@/components/timeline/SymptomSessionPopup";
import QuickCheckInModal from "@/components/emotions/QuickCheckInModal";

const LABEL_WIDTH = 44;
const DEFAULT_COL_WIDTHS = { activity: 52, eventCol: 56, emotionCol: 52, symptom: 48, alter: 44 };
const EVENT_DETAIL_MIN_WIDTH = 72;
const LS_TIMELINE_ROW_H = "symphony_timeline_row_h";

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
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
function minutesInDay(date, dayStart) {
  return differenceInMinutes(date, dayStart);
}
function formatMins(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function useDoubleTap(onSingleTap, onDoubleTap, ms = 280) {
  const lastRef = useRef({ time: 0 });
  return useCallback((e) => {
    const now = Date.now();
    if (now - lastRef.current.time < ms) {
      lastRef.current.time = 0;
      onDoubleTap?.(e);
    } else {
      lastRef.current.time = now;
      setTimeout(() => {
        if (lastRef.current.time !== 0 && Date.now() - lastRef.current.time >= ms - 30) {
          lastRef.current.time = 0;
          onSingleTap?.(e);
        }
      }, ms);
    }
  }, [onSingleTap, onDoubleTap, ms]);
}

function ResizeHandle({ onDrag }) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const onMouseDown = (e) => { dragging.current = true; startX.current = e.clientX; e.preventDefault(); };
  const onTouchStart = (e) => { dragging.current = true; startX.current = e.touches[0].clientX; e.preventDefault(); };
  useEffect(() => {
    const move = (e) => {
      if (!dragging.current) return;
      const x = e.clientX ?? e.touches?.[0]?.clientX;
      if (x == null) return;
      onDrag(x - startX.current);
      startX.current = x;
    };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [onDrag]);
  return (
    <div className="absolute top-0 bottom-0 z-20 flex items-center justify-center cursor-col-resize"
      style={{ width: 10, right: -5, userSelect: "none" }}
      onMouseDown={onMouseDown} onTouchStart={onTouchStart}>
      <div className="w-0.5 h-full bg-border/60 hover:bg-primary/60 transition-colors" />
    </div>
  );
}

function StatusNoteBadge({ note, topPx, id }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <div className="absolute left-0 right-0 z-10 flex items-start pointer-events-none" style={{ top: topPx, userSelect: "none" }} data-status-id={id}>
        <div className="mx-1 flex items-center gap-1" style={{ fontSize: 9 }}>
          {/* Only the icon is clickable — rest is pointer-events-none so alters behind are tappable */}
          <button
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded bg-muted/90 border border-border/60 hover:bg-muted transition-colors cursor-pointer pointer-events-auto"
            style={{ fontSize: 10 }}
            onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          >
            💬
          </button>
          <span className="text-muted-foreground truncate pointer-events-none opacity-70 leading-tight"
            style={{ maxWidth: 60 }}>
            {note}
          </span>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-card border border-border rounded-xl p-4 shadow-xl max-w-xs w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="text-xs text-muted-foreground mb-2">💬 Custom Status</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{note}</p>
            <button onClick={() => setOpen(false)} className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function AlterBar({ alter, color, topPx, heightPx, onTap, onDoubleTap, isPrimary, rowH, onLongPress }) {
  const sz = Math.max(18, Math.min(26, rowH * 0.45));
  const tap = useDoubleTap(onTap, onDoubleTap);
  const resolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);
  const [imgError, setImgError] = useState(false);
  const lpRef = useRef(null);
  const touchFiredRef = useRef(false);

  const startPress = (e) => {
    e.stopPropagation();
    touchFiredRef.current = false;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    lpRef.current = setTimeout(() => { lpRef.current = null; onLongPress?.(clientY); }, 500);
  };
  const cancelPress = (e) => {
    e?.stopPropagation();
    if (lpRef.current) { clearTimeout(lpRef.current); lpRef.current = null; }
  };
  const handleTouchEnd = (e) => {
    cancelPress(e);
    if (lpRef.current === null && !touchFiredRef.current) return; // long press fired, skip
    touchFiredRef.current = true;
    onTap?.();
  };

  return (
    <div className="absolute flex flex-col items-center cursor-pointer"
      style={{ top: topPx, left: 0, right: 0, userSelect: "none" }}
      onClick={(e) => { if (touchFiredRef.current) { touchFiredRef.current = false; return; } tap(e); }}
      onMouseDown={startPress} onMouseUp={cancelPress} onMouseLeave={cancelPress}
      onTouchStart={startPress} onTouchEnd={handleTouchEnd}>
      <div
        className="rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-primary/60 transition-all"
        style={{
          width: sz, height: sz,
          backgroundColor: color,
          border: isPrimary ? "2px solid #f59e0b" : "2px solid var(--background)",
          boxShadow: isPrimary ? "0 0 0 1px #f59e0b" : "none"
        }}
        title={alter?.name + (isPrimary ? " (primary)" : "")}>
        {resolvedUrl && !imgError
          ? <img src={resolvedUrl} alt={alter?.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
          : <span className="font-bold text-white" style={{ fontSize: Math.max(7, sz * 0.4) }}>{alter?.name?.charAt(0)?.toUpperCase() || "?"}</span>}
      </div>
      {heightPx > sz + 4 && (
        <div className="w-0.5 rounded-full mt-0.5" style={{
          height: Math.max(heightPx - sz - 2, 4),
          background: isPrimary
            ? `linear-gradient(to bottom, #f59e0b, #f59e0b40)`
            : `linear-gradient(to bottom, ${color}, ${color}40)`,
        }} />
      )}
    </div>
  );
}

function SessionSplitPopup({ alter, session, splitMins, onClose, onSave }) {
  const [adjustedMins, setAdjustedMins] = useState(splitMins);
  const splitResolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);
  const [splitImgError, setSplitImgError] = useState(false);
  const isPrimary = session?.alter_id
    ? (session?.is_primary ?? false)
    : session?.primary_alter_id === alter?.id;
  // For new model, co-fronters are derived from overlapping sessions (not in this record)
  const coIds = session?.alter_id ? [] : (session?.co_fronter_ids || []).filter(Boolean);

  const minsToTime = (mins) => {
    const h = Math.floor(Math.max(0, mins) / 60) % 24;
    const m = Math.max(0, mins) % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const timeToMins = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-4 shadow-xl max-w-xs w-full mx-4 space-y-3"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          {splitResolvedUrl && !splitImgError
            ? <img src={splitResolvedUrl} alt={alter?.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" onError={() => setSplitImgError(true)} />
            : <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ backgroundColor: alter?.color || "#9333ea" }}>
                {alter?.name?.charAt(0)?.toUpperCase()}
              </div>
          }
          <div className="flex-1">
            <p className="text-sm font-semibold">{alter?.name}</p>
            <p className="text-xs text-muted-foreground">Split session at:</p>
          </div>
        </div>
        <input
          type="time"
          value={minsToTime(adjustedMins)}
          onChange={e => setAdjustedMins(timeToMins(e.target.value))}
          className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-medium"
        />
        <div className="space-y-2">
          {!isPrimary && (
            <button onClick={() => onSave("promote", adjustedMins)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-500 hover:bg-amber-500/20 transition-colors text-left">
              ⭐ Make primary from {formatMins(adjustedMins)}
            </button>
          )}
          {isPrimary && coIds.length > 0 && (
            <button onClick={() => onSave("demote", adjustedMins)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-muted border border-border hover:bg-muted/80 transition-colors text-left">
              ↓ Demote to co-fronter from {formatMins(adjustedMins)}
            </button>
          )}
          {isPrimary && coIds.length === 0 && (
            <button onClick={() => onSave("demote", adjustedMins)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-muted border border-border hover:bg-muted/80 transition-colors text-left">
              ↓ Remove primary status from {formatMins(adjustedMins)}
            </button>
          )}
          <button onClick={() => onSave("end", adjustedMins)}
            className="w-full px-3 py-2 text-sm rounded-lg bg-destructive/10 border border-destructive/40 text-destructive hover:bg-destructive/20 transition-colors text-left">
            ✕ Remove from front at {formatMins(adjustedMins)}
          </button>
        </div>
        <button onClick={onClose} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors pt-1">
          Cancel
        </button>
      </div>
    </div>
  );
}

function NewSessionPopup({ startMins, dayStart, alters, onClose, onSave }) {
  const minsToTime = (mins) => {
    const h = Math.floor(Math.max(0, Math.min(1439, mins)) / 60);
    const m = Math.max(0, Math.min(1439, mins)) % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const [startTime, setStartTime] = useState(minsToTime(startMins));
  const [endTime, setEndTime] = useState("");
  const [stillFronting, setStillFronting] = useState(false);
  const [selectedAlterId, setSelectedAlterId] = useState("");
  const [asPrimary, setAsPrimary] = useState(true);
  const [search, setSearch] = useState("");

  const filtered = alters
    .filter(a => !a.is_archived)
    .filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-4 shadow-xl max-w-xs w-full mx-4 space-y-3"
        onClick={e => e.stopPropagation()}>
        <p className="text-sm font-semibold">New Fronting Session</p>

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Start time</p>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm" />
          </div>
          <button
            onClick={() => { if (!stillFronting && endTime) { const t = startTime; setStartTime(endTime); setEndTime(t); } }}
            disabled={stillFronting || !endTime}
            className="flex-shrink-0 h-8 px-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30 text-sm"
            title="Swap start and end times">
            ⇄
          </button>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">End time</p>
            <input type="time" value={stillFronting ? "" : endTime}
              onChange={e => setEndTime(e.target.value)}
              disabled={stillFronting}
              className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm disabled:opacity-40" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="still-fronting" checked={stillFronting}
            onChange={e => setStillFronting(e.target.checked)}
            className="w-4 h-4 accent-primary" />
          <label htmlFor="still-fronting" className="text-xs text-muted-foreground cursor-pointer select-none">
            Still fronting (no end time)
          </label>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Who was fronting?</p>
          <input placeholder="Search alters..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm mb-1.5" />
          <div className="max-h-32 overflow-y-auto space-y-1 border border-border rounded-lg p-1.5 bg-muted/20">
            {filtered.map(a => (
              <button key={a.id} onClick={() => setSelectedAlterId(a.id)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
                  selectedAlterId === a.id ? "bg-primary/15 text-primary" : "hover:bg-muted/50"
                }`}>
                <AlterAvatarInline alter={a} size="xs" />
                <span className="truncate">{a.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="new-as-primary" checked={asPrimary}
            onChange={e => setAsPrimary(e.target.checked)}
            className="w-4 h-4 accent-primary" />
          <label htmlFor="new-as-primary" className="text-xs text-muted-foreground cursor-pointer select-none">
            Mark as primary fronter
          </label>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted/50 transition-colors">
            Cancel
          </button>
          <button disabled={!selectedAlterId}
            onClick={() => onSave({ startTime, endTime: stillFronting ? null : endTime, alterId: selectedAlterId, asPrimary })}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function RetroEntryPicker({ startMins, onFrontSession, onCheckIn, onClose }) {
  const h = Math.floor(startMins / 60) % 12 || 12;
  const m = startMins % 60;
  const period = Math.floor(startMins / 60) < 12 ? "am" : "pm";
  const timeStr = `${h}:${String(m).padStart(2, "0")}${period}`;
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-xl p-4 max-w-xs w-full mx-4 mb-24 space-y-3" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-semibold text-center">Add entry at {timeStr}</p>
        <div className="space-y-2">
          <button onClick={onFrontSession} className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left">
            <Users className="w-5 h-5 text-primary flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Front Session</p>
              <p className="text-xs text-muted-foreground">Log who was fronting at this time</p>
            </div>
          </button>
          <button onClick={onCheckIn} className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left">
            <Heart className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Quick Check-In</p>
              <p className="text-xs text-muted-foreground">Log emotions, activities, symptoms, or a note</p>
            </div>
          </button>
        </div>
        <button onClick={onClose} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
      </div>
    </div>
  );
}

function DetailPopup({ title, icon, timeStr, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-4 shadow-xl max-w-xs w-full mx-4" onClick={e => e.stopPropagation()}>
        <p className="text-xs text-muted-foreground mb-2">{icon} {timeStr}</p>
        {children}
        <button onClick={onClose} className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
          Close
        </button>
      </div>
    </div>
  );
}

function ActivityBar({ activityName, color, mergedCount, topPx, heightPx, notes, onTap, onDoubleTap, timeStr }) {
  const sz = 26;
  const tap = useDoubleTap(onTap, onDoubleTap);
  const touchFiredRef = useRef(false);
  const handleTouchEnd = (e) => { touchFiredRef.current = true; onTap?.(); };
  return (
    <div className="absolute flex flex-col items-center cursor-pointer"
      style={{ top: topPx, left: 0, right: 0, userSelect: "none" }}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => { if (touchFiredRef.current) { touchFiredRef.current = false; return; } tap(e); }}>
      <div className="rounded-full flex-shrink-0 border-2 border-background flex items-center justify-center"
        style={{ width: sz, height: sz, backgroundColor: color }}>
        <span className="text-xs font-bold text-white leading-none">
          {activityName?.charAt(0)?.toUpperCase() || "A"}
        </span>
      </div>
      <div className="text-center leading-tight mt-0.5 px-0.5"
        style={{ fontSize: 8, color, maxWidth: 54, wordBreak: "break-word" }}>
        {activityName}
        {mergedCount > 1 && <span className="opacity-60"> ×{mergedCount}</span>}
      </div>
      {heightPx > sz + 30 && (
        <div className="w-0.5 rounded-full mt-0.5" style={{
          height: Math.max(heightPx - sz - 26, 4),
          background: `linear-gradient(to bottom, ${color}, ${color}40)`,
        }} />
      )}
    </div>
  );
}

const TYPE_META = {
  journal:         { icon: "📓" },
  checkin:         { icon: "✅" },
  bulletin:        { icon: "📌" },
  task:            { icon: "☑️" },
  task_done:       { icon: "✅" },
  mention:         { icon: "@" },
  symptom_checkin: { icon: "💊" },
};

function EmotionBubble({ entry, topPx, onTap, onDoubleTap, colWidth }) {
  const emotions = entry.data.emotions || [];
  const note = entry.data.note;
  const tap = useDoubleTap(onTap, onDoubleTap);
  return (
    <div className="absolute right-0 left-0 cursor-pointer z-10 px-1" style={{ top: topPx, userSelect: "none" }} onClick={tap}>
      <div className="relative">
        {emotions.length > 0 ? (
          <div className="flex flex-col gap-px">
            {note && <span style={{ fontSize: 8 }} className="text-muted-foreground leading-none">💭</span>}
            {emotions.slice(0, 3).map((em) => (
              <div key={em} className="flex items-center gap-0.5 overflow-hidden" title={em}>
                <div className="rounded-full flex-shrink-0 border border-background"
                  style={{ width: 7, height: 7, backgroundColor: emotionColor(em) }} />
                <span className="font-medium truncate" style={{ fontSize: 9, color: emotionColor(em), maxWidth: "100%", lineHeight: "1.1" }}>
                  {em}
                </span>
              </div>
            ))}
            {emotions.length > 3 && (
              <span className="text-muted-foreground" style={{ fontSize: 8 }}>+{emotions.length - 3}</span>
            )}
          </div>
        ) : note ? (
          <div className="rounded border border-border/60 bg-card/90 flex items-center justify-center px-1"
            style={{ height: 16 }} title={note}>
            <span style={{ fontSize: 10 }}>💭</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EventEntry({ entry, topPx, onTap, onDoubleTap, colWidth }) {
  const tap = useDoubleTap(onTap, onDoubleTap);
  const meta = TYPE_META[entry.type] || { icon: "•" };
  const isTaskDone = entry.type === "task_done";
  const showLabel = colWidth >= EVENT_DETAIL_MIN_WIDTH;

  // Special rendering for symptom check-ins: list up to 3 symptoms ranked by severity
  if (entry.type === "symptom_checkin") {
    const items = (entry.data.items || [])
      .slice()
      .sort((a, b) => (b.checkIn.severity ?? -1) - (a.checkIn.severity ?? -1))
      .slice(0, 3);
    return (
      <div className="absolute left-1 cursor-pointer z-10" style={{ top: topPx, userSelect: "none" }} onClick={tap}>
        <div className="flex flex-col gap-px" style={{ maxWidth: colWidth - 8 }}>
          {items.map(({ symptom, checkIn }, i) => {
            const color = symptom?.color || "#8b5cf6";
            return (
              <div key={i} className="flex items-center gap-0.5 overflow-hidden" title={symptom?.label}>
                <div className="rounded-full flex-shrink-0 border border-background"
                  style={{ width: 7, height: 7, backgroundColor: color }} />
                <span className="font-medium truncate" style={{ fontSize: 9, color, lineHeight: "1.1", maxWidth: "100%" }}>
                  {symptom?.label || "?"}
                  {checkIn.severity != null ? <span style={{ opacity: 0.7 }}> {checkIn.severity}</span> : null}
                </span>
              </div>
            );
          })}
          {(entry.data.items || []).length > 3 && (
            <span className="text-muted-foreground" style={{ fontSize: 8 }}>+{entry.data.items.length - 3}</span>
          )}
        </div>
      </div>
    );
  }

  const shortLabel =
    entry.type === 'checkin' ? 'Check-In' :
    entry.type === 'journal' ? (entry.label || 'Journal') :
    entry.type === 'bulletin' ? 'Bulletin' :
    (entry.label || 'Task');
  return (
    <div className="absolute left-1 cursor-pointer z-10" style={{ top: topPx, userSelect: "none" }} onClick={tap}>
      {showLabel ? (
        <div className="flex items-center gap-1 rounded-full border shadow-sm bg-card border-border/60 px-1.5 py-0.5 hover:scale-105 transition-transform"
          style={{ maxWidth: colWidth - 8 }} title={entry.label}>
          <span style={{ fontSize: 11 }}>{meta.icon}</span>
          <span className="text-muted-foreground truncate" style={{ fontSize: 9, maxWidth: colWidth - 32 }}>{shortLabel}</span>
        </div>
      ) : (
        <div className={`flex items-center justify-center rounded-full border shadow-sm hover:scale-110 transition-transform ${
          isTaskDone ? "bg-green-500/10 border-green-500/40" : "bg-card border-border/60"
        }`} style={{ width: 22, height: 22 }} title={entry.label}>
          <span style={{ fontSize: 12 }}>{meta.icon}</span>
        </div>
      )}
    </div>
  );
}

export default function InfiniteTimeline({
  day, sessions, activities, emotions, alters, hasData, isToday,
  journals = [], checkIns = [], bulletins = [], tasks = [],
  showActivities = true, showCheckIns = true, showEmotions = true,
  showSymptoms = true,
  symptomSessions = [], symptomCheckIns = [], symptoms = [],
  categories = [],
}) {
  const queryClient = useQueryClient();

  const catMap = useMemo(() => {
    const m = {};
    categories.forEach(c => { m[c.id] = c; });
    return m;
  }, [categories]);

  const [collapsed, setCollapsed] = useState(!hasData);
  const [detailPopup, setDetailPopup] = useState(null); // { type, entry }
  const [colWidths, setColWidths] = useState({ ...DEFAULT_COL_WIDTHS });
  const [showTally, setShowTally] = useState(false);
  const [showRowSlider, setShowRowSlider] = useState(false);
  const [sessionPopover, setSessionPopover] = useState(null);
  const [editingSession, setEditingSession] = useState(null);
  const [splitPopover, setSplitPopover] = useState(null); // { alter, session, splitMins }
  const [newSessionPopover, setNewSessionPopover] = useState(null);
  const [retroPickerState, setRetroPickerState] = useState(null); // { startMins } — type picker
  const [retroCheckIn, setRetroCheckIn] = useState(null); // { startMins } — QuickCheckInModal
  const [symptomSessionPopover, setSymptomSessionPopover] = useState(null); // { session, symptom, splitMins }
  const [symptomDetailModal, setSymptomDetailModal] = useState(null); // { session, symptom }
  const longPressTargetRef = useRef(null);

  const [rowH, setRowH] = useState(() => lsGet(LS_TIMELINE_ROW_H, 56));
  useEffect(() => { lsSet(LS_TIMELINE_ROW_H, rowH); }, [rowH]);

  const [nowMins, setNowMins] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    if (!isToday) return;
    const interval = setInterval(() => {
      const n = new Date();
      setNowMins(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, [isToday]);

  const navigate = useNavigate();
  const dayStart = useMemo(() => startOfDay(day), [day]);
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  const dragCol = useCallback((col, delta) => {
    setColWidths((prev) => ({ ...prev, [col]: Math.max(30, prev[col] + delta) }));
  }, []);

  const eventColWidth = colWidths.eventCol;
  const emotionColWidth = colWidths.emotionCol;

  const alterEntries = useMemo(() => {
    const byAlter = {};
    sessions.forEach((session) => {
      // Support both new (alter_id) and legacy (primary_alter_id) models
      let ids = [];
      if (session.alter_id) {
        ids = [session.alter_id];
      } else {
        ids = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
      }
      ids.forEach((alterId) => {
        const startMins = Math.max(0, minutesInDay(parseDate(session.start_time), dayStart));
        const endTime = session.end_time
          ? parseDate(session.end_time)
          : session.is_active && isToday ? new Date() : new Date(dayStart.getTime() + 24 * 60 * 60000 - 1);
        const endMins = Math.min(24 * 60, minutesInDay(endTime, dayStart));
        if (!byAlter[alterId]) byAlter[alterId] = [];
        const isPrimary = session.alter_id
          ? (session.is_primary ?? false)
          : session.primary_alter_id === alterId;
        byAlter[alterId].push({
          startMins,
          endMins: Math.max(endMins, startMins + 8),
          sessionId: session.id,
          isPrimary,
        });
      });
    });

    const result = [];
    Object.entries(byAlter).forEach(([alterId, segs]) => {
      const sorted = [...segs].sort((a, b) => a.startMins - b.startMins);

      // Resolve overlaps
      const resolved = [];
      sorted.forEach((seg) => {
        if (resolved.length === 0) { resolved.push({ ...seg }); return; }
        const last = resolved[resolved.length - 1];
        if (seg.startMins < last.endMins) {
          if (seg.isPrimary && !last.isPrimary) {
            last.endMins = seg.startMins;
            resolved.push({ ...seg });
          } else if (!seg.isPrimary && last.isPrimary) {
            if (seg.endMins > last.endMins) resolved.push({ ...seg, startMins: last.endMins });
          } else {
            last.endMins = Math.max(last.endMins, seg.endMins);
          }
        } else {
          resolved.push({ ...seg });
        }
      });

      // Merge consecutive same-status segments
      const merged = [];
      resolved.forEach((seg) => {
        if (merged.length === 0) { merged.push({ ...seg }); return; }
        const last = merged[merged.length - 1];
        if (seg.startMins <= last.endMins + 1 && seg.isPrimary === last.isPrimary) {
          last.endMins = Math.max(last.endMins, seg.endMins);
          last.sessionId = seg.sessionId;
        } else {
          merged.push({ ...seg });
        }
      });

      merged.forEach((seg, i) => result.push({
        alterId,
        startMins: seg.startMins,
        endMins: seg.endMins,
        sessionId: seg.sessionId,
        isPrimary: seg.isPrimary,
        key: `alter-${alterId}-${seg.sessionId}-${i}`,
      }));
    });
    return result;
  }, [sessions, dayStart, isToday]);

  const alterColumns = useMemo(() => {
    const cols = [];
    const alterIds = [...new Set(alterEntries.map(e => e.alterId))];
    alterIds.sort((a, b) => a.localeCompare(b));
    alterIds.forEach((alterId) => {
      const segs = alterEntries.filter(e => e.alterId === alterId);
      let placed = false;
      for (let colIdx = 0; colIdx < cols.length; colIdx++) {
        const col = cols[colIdx];
        const conflicts = segs.some(seg =>
          col.some(existing =>
            existing.alterId !== alterId &&
            seg.startMins < existing.endMins &&
            seg.endMins > existing.startMins
          )
        );
        if (!conflicts) {
          segs.forEach(seg => col.push(seg));
          placed = true;
          break;
        }
      }
      if (!placed) cols.push([...segs]);
    });
    return cols;
  }, [alterEntries]);

  const activityEntries = useMemo(() => {
    const raw = [];
    const dayStartMs = dayStart.getTime();
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

    activities.forEach((act) => {
      const actStart = parseDate(act.timestamp);
      const actStartMs = actStart.getTime();
      const duration = Math.max(act.duration_minutes || 0, 0);
      const actEndMs = duration > 0 ? actStartMs + duration * 60 * 1000 : actStartMs + 30 * 60 * 1000;

      // Skip if activity doesn't intersect this day at all
      if (actEndMs <= dayStartMs || actStartMs >= dayEndMs) return;

      // Clamp to this day's window
      const startMins = Math.max(0, Math.round((actStartMs - dayStartMs) / 60000));
      const endMins = Math.min(24 * 60, Math.round((actEndMs - dayStartMs) / 60000));

      const categoryIds = act.activity_category_ids && act.activity_category_ids.length > 0
        ? [...new Set(act.activity_category_ids)] : [null];
      categoryIds.forEach((catId) => {
        const cat = catId ? catMap[catId] : null;
        raw.push({
          startMins,
          endMins: Math.max(endMins, startMins + 5),
          activity: act,
          categoryId: catId,
          displayName: cat?.name || act.activity_name,
          categoryColor: cat?.color || act.color,
        });
      });
    });
    raw.sort((a, b) => a.startMins - b.startMins);
    const merged = [];
    raw.forEach((entry) => {
      const last = merged[merged.length - 1];
      if (last && last.categoryId === entry.categoryId && entry.startMins <= last.endMins) {
        last.endMins = Math.max(last.endMins, entry.endMins);
        last.mergedCount += 1;
      } else {
        merged.push({ ...entry, mergedCount: 1 });
      }
    });
    return merged.map((m, i) => ({ ...m, key: `act-${m.activity.id}-cat-${m.categoryId || i}` }));
  }, [activities, dayStart, catMap]);

  const activityColumns = useMemo(() => {
    const cols = [];
    [...activityEntries].sort((a, b) => a.startMins - b.startMins).forEach((entry) => {
      let placed = false;
      for (const col of cols) {
        if (col[col.length - 1].endMins <= entry.startMins + 2) { col.push(entry); placed = true; break; }
      }
      if (!placed) cols.push([entry]);
    });
    return cols;
  }, [activityEntries]);

  const symptomMap = useMemo(() => {
    const m = {};
    symptoms.forEach(s => { m[s.id] = s; });
    return m;
  }, [symptoms]);

  const emotionEntries = useMemo(() => {
    return emotions
      .map((e, i) => {
        const mins = minutesInDay(parseDate(e.timestamp), dayStart);
        return { mins, type: "emotion", id: e.id, data: e, key: `em-${i}-${e.id}` };
      })
      .filter(e => e.mins >= 0 && e.mins < 24 * 60)
      .sort((a, b) => a.mins - b.mins);
  }, [emotions, dayStart]);

  const eventEntries = useMemo(() => {
    const inDay = (mins) => mins >= 0 && mins < 24 * 60;
    const entries = [];

    journals.forEach((j) => {
      const mins = minutesInDay(parseDate(j.created_date), dayStart);
      if (inDay(mins)) entries.push({ mins, type: "journal", id: j.id, label: j.title || "Journal Entry", data: j });
    });
    checkIns.forEach((c) => {
      const mins = minutesInDay(parseDate(c.created_date), dayStart);
      if (inDay(mins)) entries.push({ mins, type: "checkin", id: c.id, label: "System Check-In", data: c });
    });
    bulletins.forEach((b) => {
      const mins = minutesInDay(parseDate(b.created_date), dayStart);
      if (inDay(mins)) entries.push({ mins, type: "bulletin", id: b.id, label: b.content?.slice(0, 40) || "Bulletin", data: b });
    });
    tasks.forEach((t) => {
      const createdMins = minutesInDay(parseDate(t.created_date), dayStart);
      if (inDay(createdMins)) {
        entries.push({ mins: createdMins, type: "task", id: t.id, label: t.title || "Task", data: t });
      }
      if (t.completed && t.completed_date) {
        const completedMins = minutesInDay(parseDate(t.completed_date), dayStart);
        if (inDay(completedMins)) {
          entries.push({ mins: completedMins, type: "task_done", id: `done-${t.id}`, label: `✓ ${t.title || "Task"}`, data: t });
        }
      }
    });

    // Group symptom check-ins by minute into single event entries
    const scByMinute = {};
    symptomCheckIns.forEach(sc => {
      const mins = minutesInDay(parseDate(sc.timestamp), dayStart);
      if (!inDay(mins)) return;
      const bucket = Math.floor(mins);
      if (!scByMinute[bucket]) scByMinute[bucket] = { mins: bucket, items: [], id: sc.id };
      scByMinute[bucket].items.push({ symptom: symptomMap[sc.symptom_id], checkIn: sc });
    });
    Object.values(scByMinute).forEach(group => {
      entries.push({ mins: group.mins, type: "symptom_checkin", id: `sc-${group.id}`, label: "Symptom Check-In", data: group });
    });

    return entries.sort((a, b) => a.mins - b.mins).map((e, i) => ({ ...e, key: `ev-${i}-${e.id}` }));
  }, [journals, checkIns, bulletins, tasks, symptomCheckIns, symptomMap, dayStart]);

  const getTopPx = useCallback((mins) => {
    return (mins / 60) * rowH;
  }, [rowH]);

  const getRangePx = useCallback((startMins, endMins) => {
    return getTopPx(endMins) - getTopPx(startMins);
  }, [getTopPx]);

  const totalHeight = 24 * rowH;

  const MIN_EMOTION_GAP = 22;
  const MIN_EVENT_GAP = 26;

  const emotionPositioned = useMemo(() => {
    let minNext = -Infinity;
    return emotionEntries.map((entry) => {
      const raw = getTopPx(entry.mins);
      const top = Math.max(raw, minNext);
      minNext = top + MIN_EMOTION_GAP;
      return { ...entry, adjustedTop: top };
    });
  }, [emotionEntries, getTopPx]);

  const eventPositioned = useMemo(() => {
    let minNext = -Infinity;
    return eventEntries.map((entry) => {
      const raw = getTopPx(entry.mins);
      const top = Math.max(raw, minNext);
      minNext = top + MIN_EVENT_GAP;
      return { ...entry, adjustedTop: top };
    });
  }, [eventEntries, getTopPx]);

  const sortedSymptomSessions = useMemo(() => {
    return [...symptomSessions].sort((a, b) => {
      if (a.is_active && !b.is_active) return -1;
      if (!a.is_active && b.is_active) return 1;
      return new Date(b.start_time) - new Date(a.start_time);
    });
  }, [symptomSessions]);

  const symptomColumns = useMemo(() => {
    const cols = [];
    const symptomIds = [...new Set(sortedSymptomSessions.map(s => s.symptom_id))];
    symptomIds.forEach(symptomId => {
      const segs = sortedSymptomSessions
        .filter(s => s.symptom_id === symptomId)
        .map(s => {
          const startMins = Math.max(0, minutesInDay(parseDate(s.start_time), dayStart));
          const endTime = s.end_time ? parseDate(s.end_time) : s.is_active && isToday ? new Date() : new Date(dayStart.getTime() + 24 * 60 * 60000 - 1);
          const endMins = Math.min(24 * 60, minutesInDay(endTime, dayStart));
          return { symptomId, startMins, endMins: Math.max(endMins, startMins + 8), sessionId: s.id };
        });
      let placed = false;
      for (const col of cols) {
        const conflicts = segs.some(seg =>
          col.some(existing => seg.startMins < existing.endMins && seg.endMins > existing.startMins)
        );
        if (!conflicts) { segs.forEach(seg => col.push(seg)); placed = true; break; }
      }
      if (!placed) cols.push([...segs]);
    });
    return cols;
  }, [sortedSymptomSessions, dayStart, isToday]);

  const numAlterCols = Math.max(1, alterColumns.length);
  const alterAreaWidth = numAlterCols * colWidths.alter;

  // Collapse empty columns to zero width
  const numActivityCols = showActivities && activityEntries.length > 0 ? Math.max(1, activityColumns.length) : 0;
  const activityAreaWidth = numActivityCols * colWidths.activity;

  const numSymptomCols = showSymptoms && symptomSessions.length > 0 ? Math.max(1, symptomColumns.length) : 0;
  const symptomAreaWidth = numSymptomCols * colWidths.symptom;

  const eventColWidth_actual = showCheckIns && eventEntries.length > 0 ? eventColWidth : 0;
  const emotionColWidth_actual = showEmotions && emotionEntries.length > 0 ? emotionColWidth : 0;

  // New column order: [time label | alters | symptoms | events | emotions | activities]
  const alterLeft = LABEL_WIDTH;
  const symptomLeft = alterLeft + alterAreaWidth;
  const eventColLeft = symptomLeft + symptomAreaWidth;
  const emotionColLeft = eventColLeft + eventColWidth_actual;
  const activityLeft = emotionColLeft + emotionColWidth_actual;
  const totalWidth = activityLeft + activityAreaWidth;
  const dateLabel = isToday ? "Today" : format(day, "EEEE, MMM d");

  const handleSplitSave = async (action, splitMins) => {
    if (!splitPopover) return;
    const { alter, session } = splitPopover;
    const splitTime = new Date(dayStart.getTime() + splitMins * 60 * 1000).toISOString();
    const isNewModel = !!session.alter_id;

    try {
      if (isNewModel) {
        // New individual model — each record is one alter
        if (action === "end") {
          // Simply end this alter's session at split time
          await base44.entities.FrontingSession.update(session.id, {
            end_time: splitTime,
            is_active: false,
          });
        } else if (action === "promote") {
          // End current session, create new with is_primary: true; demote any current primary
          await base44.entities.FrontingSession.update(session.id, { end_time: splitTime, is_active: false });
          // Find active sessions at split time to demote current primary
          const allActive = sessions.filter(s => s.is_active && s.alter_id && s.id !== session.id);
          const currentPrimary = allActive.find(s => s.is_primary);
          if (currentPrimary) {
            await base44.entities.FrontingSession.update(currentPrimary.id, { is_primary: false });
          }
          await base44.entities.FrontingSession.create({
            alter_id: alter.id,
            is_primary: true,
            start_time: splitTime,
            end_time: session.end_time || null,
            is_active: !session.end_time,
          });
        } else if (action === "demote") {
          await base44.entities.FrontingSession.update(session.id, { end_time: splitTime, is_active: false });
          await base44.entities.FrontingSession.create({
            alter_id: alter.id,
            is_primary: false,
            start_time: splitTime,
            end_time: session.end_time || null,
            is_active: !session.end_time,
          });
        }
      } else {
        // Legacy model fallback
        if (action === "end") {
          await base44.entities.FrontingSession.update(session.id, { end_time: splitTime, is_active: false });
          const others = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(id => id && id !== alter.id);
          if (others.length > 0) {
            await base44.entities.FrontingSession.create({
              primary_alter_id: others[0],
              co_fronter_ids: others.slice(1),
              start_time: splitTime,
              end_time: session.end_time || null,
              is_active: !session.end_time,
            });
          }
        } else {
          await base44.entities.FrontingSession.update(session.id, { end_time: splitTime, is_active: false });
          const newSession = {
            primary_alter_id: session.primary_alter_id,
            co_fronter_ids: session.co_fronter_ids || [],
            start_time: splitTime,
            end_time: session.end_time || null,
            is_active: !session.end_time,
          };
          if (action === "promote") {
            newSession.primary_alter_id = alter.id;
            newSession.co_fronter_ids = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(id => id && id !== alter.id);
          } else if (action === "demote") {
            const others = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(id => id && id !== alter.id);
            newSession.primary_alter_id = others[0] || null;
            newSession.co_fronter_ids = [...others.slice(1), alter.id];
          }
          await base44.entities.FrontingSession.create(newSession);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["frontHistory"], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ["activeFront"], refetchType: 'all' });
    } catch (err) {
      console.error("Split session failed", err);
    }
    setSplitPopover(null);
  };

  const handleNewSessionSave = async ({ startTime, endTime, alterId, asPrimary }) => {
    try {
      const startDate = new Date(dayStart);
      const [sh, sm] = startTime.split(":").map(Number);
      startDate.setHours(sh, sm, 0, 0);
      let endDate = null;
      if (endTime) {
        endDate = new Date(dayStart);
        const [eh, em] = endTime.split(":").map(Number);
        endDate.setHours(eh, em, 0, 0);
      }
      // New individual model
      await base44.entities.FrontingSession.create({
        alter_id: alterId,
        is_primary: asPrimary,
        start_time: startDate.toISOString(),
        end_time: endDate?.toISOString() || null,
        is_active: !endDate,
      });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ["activeFront"], refetchType: 'all' });
    } catch (err) {
      console.error("Create session failed", err);
    }
    setNewSessionPopover(null);
  };

  const startAreaLongPress = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    const y = clientY - rect.top;
    const scrollTop = e.currentTarget.closest(".overflow-y-auto")?.scrollTop || 0;
    const mins = Math.round(((y + scrollTop) / totalHeight) * 24 * 60 / 15) * 15;
    longPressTargetRef.current = setTimeout(() => {
      longPressTargetRef.current = null;
      setRetroPickerState({ startMins: Math.min(Math.max(0, mins), 1439) });
    }, 500);
  };
  const cancelAreaLongPress = () => {
    if (longPressTargetRef.current) { clearTimeout(longPressTargetRef.current); longPressTargetRef.current = null; }
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        style={{ userSelect: "none" }}
      >
        <div className="flex items-center gap-3">
          <span className={`font-semibold text-sm ${isToday ? "text-primary" : "text-foreground"}`}>{dateLabel}</span>
          {!hasData && <span className="text-xs text-muted-foreground">No data</span>}
          {hasData && (
            <div className="flex gap-2 text-xs text-muted-foreground">
              {sessions.length > 0 && <span>{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>}
              {activities.length > 0 && <span>{activities.length} activit{activities.length !== 1 ? "ies" : "y"}</span>}
              {emotions.length > 0 && <span>{emotions.length} check-in{emotions.length !== 1 ? "s" : ""}</span>}
              {journals.length > 0 && <span>{journals.length} journal{journals.length !== 1 ? "s" : ""}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {!collapsed && (
            <>
              <button onClick={() => setShowRowSlider(v => !v)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${showRowSlider ? "bg-primary/20 text-primary border-primary/40" : "bg-muted/50 text-muted-foreground border-border/50 hover:border-primary/30"}`}>
                ↕ Zoom
              </button>
              <button onClick={() => setShowTally(v => !v)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${showTally ? "bg-primary/20 text-primary border-primary/40" : "bg-muted/50 text-muted-foreground border-border/50 hover:border-primary/30"}`}>
                <BarChart3 className="w-3 h-3" />
                Tally
              </button>
            </>
          )}
          {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto border-t border-border">
          {showRowSlider && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40 bg-muted/10 text-xs">
              <span className="text-muted-foreground font-medium whitespace-nowrap">Row height</span>
              <input type="range" min={20} max={120} step={4} value={rowH}
                onChange={e => setRowH(Number(e.target.value))}
                className="w-28 accent-primary" />
              <span className="text-muted-foreground w-8">{rowH}px</span>
            </div>
          )}

          <div style={{ minWidth: totalWidth }}>
            <div className="flex border-b border-border/40 bg-muted/20 relative" style={{ minWidth: totalWidth }}>
              {/* Time label spacer */}
              <div style={{ width: LABEL_WIDTH }} className="flex-shrink-0" />
              {/* Alters — always shown */}
              <div className="text-center py-1 relative flex-shrink-0" style={{ width: alterAreaWidth }}>
                <Users className="w-3.5 h-3.5 inline" />
                <ResizeHandle onDrag={(d) => dragCol("alter", d / numAlterCols)} />
              </div>
              {/* Symptoms — only if data exists */}
              {numSymptomCols > 0 && (
                <div className="text-center py-1 relative flex-shrink-0" style={{ width: symptomAreaWidth }}>
                  <span className="text-xs text-muted-foreground opacity-60">⚡</span>
                  <ResizeHandle onDrag={(d) => dragCol("symptom", d / numSymptomCols)} />
                </div>
              )}
              {/* Events — only if data exists */}
              {eventColWidth_actual > 0 && (
                <div className="text-center py-1 relative flex-shrink-0" style={{ width: eventColWidth_actual }}>
                  <BookOpen className="w-3.5 h-3.5 inline" />
                  <ResizeHandle onDrag={(d) => dragCol("eventCol", d)} />
                </div>
              )}
              {/* Emotions — only if data exists */}
              {emotionColWidth_actual > 0 && (
                <div className="text-center py-1 relative flex-shrink-0" style={{ width: emotionColWidth_actual }}>
                  <Heart className="w-3.5 h-3.5 inline" />
                  <ResizeHandle onDrag={(d) => dragCol("emotionCol", d)} />
                </div>
              )}
              {/* Activities — only if data exists */}
              {numActivityCols > 0 && (
                <div className="text-center py-1 relative flex-shrink-0" style={{ width: activityAreaWidth }}>
                  <Activity className="w-3.5 h-3.5 inline" />
                  <ResizeHandle onDrag={(d) => dragCol("activity", d / numActivityCols)} />
                </div>
              )}
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
              <div className="relative" style={{ height: totalHeight, minWidth: totalWidth }}
                onMouseDown={startAreaLongPress} onMouseUp={cancelAreaLongPress} onMouseLeave={cancelAreaLongPress}
                onTouchStart={startAreaLongPress} onTouchEnd={cancelAreaLongPress}>

                {HOURS.map((h) => {
                  const top = getTopPx(h * 60);
                  const isCurrentHour = isToday && Math.floor(nowMins / 60) === h;
                  return (
                    <div key={h} className="absolute flex items-start"
                      style={{ top, height: rowH, left: 0, right: 0 }}>
                      {/* Current-hour highlight */}
                      {isCurrentHour && (
                        <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
                      )}
                      <div className="flex-shrink-0 text-xs text-muted-foreground pt-1 pr-1 text-right" style={{ width: LABEL_WIDTH }}>
                        {format(new Date(dayStart.getTime() + h * 3600000), "h a")}
                      </div>
                      <div className="flex-1 border-t border-border/30 mt-2" />
                    </div>
                  );
                })}

                {/* Now line — only on today */}
                {isToday && (() => {
                  const nowTop = getTopPx(nowMins);
                  return (
                    <div className="absolute pointer-events-none z-20"
                      style={{ top: nowTop, left: 0, right: 0 }}>
                      <div className="relative flex items-center">
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 -ml-1" />
                        <div className="flex-1 h-px bg-primary opacity-70" />
                      </div>
                    </div>
                  );
                })()}

                {numActivityCols > 0 && activityColumns.map((col, colIdx) => (
                  <div key={`acol-${colIdx}`} className="absolute"
                    style={{ left: activityLeft + colIdx * colWidths.activity, top: 0, width: colWidths.activity, height: totalHeight }}>
                    {col.map((entry) => {
                     const topPx = getTopPx(entry.startMins);
                     const heightPx = getRangePx(entry.startMins, entry.endMins);
                     const dateStr = format(day, "yyyy-MM-dd");
                     const timeStr = formatMins(entry.startMins);
                     return (
                       <ActivityBar
                         key={entry.key}
                         activityName={entry.displayName}
                         color={entry.categoryColor || "hsl(var(--primary))"}
                         mergedCount={entry.mergedCount}
                         topPx={topPx}
                         heightPx={heightPx}
                         notes={entry.activity.notes}
                         timeStr={timeStr}
                         onTap={() => setDetailPopup({ type: "activity", entry })}
                         onDoubleTap={() => navigate(`/activities?date=${dateStr}&highlight=${entry.activity.id}`)}
                       />
                     );
                    })}
                  </div>
                ))}

                {/* Divider: time label | alters */}
                <div className="absolute top-0 bottom-0 border-l border-border/40 pointer-events-none"
                  style={{ left: LABEL_WIDTH, height: totalHeight }} />
                {numSymptomCols > 0 && (
                  <div className="absolute top-0 bottom-0 border-l border-border/20 pointer-events-none"
                    style={{ left: symptomLeft, height: totalHeight }} />
                )}
                {eventColWidth_actual > 0 && (
                  <div className="absolute top-0 bottom-0 border-l border-border/30 pointer-events-none"
                    style={{ left: eventColLeft, height: totalHeight }} />
                )}
                {emotionColWidth_actual > 0 && (
                  <div className="absolute top-0 bottom-0 border-l border-border/20 pointer-events-none"
                    style={{ left: emotionColLeft, height: totalHeight }} />
                )}
                {numActivityCols > 0 && (
                  <div className="absolute top-0 bottom-0 border-l border-border/20 pointer-events-none"
                    style={{ left: activityLeft, height: totalHeight }} />
                )}

                {showSymptoms && symptomColumns.map((col, colIdx) => (
                  <div key={`scol-${colIdx}`} className="absolute"
                    style={{ left: symptomLeft + colIdx * colWidths.symptom, top: 0, width: colWidths.symptom, height: totalHeight, zIndex: 5 }}>
                    {col.map((entry, i) => {
                       const session = symptomSessions.find(s => s.id === entry.sessionId);
                       const symptom = symptomMap[entry.symptomId];
                       const topPx = getTopPx(entry.startMins);
                       const heightPx = getRangePx(entry.startMins, entry.endMins);
                       const barKey = `sbar-${entry.sessionId}-${i}`;
                       return (
                         <SymptomBar
                           key={barKey}
                           symptom={symptom}
                           session={session}
                           topPx={topPx}
                           heightPx={heightPx}
                           rowH={rowH}
                           expanded={false}
                           onTap={() => setSymptomDetailModal({ session, symptom })}
                           onLongPress={() => setSymptomDetailModal({ session, symptom })}
                           onDoubleTap={() => setSymptomSessionPopover({ session, symptom, splitMins: entry.startMins })}
                         />
                       );
                     })}
                  </div>
                ))}



                {eventColWidth_actual > 0 && (
                  <div className="absolute" style={{ left: eventColLeft, top: 0, width: eventColWidth_actual, height: totalHeight }}>
                    {eventPositioned.map((entry) => (
                      <EventEntry
                        key={entry.key}
                        entry={entry}
                        topPx={entry.adjustedTop}
                        colWidth={eventColWidth}
                        onTap={() => setDetailPopup({ type: "event", entry })}
                        onDoubleTap={() => {
                          if (entry.type === "journal") navigate(`/journals?id=${entry.id}`);
                          else if (entry.type === "checkin") navigate(`/system-checkin?id=${entry.id}`);
                          else if (entry.type === "bulletin") navigate(`/`);
                          else if (entry.type === "task") navigate(`/todo`);
                          else if (entry.type === "symptom_checkin") navigate(`/diary`);
                        }}
                      />
                    ))}
                  </div>
                )}

                {emotionColWidth_actual > 0 && (
                  <div className="absolute" style={{ left: emotionColLeft, top: 0, width: emotionColWidth_actual, height: totalHeight }}>
                    {emotionPositioned.map((entry) => (
                      <EmotionBubble
                        key={entry.key}
                        entry={entry}
                        topPx={entry.adjustedTop}
                        colWidth={emotionColWidth_actual}
                        onTap={() => setDetailPopup({ type: "emotion", entry })}
                        onDoubleTap={() => navigate(`/checkin-log?id=${entry.id}`)}
                      />
                    ))}
                  </div>
                )}

                <div
                  className="absolute"
                  style={{ left: alterLeft, top: 0, width: alterAreaWidth, height: totalHeight, zIndex: 1 }}
                >
                  {alterColumns.map((col, colIdx) => (
                    <div key={`col-${colIdx}`} className="absolute"
                      style={{ left: colIdx * colWidths.alter, top: 0, width: colWidths.alter, height: totalHeight }}>
                      {col.map((entry) => {
                        const alter = alters.find((a) => a.id === entry.alterId);
                        const color = alter?.color || "#9333ea";
                        const topPx = getTopPx(entry.startMins);
                        const heightPx = getRangePx(entry.startMins, entry.endMins);
                        const entrySession = sessions.find(s => s.id === entry.sessionId);
                        return (
                          <AlterBar
                            key={entry.key}
                            alter={alter}
                            color={color}
                            topPx={topPx}
                            heightPx={heightPx}
                            isPrimary={entry.isPrimary}
                            rowH={rowH}
                            onTap={() => entrySession && setSessionPopover({ session: entrySession, alter })}
                            onDoubleTap={() => entrySession && setEditingSession({ session: entrySession, alter })}
                            onLongPress={(clientY) => {
                              if (!entrySession) return;
                              const gridEl = document.querySelector(".overflow-y-auto");
                              const gridRect = gridEl?.getBoundingClientRect();
                              const scrollTop = gridEl?.scrollTop || 0;
                              const relY = clientY - (gridRect?.top || 0) + scrollTop;
                              const pressedMins = Math.round((relY / totalHeight) * 24 * 60 / 5) * 5;
                              const clampedMins = Math.min(Math.max(pressedMins, entry.startMins), entry.endMins);
                              setSplitPopover({ alter, session: entrySession, splitMins: clampedMins });
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>

                {/* Legacy session notes */}
                {sessions.flatMap((session) => {

                  if (!session.note) return [];
                  let notes = [];
                  try {
                    const parsed = JSON.parse(session.note);
                    notes = Array.isArray(parsed) ? parsed : [{ text: session.note, timestamp: session.start_time }];
                  } catch {
                    notes = [{ text: session.note, timestamp: session.start_time }];
                  }
                  return notes.map((sn, i) => {
                    const mins = Math.max(0, minutesInDay(parseDate(sn.timestamp), dayStart));
                    const topPx = getTopPx(mins);
                    return (
                      <div key={`note-${session.id}-${i}`} className="absolute"
                        style={{ left: Math.max(0, alterLeft - 20), right: 0, top: 0, height: totalHeight }}>
                        <StatusNoteBadge note={sn.text} topPx={topPx} />
                      </div>
                    );
                  });
                })}



              </div>
            </div>
          </div>
        </div>
      )}

      {!collapsed && showTally && (
        <DailyTallyPanel
          day={day} sessions={sessions} activities={activities} emotions={emotions}
          journals={journals} checkIns={checkIns} tasks={tasks} alters={alters}
          symptoms={symptoms} symptomSessions={symptomSessions}
        />
      )}

      {sessionPopover && !editingSession && (
        <AlterSessionInfo
          session={sessionPopover.session}
          alter={sessionPopover.alter}
          onClose={() => setSessionPopover(null)}
          onEdit={() => { setEditingSession(sessionPopover); setSessionPopover(null); }}
        />
      )}

      {editingSession && (
        <AlterSessionEdit
          session={editingSession.session}
          alter={editingSession.alter}
          onClose={() => setEditingSession(null)}
        />
      )}

      {splitPopover && (
        <SessionSplitPopup
          alter={splitPopover.alter}
          session={splitPopover.session}
          splitMins={splitPopover.splitMins}
          onClose={() => setSplitPopover(null)}
          onSave={handleSplitSave}
        />
      )}

      {newSessionPopover && (
        <NewSessionPopup
          startMins={newSessionPopover.startMins}
          dayStart={dayStart}
          alters={alters}
          onClose={() => setNewSessionPopover(null)}
          onSave={handleNewSessionSave}
        />
      )}

      {symptomSessionPopover && (
        <SymptomSessionPopup
          symptom={symptomSessionPopover.symptom}
          session={symptomSessionPopover.session}
          onClose={() => setSymptomSessionPopover(null)}
          onSave={() => {}}
        />
      )}

      {symptomDetailModal && (
        <SymptomDetailModal
          symptom={symptomDetailModal.symptom}
          session={symptomDetailModal.session}
          onClose={() => setSymptomDetailModal(null)}
        />
      )}

      {retroPickerState && (
        <RetroEntryPicker
          startMins={retroPickerState.startMins}
          onFrontSession={() => { setNewSessionPopover({ startMins: retroPickerState.startMins }); setRetroPickerState(null); }}
          onCheckIn={() => { setRetroCheckIn({ startMins: retroPickerState.startMins }); setRetroPickerState(null); }}
          onClose={() => setRetroPickerState(null)}
        />
      )}

      {retroCheckIn && (() => {
        const d = new Date(dayStart);
        d.setHours(Math.floor(retroCheckIn.startMins / 60), retroCheckIn.startMins % 60, 0, 0);
        return (
          <QuickCheckInModal
            isOpen={true}
            onClose={() => setRetroCheckIn(null)}
            alters={alters}
            retroTimestamp={d.toISOString()}
          />
        );
      })()}

      {detailPopup?.type === "activity" && (() => {
        const { entry } = detailPopup;
        const color = entry.categoryColor || "hsl(var(--primary))";
        return (
          <DetailPopup icon="🏃" timeStr={formatMins(entry.startMins)} onClose={() => setDetailPopup(null)}>
            <p className="text-sm font-semibold" style={{ color }}>{entry.displayName}</p>
            {entry.mergedCount > 1 && <p className="text-xs text-muted-foreground mt-1">{entry.mergedCount} instances</p>}
            {entry.activity.notes && <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">{entry.activity.notes}</p>}
            {!entry.activity.notes && entry.mergedCount <= 1 && <p className="text-xs text-muted-foreground mt-1 italic">No notes</p>}
          </DetailPopup>
        );
      })()}

      {detailPopup?.type === "emotion" && (() => {
        const { entry } = detailPopup;
        const emotions = entry.data.emotions || [];
        const note = entry.data.note;
        const timeStr = `${String(Math.floor(entry.mins / 60)).padStart(2, '0')}:${String(entry.mins % 60).padStart(2, '0')}`;
        return (
          <DetailPopup icon="💭" timeStr={timeStr} onClose={() => setDetailPopup(null)}>
            {emotions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {emotions.map((em) => (
                  <span key={em} className="px-2 py-0.5 rounded-full text-white text-xs font-medium"
                    style={{ backgroundColor: emotionColor(em) }}>{em}</span>
                ))}
              </div>
            )}
            {note && <p className="text-sm text-foreground whitespace-pre-wrap">{note}</p>}
            {emotions.length === 0 && !note && <p className="text-xs text-muted-foreground italic">No details</p>}
          </DetailPopup>
        );
      })()}

      {detailPopup?.type === "event" && (() => {
        const { entry } = detailPopup;
        const meta = TYPE_META[entry.type] || { icon: "•" };
        const timeStr = `${String(Math.floor(entry.mins / 60)).padStart(2, '0')}:${String(entry.mins % 60).padStart(2, '0')}`;
        return (
          <DetailPopup icon={meta.icon} timeStr={timeStr} onClose={() => setDetailPopup(null)}>
            {entry.type === "journal" && <p className="text-sm font-semibold">{entry.label}</p>}
            {entry.type === "checkin" && <p className="text-sm font-semibold">System Check-In</p>}
            {entry.type === "bulletin" && <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-6">{entry.data.content}</p>}
            {(entry.type === "task" || entry.type === "task_done") && <p className="text-sm font-semibold">{entry.label}</p>}
            {entry.type === "symptom_checkin" && (
              <div className="space-y-1">
                {(entry.data.items || []).map(({ symptom, checkIn }, i) => (
                  <p key={i} className="text-sm" style={{ color: symptom?.color || "#8b5cf6" }}>
                    {symptom?.label || "?"}{checkIn.severity != null ? ` · severity ${checkIn.severity}` : ""}
                  </p>
                ))}
              </div>
            )}
          </DetailPopup>
        );
      })()}
    </div>
  );
}