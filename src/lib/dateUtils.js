/**
 * Safely parse a date string from the backend.
 * Backend returns UTC timestamps - ensure they're parsed as UTC, not local time.
 * Date-only strings (YYYY-MM-DD) are parsed as local midnight.
 */
export function parseDate(str) {
  if (!str) return new Date();
  const s = String(str);
  // Date-only: treat as local midnight to avoid off-by-one day
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00');
  // Datetime without timezone info: append Z to force UTC parsing
  if (!s.endsWith('Z') && !s.match(/[+-]\d{2}:\d{2}$/)) return new Date(s + 'Z');
  return new Date(s);
}