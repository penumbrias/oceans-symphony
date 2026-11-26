// The Planner room's parts (board 04-Planner): the small month and the
// categories on the left; "This week", Goals and "Needs a decision" on the
// right; the Month, Year, Plans list and Insights views the calendar can
// switch to; the Planner options sheet.
//
// Display and quick actions only. Every write goes through the planner's
// own paths: outcomes through resolveOutcome, moves through reschedulePlan
// (planner/resolvePlan.js); many plans at once through resolveOutcome and
// deleteSeries (recurrenceUtils.js) in one trash batch. Goals, follow-through
// and the all-time tally are the old panels, reused inside house panels
// (building code §17.6) until their own rebuild.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { Button, IconButton } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { Sheet } from "@/house/kit/Sheet";
import Menu from "@/house/kit/Menu";
import { Checkbox, Segmented, SliderRow } from "@/house/kit/Choices";
import { Row } from "@/house/kit/Content";
import { EmptyBlock } from "@/house/kit/States";
import { showToast } from "@/house/kit/Toast";
import { MiniMonth, MonthBoard, YearBoard } from "@/house/kit/MonthGrid";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import ActivityGoalsPanel from "@/components/activities/ActivityGoalsPanel";
import PlanCompletionTracker from "@/components/activities/PlanCompletionTracker";
import ActivityTallyTracker from "@/components/activities/ActivityTallyTracker";
import ActivityNestingRecovery from "@/components/activities/ActivityNestingRecovery";
import PlansList from "@/components/planner/PlansList";
import { flattenCategoryTree, MAX_RENDER_DEPTH } from "@/lib/categoryTreeUtils";
import { resolveOutcome, reschedulePlan, quickRescheduleTimes } from "@/lib/planner/resolvePlan";
import { deleteSeries } from "@/lib/recurrenceUtils";
import { deleteLinkedSleep } from "@/lib/planner/linkedSleep";
import { upcomingOccurrences } from "@/lib/plannerEventDates";
import { HOUR_PX_MIN, HOUR_PX_MAX } from "@/lib/planner/displayPrefs";
import { withTrashBatch } from "@/lib/localDb";
import {
  monthCells, weekdayLetters, dayKeyOf, hoursWords, whenWords, plansListGroups, entriesByDay,
  entryTone, colourOf, TONE_WORDS, yearMonths,
} from "@/house/planner/plannerModel";
import { format } from "date-fns";

/** After any plan write: the lists that read plans re-read. */
export function useRefreshPlans() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["dailyProgress"] });
  };
}

// ── Left: the month, the categories ───────────────────────────────────
export function MonthPanel({ anchor, weekStart, weekKeys, onPick, collapsible = false, defaultOpen = true }) {
  const [shown, setShown] = useState(null);
  const month = shown || new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const step = (dir) => setShown(new Date(month.getFullYear(), month.getMonth() + dir, 1));
  // Follow the calendar when it moves to another month.
  const anchorMonth = `${anchor.getFullYear()}-${anchor.getMonth()}`;
  const [seen, setSeen] = useState(anchorMonth);
  if (seen !== anchorMonth) { setSeen(anchorMonth); setShown(null); }
  const title = format(month, "MMMM yyyy");
  return (
    <div data-tour="planner-month-panel">
      <Panel title={title} className="hpl-panel" collapsible={collapsible} defaultOpen={defaultOpen}
        tools={(
          <>
            <IconButton icon={ChevronLeft} label="Show the month before" onClick={() => step(-1)} />
            <IconButton icon={ChevronRight} label="Show the month after" onClick={() => step(1)} />
          </>
        )}>
        <div className="hpl-pad">
          <MiniMonth label={title} letters={weekdayLetters(weekStart)} cells={monthCells(month, weekStart)}
            todayKey={dayKeyOf(new Date())} selectedKey={dayKeyOf(anchor)} weekKeys={weekKeys} onPick={onPick} />
        </div>
      </Panel>
    </div>
  );
}

