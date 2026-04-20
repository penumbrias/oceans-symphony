/**
 * Safely parse a date string from the backend.
 * Backend returns UTC timestamps - ensure they're parsed as UTC, not local time.
 * Date-only strings (YYYY-MM-DD) are parsed as local midnight.
 */
export function parseDate(str) {
  if (!str) return new Date();
  const s = String(str);
  // Date-only: construct as local midnight (guaranteed, no ambiguity)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  // Datetime without timezone info: append Z to force UTC parsing
  if (!s.endsWith('Z') && !s.match(/[+-]\d{2}:\d{2}$/)) return new Date(s + 'Z');
  return new Date(s);
}