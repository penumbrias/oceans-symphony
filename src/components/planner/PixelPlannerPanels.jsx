// The planner's pixel-look pieces (mockup "Planner week, desktop"): the
// toolbar every pixel planner uses (computer and phone), and the side
// panels the computer layout puts round the calendar — a month to jump
// from, the category list, this week's insights, goals and the plans that
// need a decision.
//
// Display only. Every write goes through the planner's existing paths:
// resolving a plan through lib/planner/resolvePlan, creating through the
// shared ActivityEditor / EventSheet (handed in by PlannerSurface).

import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  addDays, addMonths, endOfMonth, format, isSameDay, isSameMonth, startOfMonth, startOfWeek,
} from "date-fns";
import { toast } from "sonner";
import { SlidersHorizontal, Settings as SettingsIcon, Users, Heart, MapPin } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useTerms } from "@/lib/useTerms";
import { flattenCategoryTree, MAX_RENDER_DEPTH } from "@/lib/categoryTreeUtils";
import { isPastTimeScheduled } from "@/lib/activityStatus";
import { resolveOutcome } from "@/lib/planner/resolvePlan";
import { formatClock } from "@/lib/planner/displayPrefs";

export const hoursLabel = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (!h) return `${m} m`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
};

// ── Toolbar ─────────────────────────────────────────────────────────
// View radios (Day / Week / Month / Year / Plans list), the date range
// with its arrows, and the three ways to add (log, event, plan). A second
// thin row keeps Today, what the grid also shows, Display and Manage.
export function PixelPlannerToolbar({
  section, view, onPick, rangeLabel, onStep, onToday, totalLabel,
  onLog, onEvent, onPlan, overlays, onOverlay, showOverlays,
  displayOpen, onDisplay, onManage,
}) {
  const tr = useT();
  const t = useTerms();
  const current = section === "plans" ? "plans" : section === "calendar" ? view : null;
  const choices = [
    ["day", tr("planner.view.day")], ["week", tr("planner.view.week")],
    ["month", tr("planner.view.month")], ["year", tr("planner.view.year")],
    ["plans", tr("planner.pxPlansList")],
  ];
  return (
    <div className="pxp-toolbar">
      <div className="pxp-toolrow">
        <div role="radiogroup" aria-label={tr("planner.pxCalendarView")} className="pxp-radios">
          {choices.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={current === id}
              className={`pxp-btn ${current === id ? "on" : ""}`} onClick={() => onPick(id)}>{label}</button>
          ))}
        </div>
        {section !== "plans" && (
          <span className="pxp-range">
            <button type="button" className="pxp-arrow" aria-label={tr("planner.prev")} onClick={() => onStep(-1)}>&lt;</button>
            <span className="tabular-nums">{rangeLabel}</span>
            <button type="button" className="pxp-arrow" aria-label={tr("planner.next")} onClick={() => onStep(1)}>&gt;</button>
          </span>
        )}
        <span className="pxp-grow" />
        <span className="pxp-adds">
          <button type="button" className="pxp-btn" onClick={onLog}>+ {tr("planner.pxLog")}</button>
          <button type="button" className="pxp-btn" onClick={onEvent}>+ {tr("planner.pxEvent")}</button>
          <button type="button" className="pxp-btn on" onClick={onPlan}>+ {tr("planner.pxPlan")}</button>
        </span>
      </div>
      <div className="pxp-toolrow pxp-toolrow-2">
        {section !== "plans" && (
          <button type="button" className="pxp-btn pxp-btn-sm" onClick={onToday}>{tr("planner.today")}</button>
        )}
        {totalLabel ? <span className="pxp-muted tabular-nums">{totalLabel}</span> : null}
        {showOverlays && (
          <span className="pxp-overlays" aria-label={tr("planner.pxOnGrid")}>
            <span className="pxp-muted">{tr("planner.pxOnGrid")}</span>
            <button type="button" aria-pressed={!!overlays.alters} onClick={() => onOverlay("alters", !overlays.alters)}
              className={`pxp-btn pxp-btn-sm ${overlays.alters ? "on" : ""}`}>
              <Users className="w-3 h-3" aria-hidden /> {tr("planner.overlay.fronting", { term: t.Fronting })}
            </button>
            <button type="button" aria-pressed={!!overlays.emotions} onClick={() => onOverlay("emotions", !overlays.emotions)}
              className={`pxp-btn pxp-btn-sm ${overlays.emotions ? "on" : ""}`}>
              <Heart className="w-3 h-3" aria-hidden /> {tr("planner.overlay.checkins")}
            </button>
            <button type="button" aria-pressed={overlays.locations !== false} onClick={() => onOverlay("locations", overlays.locations === false)}
              className={`pxp-btn pxp-btn-sm ${overlays.locations !== false ? "on" : ""}`}>
              <MapPin className="w-3 h-3" aria-hidden /> {tr("planner.overlay.locations")}
            </button>
          </span>
        )}
        <span className="pxp-grow" />
        <button type="button" className={`pxp-btn pxp-btn-sm ${displayOpen ? "on" : ""}`} aria-expanded={displayOpen}
          onClick={onDisplay} title={tr("planner.display")}>
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden /> {tr("planner.display")}
        </button>
        <button type="button" className="pxp-btn pxp-btn-sm" onClick={onManage} title={tr("planner.manage")}>
          <SettingsIcon className="w-3.5 h-3.5" aria-hidden /> {tr("planner.pxManage")}
        </button>
      </div>
    </div>
  );
}

