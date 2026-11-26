// The house's Analytics room: board 06-Analytics on a computer and tablet
// (a toolbar panel: Analytics · Week Month Year Pick dates · < period > ·
// Whose · Therapy report; then the board of panels on the checked floor:
// Fronting time, Feelings by day, Who fronts together, Symptoms over the
// period, Sleep, Noticed; the status line under it all). On a phone the
// same panels stack in one column under the range row (board 08's
// conventions), with the therapy report and the other views in the
// header's ⋯. House mode only: the frames draw it on /analytics
// (houseAnalyticsRoom); the old page is gated off (HouseRoomGate) and stays
// exactly as it was with the new house off.
//
// Read only. Every record comes through the old page's own reads
// (useAnalyticsData, so both houses keep the same {alters} out and count
// the same sessions) and every number through the analytics engine
// (src/lib/analytics/*): frontingRollup, coFrontingPairs, sleepRollup,
// plansLifecycle, sleepVsNextDayDistress, attributeRecord. analyticsModel.js
// only shapes those numbers for the board and words them.
//
// The old page's five views (Your usual, Fronting, Wellbeing, Life, each
// {alter}'s footprint) are not redrawn: "Look closer" opens each inside a
// house panel (AnalyticsTabBody, the one copy both houses draw), on the
// old address (?tab=, ?alter=), with a square ‹ back to the board.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, FileText, BarChart3, LayoutGrid } from "lucide-react";
import { HouseScope, useHouse } from "@/house/tokens/HouseRoot";
import { readableOnAll } from "@/house/tokens/contrast";
import { Button, IconButton } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { Segmented } from "@/house/kit/Choices";
import { AlterPicker } from "@/house/kit/Pickers";
import { DateField } from "@/house/kit/Field";
import { Row } from "@/house/kit/Content";
import { LoadingBlock } from "@/house/kit/States";
import { useRoomTools } from "@/house/frame/roomTools";
import { PixelBack } from "@/house/tokens/PixelGlyphs";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useAnalyticsGrouping } from "@/lib/useAnalyticsGrouping";
import { usePlannerPrefs } from "@/lib/planner/displayPrefs";
import { isValidHexColor } from "@/lib/colorUtils";
import { buildRange, dayKey, toMs } from "@/lib/analytics/range";
import { dailySeries } from "@/lib/analytics/baselines";
import { frontingRollup, sleepRollup } from "@/lib/analytics/rollups";
import { coFrontingPairs } from "@/lib/analytics/fronting";
import { plansLifecycle } from "@/lib/analytics/life";
import { sleepVsNextDayDistress } from "@/lib/analytics/wellbeing";
import { attributeRecord, buildSessionIndex } from "@/lib/analytics/attribution";
import { normalizeSessions } from "@/lib/sessionNormalizer";
import { useAnalyticsData, AnalyticsTabBody } from "@/pages/Analytics";
import StaleSessionsModal from "@/components/analytics/StaleSessionsModal";
import {
  ANALYTICS_RANGES, CUSTOM_QUICK, analyticsViewOf, analyticsAlterOf, analyticsViewHref, analyticsViewList,
  periodOf, stepAnchor, canStepForward, customFor, periodWords, spanWords, nounOf, priorPeriod,
  periodDayKeys, periodBars, barLabel, axisLabels, tallyFeelings, feelingLegend, feelingCells,
  togetherIds, togetherGrid, noticedWords, emptyWords, ARROW_WORDS,
} from "@/house/analytics/analyticsModel";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/analytics/analytics.css";