export function CategoriesPanel({ categories = [], hidden = [], onToggle, collapsible = false, defaultOpen = true }) {
  const navigate = useNavigate();
  const rows = useMemo(() => flattenCategoryTree(categories), [categories]);
  const off = new Set(hidden);
  return (
    <div data-tour="planner-px-categories" className="hpl-grow">
      <Panel title="Categories" className="hpl-panel hpl-grow" collapsible={collapsible} defaultOpen={defaultOpen}
        tools={<Button rank="quiet" onClick={() => navigate("/activities")}>manage</Button>}>
        {rows.length === 0 ? (
          <EmptyBlock compact title="No categories yet" body="Sort activities into categories (Self-care, Work…) to colour the calendar and see where the time goes."
            action={{ label: "Make categories", rank: "secondary", onClick: () => navigate("/activities") }} />
        ) : (
          <ul className="hpl-cats" aria-label="Categories on the calendar">
            {rows.map((c) => {
              const hiddenHere = off.has(c.id);
              const name = c.name || "Untitled";
              return (
                <li key={c.id} className="hpl-cat" data-off={hiddenHere || undefined}>
                  <Checkbox label={(
                    <span className="hpl-cat-label" style={{ paddingLeft: `${Math.min(c._depth || 0, MAX_RENDER_DEPTH) * 0.875}rem` }}>
                      <span className="hpl-sq" style={{ background: c.color || "var(--house-muted)" }} aria-hidden="true" />
                      <span className="hpl-cat-name">{name}</span>
                    </span>
                  )} checked={!hiddenHere} onChange={() => onToggle(c.id)}
                    description={hiddenHere ? "Hidden from the calendar on this device" : undefined} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ── Right: this week, goals, needs a decision ──────────────────────────
export function ThisWeekPanel({ summary, totals = [], onInsights, collapsible = false }) {
  const max = Math.max(1, ...totals.map((t) => t.minutes));
  const total = summary?.scheduled || 0;
  const done = summary?.completed || 0;
  return (
    <div data-tour="planner-px-week">
      <Panel title="This week" className="hpl-panel" collapsible={collapsible}
        tools={<Button rank="quiet" onClick={onInsights}>Insights</Button>}>
        <div className="hpl-pad hpl-stack">
          <div className="hpl-between"><span className="hpl-muted">Plans done</span><span className="hpl-num">{`${done} of ${total}`}</span></div>
          <div className="hpl-meter" role="meter" aria-label="Plans done this week" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={done}>
            <span style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
          </div>
          {totals.length === 0 ? <p className="hpl-muted hpl-p">Nothing logged this week yet.</p> : null}
          {totals.map((r) => (
            <div key={r.key} className="hpl-total">
              <span className="hpl-muted hpl-total-name">{r.label}</span>
              <span className="hpl-bar" aria-hidden="true"><span style={{ width: `${Math.round((r.minutes / max) * 100)}%`, background: r.colour || "var(--house-muted)" }} /></span>
              <span className="hpl-num hpl-total-h">{hoursWords(r.minutes)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function GoalsPanel({ rows = [], onOpen, collapsible = false }) {
  return (
    <Panel title="Goals" className="hpl-panel" collapsible={collapsible} tools={<Button rank="quiet" onClick={onOpen}>week</Button>}>
      <div className="hpl-pad hpl-stack-s">
        {rows.length === 0 ? (
          <p className="hpl-muted hpl-p">No weekly goals yet. Set one in Insights, like "Move 3 h".</p>
        ) : rows.map((g) => {
          const met = g.done >= g.target;
          return (
            <div key={g.id} className="hpl-between">
              <span className="hpl-trunc">{`${g.label} ${hoursWords(g.target)}`}</span>
              <span className="hpl-num" data-good={met || undefined} data-warn={met ? undefined : ""}>{met ? "done" : hoursWords(g.done)}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

const MOVE_WORDS = { hour: "In an hour", evening: "This evening", tomorrow: "Tomorrow, same time" };

/** One plan that needs a decision: Done · Partly · Skipped, and ⋯ for Called off, Move and the details. */
export function DecisionRow({ item, fmt, onOpen }) {
  const refresh = useRefreshPlans();
  const [busy, setBusy] = useState(false);
  const name = item.activity_name || "Activity";
  const run = async (fn, words) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); refresh(); showToast({ message: words }); }
    catch (e) { showToast({ tone: "failed", message: `Couldn't save that for ${name}.`, detail: `${e?.message ? `${e.message}. ` : ""}Nothing was changed.` }); }
    finally { setBusy(false); }
  };
  const outcome = (status, words) => run(() => resolveOutcome(item, status), `${name}: ${words}.`);
  const moves = quickRescheduleTimes(item).map((m) => ({
    id: `move-${m.id}`, label: `Move: ${MOVE_WORDS[m.id] || format(m.when, "EEE p")}`,
    onSelect: () => run(() => reschedulePlan(item, m.when), `${name} moved to ${format(m.when, "EEE MMM d, p")}.`),
  }));
  return (
    <li className="hpl-decide">
      <p className="hpl-decide-name"><b>{name}</b> <span className="hpl-muted">{whenWords(item, fmt)}</span></p>
      <div className="hpl-decide-row" role="group" aria-label={`How did ${name} go?`}>
        <Button rank="secondary" busy={busy} onClick={() => outcome("done", "done")}>Done</Button>
        <Button rank="secondary" onClick={() => outcome("partial", "partly done")} disabledReason={busy ? "Saving…" : undefined}>Partly</Button>
        <Button rank="secondary" onClick={() => outcome("skipped", "skipped")} disabledReason={busy ? "Saving…" : undefined}>Skipped</Button>
        <Menu label={`More for ${name}`} items={[
          ...moves,
          { id: "more-time", label: "Move to another time…", onSelect: () => onOpen(item) },
          { id: "off", label: "Called off", onSelect: () => outcome("cancelled", "called off") },
          { id: "open", label: "Open the details", onSelect: () => onOpen(item) },
        ]} />
      </div>
    </li>
  );
}

export function DecisionsPanel({ items = [], fmt, onOpen, limit = 6, collapsible = false }) {
  return (
    <div data-tour="planner-px-decisions" className="hpl-grow">
      <Panel title="Needs a decision" className="hpl-panel hpl-grow" collapsible={collapsible}
        tools={<span className="hpl-num hpl-count" aria-label={`${items.length} waiting`}>{items.length}</span>}>
        {items.length === 0 ? (
          <p className="hpl-pad hpl-muted hpl-p">Nothing waiting. Plans whose time has passed wait here until you say how they went.</p>
        ) : (
          <ul className="hpl-pad hpl-decides" aria-label="Plans that need a decision">
            {items.slice(0, limit).map((a) => <DecisionRow key={a.id} item={a} fmt={fmt} onOpen={onOpen} />)}
            {items.length > limit ? <li className="hpl-muted">{`${items.length - limit} more in the Plans list.`}</li> : null}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ── Month and year views ───────────────────────────────────────────────
export function MonthView({ anchor, weekStart, activities, events, dates, byId, fmt, compact, onPickDay, onOpenEntry, onOpenAllDay, nameOfDate }) {
  const cells = useMemo(() => monthCells(new Date(anchor.getFullYear(), anchor.getMonth(), 1), weekStart), [anchor, weekStart]);
  const byDay = useMemo(() => entriesByDay(activities), [activities]);
  const now = new Date();
  const items = (c) => {
    const list = [];
    for (const occ of events) {
      if (occ.key === c.key) list.push({ key: `ev:${occ.event.id}:${occ.key}`, kind: "event", label: occ.event.title || "Event", colour: occ.event.tag_color || null, event: occ.event, occurrenceKey: occ.key, words: "event" });
    }
    for (const d of dates) {
      if (d.month === c.date.getMonth() + 1 && d.day === c.date.getDate()) list.push({ key: `date:${d.alterId}:${d.fieldName}`, kind: "date", label: nameOfDate(d), date: d, colour: d.color || null });
    }
    for (const a of byDay.get(c.key) || []) {
      const tone = entryTone(a, now);
      const when = a.timestamp ? new Date(a.timestamp) : null;
      list.push({
        key: a.id, kind: a._isTask ? "todo" : "entry", tone, item: a, colour: a._isTask ? null : colourOf(a, byId),
        label: `${when && !a._dueOnly && !compact ? `${format(when, fmt === "ampm" ? "h:mm" : "HH:mm")} ` : ""}${a.activity_name || "Activity"}`,
        words: compact && when && !a._dueOnly ? `${format(when, fmt === "ampm" ? "h:mm a" : "HH:mm")}, ${TONE_WORDS[tone]}` : TONE_WORDS[tone],
      });
    }
    return list;
  };
  return (
    <div className="hpl-scroll">
      <MonthBoard label={format(anchor, "MMMM yyyy")} letters={weekdayLetters(weekStart)} cells={cells}
        todayKey={dayKeyOf(now)} items={items} onPickDay={onPickDay}
        onPickItem={(it) => (it.item ? onOpenEntry(it.item) : onOpenAllDay(it))} />
    </div>
  );
}

export function YearView({ anchor, weekStart, activities, events, onPickMonth, onPickDay }) {
  const months = useMemo(() => yearMonths(anchor.getFullYear(), activities, events)
    .map((m) => ({ ...m, key: m.label, cells: monthCells(m.month, weekStart) })), [anchor, activities, events, weekStart]);
  return (
    <div className="hpl-scroll">
      <YearBoard label={String(anchor.getFullYear())} months={months} letters={weekdayLetters(weekStart)}
        todayKey={dayKeyOf(new Date())} onPickMonth={onPickMonth} onPickDay={onPickDay} />
    </div>
  );
}

// ── The plans list ─────────────────────────────────────────────────────
export function PlansListView({ activities, categories, alters, events, weekStart, fmt, onOpen, onOpenEvent, onAddEvent, onEditSeries, onDeleteSeries }) {
  const [which, setWhich] = useState("open");
  const [selectOpen, setSelectOpen] = useState(false);
  const refresh = useRefreshPlans();
  const groups = useMemo(() => plansListGroups(activities, { weekStart, resolved: which === "resolved" }), [activities, weekStart, which]);
  const coming = useMemo(() => upcomingOccurrences(events, { limit: 8 }), [events]);
  const massChange = async (kind, items) => {
    try {
      if (kind === "delete") {
        await withTrashBatch(async () => {
          await deleteSeries(items);
          for (const it of items) await deleteLinkedSleep(it);
        });
        showToast({ message: `${items.length} moved to trash.`, detail: "Find them in Recent changes." });
      } else {
        for (const it of items) await resolveOutcome(it, "cancelled");
        showToast({ message: `${items.length} called off.` });
      }
    } catch (e) {
      showToast({ tone: "failed", message: "Couldn't change all of them.", detail: `${e?.message ? `${e.message}. ` : ""}Anything already changed is kept.` });
    }
    refresh();
  };
  return (
    <div className="hpl-scroll hpl-list" data-tour="planner-events">
      <div className="hpl-list-tools">
        <Segmented label="Which plans" value={which} onChange={setWhich}
          options={[{ value: "open", label: "Still to do" }, { value: "resolved", label: "Resolved" }]} />
        <span className="hpl-flex" />
        <Button rank="secondary" icon={ListChecks} onClick={() => setSelectOpen(true)}>Select several…</Button>
        <Button rank="secondary" onClick={onAddEvent}>+ Event</Button>
      </div>
      {groups.length === 0 ? (
        <EmptyBlock compact title={which === "resolved" ? "Nothing resolved yet" : "Nothing planned"}
          body={which === "resolved" ? "Plans you mark done, partly, skipped or called off show here." : "Plans you make show here, soonest first. A repeating plan is one row."} />
      ) : groups.map((g) => (
        <section key={g.id} className="hpl-list-group" aria-label={g.label}>
          <h3 className="hpl-list-h house-label">{g.label} <span className="hpl-muted">{g.rows.length}</span></h3>
          <ul className="hpl-rows">
            {g.rows.map((r) => {
              const tone = entryTone(r.item);
              return (
                <li key={r.key} data-highlight-id={r.item.id}>
                  <Row title={r.item.activity_name || "Activity"}
                    subtitle={`${whenWords(r.item, fmt)}${r.series ? ` · repeats, ${r.count} ahead` : ""}`}
                    meta={TONE_WORDS[tone]}
                    lead={<span className="hpl-sq" style={{ background: colourOf(r.item, Object.fromEntries(categories.map((c) => [c.id, c]))) || "var(--house-muted)" }} aria-hidden="true" />}
                    onClick={() => onOpen(r.item)} />
                  {r.series ? (
                    <div className="hpl-series">
                      <Button rank="quiet" onClick={() => onEditSeries(r.item)}>Change the series</Button>
                      <Button rank="quiet" onClick={() => onDeleteSeries(r.item)}>Delete…</Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {g.more ? <p className="hpl-muted hpl-p">{`${g.more} older ones: Select several… lists them all.`}</p> : null}
        </section>
      ))}
      {which === "open" && coming.length ? (
        <section className="hpl-list-group" aria-label="Events coming up">
          <h3 className="hpl-list-h house-label">Events coming up</h3>
          <ul className="hpl-rows">
            {coming.map((o) => (
              <li key={`${o.event.id}:${o.key}`}>
                <Row title={o.event.title || "Event"} subtitle={format(o.date, "EEE MMM d")} meta="event"
                  lead={<span className="hpl-sq" style={{ background: o.event.tag_color || "var(--house-accent)" }} aria-hidden="true" />}
                  onClick={() => onOpenEvent({ event: o.event, occurrenceKey: o.key })} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Sheet open={selectOpen} onClose={() => setSelectOpen(false)} title="Plans: select several" size="full" className="hpl-old-sheet">
        <div className="hpl-old">
          <PlansList activities={activities} categories={categories} alters={alters} weekStartsOn={weekStart}
            onOpen={(item, { series } = {}) => { setSelectOpen(false); if (series) onEditSeries(item); else onOpen(item); }}
            onDeleteSeries={(item) => { setSelectOpen(false); onDeleteSeries(item); }}
            onMassChange={massChange} />
        </div>
      </Sheet>
    </div>
  );
}

// ── Insights ───────────────────────────────────────────────────────────
function PanelError({ label, onRetry }) {
  return (
    <div className="hpl-pad">
      <p className="hpl-p">{`${label}: something went wrong showing this. Your data is safe.`}</p>
      <Button rank="secondary" onClick={onRetry}>Try again</Button>
    </div>
  );
}

export function InsightsView({ terms, rangeLabel, totals, weekFrom, activities }) {
  const fmt = (m) => hoursWords(m);
  return (
    <div className="hpl-scroll hpl-insights">
      <Panel title={`The week: ${rangeLabel}`} className="hpl-panel">
        <div className="hpl-pad hpl-cols2">
          <div>
            <h3 className="hpl-list-h house-label">By activity</h3>
            {totals.activities.length === 0 ? <p className="hpl-muted hpl-p">Nothing logged this week yet.</p> : (
              <ul className="hpl-kv">{totals.activities.slice(0, 10).map((a) => <li key={a.key}><span className="hpl-trunc">{a.label}</span><span className="hpl-num">{fmt(a.minutes)}</span></li>)}</ul>
            )}
          </div>
          <div>
            <h3 className="hpl-list-h house-label">{`By ${terms.alter}`}</h3>
            {totals.alters.length === 0 ? <p className="hpl-muted hpl-p">{`No ${terms.alters} named on this week's entries.`}</p> : (
              <ul className="hpl-kv">{totals.alters.map((a) => <li key={a.key}><span className="hpl-trunc">{a.label}</span><span className="hpl-num">{fmt(a.minutes)}</span></li>)}</ul>
            )}
          </div>
        </div>
      </Panel>
      <Panel title="Weekly goals" className="hpl-panel">
        <div className="hpl-old">
          <ErrorBoundary fallback={(err, reset) => <PanelError label="Goals" onRetry={reset} />} resetKeys={[activities.length]}>
            <ActivityGoalsPanel weekStart={weekFrom} />
          </ErrorBoundary>
        </div>
      </Panel>
      <Panel title="Plan follow-through" className="hpl-panel hpl-wide">
        <div className="hpl-old">
          <ErrorBoundary fallback={(err, reset) => <PanelError label="Plan follow-through" onRetry={reset} />} resetKeys={[activities.length]}>
            <PlanCompletionTracker />
          </ErrorBoundary>
        </div>
      </Panel>
      <Panel title="All-time tally" className="hpl-panel hpl-wide">
        <div className="hpl-old">
          <ErrorBoundary fallback={(err, reset) => <ActivityNestingRecovery error={err} onReset={reset} />} resetKeys={[activities.length]}>
            <ActivityTallyTracker activities={activities} />
          </ErrorBoundary>
        </div>
      </Panel>
    </div>
  );
}

// ── Planner options ────────────────────────────────────────────────────
export const PREF_DEFAULTS = Object.freeze({ timeFmt: "24", weekStartsOn: 1, hourPx: 44, laneOpacity: 90 });

export function PlannerOptionsSheet({ open, onClose, terms, prefs, setPref, overlays, setOverlay }) {
  const navigate = useNavigate();
  const reset = () => {
    for (const [k, v] of Object.entries(PREF_DEFAULTS)) setPref(k, v);
    showToast({ message: "Planner options are back to how they started." });
  };
  return (
    <Sheet open={open} onClose={onClose} title="Planner options" size="half" className="hpl-options">
      <div className="hpl-pad hpl-stack">
        <fieldset className="hpl-fieldset">
          <legend className="hpl-list-h house-label">On the calendar</legend>
          <Checkbox label={terms.Fronting} description={`Who was ${terms.fronting}, as thin bars down each day`}
            checked={!!overlays.alters} onChange={(v) => setOverlay("alters", !!v)} />
          <Checkbox label="Check-ins" description="Feelings logged, as dots at their time" checked={!!overlays.emotions} onChange={(v) => setOverlay("emotions", !!v)} />
          <Checkbox label="Places" description="Locations saved, as small diamonds" checked={overlays.locations !== false} onChange={(v) => setOverlay("locations", !!v)} />
        </fieldset>
        <Segmented showLabel label="Clock" value={prefs.timeFmt} onChange={(v) => setPref("timeFmt", v)}
          options={[{ value: "24", label: "24-hour" }, { value: "ampm", label: "12-hour" }]} />
        <Segmented showLabel label="Week starts" value={prefs.weekStartsOn} onChange={(v) => setPref("weekStartsOn", Number(v))}
          options={[{ value: 1, label: "Monday" }, { value: 0, label: "Sunday" }]} />
        <SliderRow label="Hour height" value={prefs.hourPx} fallback={PREF_DEFAULTS.hourPx} min={HOUR_PX_MIN} max={HOUR_PX_MAX} step={2} unit="px"
          onChange={(v) => setPref("hourPx", v)} />
        <SliderRow label={`${terms.Fronting} bars`} value={prefs.laneOpacity} fallback={PREF_DEFAULTS.laneOpacity} min={10} max={100} step={5} unit="%"
          onChange={(v) => setPref("laneOpacity", v)} />
        <div className="hpl-links">
          <Button rank="quiet" onClick={() => { onClose(); navigate("/activities"); }}>Activities and categories</Button>
          <Button rank="quiet" onClick={() => { onClose(); navigate("/reminders"); }}>Reminders</Button>
        </div>
        <Button rank="secondary" onClick={reset}>Reset</Button>
      </div>
    </Sheet>
  );
}
