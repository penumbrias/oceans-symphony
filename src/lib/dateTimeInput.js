import { format } from "date-fns";

// THE helpers for <input type="datetime-local"> fields (v0.279.4) — ISO
// timestamp ⇄ the local "yyyy-MM-dd'T'HH:mm" shape that input expects.
// Every time field uses these; a dozen screens used to carry their own
// copy, each with its own idea of what a blank or broken value meant.
//
// toLocalDatetimeValue(iso)                   — "" for blank/invalid.
// toLocalDatetimeValue(iso, { orNow: true })  — blank means "now" (new
//                                               entries start at now).
export function toLocalDatetimeValue(iso, { orNow = false } = {}) {
  if (!iso && iso !== 0) {
    if (!orNow) return "";
    iso = Date.now();
  }
  try {
    return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
  } catch { return ""; }
}

// The input's value (local time) → Date, or null when blank/invalid.
export function fromLocalDatetimeValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// The input's value (local time) → ISO string, or null when blank/invalid.
export function localDatetimeToISO(value) {
  return fromLocalDatetimeValue(value)?.toISOString() ?? null;
}
