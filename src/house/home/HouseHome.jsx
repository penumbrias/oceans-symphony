// The house's Home room (the approved mockups: board 01-Main on a desktop or
// tablet, board 08-Phone on a phone). House mode only: the frame draws it on
// "/" (isHouseHomeRoom), while the old Dashboard stays mounted underneath in
// its hosts-only mode, so every ?action= link and dialog keeps working and
// "Boards" (?page=board) still opens the person's own widget board.
//
//   Today  Who's {fronting} · From Planner · Guide · Status · Routines,
//          then the day's timeline dock (layer lanes), Info and Layers.
//   Me     Who's {fronting} · Status · Guide.
//   Plans  From Planner · Routines.
//
// Real data, real actions, through the records' own write paths only:
// setting front opens SetFrontSheet (setFront.js); a status saves through
// saveStatusNote (the full grammar, via MentionTextarea); plans start and
// resolve through resolvePlan.js; routines tick through toggleTemplateDone /
// addTaskCount. Nothing here writes a record by itself. Which layers show
// and in what order is a device preference (layerPrefs.js).

import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useFrontPresence } from "@/lib/useFrontPresence";
import { useTimelineSources, sliceTimelineDay } from "@/lib/timelineData";
import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { activityDate } from "@/lib/dateUtils";
import { clockOpts } from "@/lib/timeFormat";
import { getCommandSign } from "@/lib/commandTerms";
import { saveStatusNote } from "@/lib/checkinEntry";
import { isLogCommandError } from "@/lib/authoredText";
import { redactWhispers } from "@/lib/whisperRedact";
import { useAttentionSlot, ATTENTION } from "@/lib/attentionSlot";
import { resolveOutcome, startPlanActive, requestPlanResolve, reschedulePlan, quickRescheduleTimes } from "@/lib/planner/resolvePlan";
import { applyTerms, isTaskDueOn, isTemplateDoneNow, toggleTemplateDone, getLevelFromTotalXP } from "@/lib/dailyTaskSystem";
import { isCountedTask, taskCountConfig, addTaskCount, TASK_TICKS_QUERY_KEY } from "@/lib/taskCounts";
import { useGoalXp } from "@/lib/useGoalXp";
import { sumXp } from "@/lib/goalXp";
import { houseHomePage } from "@/lib/houseSwitch";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button } from "@/house/kit/Button";
import { Panel, PageTabs } from "@/house/kit/Panel";
import { Row, AlterAvatar } from "@/house/kit/Content";
import { Checkbox, Segmented } from "@/house/kit/Choices";
import Info from "@/house/kit/Info";
import Layers from "@/house/kit/Layers";
import Menu from "@/house/kit/Menu";
import { EmptyBlock } from "@/house/kit/States";
import TimeLanes from "@/house/kit/TimeLanes";
import {
  todayPlanItems, planTitle, guideItem, dayWindow, nextHoursWindow, spanIn, hourTicks, routineRows, latestStatus,
} from "@/house/home/homeModel";
import { DAY_LAYERS, buildDayLanes, visibleGroups } from "@/house/home/dayLayers";
import {
  HOUSE_HOME_LAYERS_EVENT, HOUSE_HOME_LAYERS_KEY, readHiddenLayers, readLayerOrder, setLayerShown, setLayerOrder,
} from "@/house/home/layerPrefs";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/home/home.css";

const timeOf = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...clockOpts() }) : "");
const hourOf = (d) => new Date(d).toLocaleTimeString([], { hour: "numeric", ...clockOpts() });
const dayWords = (d) => new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const plain = (s) => redactWhispers(String(s || "")).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const STATUS_WORDS = { scheduled: "Planned", done: "Done", partial: "Partly done", skipped: "Skipped", cancelled: "Cancelled", logged: "Logged" };

