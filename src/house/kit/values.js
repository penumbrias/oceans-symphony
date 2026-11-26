// The kit's value handling (new house step 1.2): pure functions behind the
// number, date, time and duration fields. No React, no storage, no clock
// unless one is passed in, so scripts/test-house-kit.mjs can test them.
//
// Stored shapes (never changed by the kit, building code RULE ZERO):
//   day       "YYYY-MM-DD" (a local calendar day; read it as local noon,
//             never new Date("YYYY-MM-DD"), which is UTC midnight)
//   time      "HH:mm", 24-hour, whatever clock the person reads
//   duration  whole minutes (a number)
//   number    a number, clamped to the field's min and max

// ── Numbers ───────────────────────────────────────────────────────────
// What a typed number commits to: the clamped value, or null when the text
// isn't a number (the field then shows its last good value again). Same
// rule as SettingRows' ValueField, so a number reads the same everywhere.
export function commitNumber(text, { min = -Infinity, max = Infinity, step = null } = {}) {
  const cleaned = String(text ?? "").trim().replace(",", ".");
  if (cleaned === "") return null;
  const v = Number(cleaned);
  if (!Number.isFinite(v)) return null;
  let c = Math.min(max, Math.max(min, v));
  if (step && step > 0) {
    const base = Number.isFinite(min) ? min : 0;
    c = base + Math.round((c - base) / step) * step;
    c = Math.min(max, Math.max(min, Number(c.toFixed(6))));
  }
  return c;
}

// ── Days ──────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");

export function isDay(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = dayToDate(v);
  return toDay(d) === v;
}

