// The house's Timeline room ("the Day"): the layered timeline of boards
// 01-Main and 08-Phone given the whole canvas, with board 10's Info and the
// Layers beside it, and board 09's Options. House mode only: the frame draws
// it on /timeline (houseTimelineRoom); the old Timeline page is gated off
// (HouseRoomGate) and stays exactly as it was with the new house off.
//
//   Studio  Timeline (Day · 6 hours · Week, the date, ‹ Now ›, Add, Options)
//           filling the canvas; Info for the picked thing, Layers and the
//           day's tally in the side column.
//   Phone   the same Timeline (compact lanes), then Layers and the tally;
//           Info opens as a sheet when something is picked.
//
// Every part is the shared one in src/house/day/ (Home's timeline dock draws
// the same parts). Nothing here writes a record by itself: fronting edits go
// through frontSessionEdit.js (the Day's sheets), plans through
// resolvePlan.js, symptom episodes through symptomSessions.js. Landings:
// ?date=YYYY-MM-DD, ?view=day|hours6|week, ?focusSessionId=…(&edit=1) and
// ?highlightStatus=…; the one-visit ones are taken off once used.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import DailyTallyPanel from "@/components/timeline/DailyTallyPanel";
import { sliceTimelineDay } from "@/lib/timelineData";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { Sheet } from "@/house/kit/Sheet";
import {
  useDayTimeline, DayTimelinePanel, DayInfoPanel, DayLayersPanel, TimelineOptionsSheet, useDayEditors, dayWords,
} from "@/house/day/DayParts";
import { landingFrom, resolveLanding, LANDING_PARAMS } from "@/house/day/dayView";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/day/day.css";
import "@/house/timeline/timeline.css";

/** The one-visit landing: read once, acted on once the records are in, then taken off the address. */
function useLanding(tl, setPick, editors) {
  const location = useLocation();
  const navigate = useNavigate();
  const landing = useMemo(() => landingFrom(location.search), [location.search]);
  const done = useRef("");
  const started = useRef(Date.now());
  useEffect(() => {
    if (!landing.any || done.current === location.search) return;
    if (landing.view && tl.range !== landing.view) { tl.setRange(landing.view); return; }
    const sessions = tl.src.sessions || [];
    const statusNotes = tl.src.statusNotes || [];
    const waiting = (landing.focusSessionId && !sessions.some((s) => s?.id === landing.focusSessionId))
      || (landing.highlightStatus && !statusNotes.some((n) => n?.id === landing.highlightStatus));
    // The records may still be loading; give them a few seconds before
    // landing on the date alone.
    if (waiting && Date.now() - started.current < 4000) {
      const id = setTimeout(() => setPick((p) => p), 500);
      return () => clearTimeout(id);
    }
    done.current = location.search;
    const to = resolveLanding(landing, { sessions, statusNotes }, tl.nameOf);
    if (to.day) tl.goDay(to.day);
    if (to.pick) setPick(to.pick);
    if (to.edit && to.pick?.ref?.type === "session") {
      editors.open({ kind: "editSession", session: to.pick.ref.record, alter: tl.alterMap[to.pick.ref.alterId] || null });
    }
    const q = new URLSearchParams(location.search);
    let changed = false;
    for (const k of LANDING_PARAMS) if (q.has(k)) { q.delete(k); changed = true; }
    if (changed) { const s = q.toString(); navigate(`${location.pathname}${s ? `?${s}` : ""}`, { replace: true }); }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landing, location.search, tl.src.sessions, tl.src.statusNotes, tl.range]);
}

/** The day's tally (the old Timeline's per-day counts), opened from a slim panel. */
function TallyPanel({ tl, compact }) {
  const [open, setOpen] = useState(false);
  const day = tl.firstDay;
  const d = useMemo(() => sliceTimelineDay(tl.src, day), [tl.src, day]);
  const week = tl.range === "week";
  const counts = [
    [d.sessions.length, `${tl.terms.fronting} record`],
    [d.emotions.length, "check-in"],
    [d.activities.length, "activity", "activities"],
  ].filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many || `${one}s`}`);
  return (
    <Panel title="Tally" className="hd-panel ht-tally" collapsible={compact} defaultOpen={!compact}
      tools={week ? null : <Button rank="quiet" icon={CalendarDays} onClick={() => setOpen(true)}>Open</Button>}>
      <p className="hd-p">{week ? "A day's counts: pick Day to see one." : `${dayWords(day)}: ${counts.length ? counts.join(", ") : "nothing counted yet"}.`}</p>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Tally: ${dayWords(day)}`} size="half" className="ht-tally-sheet">
        <div className="ht-tally-body">
          <DailyTallyPanel day={day} sessions={d.sessions} activities={d.activities} emotions={d.emotions} journals={d.journals}
            alters={tl.src.alters || []} checkIns={d.checkIns} tasks={d.tasks} symptoms={tl.src.symptoms || []}
            symptomSessions={d.symptomSessions} bulletins={d.bulletins} categories={tl.src.categories || []} statusNotes={d.statusNotes} />
        </div>
      </Sheet>
    </Panel>
  );
}

export default function HouseTimeline({ size = "full", tokens, onSetFront }) {
  const tl = useDayTimeline("timeline");
  const editors = useDayEditors();
  const [pick, setPick] = useState(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const phone = size === "phone";
  useLanding(tl, setPick, editors);

  // Studio: Info shows who's in front now when nothing is picked (board 01).
  const liveFront = tl.groups.find((g) => g.id === "fronting")?.rows.flatMap((r) => r.items).find((it) => !it.end);
  const shown = pick || (!phone && liveFront ? { key: liveFront.key, label: liveFront.label, ref: liveFront.ref } : null);
  const add = () => editors.open({ kind: "addAt", day: tl.firstDay });

  const timeline = (
    <div className="ht-canvas" data-tour="timeline-container">
      <DayTimelinePanel tl={tl} selected={shown?.key} onSelect={setPick} onAdd={add} onOptions={() => setOptionsOpen(true)}
        compact={phone} className="ht-timeline" bodyClassName="ht-timeline-body" />
    </div>
  );
  const common = (
    <>
      <TimelineOptionsSheet open={optionsOpen} onClose={() => setOptionsOpen(false)} page="timeline" />
      {editors.node}
    </>
  );

  if (phone) {
    return (
      <HouseScope tokens={tokens} className="ht ht--phone" data-house-size="phone" data-timeline-room="">
        <div className="ht-stack">
          {timeline}
          <DayLayersPanel prefs={tl.prefs} />
          <div data-tour="timeline-tally"><TallyPanel tl={tl} compact /></div>
        </div>
        <Sheet open={!!pick} onClose={() => setPick(null)} title={pick ? `Info: ${pick.label}` : "Info"} size="half" className="ht-info-sheet">
          {pick ? <DayInfoPanel bare pick={pick} tl={tl} editors={editors} onSetFront={onSetFront} inRoom onClose={() => setPick(null)} /> : null}
        </Sheet>
        {common}
      </HouseScope>
    );
  }

  return (
    <HouseScope tokens={tokens} className="ht ht--studio" data-house-size={size} data-timeline-room="">
      <div className="ht-main">{timeline}</div>
      <aside className="ht-side" aria-label="Info, layers and the tally">
        <DayInfoPanel pick={shown} tl={tl} editors={editors} onSetFront={onSetFront} inRoom onClose={pick ? () => setPick(null) : undefined} />
        <DayLayersPanel prefs={tl.prefs} />
        <div data-tour="timeline-tally"><TallyPanel tl={tl} compact={size === "compact"} /></div>
      </aside>
      {common}
    </HouseScope>
  );
}