function useNow(ms = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

function useLayerPrefs() {
  const read = () => ({ hidden: readHiddenLayers(), order: readLayerOrder() });
  const [prefs, setPrefs] = useState(read);
  useEffect(() => {
    const on = () => setPrefs(read());
    const onStorage = (e) => { if (!e.key || e.key === HOUSE_HOME_LAYERS_KEY) on(); };
    window.addEventListener(HOUSE_HOME_LAYERS_EVENT, on);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(HOUSE_HOME_LAYERS_EVENT, on); window.removeEventListener("storage", onStorage); };
  }, []);
  return prefs;
}

function useInvalidatePlans() {
  const qc = useQueryClient();
  return () => {
    for (const key of [["activities"], ["tasks"], ["dailyProgress"], ["activeActivities"]]) qc.invalidateQueries({ queryKey: key });
  };
}

// ── The data every page of the room reads ──────────────────────────────
function useHomeData(dayOffset = 0) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const now = useNow();
  const src = useTimelineSources();
  const day = useMemo(() => { const d = new Date(now); d.setDate(d.getDate() + dayOffset); return d; }, [now, dayOffset]);
  const dayKey = day.toDateString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slice = useMemo(() => sliceTimelineDay(src, day), [src, dayKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todaySlice = useMemo(() => (dayOffset === 0 ? slice : sliceTimelineDay(src, now)), [src, slice, dayOffset, now.toDateString()]);
  const alterMap = useMemo(() => Object.fromEntries((src.alters || []).map((a) => [a.id, a])), [src.alters]);
  const categoryMap = useMemo(() => Object.fromEntries((src.categories || []).map((c) => [c.id, c])), [src.categories]);
  const symptomMap = useMemo(() => Object.fromEntries((src.symptoms || []).map((s) => [s.id, s])), [src.symptoms]);
  const nameOf = (id) => (alterMap[id] ? formatAlter(alterMap[id]) : terms.Alter);
  const lanes = useMemo(
    () => buildDayLanes(slice, { alters: alterMap, categories: categoryMap, symptoms: symptomMap, nameOf, now: now.getTime() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slice, alterMap, categoryMap, symptomMap, formatAlter, now],
  );
  const planItems = useMemo(
    () => todayPlanItems({ activities: todaySlice.activities, events: todaySlice.plannerEvents, now, title: planTitle }),
    [todaySlice, now],
  );
  return { terms, formatAlter, now, day, src, slice, lanes, planItems, alterMap, categoryMap, nameOf };
}

// ── Panels ─────────────────────────────────────────────────────────────
function FrontPanel({ onSetFront, onSelect, selected, compact }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const { fronters } = useFrontPresence();
  return (
    <Panel title={`Who's ${terms.fronting}`} className="hh-panel hh-front"
      tools={compact ? <Button rank="quiet" onClick={onSetFront}>{terms.Switch}</Button> : null}>
      {fronters.length ? (
        <ul className="hh-list" aria-label={`Who's ${terms.fronting}`}>
          {fronters.map(({ s, alter }, i) => (
            <li key={s.id}>
              <Row lead={<AlterAvatar alter={alter} size="sm" />}
                title={formatAlter(alter)}
                subtitle={i === 0 ? `since ${timeOf(s.start_time)}` : `co-${terms.front}, ${timeOf(s.start_time)}`}
                selected={selected === `${s.id}:${alter.id}`}
                onClick={onSelect ? () => onSelect({ key: `${s.id}:${alter.id}`, label: formatAlter(alter), ref: { type: "session", id: s.id, record: s, alterId: alter.id } }) : undefined} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="hh-empty">{`Nobody is set as ${terms.fronting} yet.`}</p>
      )}
      {compact ? null : (
        <div className="hh-actions">
          <Button rank="secondary" onClick={onSetFront}>{fronters.length ? terms.Switch : `Set who's ${terms.fronting}`}</Button>
          {fronters.length ? <Button rank="secondary" onClick={onSetFront}>Add</Button> : null}
        </div>
      )}
    </Panel>
  );
}

function StatusPanel({ notes, compact }) {
  const terms = useTerms();
  const qc = useQueryClient();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = latestStatus(notes);
  const sign = getCommandSign();
  const save = async () => {
    const raw = draft.trim();
    if (!raw || busy) return;
    setBusy(true);
    try {
      // The one status save path: ~commands, signposts and @mentions. The
      // draft stays until the save lands, so a broken command loses nothing.
      const created = await saveStatusNote(raw, { alters, terms });
      if (!created) return;
      setDraft("");
      for (const key of [["mentionLogs"], ["statusNotes"], ["symptomSessions"], ["contactEncounters"], ["emotionCheckIns"]]) qc.invalidateQueries({ queryKey: key });
      toast.success("Status saved");
    } catch (e) {
      if (isLogCommandError(e)) toast.error(e.message);
      else toast.error("Couldn't save the status. Your words are still here.");
    } finally { setBusy(false); }
  };
  return (
    <Panel title="Status" className="hh-panel hh-status" tools={latest ? <span className="hh-value">{timeOf(latest.timestamp)}</span> : null}>
      <p className={latest ? "hh-status-now" : "hh-empty"}>{latest ? plain(latest.note) : "No status yet. Say how it's going, in a few words."}</p>
      {compact ? null : <p className="hh-label house-label">Set a new status</p>}
      <div className="hh-status-field">
        <MentionTextarea signposts value={draft} onChange={setDraft} alters={alters} rows={1}
          aria-label="Set a new status"
          placeholder={`Try ${sign}feeling calm`}
          className="hh-input"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }} />
        {draft.trim() ? <Button rank="primary" busy={busy} busyLabel="Saving…" onClick={save}>Save</Button> : null}
      </div>
      {compact ? null : <p className="hh-hint">{`${sign}feeling logs a check-in · -name signs it`}</p>}
    </Panel>
  );
}

function PlanRow({ item, onSelect, selected, categories }) {
  const run = useInvalidatePlans();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try { await startPlanActive(item.activity, { categories }); run(); toast.success(`Started ${item.activity.activity_name || "it"}`); }
    catch (e) { toast.error(e?.message || "Couldn't start it"); }
    finally { setBusy(false); }
  };
  const when = item.kind === "event" ? "All day" : item.time ? timeOf(item.time) : "Today";
  const trailing = item.action === "start"
    ? <Button rank="primary" busy={busy} busyLabel="Starting…" onClick={start}>Start</Button>
    : item.action === "resolve"
      ? <Button rank="secondary" onClick={() => requestPlanResolve(item.activity.id)}>Resolve</Button>
      : <span className="hh-meta">{item.kind === "event" ? "event" : "planned"}</span>;
  return (
    <li className="hh-plan" data-kind={item.kind}>
      <span className="hh-plan-when" data-open={item.kind === "open" || undefined}>{when}</span>
      <span className="hh-plan-main">
        <Row title={item.title} selected={selected}
          onClick={() => onSelect?.(item.activity
            ? { key: item.activity.id, label: item.title, ref: { type: "activity", id: item.activity.id, record: item.activity } }
            : { key: item.key, label: item.title, ref: { type: "event", id: item.event?.id, record: item.event } })} />
      </span>
      <span className="hh-plan-act">{trailing}</span>
    </li>
  );
}

function PlannerPanel({ items, onSelect, selected, categories, title = "From Planner" }) {
  const navigate = useNavigate();
  return (
    <Panel title={title} className="hh-panel hh-planner"
      tools={<Button rank="quiet" onClick={() => navigate("/planner")}>Planner</Button>}>
      {items.length ? (
        <ul className="hh-plans" aria-label="Today's plans">
          {items.slice(0, 8).map((it) => <PlanRow key={it.key} item={it} onSelect={onSelect} selected={selected === (it.activity?.id || it.key)} categories={categories} />)}
        </ul>
      ) : (
        <EmptyBlock compact title="Nothing planned for today" body="Plans and dates for today show here, with Start and Resolve."
          action={<Button rank="secondary" onClick={() => navigate("/?action=quick-thing")}>Plan something</Button>} />
      )}
    </Panel>
  );
}

function RoutineRow({ row, templates }) {
  const terms = useTerms();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const t = row.template;
  const title = applyTerms(t.title || "", terms);
  const counted = isCountedTask(t);
  const tick = async () => {
    if (busy) return;
    if (counted && taskCountConfig(t).mode === "steps") { navigate("/tasks"); return; }
    setBusy(true);
    try {
      let done;
      if (counted) { done = (await addTaskCount(t, { templates })).becameDone; qc.invalidateQueries({ queryKey: TASK_TICKS_QUERY_KEY }); }
      else done = await toggleTemplateDone(t, { templates });
      qc.invalidateQueries({ queryKey: ["dailyProgress"] });
      if (done) toast.success(`${title}: done`);
    } catch (e) { toast.error(e?.message || "Couldn't save that tick"); }
    finally { setBusy(false); }
  };
  return (
    <li className="hh-routine">
      {counted && !row.done ? (
        <span className="hh-routine-count">
          <span className="hh-routine-title">{title}</span>
          <Button rank="secondary" busy={busy} onClick={tick}>{taskCountConfig(t).mode === "steps" ? "Open" : "+1"}</Button>
        </span>
      ) : (
        <Checkbox label={title} checked={row.done} done onChange={tick}
          disabledReason={row.how === "auto" ? "Ticks itself when it happens" : undefined} />
      )}
      <span className="hh-meta">{row.how}</span>
    </li>
  );
}

function RoutinesPanel({ templates, progress }) {
  const navigate = useNavigate();
  const goalXp = useGoalXp();
  const rows = useMemo(() => routineRows(templates, { isDue: (t) => isTaskDueOn(t), isDone: (t) => isTemplateDoneNow(t, progress) }), [templates, progress]);
  const totalXp = (progress || []).reduce((n, p) => n + (p.xp_earned || 0), 0) + sumXp(goalXp.events || []);
  const lv = getLevelFromTotalXP(totalXp);
  return (
    <Panel title="Routines" className="hh-panel hh-routines"
      tools={rows.length ? <span className="hh-value hh-xp">{`Lv ${lv.level} · ${lv.totalXP} xp`}</span> : null}>
      {rows.length ? (
        <ul className="hh-routine-list" aria-label="Today's routines">
          {rows.slice(0, 8).map((r) => <RoutineRow key={r.template.id} row={r} templates={templates} />)}
        </ul>
      ) : (
        <EmptyBlock compact title="No routines yet" body="Small things to do each day, ticked by hand or by themselves."
          action={<Button rank="secondary" onClick={() => navigate("/tasks")}>Set up routines</Button>} />
      )}
    </Panel>
  );
}

// Penumblob's slot: a pixel blob drawn in the person's colours until the
// real sprite arrives.
function BlobSprite() {
  return (
    <svg className="hh-blob" viewBox="0 0 16 14" aria-hidden="true" shapeRendering="crispEdges">
      <path fill="var(--house-wave, var(--house-accent))" d="M5 1h6v1h2v1h1v2h1v6h-1v1h-2v1H4v-1H2v-1H1V5h1V3h1V2h2z" />
      <path fill="var(--house-text)" d="M5 6h2v2H5zM9 6h2v2H9z" />
      <path fill="var(--house-accent)" d="M7 10h2v1H7z" />
    </svg>
  );
}

function GuidePanel({ guide, compact }) {
  const terms = useTerms();
  const run = useInvalidatePlans();
  const [busy, setBusy] = useState(null);
  // One thing asks for attention at a time: the guide asks only while it
  // holds the slot; otherwise it just greets.
  const holds = useAttentionSlot("house-home-guide", { priority: ATTENTION.SETUP, active: !!guide });
  const ask = holds && guide ? guide : null;
  const resolve = async (status) => {
    setBusy(status);
    try { await resolveOutcome(ask.activity, status); run(); }
    catch (e) { toast.error(e?.message || "Couldn't save that"); }
    finally { setBusy(null); }
  };
  const name = ask?.activity?.activity_name || ask?.title;
  const line = ask
    ? `${name} didn't get ticked off. Did it happen?`
    : `Hi again! How's everyone doing? When something wants your attention, I'll ask about it here, one thing at a time.`;
  return (
    <Panel title="Guide: Penumblob" className="hh-panel hh-guide">
      <div className="hh-guide-body" data-compact={compact || undefined}>
        <p className="hh-guide-line" role={ask ? "status" : undefined}>{line}</p>
        <BlobSprite />
        {ask ? (
          <div className="hh-actions hh-guide-actions" role="group" aria-label={`Did ${name} happen?`}>
            <Button rank="primary" busy={busy === "done"} onClick={() => resolve("done")}>Done</Button>
            <Button rank="secondary" busy={busy === "partial"} onClick={() => resolve("partial")}>Partly</Button>
            <Button rank="secondary" busy={busy === "skipped"} onClick={() => resolve("skipped")}>Skipped</Button>
          </div>
        ) : null}
        {compact ? null : <p className="hh-hint">{`The guide speaks for anything in your ${terms.system} that wants your attention, one thing at a time.`}</p>}
      </div>
    </Panel>
  );
}

// ── Info: the picked thing (board 01-Main's right dock) ─────────────────
function InfoPanel({ pick, data, onSetFront }) {
  const terms = useTerms();
  const navigate = useNavigate();
  const run = useInvalidatePlans();
  const [busy, setBusy] = useState(null);
  const categories = data.src.categories || [];
  if (!pick) {
    return (
      <Panel title="Info" className="hh-panel hh-info">
        <EmptyBlock compact title="Nothing picked yet" body="Pick anything in a panel or on the timeline to see it here." />
      </Panel>
    );
  }
  const { ref } = pick;
  const r = ref.record || {};
  const act = async (id, fn) => { setBusy(id); try { await fn(); run(); } catch (e) { toast.error(e?.message || "Couldn't save that"); } finally { setBusy(null); } };
  let kind = "";
  let rows = [];
  let actions = null;
  if (ref.type === "activity") {
    const st = statusFor(r);
    const start = activityDate(r);
    const mins = Number(r.duration_minutes) || 0;
    const end = mins ? new Date(start.getTime() + mins * 60000) : null;
    const cat = data.categoryMap[r.parent_category_id];
    const scheduled = st === ACTIVITY_STATUSES.SCHEDULED;
    kind = scheduled ? "Plan" : "Activity";
    rows = [
      { id: "when", label: "When", value: r.timestamp ? `${dayWords(start)}, ${timeOf(start)}${end ? ` to ${timeOf(end)}` : ""}` : "Today, no time" },
      { id: "status", label: "Status", value: STATUS_WORDS[st] || st },
      { id: "cat", label: "Category", value: cat?.name || null, empty: "None" },
      { id: "who", label: "Who", value: r.alter_id ? data.nameOf(r.alter_id) : null, empty: "Not set" },
      { id: "repeats", label: "Repeats", value: r.recurrence?.frequency || (r.recurrence_parent_id ? "Part of a series" : null), empty: "No" },
    ];
    actions = (
      <div className="hh-actions hh-wrap">
        {scheduled && start.getTime() >= Date.now() - 6 * 3600000 ? <Button rank="primary" busy={busy === "start"} onClick={() => act("start", () => startPlanActive(r, { categories }))}>Start</Button> : null}
        {scheduled ? <Button rank="secondary" busy={busy === "done"} onClick={() => act("done", () => resolveOutcome(r, "done"))}>Done</Button> : null}
        {scheduled ? (
          <Menu label={`Move ${r.activity_name || "this plan"}`} rank="secondary" items={quickRescheduleTimes(r).map((q) => ({
            id: q.id, label: `${q.id === "hour" ? "In an hour" : q.id === "evening" ? "This evening" : "Tomorrow"}, ${timeOf(q.when)}`,
            onSelect: () => act("move", () => reschedulePlan(r, q.when)),
          }))}>Move</Menu>
        ) : null}
        <Button rank="secondary" onClick={() => requestPlanResolve(r.id)}>Details</Button>
      </div>
    );
  } else if (ref.type === "session") {
    kind = `${terms.Fronting}`;
    rows = [
      { id: "who", label: "Who", value: data.nameOf(ref.alterId || r.alter_id) },
      { id: "since", label: "Since", value: `${dayWords(r.start_time)}, ${timeOf(r.start_time)}` },
      { id: "until", label: "Until", value: r.end_time ? timeOf(r.end_time) : `Still ${terms.fronting}` },
      { id: "primary", label: "Primary", value: r.is_primary ? "Yes" : "No" },
    ];
    actions = <div className="hh-actions"><Button rank="secondary" onClick={onSetFront}>{terms.Switch}</Button><Button rank="secondary" onClick={() => navigate("/timeline")}>Timeline</Button></div>;
  } else if (ref.type === "event" || ref.type === "date") {
    kind = "Date";
    rows = [{ id: "when", label: "When", value: "All day" }];
    actions = <div className="hh-actions"><Button rank="secondary" onClick={() => navigate("/planner")}>Planner</Button></div>;
  } else {
    const at = r.timestamp || r.start_time || r.bedtime || r.created_date;
    const KIND = { emotion: "Check-in", symptomSession: "Symptom", symptomCheckIn: "Symptom", sleep: "Sleep", status: "Status note", location: "Location", journal: "Journal entry" };
    kind = KIND[ref.type] || "Record";
    rows = [
      { id: "when", label: "When", value: at ? `${dayWords(at)}, ${timeOf(at)}` : null },
      ...(ref.type === "sleep" ? [{ id: "woke", label: "Woke", value: r.wake_time ? timeOf(r.wake_time) : "Still asleep" }] : []),
      ...(ref.type === "status" ? [{ id: "note", label: "Note", value: plain(r.note) }] : []),
      ...(ref.type === "emotion" && r.intensity != null ? [{ id: "int", label: "Intensity", value: String(r.intensity) }] : []),
    ];
    const to = { journal: "/journals", location: "/location-history", emotion: "/checkin-log", sleep: "/sleep" }[ref.type] || "/timeline";
    actions = <div className="hh-actions"><Button rank="secondary" onClick={() => navigate(to)}>Open</Button></div>;
  }
  return (
    <Panel title={`Info: ${pick.label}`} className="hh-panel hh-info">
      <Info title={pick.label} kind={kind} sections={[{ id: "about", title: "About", rows }]} />
      {actions}
    </Panel>
  );
}

function LayersPanel({ prefs }) {
  const layers = prefs.order.map((id) => DAY_LAYERS.find((l) => l.id === id)).filter(Boolean)
    .map((l) => ({ ...l, name: l.label, visible: !prefs.hidden.includes(l.id) }));
  return (
    <Panel title="Layers" className="hh-panel hh-layers">
      <Layers label="Timeline layers" layers={layers}
        renderLead={(l) => <span className="hh-swatch" style={{ "--hh-c": l.color }} aria-hidden="true" />}
        onToggle={(id, visible) => setLayerShown(id, visible)}
        onReorder={(next) => setLayerOrder(next.map((l) => l.id))} />
      <p className="hh-hint">Each layer reads one kind of record. Hide or reorder them; this device remembers.</p>
    </Panel>
  );
}

// ── The timeline dock (board 01-Main) ──────────────────────────────────
function placeGroups(groups, win) {
  return groups.map((g) => ({
    ...g,
    rows: g.rows.map((r) => ({ ...r, items: r.items.map((it) => ({ ...it, pos: spanIn(win, it.start, it.end ?? (it.kind === "bar" ? Date.now() : null), { minWidth: 0.6 }) })).filter((it) => it.pos) })),
  }));
}

function TimelineDock({ data, prefs, dayOffset, setDayOffset, selected, onSelect }) {
  const navigate = useNavigate();
  const terms = useTerms();
  const [folded, setFolded] = useState([]);
  const win = dayWindow(data.day);
  const groups = placeGroups(visibleGroups(data.lanes, prefs.hidden, prefs.order), win);
  const ticks = hourTicks(win, 2).filter((t) => t.left > 0 && t.left < 100).map((t) => ({ ...t, label: hourOf(t.at) }));
  const isToday = dayOffset === 0;
  const nowPos = isToday ? spanIn(win, data.now, null)?.left ?? null : null;
  const any = groups.some((g) => g.rows.some((r) => r.items.length)) || (data.lanes.allDay || []).length > 0;
  const emptyWords = `Nothing on this day yet. Check-ins, plans and who's ${terms.fronting} show up here as they happen.`;
  return (
    <Panel title="Timeline" className="hh-panel hh-timeline" bodyClassName="hh-timeline-body"
      tools={(
        <span className="hh-tl-tools">
          <Segmented label="Timeline span" options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }]} value="day"
            onChange={(v) => { if (v === "week") navigate("/planner"); }} />
          <span className="hh-value">{dayWords(data.day)}</span>
          <Button rank="quiet" onClick={() => setDayOffset((d) => d - 1)} aria-label="The day before">‹</Button>
          <Button rank="quiet" onClick={() => setDayOffset(0)} disabledReason={isToday ? "Already showing today" : undefined}>Now</Button>
          <Button rank="quiet" onClick={() => setDayOffset((d) => d + 1)} aria-label="The day after">›</Button>
        </span>
      )}>
      <TimeLanes label={`${dayWords(data.day)}, layer by layer`} ticks={ticks} now={nowPos} nowLabel={isToday ? timeOf(data.now) : null}
        groups={groups} allDay={prefs.hidden.includes("events") ? [] : data.lanes.allDay} selected={selected} onSelect={(it) => onSelect(it)}
        folded={folded} onFold={(id) => setFolded((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))}
        onHideLayer={(id) => setLayerShown(id, false)}
        empty={emptyWords} />
      {!any && groups.length ? <p className="hh-hint hh-tl-empty">{emptyWords}</p> : null}
    </Panel>
  );
}

