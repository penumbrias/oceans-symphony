// The kit's chart set (new house step 1.3), on the app's own chart library
// (recharts, already used by the analytics pages; this file only loads
// with the house's lazy code).
//
//   <Chart kind="bar" title="Check-ins by day" xKey="day" data={rows}
//     series={[{ key: "count", label: "Check-ins" }]} />
//   <Chart kind="line" … series={[{ key: "mood", label: "Mood" }, { key: "energy", label: "Energy" }]} />
//   <Chart kind="donut" title="Time by activity" nameKey="name" data={[{ name, value }]} />
//
// Every chart has:
// - a legend in words beside a swatch AND a line style or marker, so no
//   series is told apart by colour alone;
// - a text version: "Chart / Table" switches to a real table of the same
//   numbers, and the picture itself is named with a one-line summary;
// - colours from the house: the accent first, then a set kept at 3:1
//   against the panel (readable shades, never the person's settings);
// - text in the body font at text-sm (SVG can't take the label font's
//   ligature rule; building code §7).
// Empty data shows EmptyBlock, never an empty axis.

import React, { useId, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { BarChart3 } from "lucide-react";
import { useHouse } from "@/house/tokens/HouseRoot";
import { readableOnAll } from "@/house/tokens/contrast";
import { Segmented } from "@/house/kit/Choices";
import { EmptyBlock } from "@/house/kit/States";
import { seriesSummary } from "@/house/kit/lists";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";

const BASE = ["#4F7DF3", "#E8833A", "#2FA37C", "#B455C9", "#D4A72C", "#D9466B", "#3AA6C9", "#7A6FF0"];
const DASHES = ["0", "6 4", "2 3", "10 4 2 4", "1 5", "8 3 2 3 2 3"];
const MARKERS = ["circle", "square", "triangle", "diamond", "cross", "star"];

export function useChartColours(n) {
  const house = useHouse();
  const r = house?.roles || {};
  return useMemo(() => {
    const bgs = [r.panel, r.page].filter(Boolean);
    const list = [r.accent || BASE[0], ...BASE.filter((c) => c.toLowerCase() !== String(r.accent || "").toLowerCase())];
    const out = [];
    for (let i = 0; i < n; i++) out.push(bgs.length ? readableOnAll(list[i % list.length], bgs, 3) : list[i % list.length]);
    return out;
  }, [n, r.panel, r.page, r.accent]);
}

function Marker({ shape, color }) {
  const s = 12;
  const p = { fill: color, stroke: color };
  return (
    <svg width="1em" height="1em" viewBox={`0 0 ${s} ${s}`} aria-hidden="true" className="hk-legend-marker">
      {shape === "square" ? <rect x="2" y="2" width="8" height="8" {...p} />
        : shape === "triangle" ? <path d="M6 1 L11 11 L1 11 Z" {...p} />
        : shape === "diamond" ? <path d="M6 1 L11 6 L6 11 L1 6 Z" {...p} />
        : shape === "cross" ? <path d="M2 2 L10 10 M10 2 L2 10" stroke={color} strokeWidth="2.5" fill="none" />
        : shape === "star" ? <path d="M6 1 L7.5 4.5 L11 5 L8.5 7.5 L9 11 L6 9 L3 11 L3.5 7.5 L1 5 L4.5 4.5 Z" {...p} />
        : <circle cx="6" cy="6" r="4.5" {...p} />}
    </svg>
  );
}

function Legend({ items }) {
  return (
    <ul className="hk-legend" aria-label="Legend">
      {items.map((it, i) => (
        <li key={it.label + i} className="hk-legend-item">
          <span className="hk-legend-swatch" aria-hidden="true">
            {it.dash != null
              ? <svg width="2em" height="1em" viewBox="0 0 24 12"><line x1="1" y1="6" x2="23" y2="6" stroke={it.color} strokeWidth="3" strokeDasharray={it.dash} /></svg>
              : null}
            <Marker shape={it.marker} color={it.color} />
          </span>
          <span>{it.label}</span>
          {it.value != null ? <span className="hk-legend-value">{it.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ caption, columns, rows }) {
  return (
    <div className="hk-table-wrap" tabIndex={0} role="region" aria-label={`${caption}: table`}>
      <table className="hk-table">
        <caption className="hk-sr">{caption}</caption>
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c, j) => (j === 0
                ? <th key={c.key} scope="row">{r[c.key]}</th>
                : <td key={c.key}>{r[c.key] ?? "–"}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const fmt = (v) => (typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : v);

export default function Chart({ kind = "bar", title, data = [], xKey = "label", xLabel, series = [], nameKey = "name", valueKey = "value", valueLabel = "Value", unit = "", height = "16rem", empty, initialView = "chart" }) {
  const id = useId();
  const [view, setView] = useState(initialView);
  const isDonut = kind === "donut";
  const items = isDonut ? data : series;
  const colours = useChartColours(Math.max(1, items.length));
  if (!data.length) {
    return (
      <figure className="hk-chart" aria-labelledby={`${id}-t`}>
        <figcaption id={`${id}-t`} className="hk-chart-title house-label">{title}</figcaption>
        <EmptyBlock icon={BarChart3} compact title={empty?.title || "Nothing to chart yet"} body={empty?.body} action={empty?.action} />
      </figure>
    );
  }
  const legend = isDonut
    ? data.map((d, i) => ({ label: d[nameKey], color: colours[i], marker: MARKERS[i % MARKERS.length], value: `${fmt(d[valueKey])}${unit ? ` ${unit}` : ""}` }))
    : series.map((s, i) => ({ label: s.label, color: s.color || colours[i], marker: MARKERS[i % MARKERS.length], dash: kind === "line" ? DASHES[i % DASHES.length] : null }));
  const summary = isDonut
    ? `${title}: ${data.map((d) => `${d[nameKey]} ${fmt(d[valueKey])}${unit ? ` ${unit}` : ""}`).join(", ")}.`
    : `${title}: ${series.map((s) => { const m = seriesSummary(data, s.key); return `${s.label} from ${fmt(m.min)} to ${fmt(m.max)}, total ${fmt(m.total)}`; }).join("; ")}, over ${data.length} ${xLabel ? xLabel.toLowerCase() : "points"}.`;
  const columns = isDonut
    ? [{ key: nameKey, label: xLabel || "Name" }, { key: valueKey, label: valueLabel }]
    : [{ key: xKey, label: xLabel || "When" }, ...series.map((s) => ({ key: s.key, label: s.label }))];
  const tableRows = data.map((d) => Object.fromEntries(columns.map((c) => [c.key, fmt(d[c.key])])));
  const tooltipStyle = { background: "var(--house-panel)", border: "var(--house-border-w) solid var(--house-border)", borderRadius: "var(--house-corner-sm)", color: "var(--house-text)" };
  return (
    <figure className="hk-chart" aria-labelledby={`${id}-t`}>
      <div className="hk-chart-head">
        <figcaption id={`${id}-t`} className="hk-chart-title house-label">{title}</figcaption>
        <Segmented label={`${title}: show as`} value={view} onChange={setView}
          options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]} />
      </div>
      {view === "chart" ? (
        <>
          <div className="hk-chart-plot" role="img" aria-label={summary} style={{ height }}>
            {/* The picture is named by the summary above; its marks are hidden
                from screen readers, which get the Table view instead. */}
            <div aria-hidden="true" className="hk-chart-svg">
            <ResponsiveContainer width="100%" height="100%">
              {isDonut ? (
                <PieChart>
                  <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="55%" outerRadius="85%" stroke="var(--house-panel)" strokeWidth={2} isAnimationActive={false}>
                    {data.map((d, i) => <Cell key={i} fill={colours[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              ) : kind === "line" ? (
                <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--house-divider)" vertical={false} />
                  <XAxis dataKey={xKey} stroke="var(--house-border)" />
                  <YAxis stroke="var(--house-border)" width={40} />
                  <Tooltip contentStyle={tooltipStyle} />
                  {series.map((s, i) => (
                    <Line key={s.key} dataKey={s.key} name={s.label} stroke={legend[i].color} strokeWidth={3}
                      strokeDasharray={DASHES[i % DASHES.length]} dot={{ r: 4, fill: legend[i].color }} isAnimationActive={false} />
                  ))}
                </LineChart>
              ) : (
                <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--house-divider)" vertical={false} />
                  <XAxis dataKey={xKey} stroke="var(--house-border)" />
                  <YAxis stroke="var(--house-border)" width={40} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--house-divider)" }} />
                  {series.map((s, i) => (
                    <Bar key={s.key} dataKey={s.key} name={s.label} fill={legend[i].color} stroke="var(--house-panel)" isAnimationActive={false} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
            </div>
          </div>
          <Legend items={legend} />
        </>
      ) : (
        <DataTable caption={title} columns={columns} rows={tableRows} />
      )}
    </figure>
  );
}

export { Chart, DataTable, Legend };