const HOUR_MS = 3600000;
// The board's colours: house colours only (the default look: the amber
// accent, the periwinkle wave, green, the note cream, the warning red),
// each kept at 3:1 against the panel so a dark wave or note still reads,
// as the kit's charts do.
const TONE_KEYS = ["accent", "wave", "good", "note", "danger"];
function useBoardColours() {
  const r = useHouse()?.roles || {};
  const deps = TONE_KEYS.map((k) => r[k]).concat(r.panel, r.page, r.sunken);
  return useMemo(() => {
    const bgs = [r.panel, r.sunken || r.page].filter(Boolean);
    const out = {};
    for (const k of TONE_KEYS) out[k] = r[k] && bgs.length ? readableOnAll(r[k], bgs, 3) : `var(--house-${k})`;
    return out;
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps -- deps are the role colours themselves
}

const isoDay = (d) => dayKey(d);
const dayDate = (k, end = false) => { const [y, m, d] = String(k).split("-").map(Number); return end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d); };

// Kept while the app is open, so a trip into a deeper view and back (or to
// another room) lands on the same period.
const memory = { kind: "month", anchor: null, custom: null };

export default function HouseAnalytics({ size = "full", tokens }) {
  const phone = size === "phone";
  const location = useLocation();
  const navigate = useNavigate();
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const { mode: groupMode } = useAnalyticsGrouping();
  const [prefs] = usePlannerPrefs();
  const weekStartsOn = prefs?.weekStartsOn ?? 1;

  const view = analyticsViewOf(location.search);
  const alterParam = analyticsAlterOf(location.search);

  const [kind, setKindState] = useState(memory.kind);
  const [anchor, setAnchorState] = useState(() => memory.anchor || new Date());
  const [custom, setCustomState] = useState(() => memory.custom);
  const setKind = (k) => { memory.kind = k; setKindState(k); };
  const setAnchor = (fn) => setAnchorState((a) => { const n = typeof fn === "function" ? fn(a) : fn; memory.anchor = n; return n; });
  const setCustom = (c) => { memory.custom = c; setCustomState(c); };
  const [whoseId, setWhoseId] = useState(alterParam);
  const [staleOpen, setStaleOpen] = useState(false);
  // A view opens at its top, not where the board was scrolled to.
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    const main = el.closest("main");
    if (main && main.scrollTop > 0) main.scrollTop = 0;
  }, [view]);

  const now = Date.now();
  const customRange = custom || customFor("30d", new Date());
  const { from, to } = kind === "custom" ? customRange : periodOf(kind, anchor, weekStartsOn);
  // The old views read up to today, as they always have.
  const toNow = new Date(Math.min(to.getTime(), now));
  const data = useAnalyticsData({ from, to: toNow });
  const { alters, altersById, sessions } = data;

  const pickKind = (k) => {
    if (k === "custom" && !custom) setCustom({ from, to: toNow });
    setKind(k);
  };
  const firstMs = useMemo(() => {
    const all = [...sessions.map((s) => toMs(s.start_time)), ...data.emotionCheckIns.map((c) => toMs(c.timestamp || c.created_date))].filter((v) => v != null && v > 0);
    return all.length ? Math.min(...all) : null;
  }, [sessions, data.emotionCheckIns]);

  const goView = useCallback((v, opts) => navigate(analyticsViewHref(v, opts)), [navigate]);
  const openReport = useCallback(() => navigate("/therapy-report"), [navigate]);
  const whose = whoseId ? altersById[whoseId] : null;
  const onWhose = (id) => setWhoseId(id || null);

  // The phone's ⋯: the therapy report and every old view.
  const viewList = analyticsViewList(terms);
  const tools = useMemo(() => (phone ? {
    items: [
      { id: "report", label: "Therapy report", icon: FileText, onSelect: openReport },
      ...(view !== "board" ? [{ id: "board", label: "Back to the board", icon: LayoutGrid, onSelect: () => goView("board") }] : []),
      ...viewList.filter((v) => v.id !== view).map((v) => ({ id: v.id, label: v.label, icon: BarChart3, onSelect: () => goView(v.id, v.id === "alters" && whoseId ? { alterId: whoseId } : undefined) })),
    ],
  } : null), [phone, view, whoseId, openReport, goView]); // eslint-disable-line react-hooks/exhaustive-deps -- viewList follows terms
  useRoomTools(tools);

  const unit = ARROW_WORDS[kind];
  const forwardOk = kind !== "custom" && canStepForward(kind, anchor, weekStartsOn, now);

  const toolbar = (
    <div className="han-toolbar" role="toolbar" aria-label="Analytics range" data-tour="analytics-range">
      {phone ? null : <h1 className="sr-only">Analytics</h1>}
      <div className="han-ranges">
        <Segmented label="Range" value={kind} onChange={pickKind} options={ANALYTICS_RANGES.map((r) => ({ value: r.id, label: r.label }))} />
      </div>
      {kind !== "custom" ? (
        <span className="han-step">
          <IconButton icon={ChevronLeft} label={`Back a ${unit}`} onClick={() => setAnchor((a) => stepAnchor(kind, a, -1))} />
          <span className="han-period" aria-live="polite">{periodWords(kind, from, to)}</span>
          <IconButton icon={ChevronRight} label={`Forward a ${unit}`} disabledReason={forwardOk ? undefined : "that hasn't happened yet"}
            onClick={() => setAnchor((a) => stepAnchor(kind, a, 1))} />
        </span>
      ) : null}
      <span className="han-whose" data-tour="analytics-whose">
        <AlterPicker label="Whose" value={whoseId} onChange={onWhose} alters={alters} showNone noneLabel="Everyone" placeholder="Everyone" />
      </span>
      <span className="han-grow" />
      {phone ? null : <Button rank="secondary" icon={FileText} onClick={openReport}>Therapy report</Button>}
    </div>
  );

  const datesRow = kind === "custom" ? (
    <div className="han-dates" role="group" aria-label="Pick dates">
      <DateField label="From" value={isoDay(customRange.from)} onChange={(v) => { if (v) setCustom({ from: dayDate(v), to: customRange.to }); }} />
      <DateField label="To" value={isoDay(customRange.to)} onChange={(v) => { if (v) setCustom({ from: customRange.from, to: dayDate(v, true) }); }} />
      <span className="han-quick">
        {CUSTOM_QUICK.map((q) => <Button key={q.id} rank="quiet" onClick={() => setCustom(customFor(q.id, new Date(), firstMs))}>{q.label}</Button>)}
      </span>
    </div>
  ) : null;

  const groupWords = groupMode === "group" ? "group" : terms.alter;
  const status = (
    <div className="han-status" role="status">
      <span>{spanWords(from, to)}</span>
      {view === "board" ? <span>Counts only: no words from chats, whispers or journals</span> : null}
      {data.hiddenFromAnalytics.size ? <span>{`${data.hiddenFromAnalytics.size} ${data.hiddenFromAnalytics.size === 1 ? terms.alter : terms.alters} kept out by group settings`}</span> : null}
      {data.stale?.length ? <Button rank="quiet" className="han-status-btn" onClick={() => setStaleOpen(true)}>{`${data.stale.length} open ${data.stale.length === 1 ? "session" : "sessions"} to review`}</Button> : null}
      <span className="han-grow" />
      <span>{`Group by: ${groupWords}`}</span>
    </div>
  );

  let body;
  if (data.sessionsLoading) {
    body = <div className="han-floor"><LoadingBlock label="Loading analytics" kind="rows" rows={4} /></div>;
  } else if (view === "board") {
    body = (
      <Board size={size} data={data} kind={kind} anchor={anchor} weekStartsOn={weekStartsOn} from={from} to={to} customRange={customRange}
        whose={whose} terms={terms} formatAlter={formatAlter} goView={goView} />
    );
  } else {
    const v = viewList.find((x) => x.id === view);
    body = (
      <div className="han-floor han-floor--one">
        <Panel className="han-pn han-deep" headingLevel={2}
          title={<span className="han-deephead"><IconButton icon={PixelBack} rank="secondary" label="Back to the board" onClick={() => goView("board")} />{v?.label}</span>}
          tools={<span className="han-note">{spanWords(from, toNow)}</span>}>
          <div className="han-old" data-tour="analytics-charts">
            <AnalyticsTabBody tab={view} data={data} from={from} to={toNow}
              selectedAlterId={view === "alters" ? (alterParam || whoseId) : null}
              onSelectAlter={(id) => navigate(analyticsViewHref("alters", { alterId: id }), { replace: true })}
              onNavigateTab={(t) => goView(t)} onReviewStale={() => setStaleOpen(true)} />
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <HouseScope tokens={tokens} className={`han han--${phone ? "phone" : "studio"}`} data-house-size={size} data-analytics-room="">
      <div className="han-bar">{toolbar}{datesRow}</div>
      <div ref={scrollRef} className="han-scroll">{body}</div>
      {status}
      <StaleSessionsModal isOpen={staleOpen} onClose={() => setStaleOpen(false)} staleSessions={data.stale || []} altersById={altersById} />
    </HouseScope>
  );
}

