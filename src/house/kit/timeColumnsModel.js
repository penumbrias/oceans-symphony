// The time columns' drag maths (TimeColumns.jsx), pure so it can be tested.
// Minutes from a column's midnight; 15-minute grain; nothing leaves the day.

export const TC_DAY_MINUTES = 24 * 60;
export const TC_SNAP = 15;

export const tcSnap = (m, grain = TC_SNAP) => Math.max(0, Math.min(TC_DAY_MINUTES, Math.round(m / grain) * grain));

/** A press-and-drag on empty time, as a snapped { fromMin, toMin } (15 minutes at least). */
export function dragRange(aMin, bMin) {
  const lo = tcSnap(Math.min(aMin, bMin)), hi = tcSnap(Math.max(aMin, bMin));
  const from = Math.min(lo, TC_DAY_MINUTES - TC_SNAP);
  return { fromMin: from, toMin: Math.max(from + TC_SNAP, Math.min(TC_DAY_MINUTES, hi)) };
}

/** A block dragged by `deltaMin`: moved whole ("move") or by its end ("resize"); snapped, kept inside the day. */
export function dragBlock({ startMin, endMin }, deltaMin, mode = "move") {
  const len = Math.max(TC_SNAP, endMin - startMin);
  if (mode === "resize") return { startMin, endMin: Math.max(startMin + TC_SNAP, Math.min(TC_DAY_MINUTES, tcSnap(endMin + deltaMin))) };
  const s = Math.max(0, Math.min(TC_DAY_MINUTES - len, tcSnap(startMin + deltaMin)));
  return { startMin: s, endMin: s + len };
}
