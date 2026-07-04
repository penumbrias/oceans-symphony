import React from "react";

// Full-width day-series chart for domain tabs — a bigger sibling of
// Sparkline with the same honesty rules (null days render as GAPS, never
// interpolated) plus lived-event annotation markers (SystemChangeEvents
// etc.) so a number change stays anchored to what actually happened.
//
// series:  [{ key: "YYYY-MM-DD", value|null }]
// markers: [{ key, emoji, label }]
export default function DaySeriesChart({
  series = [],
  markers = [],
  height = 96,
  stroke = "hsl(var(--primary))",
  valueFormatter = (v) => String(Math.round(v * 10) / 10),
  ariaLabel = "trend over time",
}) {
  const width = 320; // viewBox width; scales to container via preserveAspectRatio
  const padX = 6;
  const padTop = 18;  // room for marker emoji
  const padBottom = 14; // room for sparse date labels

  const values = series.map((p) => p.value).filter((v) => v != null);
  const hasData = values.length > 0;
  const min = hasData ? Math.min(...values, 0) : 0;
  const max = hasData ? Math.max(...values) : 1;
  const span = max - min || 1;

  const xFor = (i) => series.length <= 1 ? width / 2 : padX + (i * (width - padX * 2)) / (series.length - 1);
  const yFor = (v) => height - padBottom - ((v - min) / span) * (height - padBottom - padTop);

  // Contiguous non-null segments → polylines with gaps preserved.
  const segments = [];
  let cur = [];
  series.forEach((p, i) => {
    if (p.value == null) { if (cur.length) segments.push(cur); cur = []; }
    else cur.push({ x: xFor(i), y: yFor(p.value), v: p.value, key: p.key });
  });
  if (cur.length) segments.push(cur);

  const idxByKey = new Map(series.map((p, i) => [p.key, i]));

  // Sparse x labels: first, middle, last.
  const labelIdx = series.length > 2 ? [0, Math.floor(series.length / 2), series.length - 1] : series.map((_, i) => i);
  const shortLabel = (key) => {
    const [, m, d] = key.split("-");
    return `${Number(m)}/${Number(d)}`;
  };

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={ariaLabel} preserveAspectRatio="none">
        {/* max/min guide values */}
        {hasData && (
          <>
            <text x={padX} y={padTop - 6} fontSize="7" fill="hsl(var(--muted-foreground))">{valueFormatter(max)}</text>
            <line x1={padX} y1={yFor(max)} x2={width - padX} y2={yFor(max)} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.12" strokeWidth="0.5" />
          </>
        )}
        {/* event markers */}
        {markers.map((m, mi) => {
          const idx = idxByKey.get(m.key);
          if (idx == null) return null;
          const x = xFor(idx);
          return (
            <g key={`mk-${mi}`}>
              <line x1={x} y1={padTop} x2={x} y2={height - padBottom} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.35" strokeWidth="0.75" strokeDasharray="2 2" />
              <text x={x} y={padTop - 4} fontSize="9" textAnchor="middle">
                <title>{`${m.label} — ${m.key}`}</title>
                {m.emoji}
              </text>
            </g>
          );
        })}
        {/* data */}
        {segments.map((seg, si) =>
          seg.length > 1 ? (
            <polyline key={si}
              points={seg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
              fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
            />
          ) : null,
        )}
        {segments.flat().map((p, i) => (
          <circle key={`d${i}`} cx={p.x} cy={p.y} r="1.8" fill={stroke}>
            <title>{`${p.key}: ${valueFormatter(p.v)}`}</title>
          </circle>
        ))}
        {/* x labels */}
        {labelIdx.map((i) => series[i] ? (
          <text key={`xl-${i}`} x={xFor(i)} y={height - 3} fontSize="7" textAnchor="middle" fill="hsl(var(--muted-foreground))">
            {shortLabel(series[i].key)}
          </text>
        ) : null)}
        {!hasData && (
          <text x={width / 2} y={height / 2} fontSize="9" textAnchor="middle" fill="hsl(var(--muted-foreground))">
            No entries in this period
          </text>
        )}
      </svg>
    </div>
  );
}
