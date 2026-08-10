// Where a block sits on the week canvas.
//
// THE RULE THAT MATTERS: a block's vertical position and height come from
// its REAL start and end times. Nothing snaps to the hour. An activity from
// 2:15 to 3:47 draws from 2:15 to 3:47.
//
// The old grid tied a block's extent to the hour row it lived in, so
// everything read as if it happened on the hour and a 20-minute thing looked
// the same as a 90-minute thing. That's the single biggest reason the
// tracker couldn't answer "where did my time actually go".
//
// Only WIDTH responds to neighbours. Blocks that overlap in time share the
// day's width between them (the standard calendar column-packing approach):
//
//   1. sort by start, then by longest-first so the big block anchors the left
//   2. walk them, collecting a CLUSTER: blocks connected by overlap
//   3. inside a cluster, place each block in the leftmost column whose last
//      block has already finished
//   4. every block in the cluster is 1/columns wide
//
// Clusters are independent, so a busy morning never squeezes a quiet
// afternoon.

export const MINUTES_PER_DAY = 24 * 60;

// Minutes from midnight, clamped to the day. `dayStart` is that day's 00:00.
export function minutesInto(date, dayStart) {
  const ms = new Date(date).getTime() - dayStart.getTime();
  return Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(ms / 60000)));
}

// A block that ends after midnight is clipped at the day boundary — the
// caller renders the remainder on the following day, so a night shift reads
// as two pieces rather than one impossible block hanging off the bottom.
export function toSpan(item, dayStart) {
  const start = new Date(item.start);
  const end = item.end ? new Date(item.end) : null;
  const dayEnd = new Date(dayStart.getTime() + MINUTES_PER_DAY * 60000);
  if (end && end <= dayStart) return null;
  if (start >= dayEnd) return null;
  const startMin = minutesInto(start < dayStart ? dayStart : start, dayStart);
  // No end time = still running (or never stamped). Give it a visible stub
  // rather than a zero-height sliver that can't be tapped.
  const endMin = end ? minutesInto(end > dayEnd ? dayEnd : end, dayStart) : startMin + 30;
  return {
    ...item,
    startMin,
    endMin: Math.min(MINUTES_PER_DAY, Math.max(endMin, startMin + MIN_BLOCK_MINUTES)),
    continuesBefore: start < dayStart,
    continuesAfter: !!end && end > dayEnd,
    openEnded: !end,
  };
}

// Below this a block is unreadable and untappable, so it's drawn at this
// height even though its real duration is shorter. The stored times are
// never changed — this is presentation only.
export const MIN_BLOCK_MINUTES = 15;

// Two spans overlap if they share any minute. Touching end-to-start is NOT
// an overlap: back-to-back activities should sit full width, one above the
// other, not squeezed into halves.
function overlaps(a, b) {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

/**
 * Lay out one day's blocks.
 *
 * Returns each span with { left, width } as 0–1 fractions of the day column,
 * alongside the startMin/endMin the caller turns into top/height. Pure — no
 * DOM, no dates beyond what's passed in, so it can be tested directly.
 */
export function layoutDay(items, dayStart) {
  const spans = (items || [])
    .map((i) => toSpan(i, dayStart))
    .filter(Boolean)
    .sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));

  const out = [];
  let cluster = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    // Columns hold the last block placed in them, so a new block can reuse a
    // column as soon as that column is free.
    const columns = [];
    for (const span of cluster) {
      let placed = false;
      for (let c = 0; c < columns.length; c += 1) {
        if (!overlaps(columns[c], span)) {
          columns[c] = span;
          span._col = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        span._col = columns.length;
        columns.push(span);
      }
    }
    const total = columns.length;
    for (const span of cluster) {
      out.push({ ...span, left: span._col / total, width: 1 / total, columns: total });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const span of spans) {
    // A cluster continues while the next block starts before everything
    // seen so far has finished.
    if (cluster.length && span.startMin >= clusterEnd) flush();
    cluster.push(span);
    clusterEnd = Math.max(clusterEnd, span.endMin);
  }
  flush();

  return out.map(({ _col, ...rest }) => rest);
}

// How much time a set of blocks actually accounts for, in minutes. This is
// the number the week is FOR: "you drew for two hours and forty minutes."
// Overlapping blocks are counted once against the clock (union), because
// two things at the same time didn't take twice the time — but each
// activity's own total still counts its full duration.
export function occupiedMinutes(spans) {
  const ranges = [...(spans || [])]
    .map((s) => [s.startMin, s.endMin])
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cursor = -1;
  let openUntil = -1;
  for (const [s, e] of ranges) {
    if (s > openUntil) {
      if (openUntil > cursor) total += openUntil - Math.max(cursor, 0);
      cursor = s;
      openUntil = e;
    } else {
      openUntil = Math.max(openUntil, e);
    }
  }
  if (openUntil > cursor && cursor >= 0) total += openUntil - cursor;
  return total;
}

// Snap a dragged edge to a sensible grain. 15 minutes is fine enough to say
// "quarter past" and coarse enough that a shaky finger doesn't produce
// 2:13–3:47 by accident. The user can still type exact times in the modal.
export const SNAP_MINUTES = 15;
export function snap(minutes, grain = SNAP_MINUTES) {
  return Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutes / grain) * grain));
}
