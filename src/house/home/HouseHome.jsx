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
import Penumblob from "@/components/shared/Penumblob";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useFrontPresence } from "@/lib/useFrontPresence";
import { useTimelineSources, sliceTimelineDay } from "@/lib/timelineData";
import { clockOpts } from "@/lib/timeFormat";
import { getCommandSign } from "@/lib/commandTerms";
import { saveStatusNote } from "@/lib/checkinEntry";
import { isLogCommandError } from "@/lib/authoredText";
import { redactWhispers } from "@/lib/whisperRedact";
import { useAttentionSlot, ATTENTION } from "@/lib/attentionSlot";
import { resolveOutcome, startPlanActive, requestPlanResolve } from "@/lib/planner/resolvePlan";
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
import { Checkbox } from "@/house/kit/Choices";
import { EmptyBlock } from "@/house/kit/States";
import TimeLanes from "@/house/kit/TimeLanes";
import {
  todayPlanItems, planTitle, guideItem, routineRows, latestStatus,
} from "@/house/home/homeModel";
import {
  useDayTimeline, DayTimelinePanel, DayInfoPanel, DayLayersPanel, TimelineOptionsSheet, useDayEditors,
} from "@/house/day/DayParts";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/day/day.css";
import "@/house/home/home.css";

const timeOf = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...clockOpts() }) : "");
const plain = (s) => redactWhispers(String(s || "")).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function useNow(ms = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

function useInvalidatePlans() {
  const qc = useQueryClient();
  return () => {
    for (const key of [["activities"], ["tasks"], ["dailyProgress"], ["activeActivities"]]) qc.invalidateQueries({ queryKey: key });
  };
}

// ── The data every page of the room reads ──────────────────────────────
function useHomeData() {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const now = useNow();
  const src = useTimelineSources();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todaySlice = useMemo(() => sliceTimelineDay(src, now), [src, now.toDateString()]);
  const planItems = useMemo(
    () => todayPlanItems({ activities: todaySlice.activities, events: todaySlice.plannerEvents, now, title: planTitle }),
    [todaySlice, now],
  );
  return { terms, formatAlter, now, src, planItems };
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
          action={{ label: "Plan something", rank: "secondary", onClick: () => navigate("/?action=quick-thing") }} />
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
          action={{ label: "Set up routines", rank: "secondary", onClick: () => navigate("/tasks") }} />
      )}
    </Panel>
  );
}

