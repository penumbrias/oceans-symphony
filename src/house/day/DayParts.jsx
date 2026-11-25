// The layered timeline's shared parts (boards 01-Main, 08-Phone,
// 09-TimelineOptions and 10-Inspector's grammar), drawn by the Home room's
// timeline dock and by the Timeline room. ONE copy of each:
//
//   useDayTimeline(page)  the stretch on screen (a day, six hours or a week),
//                         its lanes and ruler, from the timeline's own slice
//   DayTimelinePanel      the "Timeline" panel: Day · 6 hours · Week, the
//                         date (Go to a day), ‹ Now ›, Add, Options, the lanes
//   DayInfoPanel          Info for the picked thing, with what it can do
//   DayLayersPanel        Layers: show, hide, reorder, "+ add"
//   TimelineOptionsSheet  board 09: Show, Whose, Layers, Colour, Reset
//   useDayEditors         the sheets and old forms Info opens
//
// Display only, plus quick acts through the records' write paths (plans
// through resolvePlan.js, fronting through frontSessionEdit.js and
// SetFrontSheet, symptom episodes through symptomSessions.js). What shows
// is a device preference (src/house/home/layerPrefs.js).

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal, List, Palette } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useTimelineSources, sliceTimelineDay } from "@/lib/timelineData";
import { useMedications, useMedicationDoses } from "@/lib/medications";
import { usePlannerPrefs } from "@/lib/planner/displayPrefs";
import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { activityDate } from "@/lib/dateUtils";
import { clockOpts } from "@/lib/timeFormat";
import { redactWhispers } from "@/lib/whisperRedact";
import { useFrontLevels, getSessionLevel, frontLevelLabel } from "@/lib/frontLevels";
import { parseSessionNote, parseSessionEmotions, parseSessionSymptoms } from "@/lib/perAlterSessionEntries";
import { endSymptomSession } from "@/lib/symptomSessions";
import { getCategoryMeta } from "@/lib/locationCategories";
import { resolveOutcome, startPlanActive, requestPlanResolve, reschedulePlan, quickRescheduleTimes } from "@/lib/planner/resolvePlan";
import { AlterSessionEdit } from "@/components/timeline/AlterSessionPopover";
import { SymptomSessionPopup } from "@/components/timeline/SymptomSessionPopup";
import QuickCheckInModal from "@/components/emotions/QuickCheckInModal";
import { Button, IconButton } from "@/house/kit/Button";
import { Panel, PageTabs, TabPanel } from "@/house/kit/Panel";
import { Segmented } from "@/house/kit/Choices";
import { AlterPicker, ColourField } from "@/house/kit/Pickers";
import { Sheet } from "@/house/kit/Sheet";
import { showToast } from "@/house/kit/Toast";
import Info from "@/house/kit/Info";
import Layers from "@/house/kit/Layers";
import Menu from "@/house/kit/Menu";
import { EmptyBlock } from "@/house/kit/States";
import TimeLanes from "@/house/kit/TimeLanes";
import { spanIn } from "@/house/home/homeModel";
import { DAY_LAYERS, buildDayLanes, visibleGroups, otherKindPage } from "@/house/home/dayLayers";
import {
  HOUSE_HOME_LAYERS_EVENT, HOUSE_HOME_LAYERS_KEY, readHiddenLayers, readLayerOrder, readLayerColours, readTimelineView,
  setLayerShown, setLayerOrder, setLayerColour, setTimelineView, resetTimelinePrefs, restoreTimelinePrefs,
} from "@/house/home/layerPrefs";
import {
  nowAnchor, anchorForDay, viewWindow, stepAnchor, holdsNow, switchRange, daysOf, rulerTicks, mergeSlices, filterWhose,
  weekEventItems, rangeLabels, timeOnDay,
} from "@/house/day/dayView";
import {
  SplitSheet, AddPastFrontSheet, ReassignSheet, RemoveSessionConfirm, AddAtSheet, GoToDaySheet, endSessionNow, useRefreshFront,
} from "@/house/day/DaySheets";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/day/day.css";

