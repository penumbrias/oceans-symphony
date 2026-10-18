const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Accepts "ff8800", "#ff8800", "#f80" -> "#ff8800" (or "" if not valid).
export function normalizeHex(input) {
  let v = String(input ?? "").trim();
  if (!v) return "";
  if (v[0] !== "#") v = "#" + v;
  if (!HEX_RE.test(v)) return "";
  if (v.length === 4) v = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  return v.toLowerCase();
}
