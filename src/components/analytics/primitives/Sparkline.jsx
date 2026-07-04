import React from "react";

// Tiny inline SVG sparkline for headline cards.
//
// HONESTY RULE: null values are rendered as GAPS (the line breaks), never
// interpolated across — unlogged days must not be drawn as data. Each
// non-null point also gets a small dot so isolated single-day logs are
// visible instead of vanishing (a 1-point "line" has no length).
export default function Sparkline({
  series = [],            // [{ key, value|null }]
  width = 96,
  height = 28,
  stroke = "hsl(var(--primary))",
  className = "",
  ariaLabel = "trend sparkline",
}) {
  const values = series.map((p) => p.value).filter((v) => v != null);
  if (values.length === 0) {
    return (
      <svg width={width} height={height} className={className} role="img" aria-label={`${ariaLabel} — no data`}>
        <line x1={2} y1={height / 2} x2={width - 2} y2={height / 2} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
    );
  }
  const min = Math.min(...values, 0);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const xFor = (i) => series.length <= 1 ? width / 2 : pad + (i * (width - pad * 2)) / (series.length - 1);
  const yFor = (v) => height - pad - ((v - min) / span) * (height - pad * 2);

  // Split into contiguous non-null segments so gaps stay gaps.
  const segments = [];
  let cur = [];
  series.forEach((p, i) => {
    if (p.value == null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else {
      cur.push({ x: xFor(i), y: yFor(p.value) });
    }
  });
  if (cur.length) segments.push(cur);

  return (
    <svg width={width} height={height} className={className} role="img" aria-label={ariaLabel}>
      {segments.map((seg, si) =>
        seg.length > 1 ? (
          <polyline
            key={si}
            points={seg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
            fill="none"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null,
      )}
      {segments.flat().map((p, i) => (
        <circle key={`d${i}`} cx={p.x} cy={p.y} r="1.6" fill={stroke} />
      ))}
    </svg>
  );
}
