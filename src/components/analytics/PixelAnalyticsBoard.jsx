import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { buildRange, priorRange, toMs, dayKey } from "@/lib/analytics/range";
import { dailySeries } from "@/lib/analytics/baselines";
import { frontingRollup, sleepRollup } from "@/lib/analytics/rollups";
import { coFrontingPairs } from "@/lib/analytics/fronting";
import { plansLifecycle } from "@/lib/analytics/life";
import { customEmotionColor } from "@/lib/emotionMood";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import DateRangePicker from "@/components/analytics/DateRangePicker";
import { isValidHexColor } from "@/lib/colorUtils";

// Pixel look only: the Analytics mockup (Analytics.dc.html) — a toolbar
// panel (range · step back/forward · whose · therapy report) and, on the
// Overview, a board of chart panels for the chosen range. Every number is
// read through the analytics engine (src/lib/analytics/*); nothing here
// writes. The page's own tabs, ranges and per-alter view stay in
// Analytics.jsx and are only driven from here.

const HOUR_MS = 3600000;
const FEEL_PAL = ["#9cc46b", "#c9c4e8", "#f2c08a", "#8fb8e0"];
const SHORT = { month: "short", day: "numeric" };

export const PIXEL_RANGES = [
  { id: "7d", label: "Week", noun: "week" },
  { id: "30d", label: "Month", noun: "month" },
  { id: "90d", label: "3 months", noun: "3 months" },
  { id: "1y", label: "Year", noun: "year" },
  { id: "all", label: "All time", noun: "all time" },
  { id: "custom", label: "Pick dates", noun: "these dates" },
];

function fmtDay(ms, withYear = false) {
  return new Date(ms).toLocaleDateString(undefined, withYear ? { ...SHORT, year: "numeric" } : SHORT);
}

export function rangeText(from, to) {
  const a = new Date(from), b = new Date(to);
  const sameYear = a.getFullYear() === b.getFullYear();
  if (a.getTime() <= 0) return `Everything to ${fmtDay(b, true)}`;
  return `${fmtDay(a, !sameYear)} to ${fmtDay(b, true)}`;
}

// Long ranges collapse into weekly buckets so the bars stay readable.
function bucketSeries(series, mode) {
  if (series.length <= 62) return series.map((p) => ({ key: p.key, value: p.value }));
  const size = series.length > 400 ? 30 : 7;
  const out = [];
  for (let i = 0; i < series.length; i += size) {
    const chunk = series.slice(i, i + size).filter((p) => p.value != null);
    let value = null;
    if (chunk.length) {
      const sum = chunk.reduce((a, p) => a + p.value, 0);
      value = mode === "avg" ? sum / chunk.length : sum;
    }
    out.push({ key: series[i].key, value });
  }
  return out;
}

function axisLabels(points) {
  if (!points.length) return [];
  const idx = [...new Set([0, Math.round((points.length - 1) / 3), Math.round(((points.length - 1) * 2) / 3), points.length - 1])];
  return idx.map((i) => fmtDay(new Date(`${points[i].key}T12:00:00`).getTime()));
}