// ── Panel shell ─────────────────────────────────────────────────────
export function PxPanel({ title, aside = null, className = "", children, tour }) {
  return (
    <section className={`pxp-pn ${className}`} {...(tour ? { "data-tour": tour } : {})}>
      <div className="pxp-ttl"><span className="truncate">{title}</span>{aside}</div>
      {children}
    </section>
  );
}

// ── Month ───────────────────────────────────────────────────────────
export function PixelMonthPanel({ anchor, onPick, weekStartsOn = 1, highlightWeek = true }) {
  const tr = useT();
  const [month, setMonth] = useState(() => startOfMonth(anchor));
  // Follow the calendar when it moves to another month.
  const anchorMonth = startOfMonth(anchor).getTime();
  useEffect(() => { setMonth(new Date(anchorMonth)); }, [anchorMonth]);

  const cells = useMemo(() => {
    const first = startOfWeek(startOfMonth(month), { weekStartsOn });
    const last = endOfMonth(month);
    const out = [];
    for (let d = first; d <= last || out.length % 7; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month, weekStartsOn]);
  const weekFrom = startOfWeek(anchor, { weekStartsOn });
  const weekTo = addDays(weekFrom, 7);
  const today = new Date();
  const letters = Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(today, { weekStartsOn }), i), "EEEEE"));
  return (
    <PxPanel title={format(month, "MMMM yyyy")} tour="planner-month-panel" aside={(
      <span className="pxp-ttl-act">
        <button type="button" aria-label={tr("planner.pxPrevMonth")} onClick={() => setMonth((m) => addMonths(m, -1))}>&lt;</button>
        <button type="button" aria-label={tr("planner.pxNextMonth")} onClick={() => setMonth((m) => addMonths(m, 1))}>&gt;</button>
      </span>
    )}>
      <div className="pxp-month" role="grid" aria-label={format(month, "MMMM yyyy")}>
        {letters.map((l, i) => <span key={`h${i}`} className="pxp-month-h" aria-hidden>{l}</span>)}
        {cells.map((d) => {
          const inMonth = isSameMonth(d, month);
          const inWeek = highlightWeek && d >= weekFrom && d < weekTo;
          const cls = [
            "pxp-month-d",
            !inMonth && "out",
            inWeek && "wk",
            isSameDay(d, anchor) && "sel",
            isSameDay(d, today) && "today",
          ].filter(Boolean).join(" ");
          return (
            <button key={d.toISOString()} type="button" className={cls} onClick={() => onPick(d)}
              aria-label={format(d, "EEEE d MMMM")} aria-current={isSameDay(d, today) ? "date" : undefined}>
              {inMonth ? format(d, "d") : ""}
            </button>
          );
        })}
      </div>
    </PxPanel>
  );
}

// ── Categories ──────────────────────────────────────────────────────
// The whole tree through the shared cycle-guarded flattener; the eye
// hides a category (and what's under it) from this computer's calendar.
export function PixelCategoriesPanel({ categories = [], hidden = [], onToggle, onManage }) {
  const tr = useT();
  const rows = useMemo(() => flattenCategoryTree(categories), [categories]);
  const hiddenSet = new Set(hidden);
  return (
    <PxPanel title={tr("planner.pxCategories")} className="pxp-grow-pn"
      aside={<button type="button" className="pxp-ttl-link" onClick={onManage}>{tr("planner.pxManage")}</button>}>
      <div className="pxp-cats">
        {rows.length === 0 && <p className="pxp-empty">{tr("planner.pxNoCategories")}</p>}
        {rows.map((c) => {
          const off = hiddenSet.has(c.id);
          return (
            <button key={c.id} type="button" className={`pxp-cat ${off ? "off" : ""}`}
              aria-pressed={!off} onClick={() => onToggle(c.id)}
              title={off ? tr("planner.pxShowCat") : tr("planner.pxHideCat")}>
              <span className="pxp-eye" aria-hidden>{off ? "-" : "o"}</span>
              <span className="pxp-sq" style={{ background: c.color || "var(--px-text-2)", marginLeft: Math.min(c._depth, MAX_RENDER_DEPTH) * 14 }} />
              <span className="pxp-cat-name">{c.name || tr("planner.untitled")}</span>
            </button>
          );
        })}
      </div>
    </PxPanel>
  );
}