export const timeOf = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...clockOpts() }) : "");
const hourOf = (d) => new Date(d).toLocaleTimeString([], { hour: "numeric", ...clockOpts() });
export const dayWords = (d) => new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const plain = (s) => redactWhispers(String(s || "")).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const STATUS_WORDS = { scheduled: "Planned", done: "Done", partial: "Partly done", skipped: "Skipped", cancelled: "Cancelled", logged: "Logged" };

export function useNow(ms = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

/** The layer prefs, kept live (this tab and others). `page` adds its Show and Whose. */
export function useLayerPrefs(page = "home") {
  const read = () => ({ hidden: readHiddenLayers(), order: readLayerOrder(), colours: readLayerColours(), view: readTimelineView(page) });
  const [prefs, setPrefs] = useState(read);
  useEffect(() => {
    const on = () => setPrefs(read());
    const onStorage = (e) => { if (!e.key || e.key === HOUSE_HOME_LAYERS_KEY) on(); };
    window.addEventListener(HOUSE_HOME_LAYERS_EVENT, on);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(HOUSE_HOME_LAYERS_EVENT, on); window.removeEventListener("storage", onStorage); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  return prefs;
}

// Place items in the window; a person's own layer colour wins.
function placeGroups(groups, win, colours = {}) {
  return groups.map((g) => ({
    ...g,
    rows: g.rows.map((r) => {
      const own = colours[r.layer];
      const color = own && r.layer !== "fronting" ? own : r.color;
      return {
        ...r, color,
        items: r.items
          .map((it) => ({ ...it, color: own && r.layer !== "fronting" ? own : it.color, pos: spanIn(win, it.start, it.end ?? (it.kind === "bar" ? Date.now() : null), { minWidth: 0.6 }) }))
          .filter((it) => it.pos),
      };
    }),
  }));
}

// ── The stretch on screen and its lanes ───────────────────────────────
export function useDayTimeline(page = "timeline") {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const prefs = useLayerPrefs(page);
  const [plannerPrefs] = usePlannerPrefs();
  const weekStart = plannerPrefs?.weekStartsOn ?? 1;
  const now = useNow();
  const range = prefs.view.range;
  const whose = prefs.view.whose;
  const [anchor, setAnchor] = useState(() => nowAnchor(range, new Date(), weekStart));
  const prevRange = useRef(range);
  useEffect(() => {
    if (prevRange.current === range) return;
    const from = prevRange.current;
    prevRange.current = range;
    setAnchor((a) => switchRange(from, a, range, new Date(), weekStart));
  }, [range, weekStart]);

  const src = useTimelineSources();
  const { data: doses = [] } = useMedicationDoses();
  const { data: meds = [] } = useMedications();
  const win = useMemo(() => viewWindow(range, anchor, weekStart), [range, anchor, weekStart]);
  const daySlices = useMemo(() => daysOf(win).map((d) => sliceTimelineDay(src, d)), [src, win]);
  const alterMap = useMemo(() => Object.fromEntries((src.alters || []).map((a) => [a.id, a])), [src.alters]);
  const categoryMap = useMemo(() => Object.fromEntries((src.categories || []).map((c) => [c.id, c])), [src.categories]);
  const symptomMap = useMemo(() => Object.fromEntries((src.symptoms || []).map((s) => [s.id, s])), [src.symptoms]);
  const medMap = useMemo(() => Object.fromEntries((meds || []).map((m) => [m.id, m])), [meds]);
  const nameOf = (id) => (alterMap[id] ? formatAlter(alterMap[id]) : terms.Alter);
  const slice = useMemo(() => {
    const m = mergeSlices(daySlices);
    m.doses = (doses || []).filter((x) => { const t = new Date(x?.timestamp).getTime(); return t >= win.start && t < win.end; });
    return filterWhose(m, whose);
  }, [daySlices, doses, win, whose]);
  const lanes = useMemo(() => {
    const l = buildDayLanes(slice, { alters: alterMap, categories: categoryMap, symptoms: symptomMap, medications: medMap, nameOf, terms, now: now.getTime() });
    if (range !== "week") return l;
    // A week: each day's dates and events sit on that day.
    const plans = l.groups.find((g) => g.id === "plans");
    if (plans) plans.rows.push({ id: "events", layer: "events", label: "Events", items: weekEventItems(daySlices) });
    return { ...l, allDay: [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slice, alterMap, categoryMap, symptomMap, medMap, formatAlter, now, range, daySlices, terms]);
  const groups = useMemo(() => placeGroups(visibleGroups(lanes, prefs.hidden, prefs.order), win, prefs.colours), [lanes, prefs, win]);
  const ticks = rulerTicks(range, win).filter((t) => t.left >= 0 && t.left < 100)
    .map((t) => ({ ...t, label: t.day ? t.at.toLocaleDateString([], { weekday: "short", day: "numeric" }) : hourOf(t.at) }));
  const isNow = holdsNow(range, anchor, now, weekStart);
  const nowLeft = isNow ? spanIn(win, now, null)?.left ?? null : null;
  const words = range === "week"
    ? `${new Date(win.start).toLocaleDateString([], { month: "short", day: "numeric" })} – ${new Date(win.end - 1).toLocaleDateString([], { month: "short", day: "numeric" })}`
    : range === "hours6" ? `${dayWords(win.start)}, ${hourOf(win.start)}–${hourOf(win.end)}` : dayWords(win.start);
  const any = groups.some((g) => g.rows.some((r) => r.items.length)) || (lanes.allDay || []).length > 0;
  return {
    page, terms, range, whose, prefs, weekStart, now, anchor, win, words, isNow, nowLeft, ticks, groups, lanes, slice, daySlices, src, any,
    alterMap, categoryMap, symptomMap, medMap, nameOf, firstDay: new Date(win.start),
    setRange: (r) => setTimelineView(page, { range: r }),
    setWhose: (id) => setTimelineView(page, { whose: id || null }),
    step: (dir) => setAnchor((a) => stepAnchor(range, a, dir, weekStart)),
    goNow: () => setAnchor(nowAnchor(range, new Date(), weekStart)),
    goDay: (d) => setAnchor(anchorForDay(range, d, new Date(), weekStart)),
  };
}

// ── The Timeline panel (board 01-Main's dock; the room's canvas) ──────
export function DayTimelinePanel({ tl, selected, onSelect, onOptions, onAdd, ranges = ["day", "hours6", "week"], className = "", bodyClassName = "", compact = false, title = "Timeline" }) {
  const [folded, setFolded] = useState([]);
  const [goOpen, setGoOpen] = useState(false);
  const labels = rangeLabels(tl.page);
  const emptyWords = tl.whose
    ? `Nothing of ${tl.nameOf(tl.whose)}'s here yet. Pick "Everyone" in Options to see the whole ${tl.terms.system}.`
    : `Nothing here yet. Check-ins, plans and who's ${tl.terms.fronting} show up as they happen.`;
  const label = `${tl.words}, layer by layer${tl.whose ? `, ${tl.nameOf(tl.whose)} only` : ""}`;
  return (
    <Panel title={title} className={`hd-panel hd-timeline ${className}`} bodyClassName={`hd-timeline-body ${bodyClassName}`}
      tools={(
        <span className="hd-tl-tools" data-tour="timeline-jump">
          <Segmented label="Show" options={ranges.map((r) => ({ value: r, label: labels[r] }))} value={ranges.includes(tl.range) ? tl.range : ranges[0]}
            onChange={(v) => tl.setRange(v)} />
          <Button rank="quiet" className="hd-tl-date" onClick={() => setGoOpen(true)} aria-label={`${tl.words}: go to a day`}>{tl.words}</Button>
          <IconButton icon={ChevronLeft} label={tl.range === "week" ? "The week before" : tl.range === "hours6" ? "Six hours before" : "The day before"} onClick={() => tl.step(-1)} />
          <Button rank="quiet" aria-pressed={tl.isNow} onClick={tl.goNow}>Now</Button>
          <IconButton icon={ChevronRight} label={tl.range === "week" ? "The week after" : tl.range === "hours6" ? "Six hours after" : "The day after"} onClick={() => tl.step(1)} />
          {onAdd ? <IconButton icon={Plus} label="Add something you missed" onClick={onAdd} data-tour="timeline-add" /> : null}
          {onOptions ? <IconButton icon={SlidersHorizontal} label="Options for the timeline" onClick={onOptions} data-tour="timeline-options" /> : null}
        </span>
      )}>
      <TimeLanes label={label} ticks={tl.ticks} now={tl.nowLeft} nowLabel={tl.nowLeft != null ? timeOf(tl.now) : null}
        groups={tl.groups} allDay={tl.prefs.hidden.includes("events") ? [] : tl.lanes.allDay} selected={selected}
        onSelect={(it) => onSelect?.({ key: it.key, label: it.label, ref: it.ref })}
        folded={folded} onFold={(id) => setFolded((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))}
        onHideLayer={compact ? undefined : (id) => setLayerShown(id, false)} compact={compact}
        empty={emptyWords} />
      {!tl.any && tl.groups.length ? <p className="hd-hint hd-tl-empty">{emptyWords}</p> : null}
      <GoToDaySheet open={goOpen} day={tl.firstDay} onClose={() => setGoOpen(false)} onGo={(d) => tl.goDay(d)} />
    </Panel>
  );
}

// ── Layers (board 01-Main's right dock) ───────────────────────────────
export function hiddenLayerMenu(prefs) {
  return DAY_LAYERS.filter((l) => prefs.hidden.includes(l.id)).map((l) => ({ id: l.id, label: `Show ${l.label}`, onSelect: () => setLayerShown(l.id, true) }));
}

export function DayLayersPanel({ prefs, title = "Layers" }) {
  const add = hiddenLayerMenu(prefs);
  const layers = prefs.order.map((id) => DAY_LAYERS.find((l) => l.id === id)).filter(Boolean)
    .map((l) => ({ ...l, name: l.label, visible: !prefs.hidden.includes(l.id), color: prefs.colours[l.id] || l.color }));
  return (
    <Panel title={title} className="hd-panel hd-layers"
      tools={add.length ? <Menu label="Add a layer" items={add} icon={Plus} rank="quiet">add</Menu> : null}>
      <div data-tour="timeline-filters">
        <Layers label="Timeline layers" layers={layers}
          renderLead={(l) => <span className="hd-swatch" style={{ "--hd-c": l.color }} aria-hidden="true" />}
          onToggle={(id, visible) => setLayerShown(id, visible)}
          onReorder={(next) => setLayerOrder(next.map((l) => l.id))} />
      </div>
      <p className="hd-hint">Each layer reads one kind of record. Hide, reorder or recolour them; this device remembers.</p>
    </Panel>
  );
}

// ── Options (board 09-TimelineOptions) ────────────────────────────────
export function TimelineOptionsSheet({ open, onClose, page = "timeline" }) {
  const terms = useTerms();
  const prefs = useLayerPrefs(page);
  const [tab, setTab] = useState("content");
  const labels = rangeLabels(page);
  const add = hiddenLayerMenu(prefs);
  const layers = prefs.order.map((id) => DAY_LAYERS.find((l) => l.id === id)).filter(Boolean)
    .map((l) => ({ ...l, name: l.label, visible: !prefs.hidden.includes(l.id), color: prefs.colours[l.id] || l.color }));
  const reset = () => {
    const { ok, before } = resetTimelinePrefs(page);
    if (!ok) { showToast({ tone: "failed", message: "Couldn't reset the timeline here.", detail: "Your records are safe; only how it looks didn't change." }); return; }
    showToast({ message: "The timeline's content is back to how it started.", detail: "Layers, Show and Whose.", action: { label: "Undo", onClick: () => restoreTimelinePrefs(before) } });
  };
  const title = `${page === "home" ? "Widget options" : "Options"}: Timeline`;
  const tabs = [{ id: "content", label: "Content", icon: List }, { id: "colour", label: "Colour", icon: Palette }];
  return (
    <Sheet open={open} onClose={onClose} title={title} size="half" className="hd-options">
      <PageTabs label={`${title}: sections`} idPrefix={`hd-opt-${page}`} withPanels tabs={tabs} value={tab} onChange={setTab} />
      {tab === "content" ? (
        <TabPanel idPrefix={`hd-opt-${page}`} id="content" className="hd-opt-tab">
          <div className="hd-opt-row">
            <span className="hd-opt-label house-label">Show</span>
            <Segmented label="Show" options={["day", "hours6", "week"].map((r) => ({ value: r, label: labels[r] }))} value={prefs.view.range}
              onChange={(v) => setTimelineView(page, { range: v })} />
          </div>
          <div className="hd-opt-row">
            <span className="hd-opt-label house-label" aria-hidden="true">Whose</span>
            <AlterPicker label="Whose" value={prefs.view.whose} onChange={(id) => setTimelineView(page, { whose: id || null })} showNone noneLabel="Everyone" placeholder="Everyone" />
          </div>
          <div className="hd-opt-head house-label"><span>Layers</span><span className="hd-muted">move with the arrows</span></div>
          <div className="hd-opt-layers">
            <Layers label="Timeline layers" layers={layers}
              renderLead={(l) => <span className="hd-swatch" style={{ "--hd-c": l.color }} aria-hidden="true" />}
              onToggle={(id, visible) => setLayerShown(id, visible)}
              onReorder={(next) => setLayerOrder(next.map((l) => l.id))} />
          </div>
          {add.length ? <Menu label="Add a layer" items={add} icon={Plus} rank="secondary">Add a layer</Menu> : null}
          <p className="hd-hint">{`A layer shows one kind of record: plans, events, meds, sleep, journals, places and more. Recolour one on Colour. Whose shows one ${terms.alter}'s records.`}</p>
          <div className="hd-opt-foot"><Button rank="secondary" onClick={reset}>Reset content</Button></div>
        </TabPanel>
      ) : (
        <TabPanel idPrefix={`hd-opt-${page}`} id="colour" className="hd-opt-tab">
          {layers.filter((l) => l.id !== "fronting").map((l) => (
            <ColourField key={l.id} label={l.label} value={prefs.colours[l.id] || null}
              onChange={(c) => setLayerColour(l.id, c)} onClear={() => setLayerColour(l.id, null)} />
          ))}
          <p className="hd-hint">{`${terms.Fronting} keeps each ${terms.alter}'s own colour.`}</p>
          <div className="hd-opt-foot">
            <Button rank="secondary" onClick={() => { for (const id of Object.keys(prefs.colours)) setLayerColour(id, null); }}
              disabledReason={Object.keys(prefs.colours).length ? undefined : "No layer has its own colour yet"}>Reset colour</Button>
          </div>
        </TabPanel>
      )}
    </Sheet>
  );
}

// ── The editors Info opens ────────────────────────────────────────────
export function useDayEditors() {
  const [open, setOpen] = useState(null); // { kind, ... }
  const close = () => setOpen(null);
  const node = (
    <>
      <SplitSheet open={open?.kind === "split"} session={open?.session} alter={open?.alter} onClose={close} />
      <ReassignSheet open={open?.kind === "reassign"} session={open?.session} alter={open?.alter} onClose={close} />
      <RemoveSessionConfirm open={open?.kind === "remove"} session={open?.session} alter={open?.alter} onClose={close} onDone={open?.onDone} />
      <AddPastFrontSheet open={open?.kind === "addFront"} day={open?.day} start={open?.start} onClose={close} />
      <AddAtSheet open={open?.kind === "addAt"} day={open?.day} onClose={close}
        onFront={(t) => setOpen({ kind: "addFront", day: open?.day, start: t })}
        onCheckIn={(t) => setOpen({ kind: "checkIn", at: timeOnDay(open?.day || new Date(), t) })} />
      {open?.kind === "editSession" ? <AlterSessionEdit session={open.session} alter={open.alter} onClose={close} /> : null}
      {open?.kind === "symptom" ? <SymptomSessionPopup session={open.session} symptom={open.symptom} onClose={close} onSave={() => {}} /> : null}
      {open?.kind === "checkIn" ? <QuickCheckInModal isOpen onClose={close} retroTimestamp={open.at || undefined} /> : null}
    </>
  );
  return { open: setOpen, close, node };
}

// ── Info: the picked thing (board 01-Main's right dock) ───────────────
function useInvalidatePlans() {
  const qc = useQueryClient();
  return () => { for (const key of [["activities"], ["tasks"], ["dailyProgress"], ["activeActivities"]]) qc.invalidateQueries({ queryKey: key }); };
}

export function DayInfoPanel({ pick, tl, editors, onSetFront, inRoom = false, onClose }) {
  const terms = useTerms();
  const navigate = useNavigate();
  const run = useInvalidatePlans();
  const refreshFront = useRefreshFront();
  const qc = useQueryClient();
  const levelCfg = useFrontLevels();
  const [busy, setBusy] = useState(null);
  const categories = tl.src.categories || [];
  if (!pick) {
    return (
      <Panel title="Info" className="hd-panel hd-info">
        <EmptyBlock compact title="Nothing picked yet" body="Pick anything on the timeline to see it here, with what you can do with it." />
      </Panel>
    );
  }
  const { ref } = pick;
  const r = ref.record || {};
  const act = async (id, fn) => { setBusy(id); try { await fn(); run(); } catch (e) { toast.error(e?.message || "Couldn't save that"); } finally { setBusy(null); } };
  const go = (path) => { onClose?.(); navigate(path); };
  let kind = "";
  let rows = [];
  let actions = null;
  let menu = [];
  if (ref.type === "activity") {
    const st = statusFor(r);
    const start = activityDate(r);
    const mins = Number(r.duration_minutes) || 0;
    const end = mins ? new Date(start.getTime() + mins * 60000) : null;
    const cat = tl.categoryMap[r.parent_category_id];
    const scheduled = st === ACTIVITY_STATUSES.SCHEDULED;
    kind = scheduled ? "Plan" : "Activity";
    rows = [
      { id: "when", label: "When", value: r.timestamp ? `${dayWords(start)}, ${timeOf(start)}${end ? ` to ${timeOf(end)}` : ""}` : "No time" },
      { id: "status", label: "Status", value: STATUS_WORDS[st] || st },
      { id: "cat", label: "Category", value: cat?.name || null, empty: "None" },
      { id: "who", label: "Who", value: r.alter_id ? tl.nameOf(r.alter_id) : null, empty: "Not set" },
      { id: "repeats", label: "Repeats", value: r.recurrence?.frequency || (r.recurrence_parent_id ? "Part of a series" : null), empty: "No" },
      ...(r.notes ? [{ id: "notes", label: "Notes", value: plain(r.notes) }] : []),
    ];
    actions = (
      <div className="hd-actions hd-wrap">
        {scheduled && start.getTime() >= Date.now() - 6 * 3600000 ? <Button rank="primary" busy={busy === "start"} onClick={() => act("start", () => startPlanActive(r, { categories }))}>Start</Button> : null}
        {scheduled ? <Button rank="secondary" busy={busy === "done"} onClick={() => act("done", () => resolveOutcome(r, "done"))}>Done</Button> : null}
        {scheduled ? (
          <Menu label={`Move ${r.activity_name || "this plan"}`} rank="secondary" items={quickRescheduleTimes(r).map((q) => ({
            id: q.id, label: `${q.id === "hour" ? "In an hour" : q.id === "evening" ? "This evening" : "Tomorrow"}, ${timeOf(q.when)}`,
            onSelect: () => act("move", () => reschedulePlan(r, q.when)),
          }))}>Move</Menu>
        ) : null}
        <Button rank="secondary" onClick={() => requestPlanResolve(r.id)}>{scheduled ? "Edit" : "Details"}</Button>
      </div>
    );
    const dk = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    menu = [{ id: "planner", label: "Open in the Planner", onSelect: () => go(`/planner?date=${dk}&highlight=${r.id}`) }];
  } else if (ref.type === "session") {
    const alterId = ref.alterId || r.alter_id || r.primary_alter_id;
    const alter = tl.alterMap[alterId] || null;
    const name = tl.nameOf(alterId);
    const seed = r.alter_id ? r : { ...r, is_primary: r.primary_alter_id === alterId };
    const lvl = getSessionLevel(seed, levelCfg);
    const live = !r.end_time && r.is_active;
    const notes = parseSessionNote(r.note);
    const feelings = parseSessionEmotions(r.session_emotions);
    const symptoms = parseSessionSymptoms(r.session_symptoms);
    kind = terms.Fronting;
    rows = [
      { id: "who", label: "Who", value: name },
      { id: "since", label: "From", value: `${dayWords(r.start_time)}, ${timeOf(r.start_time)}` },
      { id: "until", label: "Until", value: r.end_time ? `${dayWords(r.end_time)}, ${timeOf(r.end_time)}` : live ? `Still ${terms.fronting}` : "No end recorded" },
      ...(levelCfg.levels.length > 1 && lvl ? [{ id: "level", label: "Level", value: frontLevelLabel(lvl, terms) }] : []),
      ...(feelings.length ? [{ id: "feel", label: "Feelings", value: feelings.map((f) => (typeof f === "string" ? f : f?.name || f?.label)).filter(Boolean).join(", ") }] : []),
      ...(symptoms.length ? [{ id: "sym", label: "Symptoms", value: symptoms.map((s) => `${s.label || "Symptom"}${s.value != null && s.value !== true ? ` ${s.value}` : ""}`).join(", ") }] : []),
      ...(notes.length ? [{ id: "notes", label: notes.length === 1 ? "Note" : `Notes (${notes.length})`, value: plain(notes[notes.length - 1]?.text).slice(0, 160) }] : []),
    ];
    actions = (
      <div className="hd-actions hd-wrap">
        <Button rank="secondary" onClick={() => editors.open({ kind: "editSession", session: r, alter })}>Edit</Button>
        <Button rank="secondary" onClick={() => editors.open({ kind: "split", session: r, alter })}>Split</Button>
        {live ? <Button rank="secondary" busy={busy === "end"} onClick={async () => { setBusy("end"); await endSessionNow({ session: r, alterId, refresh: refreshFront, name, terms }); setBusy(null); }}>End now</Button> : null}
        {onSetFront && live ? <Button rank="secondary" onClick={onSetFront}>{terms.Switch}</Button> : null}
      </div>
    );
    menu = [
      { id: "someone", label: `It wasn't ${name}…`, onSelect: () => editors.open({ kind: "reassign", session: r, alter }) },
      ...(alter ? [{ id: "profile", label: `Open ${name}'s profile`, onSelect: () => go(`/alter/${alterId}`) }] : []),
      ...(inRoom ? [] : [{ id: "timeline", label: "Open in the Timeline", onSelect: () => go(`/timeline?focusSessionId=${r.id}`) }]),
      { id: "remove", label: "Remove from history…", danger: true, onSelect: () => editors.open({ kind: "remove", session: r, alter, onDone: onClose }) },
    ];
  } else if (ref.type === "event" || ref.type === "date") {
    kind = ref.type === "event" ? "Event" : "Date";
    rows = [{ id: "when", label: "When", value: "All day" }];
    actions = <div className="hd-actions"><Button rank="secondary" onClick={() => go("/planner")}>Open the Planner</Button></div>;
  } else if (ref.type === "symptomSession") {
    const def = tl.symptomMap[r.symptom_id || r.symptom_definition_id];
    kind = "Symptom";
    rows = [
      { id: "from", label: "From", value: `${dayWords(r.start_time)}, ${timeOf(r.start_time)}` },
      { id: "until", label: "Until", value: r.end_time ? timeOf(r.end_time) : "Still going" },
      ...(r.notes ? [{ id: "notes", label: "Notes", value: plain(r.notes) }] : []),
    ];
    actions = (
      <div className="hd-actions hd-wrap">
        <Button rank="secondary" onClick={() => editors.open({ kind: "symptom", session: r, symptom: def || { name: pick.label } })}>Edit</Button>
        {!r.end_time ? <Button rank="secondary" busy={busy === "endsym"} onClick={async () => {
          setBusy("endsym");
          try { await endSymptomSession(r.id); qc.invalidateQueries({ queryKey: ["symptomSessions"] }); showToast({ message: `${def?.name || "The symptom"} ended now.` }); }
          catch (e) { showToast({ tone: "failed", message: "Couldn't end it.", detail: `${e?.message || ""} Your data is safe.`.trim() }); }
          finally { setBusy(null); }
        }}>End now</Button> : null}
      </div>
    );
  } else {
    const at = r.timestamp || r.start_time || r.bedtime || r.fired_at || r.scheduled_for || r.created_date;
    const KIND = { emotion: "Check-in", symptomCheckIn: "Symptom", sleep: "Sleep", status: "Status note", location: "Location", journal: "Journal entry", dose: "Meds taken", other: "Entry" };
    kind = KIND[ref.type] || "Entry";
    const who = (r.fronting_alter_ids || (r.alter_id ? [r.alter_id] : [])).map((id) => tl.nameOf(id));
    rows = [
      { id: "when", label: "When", value: at ? `${dayWords(at)}, ${timeOf(at)}` : null },
      ...(ref.type === "sleep" ? [{ id: "woke", label: "Woke", value: r.wake_time ? timeOf(r.wake_time) : "Still asleep" }] : []),
      ...(ref.type === "status" ? [{ id: "note", label: "Note", value: plain(r.note) }] : []),
      ...(ref.type === "emotion" && r.intensity != null ? [{ id: "int", label: "Intensity", value: String(r.intensity) }] : []),
      ...(ref.type === "emotion" && r.note ? [{ id: "enote", label: "Note", value: plain(r.note).slice(0, 160) }] : []),
      ...(ref.type === "location" ? [{ id: "cat", label: "Kind", value: getCategoryMeta(r.category)?.label || null, empty: "Not set" }] : []),
      ...(ref.type === "dose" ? [{ id: "dose", label: "Medicine", value: tl.medMap[r.medication_id]?.name || null, empty: "Not found" }] : []),
      ...(who.length ? [{ id: "who", label: "Who", value: who.join(", ") }] : []),
    ];
    const to = ref.type === "other" ? otherKindPage(ref.kind, r)
      : { journal: `/journals?id=${r.id}`, location: "/location-history", emotion: `/checkin-log?id=${r.id}`, symptomCheckIn: "/checkin-log", status: "/checkin-log", sleep: "/sleep", dose: "/medications" }[ref.type] || "/timeline";
    actions = (
      <div className="hd-actions hd-wrap">
        <Button rank="secondary" onClick={() => go(to)}>Open</Button>
        {ref.type === "location" && r.latitude != null && r.longitude != null ? (
          <Button rank="secondary" onClick={() => window.open(`https://www.google.com/maps?q=${r.latitude},${r.longitude}`, "_blank", "noopener")}>Open in Maps</Button>
        ) : null}
      </div>
    );
  }
  return (
    <Panel title={`Info: ${pick.label}`} className="hd-panel hd-info" tools={onClose ? <Button rank="quiet" onClick={onClose}>Close</Button> : null}>
      <Info title={pick.label} kind={kind} sections={[{ id: "about", title: "About", rows }]} />
      {menu.length ? <div className="hd-info-more"><Menu label={`More for ${pick.label}`} items={menu} rank="quiet">More</Menu></div> : null}
      {actions}
    </Panel>
  );
}