// A Date at local noon on that day (safe across DST and time zones).
export function dayToDate(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function toDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(day, n) {
  const d = dayToDate(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

// Same day of the month, clamped to the month's end (31 Jan + 1 → 28/29 Feb).
export function addMonths(day, n) {
  const d = dayToDate(day);
  const want = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(want, last));
  return toDay(d);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const monthIndex = (word) => {
  const w = String(word).toLowerCase().replace(/\.$/, "");
  if (w.length < 3) return -1;
  return MONTHS.findIndex((m) => w.startsWith(m) || (m === "sep" && w.startsWith("sept")));
};

const validYMD = (y, m, d) => {
  if (!(y >= 1000 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const day = `${y}-${pad(m)}-${pad(d)}`;
  return isDay(day) ? day : null;
};

// The locale's numeric date order: "dmy", "mdy" or "ymd".
export function localeDateOrder(locale) {
  try {
    const parts = new Intl.DateTimeFormat(locale, { year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(2026, 10, 24));
    const seq = parts.filter((p) => ["day", "month", "year"].includes(p.type)).map((p) => p.type[0]).join("");
    return ["dmy", "mdy", "ymd"].includes(seq) ? seq : "dmy";
  } catch { return "dmy"; }
}

// What a person typed, as a day. `today` is a day string. Understands:
// today / tomorrow / yesterday, a weekday (the next one, today included),
// 2026-11-23, 23 Nov, Nov 23, 23 November 2026, and numeric 23/11(/2026)
// in the locale's order (`order`). Null when it can't tell.
export function parseDayInput(text, { today, order = "dmy" } = {}) {
  const raw = String(text ?? "").trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!raw || !isDay(today)) return null;
  const [ty] = today.split("-").map(Number);
  if (raw === "today" || raw === "now") return today;
  if (raw === "tomorrow" || raw === "tmr") return addDays(today, 1);
  if (raw === "yesterday") return addDays(today, -1);
  const wd = WEEKDAYS.findIndex((w) => raw.length >= 3 && raw.replace(/^(next|this) /, "").startsWith(w));
  if (wd >= 0 && /^(next |this )?[a-z]+$/.test(raw)) {
    const cur = dayToDate(today).getDay();
    let diff = (wd - cur + 7) % 7;
    if (raw.startsWith("next ") && diff === 0) diff = 7;
    return addDays(today, diff);
  }
  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return validYMD(+m[1], +m[2], +m[3]);
  // Words: "23 nov 2026", "nov 23 2026", "mon 23 nov" (a leading weekday is ignored).
  const words = raw.split(" ").filter((w) => !(WEEKDAYS.some((d) => w.startsWith(d)) && monthIndex(w) < 0 && !/\d/.test(w)));
  if (words.length >= 2 && words.length <= 3) {
    const mi = words.findIndex((w) => monthIndex(w) >= 0);
    if (mi >= 0) {
      const rest = words.filter((_, i) => i !== mi).map((w) => w.replace(/(st|nd|rd|th)$/, ""));
      if (rest.every((w) => /^\d+$/.test(w))) {
        const nums = rest.map(Number);
        const month = monthIndex(words[mi]) + 1;
        if (nums.length === 1) return validYMD(ty, month, nums[0]);
        const [a, b] = nums;
        if (a <= 31 && b > 31) return validYMD(b, month, a);
        if (b <= 31 && a > 31) return validYMD(a, month, b);
        return null;
      }
    }
  }
  m = raw.match(/^(\d{1,4})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);
  if (m) {
    const a = +m[1], b = +m[2];
    let y = m[3] != null ? +m[3] : ty;
    if (m[3] != null && m[3].length === 2) y = 2000 + y;
    if (order === "mdy") return validYMD(y, a, b);
    return validYMD(y, b, a);
  }
  return null;
}

// "Mon 23 Nov" (with the year when it isn't this year). `relative` adds
// "Today, " / "Tomorrow, " / "Yesterday, " before it.
export function formatDayWords(day, { today, locale, relative = true } = {}) {
  if (!isDay(day)) return "";
  const d = dayToDate(day);
  const sameYear = isDay(today) && today.slice(0, 4) === day.slice(0, 4);
  let words;
  try {
    words = d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).replace(/,/g, "");
  } catch {
    words = day;
  }
  if (!relative || !isDay(today)) return words;
  const rel = day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : day === addDays(today, -1) ? "Yesterday" : null;
  return rel ? `${rel}, ${words}` : words;
}

// The full spoken form for screen readers: "Monday 23 November 2026".
export function formatDayLong(day, { locale } = {}) {
  if (!isDay(day)) return "";
  try {
    return dayToDate(day).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/,/g, "");
  } catch { return day; }
}

// Six weeks of days for a month view, starting on `weekStart` (0 Sunday,
// 1 Monday). Each cell: { day, inMonth }.
export function monthGrid(year, monthIndex0, weekStart = 1) {
  const first = new Date(year, monthIndex0, 1, 12);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const start = toDay(new Date(year, monthIndex0, 1 - lead, 12));
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const day = addDays(start, i);
    cells.push({ day, inMonth: dayToDate(day).getMonth() === monthIndex0 });
  }
  return cells;
}

// ── Times ─────────────────────────────────────────────────────────────
export function isTime(v) {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

// What a person typed, as "HH:mm". Understands 9, 930, 0930, 9:30, 9.30,
// 21:30, 9pm, 9:30 pm, 12am, noon and midnight. Null when it can't tell.
export function parseTimeInput(text) {
  const raw = String(text ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;
  if (raw === "noon" || raw === "midday") return "12:00";
  if (raw === "midnight") return "00:00";
  const m = raw.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/) || raw.match(/^(\d{3,4})(am|pm|a|p)?$/);
  if (!m) return null;
  let h, min, mer;
  if (m.length === 3 || (m[1].length > 2)) {
    const digits = m[1];
    h = Number(digits.slice(0, digits.length - 2));
    min = Number(digits.slice(-2));
    mer = m[2];
  } else {
    h = Number(m[1]);
    min = m[2] != null ? Number(m[2]) : 0;
    mer = m[3];
  }
  if (min > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    const pm = mer.startsWith("p");
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23) return null;
  return `${pad(h)}:${pad(min)}`;
}

// "21:30" on a 24-hour clock, "9:30 pm" on a 12-hour one.
export function formatTimeValue(time, format = "12") {
  if (!isTime(time)) return "";
  if (format === "24") return time;
  const [h, m] = time.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${h < 12 ? "am" : "pm"}`;
}

// Times every `step` minutes through the day, for the time list.
export function timeSlots(step = 15) {
  const out = [];
  const s = Math.max(1, Math.min(60, Math.round(step)));
  for (let t = 0; t < 24 * 60; t += s) out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  return out;
}

// The slot nearest a time (for scrolling the list to it).
export function nearestSlot(time, step = 15) {
  if (!isTime(time)) return null;
  const [h, m] = time.split(":").map(Number);
  const t = Math.round((h * 60 + m) / step) * step % (24 * 60);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

// ── Durations (whole minutes) ─────────────────────────────────────────
const UNIT_MIN = { d: 1440, day: 1440, days: 1440, h: 60, hr: 60, hrs: 60, hour: 60, hours: 60, m: 1, min: 1, mins: 1, minute: 1, minutes: 1 };

// What a person typed, as minutes. Understands 90, 1:30, 1h30, 1h 30m,
// 1 h 30 min, 1.5h, 2 hours, 45m, 1d 2h and "half an hour". Null when it
// can't tell; never negative.
export function parseDuration(text) {
  const raw = String(text ?? "").trim().toLowerCase().replace(",", ".");
  if (!raw) return null;
  if (/^half an? hour$/.test(raw)) return 30;
  if (/^an? hour$/.test(raw)) return 60;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw));
  let m = raw.match(/^(\d+):([0-5]\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)/g;
  let total = 0, used = "", hit;
  while ((hit = re.exec(raw))) {
    const unit = UNIT_MIN[hit[2]];
    if (!unit) return null;
    total += Number(hit[1]) * unit;
    used += hit[0];
  }
  // "1h30" — a bare number after hours means minutes.
  m = raw.match(/(\d+)\s*h(?:ours?|rs?)?\s*(\d+)$/);
  if (m) { total += Number(m[2]); used += m[2]; }
  if (!used || used.replace(/\s/g, "").length !== raw.replace(/\s/g, "").length) return null;
  return Math.round(total);
}

// "1 h 30 min", "45 min", "2 h", "1 d 3 h". Short, for the field.
export function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  const n = Math.round(minutes);
  if (n === 0) return "0 min";
  const d = Math.floor(n / 1440), h = Math.floor((n % 1440) / 60), m = n % 60;
  return [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
}

// "1 hour 30 minutes": the spoken form.
export function formatDurationLong(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  const n = Math.round(minutes);
  if (n === 0) return "0 minutes";
  const d = Math.floor(n / 1440), h = Math.floor((n % 1440) / 60), m = n % 60;
  const w = (v, one) => `${v} ${one}${v === 1 ? "" : "s"}`;
  return [d && w(d, "day"), h && w(h, "hour"), m && w(m, "minute")].filter(Boolean).join(" ");
}

// ── Save state (the slot every field has) ─────────────────────────────
// idle | saving | saved | failed. The words are short and plain, and a
// failure always says the typing is kept (building code §1 rule 6).
export const SAVE_STATES = ["idle", "saving", "saved", "failed"];
export function saveStateWords(state, { error } = {}) {
  switch (state) {
    case "saving": return "Saving…";
    case "saved": return "Saved";
    case "failed": return `Not saved${error ? `: ${error}` : ""}. Your typing is kept.`;
    default: return "";
  }
}

// How many characters a value box must show whole (kit gate item 1): the
// words in it, or (empty) its placeholder's up to 12, never under 2. The
// field sets it as --hk-chars and kit.css makes the box at least that wide.
export function valueChars(text, placeholder) {
  const n = String(text ?? "").length || Math.min(String(placeholder ?? "").length, 12);
  return Math.max(2, n);
}
