import { format } from "date-fns";

// Shared helper for <input type="datetime-local"> fields — converts an ISO
// timestamp to the "yyyy-MM-dd'T'HH:mm" shape that input expects, and back.
export function toLocalDatetimeValue(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
  } catch { return ""; }
}

export function fromLocalDatetimeValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