function Panel({ title, note, className = "", children }) {
  return (
    <section className={`px-an-pn ${className}`}>
      <div className="px-an-ttl"><span>{title}</span>{note && <span className="px-an-mut">{note}</span>}</div>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <p className="px-an-empty">{children}</p>;
}

function BarChart({ points, max, color, label, unit }) {
  const top = Math.max(max || 0, ...points.map((p) => p.value || 0)) || 1;
  return (
    <>
      <div className="px-an-bars" role="img" aria-label={label}>
        {points.map((p) => (
          <span
            key={p.key}
            title={p.value != null ? `${fmtDay(new Date(`${p.key}T12:00:00`).getTime())}: ${p.value.toFixed(1)} ${unit}` : `${fmtDay(new Date(`${p.key}T12:00:00`).getTime())}: nothing logged`}
            className={p.value != null && p.value > 0 ? "px-an-bar" : "px-an-bar none"}
            style={p.value != null && p.value > 0 ? { height: `${Math.max(4, (p.value / top) * 100)}%`, background: color } : undefined}
          />
        ))}
      </div>
      <div className="px-an-axis">{axisLabels(points).map((l, i) => <span key={i}>{l}</span>)}</div>
    </>
  );
}

export function PixelAnalyticsToolbar({
  preset, onPreset, from, to, onRange, onStep, alters, selectedAlterId, onWhose, onReport,
}) {
  const terms = useTerms();
  const canStep = preset !== "all";
  const atToday = new Date(to).toDateString() === new Date().toDateString() || new Date(to) > new Date();
  return (
    <>
      <div className="px-an-pn px-an-toolbar">
        <h1 className="px-an-title">Analytics</h1>
        <div role="radiogroup" aria-label="Range" className="px-an-ranges">
          {PIXEL_RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={preset === r.id}
              className={`px-an-btn ${preset === r.id ? "on" : ""}`}
              onClick={() => onPreset(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="px-an-step">
          {canStep && <button type="button" className="px-an-arrow" aria-label="Earlier" onClick={() => onStep(-1)}>&lt;</button>}
          <span className="px-an-period">{rangeText(from, to)}</span>
          {canStep && <button type="button" className="px-an-arrow" aria-label="Later" disabled={atToday} onClick={() => onStep(1)}>&gt;</button>}
        </div>
        <div className="px-an-whose">
          <span className="px-an-mut">Whose</span>
          <AlterSearchSelect
            alters={alters.filter((a) => !a.is_archived)}
            value={selectedAlterId}
            onChange={onWhose}
            terms={terms}
            placeholder="Everyone"
            noneLabel="Everyone"
            showNone
            buttonClassName="px-an-ins"
          />
        </div>
        <span className="px-an-grow" />
        <button type="button" className="px-an-btn" onClick={onReport}>Therapy report</button>
      </div>
      {preset === "custom" && (
        <div className="px-an-pn px-an-dates">
          <DateRangePicker from={from} to={to} onChange={onRange} />
        </div>
      )}
    </>
  );
}

export default function PixelAnalyticsBoard({
  sessions = [], alters = [], altersById = {}, emotionCheckIns = [], symptomCheckIns = [],
  sleepRecords = [], activities = [], from, to, preset, onPickAlter,
}) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => base44.entities.CustomEmotion.list(),
  });

  const range = useMemo(() => {
    let start = from;
    // "All time" starts at the first thing logged, not 1970.
    if (new Date(from).getTime() <= 0) {
      const firsts = [
        ...sessions.map((s) => toMs(s.start_time)),
        ...emotionCheckIns.map((c) => toMs(c.timestamp || c.created_date)),
        ...sleepRecords.map((r) => toMs(r.start_time || r.created_date)),
      ].filter((v) => v != null && v > 0);
      start = firsts.length ? new Date(Math.min(...firsts)) : new Date(to);
    }
    return buildRange(start, to);
  }, [from, to, sessions, emotionCheckIns, sleepRecords]);
  const noun = (PIXEL_RANGES.find((r) => r.id === preset) || PIXEL_RANGES[1]).noun;
  const overNoun = preset === "custom" || preset === "all" ? noun : `the ${noun}`;

  const fronting = useMemo(() => frontingRollup({ sessions, range }), [sessions, range]);
  const frontRows = useMemo(() => [...fronting.perAlterMs.entries()]
    .filter(([id]) => altersById[id])
    .map(([id, ms]) => ({ alter: altersById[id], ms }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 8), [fronting, altersById]);
  const frontMax = frontRows[0]?.ms || 1;

  // Feelings by day: the most-felt feeling of each day, coloured by the
  // range's four most-felt feelings (a feeling's own colour wins).
  const feelings = useMemo(() => {
    const perDay = new Map();
    const total = new Map();
    for (const c of emotionCheckIns) {
      const ms = toMs(c.timestamp || c.created_date);
      if (ms == null || ms < range.fromMs || ms > range.toMs) continue;
      const k = dayKey(ms);
      if (!perDay.has(k)) perDay.set(k, new Map());
      for (const e of c.emotions || []) {
        if (!e) continue;
        perDay.get(k).set(e, (perDay.get(k).get(e) || 0) + 1);
        total.set(e, (total.get(e) || 0) + 1);
      }
    }
    const top = [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l]) => l);
    const colorOf = (label) => {
      const i = top.indexOf(label);
      return customEmotionColor(label, customEmotions, i >= 0 ? FEEL_PAL[i] : "#8a8fb3");
    };
    const keys = range.dayKeys.slice(-35);
    const cells = keys.map((k) => {
      const m = perDay.get(k);
      const best = m && m.size ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
      return { key: k, day: Number(k.slice(8)), feeling: best, color: best ? colorOf(best) : null };
    });
    const lead = keys.length ? (new Date(`${keys[0]}T12:00:00`).getDay() + 6) % 7 : 0;
    return { cells, lead, legend: top.map((l) => ({ label: l, color: colorOf(l) })), clipped: range.dayKeys.length > 35 };
  }, [emotionCheckIns, range, customEmotions]);

  const matrix = useMemo(() => {
    const ids = frontRows.slice(0, 5).map((r) => r.alter.id);
    const pairs = coFrontingPairs({ sessions, range });
    const val = new Map();
    for (const p of pairs) {
      val.set(`${p.alterIdA}|${p.alterIdB}`, p.totalOverlap);
      val.set(`${p.alterIdB}|${p.alterIdA}`, p.totalOverlap);
    }
    const max = Math.max(1, ...pairs.filter((p) => ids.includes(p.alterIdA) && ids.includes(p.alterIdB)).map((p) => p.totalOverlap));
    return { ids, val, max, any: pairs.some((p) => ids.includes(p.alterIdA) && ids.includes(p.alterIdB)) };
  }, [frontRows, sessions, range]);

  const symptomPoints = useMemo(() => {
    const series = dailySeries(
      symptomCheckIns.filter((c) => Number(c.severity) > 0),
      (c) => toMs(c.timestamp || c.created_date),
      range,
      { kind: "value", getValue: (items) => items.reduce((a, c) => a + Number(c.severity), 0) / items.length },
    );
    return bucketSeries(series, "avg");
  }, [symptomCheckIns, range]);

  const sleep = useMemo(() => sleepRollup({ sleepRecords, range }), [sleepRecords, range]);
  const sleepPoints = useMemo(() => bucketSeries(sleep.hoursSeries, "avg"), [sleep]);

  const plans = useMemo(() => plansLifecycle({ activities, range }), [activities, range]);
  const plansPrior = useMemo(() => plansLifecycle({ activities, range: priorRange(range) }), [activities, range]);
  const switchesPerDay = range.days ? fronting.switchesTotal / range.days : null;

  const hm = (h) => {
    if (h == null) return "—";
    const whole = Math.floor(h);
    const mins = Math.round((h - whole) * 60);
    return mins ? `${whole} h ${String(mins).padStart(2, "0")}` : `${whole} h`;
  };
  const short = (a) => formatAlter(a).slice(0, 3);
  const pct = (r) => `${Math.round(r * 100)}%`;

  return (
    <div className="px-an-grid">
      <Panel title={`${terms.Fronting} time`} note="hours">
        <div className="px-an-front">
          {frontRows.length === 0 && <Empty>No {terms.fronting} logged in this range.</Empty>}
          {frontRows.map(({ alter, ms }) => {
            const color = isValidHexColor(alter.color) ? alter.color : "var(--color-primary)";
            return (
              <button key={alter.id} type="button" className="px-an-frow" onClick={() => onPickAlter?.(alter.id)} title={`Open ${formatAlter(alter)}'s footprint`}>
                <span className="px-an-fname">{formatAlter(alter)}</span>
                <span className="px-an-ftrack"><span style={{ width: `${(ms / frontMax) * 100}%`, background: color }} /></span>
                <span className="px-an-fnum">{Math.round(ms / HOUR_MS)}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Feelings by day" note={feelings.clipped ? "last 35 days" : "most felt"}>
        <div className="px-an-cal">
          {Array.from({ length: feelings.lead }).map((_, i) => <span key={`b${i}`} className="px-an-cell blank" />)}
          {feelings.cells.map((c) => (
            <span
              key={c.key}
              className={`px-an-cell ${c.feeling ? "" : "none"}`}
              style={c.color ? { background: c.color } : undefined}
              title={`${fmtDay(new Date(`${c.key}T12:00:00`).getTime())}: ${c.feeling || "no feelings logged"}`}
            >
              {c.day}
            </span>
          ))}
        </div>
        {feelings.legend.length > 0 && (
          <div className="px-an-legend">
            {feelings.legend.map((l) => <span key={l.label} style={{ color: l.color }}>{l.label}</span>)}
          </div>
        )}
      </Panel>

      <Panel title={`Who ${terms.fronts || "fronts"} together`} note="shared hours">
        {!matrix.any ? <Empty>No shared {terms.fronting} time in this range.</Empty> : (
          <div className="px-an-matrix" style={{ gridTemplateColumns: `64px repeat(${matrix.ids.length}, minmax(0, 1fr))` }}>
            <span />
            {matrix.ids.map((id) => <span key={`h${id}`} className="px-an-mhead">{short(altersById[id])}</span>)}
            {matrix.ids.map((row) => (
              <React.Fragment key={row}>
                <span className="px-an-mrow">{formatAlter(altersById[row])}</span>
                {matrix.ids.map((col) => {
                  if (row === col) return <span key={col} className="px-an-mcell self" />;
                  const ms = matrix.val.get(`${row}|${col}`) || 0;
                  return (
                    <span
                      key={col}
                      className="px-an-mcell"
                      style={{ background: `color-mix(in srgb, var(--color-primary) ${Math.round(15 + (ms / matrix.max) * 85)}%, var(--px-sunk))` }}
                      title={`${formatAlter(altersById[row])} + ${formatAlter(altersById[col])}`}
                    >
                      {Math.round(ms / HOUR_MS)}
                    </span>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Symptoms over ${overNoun}`} note="average 1 to 5" className="px-an-span2">
        {symptomPoints.some((p) => p.value != null)
          ? <BarChart points={symptomPoints} max={5} color="var(--px-an-sym)" label="Average symptom severity by day" unit="of 5" />
          : <Empty>No rated symptoms in this range.</Empty>}
      </Panel>

      <Panel title="Sleep" note="hours a night">
        {sleepPoints.some((p) => p.value != null)
          ? <BarChart points={sleepPoints} max={10} color="var(--px-an-sleep)" label="Hours of sleep a night" unit="h" />
          : <Empty>No nights logged in this range.</Empty>}
      </Panel>

      <Panel title={`Noticed ${preset === "custom" || preset === "all" ? "in this range" : `this ${noun}`}`} note="from your own records" className="px-an-span3">
        <div className="px-an-noticed">
          <div>
            <span className="px-an-big" style={{ color: "#f2c08a" }}>{plans.completionRate != null ? pct(plans.completionRate) : "—"}</span>
            <span className="px-an-mut">
              {plans.completionRate != null
                ? `of plans got done${plansPrior.completionRate != null ? `, ${pct(plansPrior.completionRate)} the ${noun === "these dates" || noun === "all time" ? "time" : noun} before` : ""}`
                : "no plans resolved in this range"}
            </span>
          </div>
          <div>
            <span className="px-an-big" style={{ color: "#9cc46b" }}>{switchesPerDay != null ? switchesPerDay.toFixed(1) : "—"}</span>
            <span className="px-an-mut">{terms.switches} a day on average</span>
          </div>
          <div>
            <span className="px-an-big" style={{ color: "#8fb8e0" }}>{hm(sleep.avgHours)}</span>
            <span className="px-an-mut">{sleep.avgHours != null ? `average sleep over ${sleep.nightsLogged} logged night${sleep.nightsLogged === 1 ? "" : "s"}` : "no nights logged in this range"}</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
