// The house's Analytics room (board 06): the rules, in words and numbers,
// with no React and nothing written anywhere. What the address means
// (?tab=, ?alter=), the calendar periods (Week · Month · Year · Pick dates)
// and how they step, how each panel shapes the engine's numbers for the
// board (bars, the feelings calendar, the together grid) and how the room
// words them. Every count itself comes from the analytics engine
// (src/lib/analytics/*) or the old page's reads; this file only shapes.
// Tested by scripts/test-house-analytics.mjs.

import { dayKey, eachDayKey } from "../../lib/analytics/range.js";

const DAY_MS = 86400000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON = MONTHS.map((m) => m.slice(0, 3));

// ── The address ──────────────────────────────────────────────────────────
// No ?tab is the board. The old page's tabs keep their ids, so every old
// link (?tab=alters&alter=<id> from a profile) still lands where it did.
export const ANALYTICS_VIEWS = Object.freeze(["board", "overview", "fronting", "wellbeing", "life", "alters"]);

function params(search) {
  try { return new URLSearchParams(search || ""); } catch { return new URLSearchParams(""); }
}

export function analyticsViewOf(search) {
  const t = params(search).get("tab");
  return ANALYTICS_VIEWS.includes(t) ? t : "board";
}

export function analyticsAlterOf(search) {
  return params(search).get("alter") || null;
}

export function analyticsViewHref(view, { alterId } = {}) {
  if (!ANALYTICS_VIEWS.includes(view) || view === "board") return "/analytics";
  const q = new URLSearchParams({ tab: view });
  if (alterId) q.set("alter", alterId);
  return `/analytics?${q.toString()}`;
}

/** The five old views, in the person's words, for the "Look closer" doors. */
export function analyticsViewList(terms = {}) {
  const t = { fronting: "fronting", Fronting: "Fronting", Alters: "Alters", alter: "alter", switches: "switches", ...terms };
  return [
    { id: "overview", label: "Your usual", hint: `This week against your usual: ${t.fronting} time, ${t.switches}, check-ins, sleep, and insight cards` },
    { id: "fronting", label: t.Fronting, hint: `Who ${t.fronts || "fronts"} most, by level, history, time of day, ${t.switches} and their log` },
    { id: "wellbeing", label: "Wellbeing", hint: "Feelings, symptoms, check-in log, sleep, meetings and patterns" },
    { id: "life", label: "Life", hint: "Activities, plans, to-dos, places, contacts, journals and authorship" },
    { id: "alters", label: t.Alters, hint: `Each ${t.alter}'s footprint` },
  ];
}

// ── The periods ──────────────────────────────────────────────────────────
export const ANALYTICS_RANGES = Object.freeze([
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "custom", label: "Pick dates" },
]);

export const CUSTOM_QUICK = Object.freeze([
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "1y", label: "Last year", days: 365 },
  { id: "all", label: "All time", days: null },
]);

const startOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOf = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

/** The whole calendar period holding `anchor` ({ from, to } as Dates, both whole days). */
export function periodOf(kind, anchor = new Date(), weekStartsOn = 1) {
  const a = new Date(anchor);
  if (kind === "week") {
    const s = startOf(a);
    const back = (s.getDay() - (weekStartsOn === 0 ? 0 : 1) + 7) % 7;
    s.setDate(s.getDate() - back);
    const e = new Date(s); e.setDate(e.getDate() + 6);
    return { from: s, to: endOf(e) };
  }
  if (kind === "year") return { from: new Date(a.getFullYear(), 0, 1), to: endOf(new Date(a.getFullYear(), 11, 31)) };
  return { from: new Date(a.getFullYear(), a.getMonth(), 1), to: endOf(new Date(a.getFullYear(), a.getMonth() + 1, 0)) };
}

/** Move the anchor a whole period back (-1) or forward (+1). */
export function stepAnchor(kind, anchor, dir) {
  const a = new Date(anchor);
  if (kind === "week") { a.setDate(a.getDate() + 7 * dir); return a; }
  if (kind === "year") return new Date(a.getFullYear() + dir, Math.min(a.getMonth(), 11), 1, 12);
  return new Date(a.getFullYear(), a.getMonth() + dir, 1, 12);
}