// ── This week ───────────────────────────────────────────────────────
export function PixelWeekPanel({ planSummary, rootTotals = [], onOpenInsights }) {
  const tr = useT();
  const max = Math.max(1, ...rootTotals.map((r) => r.minutes));
  const total = planSummary?.scheduled || 0;
  const done = planSummary?.completed || 0;
  return (
    <PxPanel title={tr("planner.pxThisWeek")}
      aside={<button type="button" className="pxp-ttl-link" onClick={onOpenInsights}>{tr("planner.section.insights")}</button>}>
      <div className="pxp-pad pxp-stack">
        <div className="pxp-between"><span className="pxp-muted">{tr("planner.pxPlansDone")}</span>
          <span className="pxp-f">{tr("planner.pxOf", { done, total })}</span></div>
        <div className="pxp-meter" role="meter" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={done}
          aria-label={tr("planner.pxPlansDone")}>
          <span style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
        </div>
        {rootTotals.length === 0 && <p className="pxp-empty">{tr("planner.nothingTracked")}</p>}
        {rootTotals.map((r) => (
          <div key={r.key} className="pxp-total">
            <span className="pxp-muted truncate pxp-total-name">{r.label}</span>
            <span className="pxp-bar"><span style={{ width: `${Math.round((r.minutes / max) * 100)}%`, background: r.color || "var(--px-text-2)" }} /></span>
            <span className="pxp-f pxp-total-h">{hoursLabel(r.minutes)}</span>
          </div>
        ))}
      </div>
    </PxPanel>
  );
}

// ── Goals ───────────────────────────────────────────────────────────
export function PixelGoalsPanel({ goalRows = [], onOpen }) {
  const tr = useT();
  return (
    <PxPanel title={tr("planner.goals")}
      aside={<button type="button" className="pxp-ttl-link" onClick={onOpen}>{tr("planner.view.week").toLowerCase()}</button>}>
      <div className="pxp-pad pxp-stack-s">
        {goalRows.length === 0 && (
          <button type="button" className="pxp-empty pxp-linkish" onClick={onOpen}>{tr("planner.pxNoGoals")}</button>
        )}
        {goalRows.map((g) => (
          <div key={g.id} className="pxp-between">
            <span className="truncate">{g.label} {hoursLabel(g.target)}</span>
            <span className={`pxp-f ${g.done >= g.target ? "pxp-good" : "pxp-warn"}`}>
              {g.done >= g.target ? tr("planner.pxGoalDone") : hoursLabel(g.done)}
            </span>
          </div>
        ))}
      </div>
    </PxPanel>
  );
}

// ── Needs a decision ────────────────────────────────────────────────
// Plans whose time has passed and nobody said how they went. One tap
// resolves through the shared outcome write; the name opens the plan's
// details, which hold the rest (when it finished, reschedule, cancel…).
export function PixelDecisionsPanel({ activities = [], timeFmt, onOpen, limit = 6 }) {
  const tr = useT();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const open = useMemo(() => activities
    .filter((a) => isPastTimeScheduled(a))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)), [activities]);
  const resolve = async (item, status) => {
    if (busy) return;
    setBusy(item.id);
    try {
      await resolveOutcome(item, status);
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dailyProgress"] });
    } catch (e) { toast.error(e?.message || "Failed"); }
    finally { setBusy(null); }
  };
  return (
    <PxPanel title={tr("planner.pxNeedsDecision")} className="pxp-grow-pn"
      aside={<span className="pxp-f">{open.length}</span>}>
      <div className="pxp-pad pxp-stack pxp-scroll">
        {open.length === 0 && <p className="pxp-empty">{tr("planner.pxAllDecided")}</p>}
        {open.slice(0, limit).map((a) => {
          const d = new Date(a.timestamp);
          return (
            <div key={a.id}>
              <button type="button" className="pxp-decide-name" onClick={() => onOpen(a)}>
                <b>{a.activity_name || tr("planner.untitled")}</b>{" "}
                <span className="pxp-muted">{format(d, "EEE")} {formatClock(d.getHours() * 60 + d.getMinutes(), timeFmt)}</span>
              </button>
              <div className="pxp-decide-row">
                <button type="button" className="pxp-btn pxp-btn-sm" disabled={busy === a.id} onClick={() => resolve(a, "done")}>{tr("planner.pxDone")}</button>
                <button type="button" className="pxp-btn pxp-btn-sm" disabled={busy === a.id} onClick={() => resolve(a, "partial")}>{tr("planner.pxPartly")}</button>
                <button type="button" className="pxp-btn pxp-btn-sm" disabled={busy === a.id} onClick={() => resolve(a, "skipped")}>{tr("planner.pxSkipped")}</button>
                <button type="button" className="pxp-btn pxp-btn-sm" onClick={() => onOpen(a)} aria-label={tr("planner.pxMore")}>…</button>
              </div>
            </div>
          );
        })}
        {open.length > limit && <p className="pxp-empty">{tr("planner.pxMoreToDecide", { count: open.length - limit })}</p>}
      </div>
    </PxPanel>
  );
}