// ── The phone's "Next 6 hours" (board 08-Phone) ────────────────────────
function NextHoursPanel({ data }) {
  const navigate = useNavigate();
  const terms = useTerms();
  const win = nextHoursWindow(data.now, 6);
  const pick = (gid, layers) => {
    const g = data.lanes.groups.find((x) => x.id === gid);
    return (g?.rows || []).filter((r) => !layers || layers.includes(r.layer)).flatMap((r) => r.items.map((it) => ({ ...it, color: it.color || r.color })));
  };
  const rows = [
    { id: "front", layer: "fronting", label: "Front", color: "var(--house-text)", items: pick("fronting") },
    { id: "plans", layer: "planned", label: "Plans", color: "var(--house-accent)", items: pick("plans") },
    { id: "feel", layer: "feelings", label: "Feel", color: "var(--house-good)", items: pick("checkins", ["feelings", "symptoms"]) },
  ];
  const groups = placeGroups([{ id: "next", label: "Next 6 hours", rows }], win);
  const ticks = hourTicks(win, 2).filter((t) => t.left < 100).map((t) => ({ ...t, label: hourOf(t.at) }));
  return (
    <Panel title="Next 6 hours" className="hh-panel hh-next"
      tools={<Button rank="quiet" onClick={() => navigate("/timeline")}>Options</Button>}>
      <TimeLanes compact label={`The next six hours: ${terms.front}, plans and feelings`} ticks={ticks}
        now={spanIn(win, data.now, null)?.left ?? null} groups={groups}
        onSelect={(it) => { if (it.ref?.type === "activity") requestPlanResolve(it.ref.id); else navigate("/timeline"); }} />
    </Panel>
  );
}