/** Forward is offered only while the next period has started. */
export function canStepForward(kind, anchor, weekStartsOn = 1, now = Date.now()) {
  const next = periodOf(kind, stepAnchor(kind, anchor, 1), weekStartsOn);
  return next.from.getTime() <= now;
}

export function customFor(id, now = new Date(), firstMs = null) {
  const q = CUSTOM_QUICK.find((x) => x.id === id);
  if (!q) return null;
  const to = endOf(now);
  if (q.days == null) return { from: startOf(firstMs != null ? new Date(firstMs) : now), to };
  const from = startOf(new Date(now.getTime() - (q.days - 1) * DAY_MS));
  return { from, to };
}

export const ARROW_WORDS = Object.freeze({ week: "week", month: "month", year: "year" });

/** The toolbar's words for the period: "November 2026", "2026", "Nov 23 to 29, 2026". */
export function periodWords(kind, from, to) {
  const a = new Date(from), b = new Date(to);
  if (kind === "month") return `${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  if (kind === "year") return String(a.getFullYear());
  if (a.getTime() <= DAY_MS * 366) return `Everything to ${MON[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = `${MON[a.getMonth()]} ${a.getDate()}${sameYear ? "" : `, ${a.getFullYear()}`}`;
  const right = a.getMonth() === b.getMonth() && sameYear ? `${b.getDate()}` : `${MON[b.getMonth()]} ${b.getDate()}`;
  return `${left} to ${right}, ${b.getFullYear()}`;
}

/** The status line's words (board 06: "November 1 to 30"). */
export function spanWords(from, to, now = new Date()) {
  const a = new Date(from), b = new Date(to);
  const yr = (d) => (d.getFullYear() === new Date(now).getFullYear() ? "" : `, ${d.getFullYear()}`);
  if (a.getTime() <= DAY_MS * 366) return `Everything to ${MONTHS[b.getMonth()]} ${b.getDate()}${yr(b)}`;
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${MONTHS[a.getMonth()]} ${a.getDate()} to ${b.getDate()}${yr(b)}`;
  if (a.getFullYear() === b.getFullYear()) return `${MONTHS[a.getMonth()]} ${a.getDate()} to ${MONTHS[b.getMonth()]} ${b.getDate()}${yr(b)}`;
  return `${MONTHS[a.getMonth()]} ${a.getDate()}, ${a.getFullYear()} to ${MONTHS[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
}

/** "the month" / "the week" / "the year" / "these dates" for panel titles. */
export function nounOf(kind) {
  return kind === "week" ? "week" : kind === "month" ? "month" : kind === "year" ? "year" : null;
}

/** The period before, in words: "in October", "the week before", "in 2025". */
export function priorWords(kind, from) {
  const a = new Date(from);
  if (kind === "month") { const p = new Date(a.getFullYear(), a.getMonth() - 1, 1); return `in ${MONTHS[p.getMonth()]}`; }
  if (kind === "year") return `in ${a.getFullYear() - 1}`;
  if (kind === "week") return "the week before";
  return "the stretch before";
}

/** The window of equal length just before (for "up from 61% in October"). */
export function priorPeriod(kind, anchor, weekStartsOn = 1, custom = null) {
  if (kind === "custom" && custom) {
    const len = custom.to.getTime() - custom.from.getTime();
    const to = new Date(custom.from.getTime() - 1);
    return { from: startOf(new Date(to.getTime() - len)), to: endOf(to) };
  }
  return periodOf(kind, stepAnchor(kind, anchor, -1), weekStartsOn);
}

// ── Day keys for the whole period (future days drawn empty, as board 06) ──
export function periodDayKeys(from, to) {
  return eachDayKey(startOf(from).getTime(), endOf(to).getTime());
}

/** The day bars: one per day up to 62 days, else one per month (or week for odd spans). */
export function periodBars({ keys = [], valueByKey = new Map(), todayKey }) {
  const day = (k) => ({ key: k, value: valueByKey.has(k) ? valueByKey.get(k) : null, future: todayKey != null && k > todayKey });
  if (keys.length <= 62) return keys.map(day);
  const groups = new Map();
  const byMonth = keys.length > 120;
  keys.forEach((k, i) => {
    const g = byMonth ? k.slice(0, 7) : keys[i - (i % 7)];
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(k);
  });
  return [...groups.entries()].map(([g, ks]) => {
    const vals = ks.filter((k) => valueByKey.has(k) && valueByKey.get(k) != null).map((k) => valueByKey.get(k));
    return {
      key: g,
      days: ks,
      value: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null,
      future: todayKey != null && ks[0] > todayKey,
    };
  });
}

export function barLabel(key) {
  if (/^\d{4}-\d{2}$/.test(key)) return MON[Number(key.slice(5, 7)) - 1];
  const [, m, d] = key.split("-").map(Number);
  return `${MON[m - 1]} ${d}`;
}

/** Four labels under a bar chart: first, a third, two thirds, last (board 06: Nov 1 · Nov 10 · Nov 20 · Nov 30). */
export function axisLabels(points = []) {
  if (!points.length) return [];
  const n = points.length - 1;
  const idx = [...new Set([0, Math.round(n / 3), Math.round((2 * n) / 3), n])];
  return idx.map((i) => barLabel(points[i].key));
}

// ── Feelings by day ──────────────────────────────────────────────────────
/** Day → Map(feeling → times) over check-ins in the window. */
export function tallyFeelings(checkIns = [], fromMs, toMs, keep = () => true) {
  const byDay = new Map();
  const total = new Map();
  for (const c of checkIns) {
    const ms = new Date(c?.timestamp || c?.created_date).getTime();
    if (!Number.isFinite(ms) || ms < fromMs || ms > toMs || !keep(c)) continue;
    const k = dayKey(ms);
    if (!byDay.has(k)) byDay.set(k, new Map());
    for (const e of c.emotions || []) {
      if (!e) continue;
      byDay.get(k).set(e, (byDay.get(k).get(e) || 0) + 1);
      total.set(e, (total.get(e) || 0) + 1);
    }
  }
  return { byDay, total };
}

const mostOf = (m) => {
  if (!m || !m.size) return null;
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0][0];
};

/** The legend: the period's most-felt feelings (up to `max`), most first. */
export function feelingLegend(total = new Map(), max = 4) {
  return [...total.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, max).map(([l]) => l);
}

/**
 * The calendar: up to 42 days is a month grid (blank cells before the first
 * day so columns are weekdays), longer spans are one cell per month.
 */
export function feelingCells({ keys = [], byDay = new Map(), todayKey, weekStartsOn = 1 }) {
  if (keys.length <= 42) {
    const first = keys[0];
    let lead = 0;
    if (first) {
      const [y, m, d] = first.split("-").map(Number);
      lead = (new Date(y, m - 1, d, 12).getDay() - (weekStartsOn === 0 ? 0 : 1) + 7) % 7;
    }
    return {
      mode: "days",
      lead,
      cells: keys.map((k) => ({ key: k, label: String(Number(k.slice(8))), feeling: mostOf(byDay.get(k)), future: todayKey != null && k > todayKey })),
    };
  }
  const months = new Map();
  for (const k of keys) {
    const g = k.slice(0, 7);
    if (!months.has(g)) months.set(g, { first: k, counts: new Map() });
    for (const [e, n] of byDay.get(k) || []) months.get(g).counts.set(e, (months.get(g).counts.get(e) || 0) + n);
  }
  return {
    mode: "months",
    lead: 0,
    cells: [...months.entries()].map(([g, v]) => ({ key: g, label: barLabel(g), feeling: mostOf(v.counts), future: todayKey != null && v.first > todayKey })),
  };
}

// ── Who fronts together ──────────────────────────────────────────────────
/** Rows/columns: the top fronters, or the picked one and who they shared the most time with. */
export function togetherIds({ fronters = [], pairs = [], whoseId = null, max = 5 }) {
  if (!whoseId) return fronters.slice(0, max);
  const partners = pairs
    .filter((p) => p.alterIdA === whoseId || p.alterIdB === whoseId)
    .sort((a, b) => b.totalOverlap - a.totalOverlap)
    .map((p) => (p.alterIdA === whoseId ? p.alterIdB : p.alterIdA));
  return [whoseId, ...partners].slice(0, max);
}

export function togetherGrid(ids = [], pairs = []) {
  const val = new Map();
  for (const p of pairs) {
    val.set(`${p.alterIdA}|${p.alterIdB}`, p.totalOverlap);
    val.set(`${p.alterIdB}|${p.alterIdA}`, p.totalOverlap);
  }
  const inGrid = pairs.filter((p) => ids.includes(p.alterIdA) && ids.includes(p.alterIdB));
  return { ids, val, max: Math.max(1, ...inGrid.map((p) => p.totalOverlap)), any: inGrid.length > 0 };
}

// ── Words ────────────────────────────────────────────────────────────────
/** "6 h 50", "7 h", or an em dash. */
export function hoursWords(h) {
  if (h == null || !Number.isFinite(h)) return "—";
  let whole = Math.floor(h);
  let mins = Math.round((h - whole) * 60);
  if (mins === 60) { whole += 1; mins = 0; }
  return mins ? `${whole} h ${String(mins).padStart(2, "0")}` : `${whole} h`;
}

export const pct = (r) => `${Math.round(r * 100)}%`;

function change(now, before, fmt) {
  if (before == null || now == null) return "";
  if (fmt(now) === fmt(before)) return `, the same as`;
  return now > before ? `, up from ${fmt(before)}` : `, down from ${fmt(before)}`;
}

/**
 * Board 06's "Noticed" sentences, from the engine's numbers. Descriptive
 * only (never "better" or "worse"), in the person's words.
 */
export function noticedWords({ terms = {}, kind, from, plans, plansPrior, switchesPerDay, switchesPrior, sleep, sleepLink, whoseName = null }) {
  const t = { switches: "switches", fronting: "fronting", ...terms };
  const before = priorWords(kind, from);
  const out = [];
  const pr = plans?.completionRate;
  out.push({
    id: "plans", tone: "accent",
    big: pr != null ? pct(pr) : "—",
    words: pr != null
      ? `of plans got done${(() => { const c = change(pr, plansPrior?.completionRate ?? null, pct); return c ? `${c} ${before}` : ""; })()}`
      : "no plans resolved in this stretch",
  });
  const sp = switchesPerDay;
  const one = (v) => v.toFixed(1);
  out.push({
    id: "switches", tone: "good",
    big: sp != null ? one(sp) : "—",
    words: sp == null ? `no ${t.fronting} logged in this stretch`
      : `${whoseName ? `times a day ${whoseName} came to ${t.front || "front"}` : `${t.switches} a day on average`}${(() => { const c = change(sp, switchesPrior, one); return c ? `${c} ${before}` : ""; })()}`,
  });
  const avg = sleep?.avgHours ?? null;
  let sleepWords = avg == null ? "no nights logged in this stretch" : `average sleep over ${sleep.nightsLogged} logged night${sleep.nightsLogged === 1 ? "" : "s"}`;
  if (avg != null && sleepLink && !sleepLink.gated && Number.isFinite(sleepLink.withMean) && Number.isFinite(sleepLink.withoutMean)) {
    sleepWords = `average sleep; distress was logged on ${pct(sleepLink.withoutMean)} of days after nights under ${hoursWords(sleepLink.medianHours)}, ${pct(sleepLink.withMean)} after longer ones`;
  }
  out.push({ id: "sleep", tone: "wave", big: hoursWords(avg), words: sleepWords });
  return out;
}

/** The panels' empty lines, in the person's words. */
export function emptyWords(panel, terms = {}) {
  const t = { fronting: "fronting", ...terms };
  return ({
    fronting: `No ${t.fronting} logged in this stretch.`,
    feelings: "No feelings logged in this stretch.",
    together: `No shared ${t.fronting} time in this stretch.`,
    symptoms: "No rated symptoms in this stretch.",
    sleep: "No nights logged in this stretch.",
  })[panel] || "Nothing logged in this stretch.";
}
