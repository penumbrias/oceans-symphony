// Pure compute for the analytics SystemMap. Extracted from
// src/components/system/SystemMap.jsx so it can run in a worker thread
// (see src/workers/systemMapLayout.worker.js). No React, no DOM, no
// window — these functions only touch the inputs they're given.
//
// What's in here:
//   - computeFrontingTimeAll: per-alter ms in {total, primary, cofronting}
//   - computeCofrontingTimeAll: per-pair ms in {total, primary, cofronting}
//   - viewTimes / viewCofrontingTimes: cheap timeMode projection
//   - computeNodePositions: the O(n²) bumper layout (the slow one)
//
// The bumper used to live as an inline closure inside the SystemMap
// component's nodePositions useMemo. Pulling it out lets a worker run
// the same algorithm without copy-pasting hundreds of lines.

import {
  foldAbsorptionTimes,
  foldAbsorptionCofronting,
} from "./absorptionUtils";
import {
  normalizeSessions,
  effectiveDurationMs,
  sliceByOverlap,
} from "./sessionNormalizer";

export const LAYOUT_DEFAULTS = Object.freeze({
  centerX: 600,
  centerY: 400,
  minRadius: 50,
  maxRadius: 320,
  nodeR: 32,
});

export function computeFrontingTimeAll(frontingSessions, absorptionMap) {
  const fromMs = 0;
  const toMs = Date.now();
  const now = Date.now();
  const normalised = normalizeSessions(frontingSessions, now);
  const time = {};
  for (const s of normalised) {
    const dur = effectiveDurationMs(s, fromMs, toMs, now);
    if (dur <= 0) continue;
    for (const id of s.alterIds) {
      if (!time[id]) time[id] = { total: 0, primary: 0, cofronting: 0 };
      time[id].total += dur;
      if (id === s.primaryAlterId) time[id].primary += dur;
      else time[id].cofronting += dur;
    }
  }
  return foldAbsorptionTimes(time, absorptionMap);
}

export function computeCofrontingTimeAll(frontingSessions, absorptionMap) {
  const fromMs = 0;
  const toMs = Date.now();
  const now = Date.now();
  const normalised = normalizeSessions(frontingSessions, now);
  const map = {};
  const ensurePair = (idA, idB) => {
    if (!map[idA]) map[idA] = {};
    if (!map[idA][idB]) map[idA][idB] = { total: 0, primary: 0, cofronting: 0 };
  };
  const slices = sliceByOverlap(normalised, fromMs, toMs, now);
  const rowSpans = normalised.map((s) => {
    const start = Math.max(s.startMs, fromMs);
    const end = s.endMs != null
      ? Math.min(s.endMs, toMs)
      : Math.min(now, toMs);
    return { s, start, end };
  });
  for (const slice of slices) {
    const ids = [...slice.aliveAlterIds];
    if (ids.length < 2) continue;
    const dur = slice.endMs - slice.startMs;
    const primarySet = new Set();
    for (const { s, start, end } of rowSpans) {
      if (!s.primaryAlterId) continue;
      if (start <= slice.startMs && end >= slice.endMs && slice.aliveAlterIds.has(s.primaryAlterId)) {
        primarySet.add(s.primaryAlterId);
      }
    }
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue;
        const idA = ids[i];
        const idB = ids[j];
        ensurePair(idA, idB);
        map[idA][idB].total += dur;
        if (primarySet.has(idA)) map[idA][idB].primary += dur;
        else map[idA][idB].cofronting += dur;
      }
    }
  }
  return foldAbsorptionCofronting(map, absorptionMap);
}

export function viewTimes(timesAll, timeMode) {
  const result = {};
  for (const id of Object.keys(timesAll)) {
    const times = timesAll[id];
    result[id] = times[timeMode] ?? times.total;
  }
  return result;
}

export function viewCofrontingTimes(timesAll, timeMode) {
  const result = {};
  for (const idA of Object.keys(timesAll)) {
    result[idA] = {};
    const peers = timesAll[idA];
    for (const idB of Object.keys(peers)) {
      const times = peers[idB];
      result[idA][idB] = times[timeMode] ?? times.total;
    }
  }
  return result;
}