// ── The room ───────────────────────────────────────────────────────────
export default function HouseHome({ size = "full", tokens, onSetFront, lead = null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const page = houseHomePage(location.search);
  const [dayOffset, setDayOffset] = useState(0);
  const data = useHomeData(dayOffset);
  const prefs = useLayerPrefs();
  const [pick, setPick] = useState(null);
  const phone = size === "phone";

  // Info shows the next thing to start when nothing is picked (board 01).
  const next = data.planItems.find((p) => p.kind === "next") || data.planItems.find((p) => p.activity);
  const shown = pick || (next?.activity ? { key: next.activity.id, label: next.title, ref: { type: "activity", id: next.activity.id, record: next.activity } } : null);
  const select = (p) => setPick(p);
  const guide = guideItem(data.planItems);
  const categories = data.src.categories || [];
  const templates = data.src.dailyTaskTemplates || [];
  const progress = data.src.dailyProgress || [];

  const tabs = [{ id: "today", label: "Today" }, { id: "me", label: "Me" }, { id: "plans", label: "Plans" }, { id: "board", label: "Boards" }];
  const setPage = (id) => {
    const q = new URLSearchParams(location.search);
    if (id === "today") q.delete("page"); else q.set("page", id);
    const s = q.toString();
    navigate(`/${s ? `?${s}` : ""}`);
  };
  const pageTabs = <PageTabs label="Pages of Home" tabs={tabs} value={page} onChange={setPage} idPrefix="hh-pages" />;
  const panels = {
    front: <FrontPanel key="front" onSetFront={onSetFront} onSelect={select} selected={shown?.key} compact={phone} />,
    status: <StatusPanel key="status" notes={data.src.statusNotes} compact={phone} />,
    planner: <PlannerPanel key="planner" items={data.planItems} onSelect={select} selected={shown?.key} categories={categories} title={phone ? "Coming up" : "From Planner"} />,
    routines: <RoutinesPanel key="routines" templates={templates} progress={progress} />,
    guide: <GuidePanel key="guide" guide={guide} compact={phone} />,
  };

  if (phone) {
    const order = page === "me" ? ["guide", "front", "status"] : page === "plans" ? ["planner", "routines"] : ["guide", "front", "status", "next", "planner"];
    return (
      <HouseScope tokens={tokens} className="hh hh--phone" data-house-size="phone">
        <div className="hh-phone-tabs">{pageTabs}</div>
        <div className="hh-stack">
          {lead}
          {order.map((id) => (id === "next" ? <NextHoursPanel key="next" data={data} /> : panels[id]))}
        </div>
      </HouseScope>
    );
  }

  const grid = page === "me" ? ["front", "status", "guide"] : page === "plans" ? ["planner", "routines"] : ["front", "planner", "guide", "status", "routines"];
  return (
    <HouseScope tokens={tokens} className="hh hh--studio" data-house-size={size} data-page={page}>
      <div className="hh-main">
        <div className="hh-panels" data-page={page}>{grid.map((id) => panels[id])}</div>
        <div className="hh-pagetabs">
          <span className="hh-pagetabs-label house-label" aria-hidden="true">Pages</span>
          {pageTabs}
        </div>
        <TimelineDock data={data} prefs={prefs} dayOffset={dayOffset} setDayOffset={setDayOffset}
          selected={shown?.key} onSelect={(it) => select({ key: it.key, label: it.label, ref: it.ref })} />
      </div>
      <aside className="hh-side" aria-label="Info and layers">
        <InfoPanel pick={shown} data={data} onSetFront={onSetFront} />
        <LayersPanel prefs={prefs} />
      </aside>
    </HouseScope>
  );
}
