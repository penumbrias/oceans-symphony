// Plan color tags (v0.258.4).
//
// A plan can carry its OWN color tag (`Activity.tag_color`, a #rrggbb hex) that
// is independent of the activity/category color. The Month and Year calendars
// tint a day's box with it.
//
// When a day holds several tagged plans, the box takes the color of the
// highest-priority one: a plan at a specific time first, then daily, weekly,
// monthly and yearly repeats (the most specific, "closest" plan wins).
//
// Saved colors are a small personal palette kept on the device
// (localStorage `symphony_plan_tag_colors`) — losing it only loses swatches,
// never a plan: each plan stores its own hex.

export const PLAN_TAG_PRESETS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#78716c", "#0f172a",
];

const SAVED_KEY = "symphony_plan_tag_colors";
const MAX_SAVED = 24;

export function normalizeHex(input) {
  if (typeof input !== "string") return null;
  let v = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.split("").map((c) => c + c).join("");
  return /^[0-9a-fA-F]{6}$/.test(v) ? `#${v.toLowerCase()}` : null;
}

export function readSavedTagColors() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(normalizeHex).filter(Boolean) : [];
  } catch { return []; }
}

function writeSaved(list) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, MAX_SAVED))); } catch { /* storage full/blocked — swatches only */ }
}

export function saveTagColor(hex) {
  const h = normalizeHex(hex);
  if (!h) return readSavedTagColors();
  const next = [h, ...readSavedTagColors().filter((c) => c !== h)];
  writeSaved(next);
  return next.slice(0, MAX_SAVED);
}

export function deleteSavedTagColor(hex) {
  const h = normalizeHex(hex);
  const next = readSavedTagColors().filter((c) => c !== h);
  writeSaved(next);
  return next;
}

// 0 = specific time (one-off), 1 = daily, 2 = weekly, 3 = monthly, 4 = yearly.
// A one-off "no specific time" plan sits just after the timed ones.
export function tagRank(a) {
  const r = a?.recurrence_interval;
  if (r === "daily") return 1;
  if (r === "weekly" || r === "biweekly") return 2;
  if (r === "monthly") return 3;
  if (r === "yearly") return 4;
  return a?.is_quick_plan ? 0.5 : 0;
}

export function tagColorOf(a) {
  return normalizeHex(a?.tag_color || "") || null;
}

// The tagged plans on a day, highest priority first.
export function taggedPlansForDay(list) {
  return (list || [])
    .filter((a) => tagColorOf(a))
    .sort((x, y) => tagRank(x) - tagRank(y) || new Date(x.timestamp) - new Date(y.timestamp));
}

export function dayTagColor(list) {
  const top = taggedPlansForDay(list)[0];
  return top ? tagColorOf(top) : null;
}

// Readable text color over a hex background.
export function textOn(hex) {
  const h = normalizeHex(hex);
  if (!h) return undefined;
  const n = parseInt(h.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#111827" : "#ffffff";
}

// Colour a dot should use for an event: its own colour, else its plan colour
// tag. null → the caller shows its faint theme dot.
export function eventDotColor(a) {
  return a?.color || tagColorOf(a) || null;
}

// A soft see-through fill of any CSS colour (hex, hsl, var…), `pct` = 0-100.
export function softFill(color, pct = 40) {
  if (!color) return undefined;
  const h = normalizeHex(color);
  if (h) {
    const a = Math.round((Math.max(0, Math.min(100, pct)) / 100) * 255).toString(16).padStart(2, "0");
    return `${h}${a}`;
  }
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

// Colour for a day that has NO plan colour tag: the colour of what took the
// most time that day, else the highest-priority event that has a colour. This
// is what tints older entries (made before colour tags existed) like a tagged
// day, in both the month and year calendars and their widgets.
export function dayActivityColor(list, minutesOf) {
  const items = (list || []).filter((a) => a?.color);
  if (!items.length) return null;
  const mins = (a) => (typeof minutesOf === "function" ? minutesOf(a) || 0 : 0);
  items.sort((x, y) => mins(y) - mins(x) || tagRank(x) - tagRank(y) || new Date(x.timestamp) - new Date(y.timestamp));
  return items[0].color;
}