function GuidePanel({ guide, compact, fresh }) {
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
    : fresh
      ? `Hi, I'm Penumblob. When something wants your attention, I'll ask about it here, one thing at a time. Start by saying who's ${terms.fronting}.`
      : `Hi again! How's everyone doing? When something wants your attention, I'll ask about it here, one thing at a time.`;
  return (
    <Panel title="Guide: Penumblob" className="hh-panel hh-guide">
      <div className="hh-guide-body" data-compact={compact || undefined}>
        <p className="hh-guide-line" role={ask ? "status" : undefined}>{line}</p>
        <Penumblob className="hh-blob" cue={ask ? (ask.activity?.id || ask.title || "ask") : null} />
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

// ── The phone's "Next 6 hours" (board 08-Phone) ────────────────────────
// The shared timeline, drawn small: three rows (who's in front, plans, and
// meds taken or feelings), the range and Whose from its Options (board 09).
const NEXT_TITLES = { hours6: "Next 6 hours", day: "Today", week: "This week" };
function NextHoursPanel() {
  const navigate = useNavigate();
  const terms = useTerms();
  const tl = useDayTimeline("homePhone");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const pick = (gid, layers) => {
    const g = tl.groups.find((x) => x.id === gid);
    return (g?.rows || []).filter((r) => !layers || layers.includes(r.layer)).flatMap((r) => r.items.map((it) => ({ ...it, color: it.color || r.color })));
  };
  const meds = pick("more", ["meds"]);
  const rows = [
    { id: "front", layer: "fronting", label: "Front", color: "var(--house-text)", items: pick("fronting") },
    { id: "plans", layer: "planned", label: "Plans", color: "var(--house-accent)", items: pick("plans", ["planned", "logged"]) },
    meds.length
      ? { id: "meds", layer: "meds", label: "Meds", color: "var(--house-note)", items: meds }
      : { id: "feel", layer: "feelings", label: "Feel", color: "var(--house-good)", items: pick("checkins", ["feelings", "symptoms"]) },
  ];
  const open = (it) => {
    const ref = it.ref || {};
    if (ref.type === "activity") { requestPlanResolve(ref.id); return; }
    if (ref.type === "session") { navigate(`/timeline?focusSessionId=${ref.id}`); return; }
    if (ref.type === "status") { navigate(`/timeline?highlightStatus=${ref.id}`); return; }
    navigate("/timeline");
  };
  return (
    <Panel title={NEXT_TITLES[tl.range] || "Next 6 hours"} className="hh-panel hh-next"
      tools={<Button rank="quiet" onClick={() => setOptionsOpen(true)} data-tour="timeline-options">Options</Button>}>
      <TimeLanes compact label={`${tl.words}: ${terms.front}, plans and ${meds.length ? "meds" : "feelings"}`} ticks={tl.ticks}
        now={tl.nowLeft} groups={[{ id: "next", label: NEXT_TITLES[tl.range] || "Next 6 hours", rows }]} onSelect={open} />
      <TimelineOptionsSheet open={optionsOpen} onClose={() => setOptionsOpen(false)} page="homePhone" />
    </Panel>
  );
}

// ── The room ───────────────────────────────────────────────────────────
export default function HouseHome({ size = "full", tokens, onSetFront, lead = null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const page = houseHomePage(location.search);
  const data = useHomeData();
  const phone = size === "phone";
  // The studio's timeline dock is the shared timeline (src/house/day/).
  const tl = useDayTimeline("home");
  const editors = useDayEditors();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [pick, setPick] = useState(null);

  // Info shows the next thing to start when nothing is picked (board 01).
  const next = data.planItems.find((p) => p.kind === "next") || data.planItems.find((p) => p.activity);
  const firstFront = tl.groups.find((g) => g.id === "fronting")?.rows.flatMap((r) => r.items).find((it) => !it.end);
  const shown = pick
    || (next?.activity ? { key: next.activity.id, label: next.title, ref: { type: "activity", id: next.activity.id, record: next.activity } } : null)
    || (firstFront ? { key: firstFront.key, label: firstFront.label, ref: firstFront.ref } : null);
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
    front: <FrontPanel key="front" onSetFront={onSetFront} onSelect={phone ? null : select} selected={shown?.key} compact={phone} />,
    status: <StatusPanel key="status" notes={data.src.statusNotes} compact={phone} />,
    planner: <PlannerPanel key="planner" items={data.planItems} onSelect={select} selected={shown?.key} categories={categories} title={phone ? "Coming up" : "From Planner"} />,
    routines: <RoutinesPanel key="routines" templates={templates} progress={progress} />,
    guide: <GuidePanel key="guide" guide={guide} compact={phone} fresh={!(data.src.sessions || []).length && !(data.src.statusNotes || []).length} />,
  };

  if (phone) {
    const order = page === "me" ? ["guide", "front", "status"] : page === "plans" ? ["planner", "routines"] : ["guide", "front", "status", "next", "planner"];
    return (
      <HouseScope tokens={tokens} className="hh hh--phone" data-house-size="phone">
        <div className="hh-phone-tabs">{pageTabs}</div>
        <div className="hh-stack">
          {lead}
          {order.map((id) => (id === "next" ? <NextHoursPanel key="next" /> : panels[id]))}
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
        <DayTimelinePanel tl={tl} selected={shown?.key} onSelect={select} className="hh-timeline" bodyClassName="hh-timeline-body"
          ranges={tl.range === "hours6" ? ["day", "hours6", "week"] : ["day", "week"]}
          onAdd={() => editors.open({ kind: "addAt", day: tl.firstDay })} onOptions={() => setOptionsOpen(true)} />
      </div>
      <aside className="hh-side" aria-label="Info and layers">
        <DayInfoPanel pick={shown} tl={tl} editors={editors} onSetFront={onSetFront} onClose={pick ? () => setPick(null) : undefined} />
        <DayLayersPanel prefs={tl.prefs} />
      </aside>
      <TimelineOptionsSheet open={optionsOpen} onClose={() => setOptionsOpen(false)} page="home" />
      {editors.node}
    </HouseScope>
  );
}
