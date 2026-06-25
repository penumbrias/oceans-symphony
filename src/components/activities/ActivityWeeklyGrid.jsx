import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { parseDate } from "@/lib/dateUtils";
import { datesForDay } from "@/lib/importantDates";
import { Plus, Eye, EyeOff, Settings, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// Resolve legacy local-image:// avatars before rendering (raw <img src> on
// those renders broken). Used inside the grid's many alter-chip .map()s, so it
// must be a child component. `fallback` is each call site's exact initial-letter
// node; `alt` keeps each <img>'s original alt text.
function GridAlterImg({ alter, alt, fallback }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  return resolved
    ? <img src={resolved} alt={alt} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
    : fallback;
}

const LS_ROW_H      = "symphony_act_row_h";
const LS_COL_W      = "symphony_act_col_w";
const LS_INTERVAL   = "symphony_act_interval";
const LS_WEEK_START = "symphony_act_week_start";
const LS_TIME_FMT   = "symphony_act_time_fmt";
const LS_TICK_MODE  = "symphony_act_tick_mode";

// Default column width that fits all 7 days within the current viewport
// (minus the fixed time-label column and a little chrome). Falls back to a
// reasonable middle value when window is unavailable.
function defaultColWidth() {
  if (typeof window === 'undefined') return 60;
  const TIME_COL_ESTIMATE = 56;
  const CHROME_ESTIMATE = 16;
  return Math.max(40, Math.min(110, Math.floor((window.innerWidth - TIME_COL_ESTIMATE - CHROME_ESTIMATE) / 7)));
}

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

const HEADER_H = 56;
// Each quick-plan pill in the day-header band is ~20 px tall (text +
// padding + border). The band height is `maxQuickPlans * QUICK_PLAN_PILL_H`
// across the visible week, capped so a day with a huge backlog doesn't
// push the time grid off-screen — past that cap, taps on a pill open
// the full-day quick-plan popup which lists every pill.
const QUICK_PLAN_PILL_H = 20;
const QUICK_PLANS_CAP = 4;
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

import { emotionColor, getActivityColor as _getActivityColor, getActivitiesForSlot as _getActivitiesForSlot, getAlterIdsForSlot as _getAlterIdsForSlot, getEmotionsForSlot as _getEmotionsForSlot } from "./activityHelpers";
import { statusFor, visualForStatus, isPastTimeScheduled, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { useNavigate } from "react-router-dom";
import ActivityLifecyclePopover from "./ActivityLifecyclePopover";
import ActivityDetailsModal from "./ActivityDetailsModal";

// Quick-plan row with tap vs press-and-hold gestures. Tap opens the
// Activity Details modal (mark done / edit / delete affordances);
// long-press jumps straight to the Manage Plan lifecycle popover.
function QuickPlanRow({ activity, getActivityColor, onTap, onLongPress }) {
  const color = getActivityColor(activity) || "hsl(var(--primary))";
  const st = statusFor(activity);
  const v = visualForStatus(st);
  const timerRef = useRef(null);
  const heldRef = useRef(false);
  const startPress = () => {
    heldRef.current = false;
    clearTimeout(timerRef.current);
    // heldRef flips true ONLY when the long-press actually fires;
    // pointerleave / pointercancel can fire after pointerup on
    // mobile (or on a 1px cursor wobble on desktop) and used to
    // incorrectly mark the gesture as held, which then blocked the
    // click handler from invoking onTap — the entire "tap to open
    // details" interaction was silently swallowed.
    timerRef.current = setTimeout(() => { heldRef.current = true; onLongPress(); }, 500);
  };
  const cancelPress = () => {
    clearTimeout(timerRef.current);
  };
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return (
    <button
      type="button"
      onClick={() => { if (!heldRef.current) onTap(); }}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 bg-card hover:bg-muted/40 text-left transition-colors"
    >
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: v.dashed ? "transparent" : color,
          border: v.dashed ? `1px dashed ${color}` : undefined,
        }}
      />
      <span
        className="flex-1 text-sm break-words"
        style={{ textDecoration: v.strike ? "line-through" : undefined }}
      >
        {activity.activity_name || "Quick plan"}
      </span>
      {v.corner && (
        <span className="text-xs font-bold flex-shrink-0" style={{ color }}>{v.corner}</span>
      )}
    </button>
  );
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
  onDayClick,
  onEditPlan,
  importantDates = [],
}) {
  const [rowH,         setRowH]         = useState(() => lsGet(LS_ROW_H,      40));
  const [colW,         setColW]         = useState(() => lsGet(LS_COL_W,      defaultColWidth()));
  const [gridInterval, setGridInterval] = useState(() => lsGet(LS_INTERVAL,   60));
  const [weekStartsOn, setWeekStartsOn] = useState(() => lsGet(LS_WEEK_START, 0));
  const [timeFmt,      setTimeFmt]      = useState(() => lsGet(LS_TIME_FMT,   "24"));
  const [tickMode,     setTickMode]     = useState(() => lsGet(LS_TICK_MODE,  "auto"));

  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [showAlters,     setShowAlters]     = useState(false);
  const [showEmotions,   setShowEmotions]   = useState(false);
  const [showSettings,   setShowSettings]   = useState(false);
  // Quick plans (date-only plans) overlay as pills. Persist the
  // visibility toggle so the user's preference survives reloads.
  const [showQuickPlans, setShowQuickPlans] = useState(() => lsGet("symphony_act_quick_plans", true));
  useEffect(() => { lsSet("symphony_act_quick_plans", showQuickPlans); }, [showQuickPlans]);
  const [pendingStart,   setPendingStart]   = useState(null);
  const [hoveredCell,    setHoveredCell]    = useState(null);
  // Long-press-drag selection state. When the user holds an empty
  // cell for 500ms, we enter dragSelect mode: pendingStart is set
  // to the starting cell and dragSelectEnd tracks whichever cell
  // the finger is currently over via elementFromPoint. On release
  // we fire onTimeRangeSelect with start → end (or just the start
  // cell if the user never moved).
  const [dragSelectEnd, setDragSelectEnd] = useState(null);
  const dragSelectActiveRef = useRef(false);
  // State mirror of the ref so the grid wrapper can re-render with
  // `touch-action: none` the instant long-press fires. Refs don't
  // trigger a render, so a ref alone leaves the browser free to
  // engage its own pan-scroll gesture during the drag.
  const [dragSelectActive, setDragSelectActive] = useState(false);
  // Pinch-to-zoom row-height state. Tracks the initial touch
  // distance and rowH so we can scale proportionally on subsequent
  // touchmoves. The active touchmove listener is attached natively
  // (via useEffect below) with { passive: false } so preventDefault
  // actually stops the browser's page-zoom gesture from fighting
  // ours — React's synthetic touchmove is passive by default, and a
  // passive preventDefault is silently ignored, which is what made
  // this gesture feel sluggish vs. the timeline's snappy one.
  const pinchStartRef = useRef(null);
  const pinchActiveRef = useRef(false);
  // Coalesce pinch row-height updates to one per animation frame.
  // Touch sampling on high-refresh screens fires far faster than the
  // display refresh; without this, every sample triggered a full grid
  // re-render and the gesture lagged badly ("super slow to render").
  const pinchRafRef = useRef(null);
  const pinchPendingRef = useRef(null);
  const gridRef = useRef(null);
  const rowHRef = useRef(rowH);
  useEffect(() => { rowHRef.current = rowH; }, [rowH]);
  const lastTapRef     = useRef({ key: "", time: 0 });
  const tooltipTimerRef = useRef(null);
  // Long-press detection for opening the lifecycle popover. We track the
  // press target separately from the cell-tap state — a real "long press"
  // is anchored to a single activity chip, not the slot the chip happens
  // to live in.
  const longPressTimerRef = useRef(null);
  const longPressFiredRef = useRef(false);
  // Touchstart coordinates so the long-press timer can be cancelled
  // only when the finger actually moves a meaningful distance — tiny
  // jitter shouldn't kill the press (otherwise drag-select is almost
  // impossible to trigger on a real touchscreen).
  const touchStartPosRef = useRef(null);
  const TOUCH_SLOP_PX = 10;
  const [lifecycleActivity, setLifecycleActivity] = useState(null);
  // Set when a quick-plan chip in the day popup is tapped (not held).
  // Tap → Activity Details (lets the user mark done / edit / delete).
  // Long-press → skip details and jump straight to Manage Plan.
  const [detailsActivity, setDetailsActivity] = useState(null);
  // Popup that lists every quick plan for a single day, with full
  // (un-truncated) names. Triggered by double-tap on a quick-plan
  // pill — a single tap still navigates to the day view, double-tap
  // is the "view in full" affordance. From the popup, tapping a row
  // opens the same ActivityLifecyclePopover that timed plans use.
  const [quickPlanDayPopup, setQuickPlanDayPopup] = useState(null);
  const quickPlanTapRef = useRef({ id: null, time: 0 });

  useEffect(() => { lsSet(LS_ROW_H,      rowH);         }, [rowH]);
  useEffect(() => { lsSet(LS_COL_W,      colW);         }, [colW]);

  // Pinch-to-zoom — native listener with { passive: false } so
  // preventDefault on touchmove actually stops the browser's page
  // pan/zoom from competing with our row-height resize. The previous
  // implementation used React's onTouchMove prop, which is passive
  // by default; preventDefault was silently ignored and the
  // browser's own gesture handling added the perceived lag the user
  // reported ("drag to zoom on the activity tracker is so slow to
  // respond, it's quick on the timeline though"). Mirrors the
  // canonical pattern in InfiniteTimeline.jsx.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        const [a, b] = e.touches;
        pinchStartRef.current = {
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          startRowH: rowHRef.current,
        };
        pinchActiveRef.current = true;
      }
    };
    const commitPinch = () => {
      pinchRafRef.current = null;
      if (pinchPendingRef.current != null) {
        setRowH(pinchPendingRef.current);
        pinchPendingRef.current = null;
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinchStartRef.current) {
        const [a, b] = e.touches;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const ratio = dist / pinchStartRef.current.dist;
        const next = Math.round(Math.max(6, Math.min(80, pinchStartRef.current.startRowH * ratio)));
        // Stash the target and let one rAF commit it — multiple touch
        // samples within a frame collapse into a single re-render. Skip
        // when the rounded value hasn't changed.
        if (next !== rowHRef.current && next !== pinchPendingRef.current) {
          pinchPendingRef.current = next;
          if (pinchRafRef.current == null) pinchRafRef.current = requestAnimationFrame(commitPinch);
        }
        e.preventDefault();
      }
    };
    const onTouchEnd = (e) => {
      if (e.touches.length < 2) {
        pinchStartRef.current = null;
        pinchActiveRef.current = false;
        // Flush the last pending value so the final size sticks even if
        // the gesture ended between frames.
        if (pinchRafRef.current != null) { cancelAnimationFrame(pinchRafRef.current); pinchRafRef.current = null; }
        if (pinchPendingRef.current != null) { setRowH(pinchPendingRef.current); pinchPendingRef.current = null; }
      }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      if (pinchRafRef.current != null) { cancelAnimationFrame(pinchRafRef.current); pinchRafRef.current = null; }
    };
  }, []);

  useEffect(() => { lsSet(LS_INTERVAL,   gridInterval); }, [gridInterval]);
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
      for (let m = 0; m < 60; m += gridInterval) {
        s.push({ hour: h, minute: m });
      }
    });
    return s;
  }, [gridInterval]);

  // Changing the interval scales the row height inversely so the
  // ONE-HOUR demarcations keep their pixel position. Going 1h → 30m
  // doubles the rows-per-hour, so each row halves; 30m → 15m halves
  // again; 15m → 1h quadruples. Clamped to the slider's [6,80] range
  // (exact hour alignment can drift slightly at the clamp edges,
  // which is fine).
  const changeInterval = useCallback((newIv) => {
    setRowH((prev) => {
      const scaled = Math.round(prev * (newIv / gridInterval));
      return Math.max(6, Math.min(80, scaled));
    });
    setGridInterval(newIv);
  }, [gridInterval]);

  // The horizontal line at the BOTTOM of a slot row sits at the slot's
  // end time. Style it by what kind of boundary that is: a full hour
  // (solid, full opacity), a half hour (solid, 50%), or a quarter
  // (dashed, 50%). At the 1h interval every line is an hour line.
  // Returned as an inline `borderBottom` so ONLY the bottom edge is
  // affected — the vertical day-separator (border-r) stays solid and
  // at its own opacity. Matches the Tailwind border colour
  // (var(--color-muted)).
  const slotBottomBorderStyle = useCallback((minute) => {
    const endMin = (minute + gridInterval) % 60;
    if (endMin === 0) return { borderBottom: "1px solid var(--color-muted)" };
    if (endMin === 30) return { borderBottom: "1px solid color-mix(in srgb, var(--color-muted) 50%, transparent)" };
    return { borderBottom: "1px dashed color-mix(in srgb, var(--color-muted) 50%, transparent)" };
  }, [gridInterval]);

  // Quick plans live in the day-header band so they don't paint on top
  // of activities in the time grid. The band is tall enough to fit the
  // most-loaded day in the visible week (capped). Recomputed on every
  // activities change.
  const quickByDay = useMemo(() => {
    const m = new Map();
    for (const a of activities) {
      if (!a.is_quick_plan) continue;
      const st = statusFor(a);
      if (st === ACTIVITY_STATUSES.CANCELLED || st === ACTIVITY_STATUSES.SKIPPED) continue;
      const dayKey = format(parseDate(a.timestamp), "yyyy-MM-dd");
      if (!m.has(dayKey)) m.set(dayKey, []);
      m.get(dayKey).push(a);
    }
    return m;
  }, [activities]);
  const maxQuickPlansThisWeek = useMemo(() => {
    let max = 0;
    for (const d of weekDays) {
      const list = quickByDay.get(format(d, "yyyy-MM-dd")) || [];
      max = Math.max(max, list.length);
    }
    return max;
  }, [weekDays, quickByDay]);
  const quickPlansBandH = showQuickPlans && maxQuickPlansThisWeek > 0
    ? Math.min(maxQuickPlansThisWeek, QUICK_PLANS_CAP) * QUICK_PLAN_PILL_H + 4
    : 0;
  // Top y-coordinate of the time grid inside the right-hand scroll area.
  // Used by every absolute-positioned element that previously anchored
  // to HEADER_H.
  const gridTopY = HEADER_H + quickPlansBandH;

  const getActivityColor = useCallback((act) => _getActivityColor(act, catById), [catById]);
  const getActivitiesForSlot = useCallback((date, hour, minute) => _getActivitiesForSlot(date, hour, minute, gridInterval, activities), [activities, gridInterval]);
  const getAlterIdsForSlot = useCallback((date, hour, minute) => _getAlterIdsForSlot(date, hour, minute, gridInterval, frontingHistory), [frontingHistory, gridInterval]);
  const getEmotionsForSlot = useCallback((date, hour, minute) => _getEmotionsForSlot(date, hour, minute, gridInterval, activities, emotionCheckIns), [emotionCheckIns, activities, gridInterval]);

  const isFirstSlotForActivity = useCallback((act, date, hour, minute) => {
    const actStart = parseDate(act.timestamp);
    const slotStart = new Date(date);
    slotStart.setHours(hour, minute, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + gridInterval * 60 * 1000);
    return actStart >= slotStart && actStart < slotEnd;
  }, [gridInterval]);

  const isLastSlotForActivity = useCallback((act, date, hour, minute) => {
    const actEnd = new Date(parseDate(act.timestamp).getTime() + act.duration_minutes * 60 * 1000);
    const slotEnd = new Date(date);
    slotEnd.setHours(hour, minute, 0, 0);
    slotEnd.setTime(slotEnd.getTime() + gridInterval * 60 * 1000);
    return actEnd <= slotEnd;
  }, [gridInterval]);

  const getDayStats = useCallback((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const dayActs = activities.filter(a => format(parseDate(a.timestamp), "yyyy-MM-dd") === dateStr);
    return {
      count: dayActs.length,
      duration: dayActs.reduce((s, a) => s + (a.duration_minutes || 0), 0),
    };
  }, [activities]);

  const slotKey = (date, hour, minute) => `${format(date, "yyyy-MM-dd")}-${hour}-${minute}`;

  const handleCellTap = useCallback((date, hour, minute, e) => {
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
  const startDateStr = format(pendingStart.date, "yyyy-MM-dd");
  const endDateStr = format(date, "yyyy-MM-dd");
  const isDifferentDay = startDateStr !== endDateStr;

  if (isDifferentDay) {
    // Cross-day: always treat pendingStart as start, current cell as end
    onTimeRangeSelect(
      pendingStart.date,
      pendingStart.hour,
      hour,
      pendingStart.minute,
      minute,
      date  // endDate
    );
  } else {
    const isForward = startH <= endH;
    onTimeRangeSelect(
      pendingStart.date,
      isForward ? pendingStart.hour : hour,
      isForward ? hour : pendingStart.hour,
      isForward ? pendingStart.minute : minute,
      isForward ? minute : pendingStart.minute,
      pendingStart.date  // endDate = same day
    );
  }
  setPendingStart(null);
}
  }
}
    if (addMode) return;
    // Single-tap on a cell that has anything to show (activities,
    // emotions, or fronting alters) pins the translucent info popover
    // at the tap point. Tapping a row inside it opens details; tapping
    // the same cell again, or the backdrop, dismisses it. Empty cells
    // do nothing on single tap. (On touch there's no hover, so this tap
    // is the only way to reach the popover.)
    const alterIds = getAlterIdsForSlot(date, hour, minute);
    const emotions = getEmotionsForSlot(date, hour, minute);
    if (allActs.length === 0 && alterIds.length === 0 && emotions.length === 0) return;
    const px = e?.clientX, py = e?.clientY;
    const position = (px != null && py != null)
      ? { x: Math.min(px + 10, window.innerWidth - 300), y: Math.min(py + 10, window.innerHeight - 200) }
      : { x: 16, y: 140 };
    setHoveredCell(prev =>
      prev && prev.key === key && prev.pinned
        ? null
        : { key, date, hour, minute, position, pinned: true }
    );
  }, [addMode, pendingStart, getActivitiesForSlot, getAlterIdsForSlot, getEmotionsForSlot, onTimeRangeSelect, onActivityClick, onToggleAddMode]);

  const handleToggleAddMode = () => { setPendingStart(null); onToggleAddMode?.(); };
  const handleSetWeekStart = (val) => { setWeekStartsOn(val); onWeekStartChange?.(val); };

  const clampTooltipPos = useCallback((x, y) => {
    return {
      x: Math.min(x + 10, window.innerWidth - 300),
      y: Math.min(y + 10, window.innerHeight - 200),
    };
  }, []);

  const handleCellMouseEnter = useCallback((e, date, hour, minute) => {
    const key = slotKey(date, hour, minute);
    const pos = clampTooltipPos(e.clientX, e.clientY);
    // Hover-shown popovers are transient (pinned:false) — they clear on
    // mouse-leave. A tap-pinned popover (pinned:true) is left alone so a
    // stray hover doesn't replace what the user explicitly opened.
    setHoveredCell(prev => (prev && prev.pinned) ? prev : { key, date, hour, minute, position: pos, pinned: false });
  }, [clampTooltipPos]);

  const handleCellMouseLeave = useCallback(() => {
    setHoveredCell(prev => (prev && prev.pinned) ? prev : null);
  }, []);

  // On touch we only record the start position (for long-press slop
  // detection). The info popover is opened by the trailing tap via
  // handleCellTap — not a hold-timer, which used to collide with the
  // 500 ms long-press and was cleared the instant the finger lifted.
  const handleCellTouchStart = useCallback((e, date, hour, minute) => {
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleCellTouchEnd = useCallback(() => {
    if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null; }
    touchStartPosRef.current = null;
  }, []);

  // Returns true when the touch has moved past the slop threshold —
  // used by cell onTouchMove to decide whether to cancel a long-press
  // timer. Finger jitter inside ~10 px shouldn't kill the press.
  const touchMovedBeyondSlop = useCallback((e) => {
    const start = touchStartPosRef.current;
    if (!start) return false;
    const t = e.touches?.[0];
    if (!t) return false;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    return (dx * dx + dy * dy) > (TOUCH_SLOP_PX * TOUCH_SLOP_PX);
  }, []);

  // Long-press to open the lifecycle popover. We only arm it when the
  // cell actually has an activity to act on. If a long-press fires, we
  // also set `longPressFiredRef` so the trailing click doesn't double-
  // fire as a normal cell tap.
  const startLongPress = useCallback((date, hour, minute) => {
    const { timed, logged } = getActivitiesForSlot(date, hour, minute);
    const real = [...timed, ...logged].filter(a => !a._isTask);
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressFiredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      if (navigator.vibrate) try { navigator.vibrate(20); } catch {}
      if (real.length > 0) {
        // Cell has an activity → existing behaviour: open lifecycle
        // popover on the first activity.
        setLifecycleActivity(real[0]);
      } else {
        // Cell is empty → enter long-press-drag selection mode:
        // start cell is this one, drag end will follow the finger
        // via pointermove until release.
        //
        // We deliberately do NOT enable addMode here even though the
        // two-tap fallback uses it. Toggling addMode mid-press renders
        // the "Cancel selection" pill + "Start: HH:00" banner above
        // the grid, which pushes the cell under the finger downward —
        // the user's finger ends up over a different cell from the
        // one they pressed, and the drag-select interprets that as
        // an instant cross-cell drag. We turn addMode on only on
        // release, and only in the no-drag case (so the user can tap
        // an end cell using the existing two-tap flow).
        setPendingStart({ date, hour, minute });
        setDragSelectEnd({ date, hour, minute });
        dragSelectActiveRef.current = true;
        setDragSelectActive(true);
      }
    }, 500);
  }, [getActivitiesForSlot, addMode, onToggleAddMode]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Inline cell <-> info lookup keyed by `slotKey`. Set via data
  // attribute on each cell so elementFromPoint can resolve which
  // cell a touch is currently over during a drag-select.
  const cellInfoRef = useRef(new Map());
  const registerCellInfo = useCallback((key, info) => {
    cellInfoRef.current.set(key, info);
  }, []);

  // Window-level pointermove + pointerup during a long-press-drag
  // selection. Reads the cell under the pointer via
  // elementFromPoint so we don't depend on per-cell pointerenter
  // (which doesn't fire during touch when the original element
  // has the pointer captured).
  const handleDragSelectPointerMove = useCallback((e) => {
    if (!dragSelectActiveRef.current) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    const y = e.clientY ?? e.touches?.[0]?.clientY;
    if (x == null || y == null) return;
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    const cell = el.closest("[data-cell-key]");
    if (!cell) return;
    const info = cellInfoRef.current.get(cell.getAttribute("data-cell-key"));
    if (!info) return;
    setDragSelectEnd((prev) => {
      if (prev && prev.date.toDateString() === info.date.toDateString()
        && prev.hour === info.hour && prev.minute === info.minute) return prev;
      return info;
    });
  }, []);
  const handleDragSelectPointerUp = useCallback(() => {
    if (!dragSelectActiveRef.current) return;
    dragSelectActiveRef.current = false;
    setDragSelectActive(false);
    const start = pendingStart;
    const end = dragSelectEnd || start;
    setDragSelectEnd(null);
    if (!start) return;
    const startH = start.hour + start.minute / 60;
    const endH = (end.hour ?? start.hour) + (end.minute ?? start.minute) / 60;
    const isSameDay = format(start.date, "yyyy-MM-dd") === format(end.date, "yyyy-MM-dd");
    const isSameCell = isSameDay && startH === endH;
    if (isSameCell) {
      // No drag — leave pendingStart in place so the user can tap
      // an end cell next (the existing two-tap flow). Now is the
      // safe time to turn addMode on (the press is over, so the
      // banner appearing won't shift the cell out from under the
      // user's finger).
      if (!addMode) onToggleAddMode?.();
      return;
    }
    if (!isSameDay) {
      onTimeRangeSelect(start.date, start.hour, end.hour, start.minute, end.minute, end.date);
    } else {
      const forward = startH <= endH;
      onTimeRangeSelect(
        start.date,
        forward ? start.hour : end.hour,
        forward ? end.hour : start.hour,
        forward ? start.minute : end.minute,
        forward ? end.minute : start.minute,
        start.date,
      );
    }
    setPendingStart(null);
  }, [pendingStart, dragSelectEnd, onTimeRangeSelect, addMode, onToggleAddMode]);

  useEffect(() => {
    if (!dragSelectActiveRef.current && !dragSelectEnd) return;
    window.addEventListener("pointermove", handleDragSelectPointerMove);
    window.addEventListener("pointerup", handleDragSelectPointerUp);
    window.addEventListener("pointercancel", handleDragSelectPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleDragSelectPointerMove);
      window.removeEventListener("pointerup", handleDragSelectPointerUp);
      window.removeEventListener("pointercancel", handleDragSelectPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragSelectEnd, handleDragSelectPointerMove, handleDragSelectPointerUp]);

  // Mount-once non-passive touchmove listener. Has to be attached
  // BEFORE the user starts moving — if we wait until drag-select
  // activation, the browser may have already engaged a pan-scroll
  // gesture during the 500 ms hold and calling preventDefault
  // mid-pan is unreliable. The listener is a no-op while drag-select
  // is inactive, so normal scrolling still works.
  useEffect(() => {
    const blockTouchScroll = (e) => {
      if (dragSelectActiveRef.current) e.preventDefault();
    };
    document.addEventListener("touchmove", blockTouchScroll, { passive: false });
    return () => {
      document.removeEventListener("touchmove", blockTouchScroll, { passive: false });
    };
  }, []);

  // Helper: is this cell inside the current long-press-drag range?
  const isInDragRange = useCallback((date, hour, minute) => {
    if (!pendingStart || !dragSelectEnd) return false;
    const startStr = format(pendingStart.date, "yyyy-MM-dd");
    const endStr = format(dragSelectEnd.date, "yyyy-MM-dd");
    const curStr = format(date, "yyyy-MM-dd");
    if (startStr !== endStr) {
      // Cross-day range: include start day, end day, and any days
      // between. For each contained day, the whole column counts
      // up to the boundary cells.
      if (curStr < Math.min(startStr, endStr) || curStr > Math.max(startStr, endStr)) return false;
      return true;
    }
    if (curStr !== startStr) return false;
    const cur = hour + minute / 60;
    const a = pendingStart.hour + pendingStart.minute / 60;
    const b = dragSelectEnd.hour + dragSelectEnd.minute / 60;
    return cur >= Math.min(a, b) && cur <= Math.max(a, b);
  }, [pendingStart, dragSelectEnd]);

  return (
    <div className="space-y-2">
      {/* Display-filter controls — Emotions / Alters / Display only.
          The "+ Add" range-select toggle and "Manage Activities" button
          were promoted to the page header in 0.17.3 (primary actions live
          one row up, with New Plan / Log Activity / Manage Activities).
          Visual range-selection on the grid still works: double-tap an
          empty cell to arm pendingStart, then tap another cell to
          finish the range — see handleCellTap below. The trailing
          "Cancel selection" pill renders when addMode is on, so users
          can exit that flow without entering it from this row. */}
      <div className="flex flex-wrap gap-1.5 justify-end items-center">
        {addMode && (
          <Button variant="default" size="sm" onClick={handleToggleAddMode} className="gap-1.5 h-7 px-2 text-xs">
            <X className="w-3 h-3" />Cancel selection
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setShowEmotions(v => !v)} className="gap-1.5 h-7 px-2 text-xs">
          {showEmotions ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} Emotions
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowAlters(v => !v)} className="gap-1.5 h-7 px-2 text-xs">
          {showAlters ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} Alters
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowQuickPlans(v => !v)} className="gap-1.5 h-7 px-2 text-xs">
          {showQuickPlans ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} Quick plans
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowSettings(v => !v)} className="gap-1.5 h-7 px-2 text-xs">
          <Settings className="w-3 h-3" /> Display
        </Button>
      </div>

      {/* Display settings panel */}
      {showSettings && (
        <div className="rounded-lg border border-border bg-card p-3 text-xs">
          <div className="flex flex-wrap gap-x-5 gap-y-2.5 items-center">

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium whitespace-nowrap">Row height</span>
              <button type="button" onClick={() => setRowH(v => Math.max(6, v - 1))}
                className="w-6 h-6 rounded-md bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors text-base leading-none">−</button>
              <input type="range" min={6} max={80} step={1} value={rowH}
                onChange={e => setRowH(Number(e.target.value))}
                className="w-28 accent-primary touch-pan-y" />
              <button type="button" onClick={() => setRowH(v => Math.min(80, v + 1))}
                className="w-6 h-6 rounded-md bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors text-base leading-none">+</button>
              <span className="text-muted-foreground w-7 tabular-nums">{rowH}px</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium whitespace-nowrap">Col width</span>
              <button type="button" onClick={() => setColW(v => Math.max(15, v - 1))}
                className="w-6 h-6 rounded-md bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors text-base leading-none">−</button>
              <input type="range" min={15} max={200} step={1} value={colW}
                onChange={e => setColW(Number(e.target.value))}
                className="w-28 accent-primary touch-pan-y" />
              <button type="button" onClick={() => setColW(v => Math.min(200, v + 1))}
                className="w-6 h-6 rounded-md bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors text-base leading-none">+</button>
              <span className="text-muted-foreground w-8 tabular-nums">{colW}px</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium whitespace-nowrap">Interval</span>
              {[15, 30, 60].map(iv => (
                <button key={iv} onClick={() => changeInterval(iv)}
                  className={`px-2 py-0.5 rounded font-medium transition-colors ${
                    gridInterval === iv ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
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

      {/* Floating tooltip */}
      {hoveredCell && (() => {
        const { date, hour, minute, position, pinned } = hoveredCell;
        const { timed, logged } = getActivitiesForSlot(date, hour, minute);
        const allLogged = logged;
        const allActs = [...timed, ...allLogged];
        const alterIds = getAlterIdsForSlot(date, hour, minute);
        const emotions = getEmotionsForSlot(date, hour, minute);
        if (allActs.length === 0 && emotions.length === 0 && alterIds.length === 0) return null;

        const slotStart = new Date(date);
        slotStart.setHours(hour, minute, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + gridInterval * 60 * 1000);
        const timeRange = `${formatSlotLabel(hour, minute, timeFmt)} – ${formatSlotLabel(slotEnd.getHours(), slotEnd.getMinutes(), timeFmt)}`;

        return (
          <>
            {/* Tap-pinned popover gets a full-screen catcher so a tap
                anywhere outside dismisses it (touch has no mouse-leave). */}
            {pinned && (
              <div className="fixed inset-0 z-40" onClick={() => setHoveredCell(null)} />
            )}
          <div
            className="fixed z-50 w-max max-w-[280px]"
            style={{ left: position.x, top: position.y }}
          >
            <div className="bg-card/95 backdrop-blur-sm border border-border shadow-xl rounded-lg p-3 space-y-2 text-xs">
              <p className="text-muted-foreground font-medium pointer-events-none">{format(date, "EEE d MMM")} · {timeRange}</p>

              {timed.map(a => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => { setHoveredCell(null); setDetailsActivity(a); }}
                  className="block w-full text-left space-y-0.5 -mx-1 px-1 py-0.5 rounded hover:bg-muted/40"
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getActivityColor(a) }} />
                    <span className="font-semibold text-foreground">{a.activity_name}</span>
                    {a.duration_minutes && <span className="text-muted-foreground ml-auto">{a.duration_minutes}m</span>}
                  </div>
                  {a.notes && <p className="text-muted-foreground italic pl-4 leading-snug">{a.notes}</p>}
                </button>
              ))}

              {allLogged.map(a => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => { setHoveredCell(null); setDetailsActivity(a); }}
                  className="block w-full text-left space-y-0.5 -mx-1 px-1 py-0.5 rounded hover:bg-muted/40"
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getActivityColor(a) }} />
                    <span className="font-semibold text-foreground">{a.activity_name}</span>
                    <span className="text-muted-foreground ml-1 opacity-70">· logged</span>
                  </div>
                  {a.notes && <p className="text-muted-foreground italic pl-4 leading-snug">{a.notes}</p>}
                </button>
              ))}

              {emotions.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {emotions.map((em, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded-full text-white font-medium"
                      style={{ fontSize: 9, backgroundColor: emotionColor(em) }}>
                      {em}
                    </span>
                  ))}
                </div>
              )}

              {alterIds.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {alterIds.map(alterId => {
                    const alter = alters.find(a => a.id === alterId);
                    return (
                      <div key={alterId} className="flex items-center gap-1">
                        <div className="w-5 h-5 rounded-full border border-border overflow-hidden flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: alter?.color || "#9333ea" }}>
                          <GridAlterImg alter={alter} alt={alter?.name}
                            fallback={<span className="font-bold text-white" style={{ fontSize: 8 }}>{alter?.name?.charAt(0)?.toUpperCase() || "?"}</span>} />
                        </div>
                        <span className="text-foreground">{alter?.name || "Unknown"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          </>
        );
      })()}

      {/* Grid — pinch-to-zoom listeners are attached natively in the
          useEffect below so the touchmove handler can preventDefault
          (React's synthetic touchmove is passive by default). */}
      <div
        ref={gridRef}
        className="border border-border rounded-lg overflow-hidden flex"
        style={{ maxWidth: "100vw", touchAction: dragSelectActive ? "none" : "pan-x pan-y" }}
      >
        {/* Fixed time column */}
        <div className="flex-shrink-0 bg-muted border-r border-border flex flex-col z-10">
          <div style={{ height: HEADER_H, minHeight: HEADER_H }} className="border-b border-border" />
          {/* Spacer matching the day-header quick-plans band so the
              time labels line up with their slot rows. */}
          {quickPlansBandH > 0 && (
            <div style={{ height: quickPlansBandH, minHeight: quickPlansBandH }} className="border-b border-border" />
          )}
          {slots.map(({ hour, minute }) => {
            const useTicks = shouldUseTicks(rowH, tickMode, gridInterval);
            return (
              <div
                key={`${hour}-${minute}`}
                // Top-aligned: a slot's label marks where that slot BEGINS
                // (the line at the TOP of the row), so the time reads in line
                // with that demarcation rather than floating in the middle.
                className="px-1.5 text-right flex items-start justify-end flex-shrink-0 whitespace-nowrap"
                style={{ height: rowH, minHeight: rowH, color: "hsl(var(--muted-foreground))", ...slotBottomBorderStyle(minute) }}
              >
                {/* Lift the label so its centre sits ON the slot's top gridline
                    (matching the Timeline) rather than floating just below it. */}
                <div style={{ transform: "translateY(-50%)" }}>
                  {minute === 0 ? (
                    <span className="font-semibold" style={{ fontSize: Math.max(8, Math.min(10, rowH * 0.7)) }}>
                      {formatSlotLabel(hour, 0, timeFmt)}
                    </span>
                  ) : useTicks ? (
                    <span style={{ fontSize: rowH <= 10 ? 7 : 9, lineHeight: 1, opacity: 0.6 }}>
                      {minute % 30 === 0 ? "·" : "−"}
                    </span>
                  ) : (
                    gridInterval <= 30 && (
                      <span className="opacity-50" style={{ fontSize: 8 }}>
                        {formatSlotLabel(hour, minute, timeFmt)}
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scrollable days */}
        <div className="overflow-x-auto flex-1">
          <div className="relative" style={{ minWidth: weekDays.length * colW }}>
            {/* Now line — only when today is in the visible week */}
            {(() => {
              const todayStr = format(currentTime, "yyyy-MM-dd");
              const todayInWeek = weekDays.some(d => format(d, "yyyy-MM-dd") === todayStr);
              if (!todayInWeek) return null;
              const totalGridHeight = slots.length * rowH;
              const nowTop = gridTopY + ((currentTime.getHours() * 60 + currentTime.getMinutes()) / (24 * 60)) * totalGridHeight;
              return (
                <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                  style={{ top: nowTop }}>
                  <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0 -ml-1" />
                  <div className="flex-1 h-0.5 bg-primary opacity-80" />
                </div>
              );
            })()}

            {/* Current-day column highlight — vertical tint that
                spans the full grid height so today's column stands
                out from the other six. pointer-events-none so it
                doesn't intercept taps on the cells underneath. */}
            {(() => {
              const todayIdx = weekDays.findIndex(d => format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"));
              if (todayIdx === -1) return null;
              const totalGridHeight = slots.length * rowH;
              return (
                <div
                  className="absolute bg-primary/5 pointer-events-none"
                  style={{
                    top: gridTopY,
                    left: todayIdx * colW,
                    width: colW,
                    height: totalGridHeight,
                    zIndex: 1,
                  }}
                />
              );
            })()}

            {/* Day headers */}
            <div className="grid bg-card border-b border-border"
              style={{ gridTemplateColumns: `repeat(${weekDays.length}, ${colW}px)`, height: HEADER_H }}>
              {weekDays.map(date => {
                const stats = getDayStats(date);
                const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                const dayDates = datesForDay(importantDates, date);
                return (
                  <button
                    key={format(date, "yyyy-MM-dd")}
                    onClick={() => onDayClick?.(date)}
                    className={`relative p-1.5 text-center border-r border-border w-full h-full transition-colors
                      ${isToday ? "bg-primary/5" : ""}
                      ${onDayClick ? "hover:bg-primary/10 cursor-pointer" : "cursor-default"}
                    `}
                  >
                    {dayDates.length > 0 && (
                      <span
                        className="absolute top-0.5 right-0.5 inline-flex items-center gap-0.5"
                        title={dayDates.map((x) => `${x.alterName} — ${x.fieldName}`).join("\n")}
                      >
                        <span style={{ fontSize: 9 }} className="leading-none">📅</span>
                        {dayDates.slice(0, 3).map((x, i) => (
                          <span key={i} className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: x.color || "var(--color-primary, #6366f1)" }} />
                        ))}
                      </span>
                    )}
                    <div className="text-xs font-medium text-muted-foreground">{format(date, "EEE")}</div>
                    <div className={`text-base font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                      {format(date, "d")}
                    </div>
                    {stats.count > 0 && (
                      <div style={{ fontSize: 9 }} className="text-primary/80">
                        {stats.count}{stats.duration > 0 ? ` · ${Math.round(stats.duration / 60)}h` : ""}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick-plans band — one column per day, vertically
                stacked pills inside each. Lives in the layout flow
                BELOW the date row and ABOVE the time-slot grid so
                pills never paint over activities. Hidden entirely
                when no day in the visible week has any quick plans. */}
            {quickPlansBandH > 0 && (
              <div className="grid border-b border-border bg-card/40"
                style={{
                  gridTemplateColumns: `repeat(${weekDays.length}, ${colW}px)`,
                  height: quickPlansBandH,
                }}>
                {weekDays.map((date, dayIdx) => {
                  const dayKey = format(date, "yyyy-MM-dd");
                  const list = quickByDay.get(dayKey) || [];
                  const visible = list.slice(0, QUICK_PLANS_CAP);
                  const overflow = Math.max(0, list.length - visible.length);
                  return (
                    <div key={dayKey} className="border-r border-border/40 flex flex-col gap-0.5 p-0.5 overflow-hidden">
                      {visible.map((a) => {
                        const color = getActivityColor(a) || "hsl(var(--primary))";
                        const st = statusFor(a);
                        const v = visualForStatus(st);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            title={a.activity_name || "Quick plan"}
                            onClick={(e) => {
                              e.stopPropagation();
                              const now = Date.now();
                              const last = quickPlanTapRef.current;
                              if (last.id === a.id && now - last.time < 280) {
                                quickPlanTapRef.current = { id: null, time: 0 };
                                setQuickPlanDayPopup({ date: dayKey, plans: list });
                                return;
                              }
                              quickPlanTapRef.current = { id: a.id, time: now };
                              setTimeout(() => {
                                const cur = quickPlanTapRef.current;
                                if (cur.id === a.id && cur.time === now) {
                                  quickPlanTapRef.current = { id: null, time: 0 };
                                  navigate(`/activities?date=${dayKey}&highlight=${a.id}`);
                                }
                              }, 280);
                            }}
                            className="text-[0.625rem] leading-tight font-semibold text-white rounded-full px-1.5 py-0 truncate shadow-sm"
                            style={{
                              backgroundColor: v.dashed ? "transparent" : color,
                              border: v.dashed ? `1px dashed ${color}` : `1px solid ${color}`,
                              opacity: v.fillOpacity ?? 0.95,
                              textDecoration: v.strike ? "line-through" : undefined,
                              height: QUICK_PLAN_PILL_H - 2,
                              lineHeight: `${QUICK_PLAN_PILL_H - 4}px`,
                            }}
                          >
                            {v.corner ? `${v.corner} ` : ""}{a.activity_name || "Plan"}
                          </button>
                        );
                      })}
                      {overflow > 0 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setQuickPlanDayPopup({ date: dayKey, plans: list }); }}
                          className="text-[0.625rem] leading-tight text-muted-foreground self-start px-1"
                        >
                          +{overflow} more
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Slot rows */}
            {slots.map(({ hour, minute }) => (
              <div key={`${hour}-${minute}`} className="grid"
                style={{ gridTemplateColumns: `repeat(${weekDays.length}, ${colW}px)`, minHeight: rowH }}>
                {weekDays.map(date => {
                  const key = slotKey(date, hour, minute);
                  const { timed, logged } = getActivitiesForSlot(date, hour, minute);
                  const alterIds = getAlterIdsForSlot(date, hour, minute);
                  const emotions = getEmotionsForSlot(date, hour, minute);
                  const isExpanded = false; // expand-in-place removed; tap opens the details sheet instead.
                  const isPending = pendingStart &&
                    pendingStart.date.toDateString() === date.toDateString() &&
                    pendingStart.hour === hour && pendingStart.minute === minute;

                  // Slot tint: cells whose end time is already in the past
                  // get a slightly darker background so the current /
                  // upcoming part of the week reads as "available" at a
                  // glance. Re-uses the `currentTime` state that's already
                  // ticking once a minute. The empty-cell hover styles
                  // below override this on interaction, so it stays subtle.
                  const slotEnd = (() => {
                    const d = new Date(date);
                    d.setHours(hour, minute + gridInterval, 0, 0);
                    return d;
                  })();
                  const isPastSlot = slotEnd.getTime() <= currentTime.getTime();
                  const timedContinues = timed.some(a => !isLastSlotForActivity(a, date, hour, minute));
                  // Compute how many slots the longest activity starting in
                  // this cell spans — used to (a) stop drawing a corner
                  // badge / X overlay / needs-review dot inside every slot
                  // (the redundant cross-cell duplication), and (b) extend
                  // the label box so the activity name can wrap across the
                  // full activity duration instead of being clamped to one
                  // row's width.
                  const labelSpanCells = (() => {
                    const starters = timed.filter(a => isFirstSlotForActivity(a, date, hour, minute));
                    if (starters.length === 0) return 1;
                    const headActivityIds = new Set(starters.map(a => a.id));
                    const desired = Math.max(1, ...starters.map(a =>
                      Math.ceil(Math.max(gridInterval, a.duration_minutes || gridInterval) / gridInterval)
                    ));
                    // Truncate at the first downstream cell that introduces
                    // a new activity (one not already starting in this head
                    // cell) so the label box doesn't bleed down over the
                    // next activity's row.
                    let span = 1;
                    for (let i = 1; i < desired; i++) {
                      const nextMinutes = minute + i * gridInterval;
                      const nextHour = hour + Math.floor(nextMinutes / 60);
                      const nextMin = nextMinutes % 60;
                      if (nextHour > 23) break;
                      const { timed: nextTimed } = getActivitiesForSlot(date, nextHour, nextMin);
                      const introducesNew = nextTimed.some(a =>
                        !headActivityIds.has(a.id)
                        && isFirstSlotForActivity(a, date, nextHour, nextMin)
                      );
                      if (introducesNew) break;
                      span = i + 1;
                    }
                    return span;
                  })();
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
                    // Not a <button>: cells contain nested chip buttons,
                    // and a button-inside-button is invalid HTML that makes
                    // taps on the inner chips fire unreliably (the reported
                    // "popup doesn't appear"). A div with onClick taps fine.
                    <div
                      key={key}
                      onClick={(e) => {
                        if (longPressFiredRef.current) {
                          longPressFiredRef.current = false;
                          return;
                        }
                        handleCellTap(date, hour, minute, e);
                      }}
                      onMouseEnter={(e) => handleCellMouseEnter(e, date, hour, minute)}
                      onMouseLeave={handleCellMouseLeave}
                      onPointerDown={() => startLongPress(date, hour, minute)}
                      onPointerUp={cancelLongPress}
                      onPointerLeave={cancelLongPress}
                      onPointerCancel={cancelLongPress}
                      onTouchStart={(e) => handleCellTouchStart(e, date, hour, minute)}
                      onTouchEnd={(e) => { handleCellTouchEnd(); cancelLongPress(); }}
                      onTouchMove={(e) => {
                        // Don't kill the long-press for finger jitter
                        // under TOUCH_SLOP_PX. Once drag-select is
                        // active we never want to cancel anyway —
                        // dragging IS the interaction at that point.
                        if (dragSelectActiveRef.current) return;
                        if (!touchMovedBeyondSlop(e)) return;
                        handleCellTouchEnd();
                        cancelLongPress();
                      }}
                      data-cell-key={key}
                      ref={(el) => { if (el) registerCellInfo(key, { date, hour, minute }); }}
                        className={`border-r border-border/40 relative flex flex-col items-start justify-start overflow-visible cursor-pointer transition-colors group
                        ${!hasContent && addMode ? "hover:bg-primary/10" : ""}
                        ${!hasContent && !addMode ? "hover:bg-muted/20" : ""}
                        ${isExpanded ? "z-10" : ""}
                      `}
                      style={{
                        minHeight: rowH,
                        height: isExpanded ? "auto" : rowH,
                        userSelect: "none",
                        // Bottom gridline — skipped while a timed activity
                        // block continues into the next slot (so the block
                        // doesn't get sliced by a divider). Hour / half /
                        // quarter lines get distinct weight + dash.
                        ...(timedContinues ? {} : slotBottomBorderStyle(minute)),
                      }}
                    >
                      {/* Past-time tint — sits behind activity blocks
                          so logged/scheduled colours stay on top, but
                          any uncovered portion of a past cell shows as
                          visibly darker than future cells. */}
                      {isPastSlot && (
                        <div className="absolute inset-0 bg-black/40 pointer-events-none" />
                      )}
                      {highlightActivityId && timed.some(a => a.id === highlightActivityId) && (
                        <div className="absolute inset-0 ring-2 ring-yellow-400 ring-inset pointer-events-none z-20 animate-pulse" />
                      )}
                      {isPending && (
                        <div className="absolute inset-0 ring-2 ring-primary ring-inset pointer-events-none z-20" />
                      )}
                      {isInDragRange(date, hour, minute) && !isPending && (
                        <div className="absolute inset-0 bg-primary/20 ring-1 ring-primary/60 ring-inset pointer-events-none z-20" />
                      )}

                      {timed.length > 0 && (
                        <div className="absolute inset-0 flex">
                          {timed.map(a => {
                            const st = statusFor(a);
                            const v = visualForStatus(st);
                            const needsReview = isPastTimeScheduled(a);
                            const color = getActivityColor(a);
                            // Only the activity's first slot renders the
                            // status decorations (corner badge, "cancelled"
                            // X, needs-review dot). Continuation slots get
                            // the colored background only, so a 8-hour plan
                            // doesn't paint 16 redundant ✓s down the column.
                            const isHeadSlot = isFirstSlotForActivity(a, date, hour, minute);
                            return (
                              <div
                                key={a.id}
                                className="flex-1 h-full relative"
                                style={{
                                  backgroundColor: v.dashed ? "transparent" : color,
                                  opacity: v.fillOpacity,
                                  border: v.dashed ? `1px dashed ${color}` : undefined,
                                  boxSizing: "border-box",
                                }}
                              >
                                {v.showXCenter && isHeadSlot && (
                                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <X className="w-3 h-3 text-white drop-shadow" />
                                  </div>
                                )}
                                {v.corner && isHeadSlot && (
                                  <span
                                    className="absolute top-0 right-0.5 text-white font-bold leading-none pointer-events-none drop-shadow"
                                    style={{ fontSize: Math.max(8, rowH * 0.3) }}
                                  >
                                    {v.corner}
                                  </span>
                                )}
                                {needsReview && isHeadSlot && (
                                  <span
                                    className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 ring-1 ring-amber-700/40 pointer-events-none"
                                    title="Past-time plan — needs review"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="relative z-10 w-full h-full flex flex-col">
                        {timed.length > 0 && showLabel && (
                          <div className={`px-1 pt-0.5 w-full ${isExpanded ? "" : "overflow-hidden"}`}
                            style={{
                              // Extend the label box to the full activity
                              // duration so a long-running activity can
                              // wrap its name across multiple slots instead
                              // of being clipped to one row.
                              maxHeight: isExpanded ? "none" : Math.max(rowH - 2, labelSpanCells * rowH - 2),
                            }}>
<div className="font-semibold text-white drop-shadow leading-tight flex items-start gap-0.5 flex-wrap"
  style={{ fontSize: Math.max(9, Math.min(11, rowH / 4)), wordBreak: "break-word" }}>
  <span className="break-words">{timed.map(a => a.activity_name).join(" + ")}</span>
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
                                  <GridAlterImg alter={alter} alt={alter?.name}
                                    fallback={<span className="font-bold text-white" style={{ fontSize: 6 }}>{alter?.name?.charAt(0)?.toUpperCase()}</span>} />
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
                                  <GridAlterImg alter={alter} alt={alter?.name}
                                    fallback={<span className="font-bold text-white" style={{ fontSize: 7 }}>{alter?.name?.charAt(0)?.toUpperCase() || "?"}</span>} />
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
                                      const st = statusFor(pill);
                                      const v = visualForStatus(st);
                                      const needsReview = isPastTimeScheduled(pill);
                                      const size = Math.max(6, Math.min(rowH - 2, Math.floor((colW - 8) / count) - 2));
                                      const chars = Math.floor(size / 5.5);
                                      const label = chars >= 2 ? pill.activity_name?.slice(0, chars) : "";
                                      return (
                                        <button
                                          type="button"
                                          key={pill.id}
                                          onClick={(e) => { e.stopPropagation(); handleCellTap(date, hour, minute, e); }}
                                          onPointerDown={(e) => e.stopPropagation()}
                                          onTouchStart={(e) => e.stopPropagation()}
                                          className="rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold overflow-hidden relative cursor-pointer hover:brightness-110 active:scale-95 transition-all"
                                          style={{
                                            backgroundColor: v.dashed ? "transparent" : color,
                                            border: v.dashed ? `1px dashed ${color}` : undefined,
                                            opacity: v.fillOpacity,
                                            height: size,
                                            minWidth: size,
                                            fontSize: Math.max(5, size * 0.5),
                                            paddingLeft: label ? 2 : 0,
                                            paddingRight: label ? 2 : 0,
                                            boxSizing: "border-box",
                                            textDecoration: v.strike ? "line-through" : undefined,
                                          }}
                                          title={pill.activity_name}>
                                          {label}
                                          {pill.notes && <span style={{ fontSize: Math.max(4, size * 0.4), marginLeft: 1, opacity: 0.85 }}>💭</span>}
                                          {needsReview && (
                                            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 ring-1 ring-amber-700/40" />
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                );
                              }
                              return loggedToShow.map(pill => {
                                const color = getActivityColor(pill);
                                const st = statusFor(pill);
                                const v = visualForStatus(st);
                                const needsReview = isPastTimeScheduled(pill);
                                const pillAlters = (pill.fronting_alter_ids || []).map(id => alters.find(a => a.id === id)).filter(Boolean);
                                const pillEmotions = pill.emotions || [];
                                const h = isExpanded ? undefined : Math.min(Math.max(10, pillH), 18);
                                const fs = isExpanded ? 9 : Math.max(7, Math.min(9, pillH * 0.6));
                                return (
                                  <button
                                    type="button"
                                    key={pill.id}
                                    onClick={(e) => { e.stopPropagation(); handleCellTap(date, hour, minute, e); }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onTouchStart={(e) => e.stopPropagation()}
                                    className="rounded-full flex items-center gap-0.5 px-1 text-white font-medium flex-shrink-0 overflow-hidden w-full relative cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all text-left"
                                    style={{
                                      backgroundColor: v.dashed ? "transparent" : color,
                                      border: v.dashed ? `1px dashed ${color}` : undefined,
                                      opacity: v.fillOpacity,
                                      fontSize: fs,
                                      height: h,
                                      maxWidth: "100%",
                                      marginTop: 0,
                                      boxSizing: "border-box",
                                      textDecoration: v.strike ? "line-through" : undefined,
                                    }}
                                    title={pill.activity_name}>
                                    {v.corner && (
                                      <span className="font-bold mr-0.5" style={{ fontSize: Math.max(7, fs) }}>{v.corner}</span>
                                    )}
                                    {needsReview && (
                                      <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-amber-400 ring-1 ring-amber-700/40" />
                                    )}
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
                                        <GridAlterImg alter={a}
                                          fallback={<span style={{ fontSize: 5 }} className="flex items-center justify-center h-full font-bold">{a.name?.charAt(0)}</span>} />
                                      </div>
                                    ))}
                                    {showEmotions && pillEmotions.slice(0, isExpanded ? 6 : 1).map((em, i) => (
                                      <span key={i} className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: emotionColor(em) }} title={em} />
                                    ))}
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        )}

                        {addMode && !hasContent && (
                          <Plus className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity m-auto text-primary" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick plan day popup — opens on double-tap of any quick
          plan pill. Lists every quick plan for that day with the
          full (un-truncated) name and current status. Tapping a row
          opens the same lifecycle popover used everywhere else. */}
      <Dialog open={!!quickPlanDayPopup} onOpenChange={(open) => { if (!open) setQuickPlanDayPopup(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              Quick plans · {quickPlanDayPopup ? format(parseDate(`${quickPlanDayPopup.date}T00:00:00`), "EEEE, MMM d") : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {quickPlanDayPopup?.plans?.length ? quickPlanDayPopup.plans.map((a) => (
              <QuickPlanRow
                key={a.id}
                activity={a}
                getActivityColor={getActivityColor}
                onTap={() => { setQuickPlanDayPopup(null); setDetailsActivity(a); }}
                onLongPress={() => { setQuickPlanDayPopup(null); setLifecycleActivity(a); }}
              />
            )) : (
              <p className="text-xs text-muted-foreground text-center py-4">No quick plans for this day.</p>
            )}
          </div>
          <p className="text-[0.6875rem] text-muted-foreground pt-1">
            Tap to open details · press &amp; hold to jump straight to Manage Plan.
          </p>
        </DialogContent>
      </Dialog>

      <ActivityDetailsModal
        isOpen={!!detailsActivity}
        onClose={() => setDetailsActivity(null)}
        activity={detailsActivity}
        alters={alters}
        onEditPlan={(act) => {
          setDetailsActivity(null);
          // Open the real plan editor (handed down from ActivityTracker)
          // so "Edit" reaches the full edit form. Fall back to the
          // Manage/lifecycle popover only if no editor was provided.
          if (onEditPlan) { onEditPlan(act); return; }
          setLifecycleActivity(act);
        }}
      />

      <ActivityLifecyclePopover
        isOpen={!!lifecycleActivity}
        activity={lifecycleActivity}
        onClose={() => setLifecycleActivity(null)}
        onChanged={() => {
          // The Activity subscribe handler in ActivityTracker will
          // invalidate the activities query; the grid re-renders
          // automatically once the patched record lands.
        }}
      />
    </div>
  );
}