// ═══ The board (board 06's six panels) ═══════════════════════════════════
function Board({ size, data, kind, anchor, weekStartsOn, from, to, customRange, whose, terms, formatAlter, goView }) {
  const { sessions, altersById, emotionCheckIns, symptomCheckIns, sleepRecords, activities } = data;
  const phone = size === "phone";
  const whoseId = whose?.id || null;
  const whoseName = whose ? formatAlter(whose) : null;
  const range = useMemo(() => buildRange(from, to), [from, to]);
  const prior = useMemo(() => {
    const p = priorPeriod(kind, anchor, weekStartsOn, kind === "custom" ? customRange : null);
    return buildRange(p.from, p.to);
  }, [kind, anchor, weekStartsOn, customRange]);
  const keys = useMemo(() => periodDayKeys(from, to), [from, to]);
  const todayKey = dayKey(Date.now());
  const noun = nounOf(kind);
  const col = useBoardColours();
  const FEEL = [col.good, col.wave, col.accent, col.note];

  // Whose: a record counts for them when it names them, or (as the old
  // analytics do) when they were in front at the time.
  const index = useMemo(() => buildSessionIndex(normalizeSessions(sessions, range.now), range.now), [sessions, range.now]);
  const keep = useCallback((rec) => !whoseId || attributeRecord(rec, { index }).alterIds.includes(whoseId), [whoseId, index]);

  const fronting = useMemo(() => frontingRollup({ sessions, range }), [sessions, range]);
  const frontRows = useMemo(() => [...fronting.perAlterMs.entries()]
    .filter(([id]) => altersById[id])
    .map(([id, ms]) => ({ alter: altersById[id], ms }))
    .sort((a, b) => b.ms - a.ms), [fronting, altersById]);
  const shownFront = useMemo(() => {
    const top = frontRows.slice(0, phone ? 6 : 8);
    if (whoseId && !top.some((r) => r.alter.id === whoseId)) {
      const mine = frontRows.find((r) => r.alter.id === whoseId);
      if (mine) top.push(mine);
    }
    return top;
  }, [frontRows, whoseId, phone]);
  const frontMax = frontRows[0]?.ms || 1;

  const feel = useMemo(() => {
    const { byDay, total } = tallyFeelings(emotionCheckIns, range.fromMs, range.toMs, keep);
    const legend = feelingLegend(total);
    const grid = feelingCells({ keys, byDay, todayKey, weekStartsOn });
    return { legend, grid };
  }, [emotionCheckIns, range, keep, keys, todayKey, weekStartsOn]);
  const feelColour = (label) => { const i = feel.legend.indexOf(label); return i >= 0 ? FEEL[i] : "var(--house-muted)"; };

  const pairs = useMemo(() => coFrontingPairs({ sessions, range }), [sessions, range]);
  const grid = useMemo(() => togetherGrid(togetherIds({ fronters: frontRows.map((r) => r.alter.id), pairs, whoseId }).filter((id) => altersById[id]), pairs), [frontRows, pairs, whoseId, altersById]);

  const symptomBars = useMemo(() => {
    const series = dailySeries(
      symptomCheckIns.filter((c) => Number(c.severity) > 0 && keep(c)),
      (c) => toMs(c.timestamp || c.created_date), range,
      { kind: "value", getValue: (items) => items.reduce((a, c) => a + Number(c.severity), 0) / items.length },
    );
    return periodBars({ keys, valueByKey: new Map(series.filter((p) => p.value != null).map((p) => [p.key, p.value])), todayKey });
  }, [symptomCheckIns, keep, range, keys, todayKey]);

  const sleep = useMemo(() => sleepRollup({ sleepRecords, range }), [sleepRecords, range]);
  const sleepBars = useMemo(() => periodBars({ keys, valueByKey: new Map(sleep.hoursSeries.filter((p) => p.value != null).map((p) => [p.key, p.value])), todayKey }), [sleep, keys, todayKey]);
  const sleepPrior = useMemo(() => sleepVsNextDayDistress({ sleepRecords, emotionCheckIns, range }), [sleepRecords, emotionCheckIns, range]);

  const plans = useMemo(() => plansLifecycle({ activities, range }), [activities, range]);
  const plansPrior = useMemo(() => plansLifecycle({ activities, range: prior }), [activities, prior]);
  const switchesPer = useCallback((rng) => {
    if (!rng.days) return null;
    if (!whoseId) return frontingRollup({ sessions, range: rng }).switchesTotal / rng.days;
    const starts = normalizeSessions(sessions, rng.now).filter((s) => s.alterIds.includes(whoseId) && s.startMs >= rng.fromMs && s.startMs <= rng.toMs);
    return starts.length / rng.days;
  }, [sessions, whoseId]);
  const switchesNow = useMemo(() => (fronting.switchesTotal || whoseId ? switchesPer(range) : (frontRows.length ? 0 : null)), [fronting, whoseId, switchesPer, range, frontRows]);
  const switchesBefore = useMemo(() => switchesPer(prior), [switchesPer, prior]);
  const noticed = noticedWords({
    terms, kind, from, plans, plansPrior, switchesPerDay: switchesNow, switchesPrior: switchesBefore,
    sleep, sleepLink: sleepPrior, whoseName,
  });

  const span = noun ? `the ${noun}` : "these dates";

  return (
    <div className="han-floor" data-tour="analytics-board" data-house-size={size}>
      <Panel className="han-pn" title={`${terms.Fronting} time`} tools={<span className="han-note">hours</span>}>
        {shownFront.length === 0 ? <p className="han-empty">{emptyWords("fronting", terms)}</p> : (
          <ul className="han-front" aria-label={`${terms.Fronting} time in hours`}>
            {shownFront.map(({ alter, ms }) => (
              <li key={alter.id} className="han-frow" data-on={whoseId === alter.id || undefined}>
                <span className="han-fname">{formatAlter(alter)}</span>
                <span className="han-ftrack" aria-hidden="true">
                  <span style={{ width: `${Math.max(1, (ms / frontMax) * 100)}%`, background: isValidHexColor(alter.color) ? alter.color : "var(--house-accent)" }} />
                </span>
                <span className="han-fnum">{Math.round(ms / HOUR_MS)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="han-pn" title={feel.grid.mode === "months" ? "Feelings by month" : "Feelings by day"}
        tools={<span className="han-note">{whoseName ? `${whoseName}'s most felt` : "most felt"}</span>}>
        {feel.legend.length === 0 ? <p className="han-empty">{emptyWords("feelings", terms)}</p> : (
          <>
            <div className={`han-cal han-cal--${feel.grid.mode}`} role="img"
              aria-label={`Most felt each ${feel.grid.mode === "months" ? "month" : "day"}: ${feel.grid.cells.filter((c) => c.feeling).map((c) => `${feel.grid.mode === "months" ? c.label : barLabel(c.key)} ${c.feeling}`).join(", ")}`}>
              {Array.from({ length: feel.grid.lead }).map((_, i) => <span key={`b${i}`} className="han-cell" data-blank="" />)}
              {feel.grid.cells.map((c) => (
                <span key={c.key} className="han-cell" data-future={c.future || undefined} data-none={!c.feeling && !c.future ? "" : undefined}
                  style={c.feeling ? { background: feelColour(c.feeling) } : undefined}
                  title={`${feel.grid.mode === "months" ? c.label : barLabel(c.key)}: ${c.feeling || (c.future ? "not yet" : "no feelings logged")}`}>
                  {c.label}
                </span>
              ))}
            </div>
            <div className="han-legend">
              {feel.legend.map((l) => <span key={l} style={{ color: feelColour(l) }}>{l}</span>)}
            </div>
          </>
        )}
      </Panel>

      <Panel className="han-pn" title={`Who ${terms.fronts || "fronts"} together`} tools={<span className="han-note">shared hours</span>}>
        {!grid.any ? <p className="han-empty">{emptyWords("together", terms)}</p> : (
          <div className="han-matrix" role="table" aria-label={`Hours of shared ${terms.fronting}`}
            style={{ gridTemplateColumns: `minmax(3.5rem, auto) repeat(${grid.ids.length}, minmax(0, 1fr))` }}>
            <span role="row" className="han-mrowwrap">
              <span role="columnheader" />
              {grid.ids.map((id) => <span key={`h${id}`} role="columnheader" className="han-mhead" title={formatAlter(altersById[id])}>{formatAlter(altersById[id]).slice(0, 3)}</span>)}
            </span>
            {grid.ids.map((row) => (
              <span role="row" key={row} className="han-mrowwrap">
                <span role="rowheader" className="han-mrow">{formatAlter(altersById[row])}</span>
                {grid.ids.map((col) => {
                  if (row === col) return <span key={col} role="cell" className="han-mcell" data-self="" aria-label="the same one" />;
                  const ms = grid.val.get(`${row}|${col}`) || 0;
                  return (
                    <span key={col} role="cell" className="han-mcell"
                      style={{ background: `color-mix(in srgb, var(--house-accent) ${Math.round(15 + (ms / grid.max) * 85)}%, var(--house-sunken, var(--house-page)))` }}
                      title={`${formatAlter(altersById[row])} and ${formatAlter(altersById[col])}`}>
                      {Math.round(ms / HOUR_MS)}
                    </span>
                  );
                })}
              </span>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="han-pn han-span2" title={`Symptoms over ${span}`} tools={<span className="han-note">{whoseName ? `${whoseName}, average 1 to 5` : "average 1 to 5"}</span>}>
        {symptomBars.some((b) => b.value != null)
          ? <Bars points={symptomBars} max={5} colour={col.danger} label="Average symptom rating" unit="of 5" axis />
          : <p className="han-empty">{emptyWords("symptoms", terms)}</p>}
      </Panel>

      <Panel className="han-pn" title="Sleep" tools={<span className="han-note">{whoseName ? "everyone's hours a night" : "hours a night"}</span>}>
        {sleepBars.some((b) => b.value != null)
          ? <Bars points={sleepBars} max={10} colour={col.wave} label="Hours of sleep a night" unit="h" axis={false} />
          : <p className="han-empty">{emptyWords("sleep", terms)}</p>}
      </Panel>

      <Panel className="han-pn han-span3" title={noun ? `Noticed this ${noun}` : "Noticed in these dates"} tools={<span className="han-note">from your own records</span>}>
        <div className="han-noticed">
          {noticed.map((n) => (
            <div key={n.id}>
              <span className="han-big" style={{ color: col[n.tone] }}>{n.big}</span>
              <span className="han-words">{n.words}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="han-pn han-span3" title="Look closer" tools={<span className="han-note">the full views</span>}>
        <div className="han-doors" data-tour="analytics-more">
          {analyticsViewList(terms).map((v) => (
            <Row key={v.id} title={v.id === "alters" && whoseName ? `${whoseName}'s footprint` : v.label} subtitle={v.hint}
              onClick={() => goView(v.id, v.id === "alters" && whoseId ? { alterId: whoseId } : undefined)} meta="›" />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Bars({ points, max, colour, label, unit, axis = true }) {
  const top = Math.max(max || 0, ...points.map((p) => p.value || 0)) || 1;
  const logged = points.filter((p) => p.value != null);
  const summary = `${label}: ${logged.length} of ${points.length} ${points[0]?.days ? "stretches" : "days"} logged, from ${Math.min(...logged.map((p) => p.value)).toFixed(1)} to ${Math.max(...logged.map((p) => p.value)).toFixed(1)} ${unit}.`;
  return (
    <>
      <div className="han-bars" role="img" aria-label={summary}>
        {points.map((p) => (
          <span key={p.key} className="han-bar"
            data-none={p.value == null ? "" : undefined} data-future={p.future || undefined}
            style={p.value != null ? { height: `${Math.max(4, (p.value / top) * 100)}%`, background: colour } : undefined}
            title={`${barLabel(p.key)}: ${p.value != null ? `${p.value.toFixed(1)} ${unit}` : p.future ? "not yet" : "nothing logged"}`} />
        ))}
      </div>
      {axis ? <div className="han-axis" aria-hidden="true">{axisLabels(points).map((l, i) => <span key={i}>{l}</span>)}</div> : null}
    </>
  );
}