// Greedy nearest-neighbor chain — ordered angularly by co-fronting
// similarity so alters that co-front frequently end up adjacent on the
// orbit. O(n²) but only walked once per layout.
function orderByCoFrontSimilarity(items, getCoTime) {
  if (items.length <= 1) return items;
  const remaining = [...items];
  const ordered = [remaining.splice(0, 1)[0]];
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestScore = -1;
    for (let idx = 0; idx < remaining.length; idx++) {
      const score = getCoTime(last, remaining[idx]);
      if (score > bestScore) { bestScore = score; bestIdx = idx; }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

// The bumper. Items push each other along their orbit until no pair
// overlaps. Iteration cap scales inversely with pair count so very
// large systems get fewer passes instead of locking the thread.
function placeOnOrbit(items, getRadius, getCoTime, config) {
  const { centerX, centerY, nodeR: targetNodeR } = config;
  const n = items.length;
  if (n === 0) return {};
  const pairCount = Math.max(1, (n * (n - 1)) / 2);
  const maxBumperIters = Math.max(1, Math.min(300, Math.floor((300 * 3160) / pairCount)));
  const ordered = getCoTime ? orderByCoFrontSimilarity(items, getCoTime) : items;
  const radii = ordered.map((item) => getRadius(item));
  let effectiveNodeR = targetNodeR;
  const angles = ordered.map((_, idx) => (idx / n) * Math.PI * 2 - Math.PI / 2);

  const runBumper = (nr) => {
    const a = [...angles];
    for (let iter = 0; iter < maxBumperIters; iter++) {
      let moved = false;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const xi = Math.cos(a[i]) * radii[i], yi = Math.sin(a[i]) * radii[i];
          const xj = Math.cos(a[j]) * radii[j], yj = Math.sin(a[j]) * radii[j];
          const dx = xj - xi, dy = yj - yi;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = nr * 2.05;
          if (dist < minDist && dist > 0.001) {
            const overlap = minDist - dist;
            const nudgeI = (overlap / Math.max(radii[i], 1)) * 0.6;
            const nudgeJ = (overlap / Math.max(radii[j], 1)) * 0.6;
            a[i] -= nudgeI;
            a[j] += nudgeJ;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return a;
  };

  const hasOverlap = (a, nr) => {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const xi = Math.cos(a[i]) * radii[i], yi = Math.sin(a[i]) * radii[i];
        const xj = Math.cos(a[j]) * radii[j], yj = Math.sin(a[j]) * radii[j];
        const dx = xj - xi, dy = yj - yi;
        if (Math.sqrt(dx * dx + dy * dy) < nr * 2.0) return true;
      }
    }
    return false;
  };

  let finalAngles = runBumper(effectiveNodeR);
  while (effectiveNodeR > 10 && hasOverlap(finalAngles, effectiveNodeR)) {
    effectiveNodeR -= 1;
    finalAngles = runBumper(effectiveNodeR);
  }

  const out = {};
  ordered.forEach((item, idx) => {
    out[item.id] = {
      x: centerX + Math.cos(finalAngles[idx]) * radii[idx],
      y: centerY + Math.sin(finalAngles[idx]) * radii[idx],
      nodeR: effectiveNodeR,
    };
  });
  return out;
}

// Top-level layout. Pure: same input → same output.
//
// inputs:
//   filteredAlters: [{ id, ... }]                — already filtered by main
//   selectedAlterId: string | null
//   frontingTime: { [id]: ms }                    — timeMode-projected
//   frontingTimeAll: { [id]: { total, primary, cofronting } }
//   cofrontingTime: { [idA]: { [idB]: ms } }      — timeMode-projected
//   cofrontingTimeAll: { [idA]: { [idB]: { total, primary, cofronting } } }
//
// returns: { [id]: { x, y, nodeR } }
export function computeNodePositions(input, config = LAYOUT_DEFAULTS) {
  const {
    filteredAlters,
    selectedAlterId,
    frontingTime,
    frontingTimeAll,
    cofrontingTime,
    cofrontingTimeAll,
  } = input;
  const { centerX, centerY, minRadius, maxRadius } = config;

  const positions = {};

  if (!selectedAlterId) {
    const times = filteredAlters.map((a) => frontingTime[a.id] || 0);
    const maxTime = Math.max(...times, 1);
    const getCoTime = (a, b) => cofrontingTimeAll[a.id]?.[b.id]?.total || 0;
    const getRadius = (a) => {
      const t = frontingTime[a.id] || 0;
      const ratio = t / maxTime;
      return maxRadius - ratio * (maxRadius - minRadius);
    };
    return placeOnOrbit(filteredAlters, getRadius, getCoTime, config);
  }

  positions[selectedAlterId] = { x: centerX, y: centerY, nodeR: 35 };
  const others = filteredAlters.filter((a) => a.id !== selectedAlterId);
  const xTotalTime = frontingTimeAll[selectedAlterId]?.total || 1;
  const getRadius = (a) => {
    const overlap = cofrontingTime[selectedAlterId]?.[a.id] || 0;
    const ratio = Math.min(1, overlap / xTotalTime);
    return maxRadius - ratio * (maxRadius - minRadius);
  };
  const getCoTime = (a, b) => cofrontingTimeAll[a.id]?.[b.id]?.total || 0;
  const placed = placeOnOrbit(others, getRadius, getCoTime, config);
  return { ...positions, ...placed };
}

// One-stop entry point used by the worker. Re-computes everything in
// the correct order. The output is enough to drive a full re-render
// of the analytics map.
export function computeFullLayout(input, config = LAYOUT_DEFAULTS) {
  const {
    frontingSessions,
    absorptionMap,
    filteredAlters,
    selectedAlterId,
    timeMode,
  } = input;
  const frontingTimeAll = computeFrontingTimeAll(frontingSessions, absorptionMap);
  const cofrontingTimeAll = computeCofrontingTimeAll(frontingSessions, absorptionMap);
  const frontingTime = viewTimes(frontingTimeAll, timeMode);
  const cofrontingTime = viewCofrontingTimes(cofrontingTimeAll, timeMode);
  const nodePositions = computeNodePositions({
    filteredAlters,
    selectedAlterId,
    frontingTime,
    frontingTimeAll,
    cofrontingTime,
    cofrontingTimeAll,
  }, config);
  return {
    frontingTimeAll,
    cofrontingTimeAll,
    frontingTime,
    cofrontingTime,
    nodePositions,
  };
}
