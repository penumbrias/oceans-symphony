// An alter's roles (v0.371.13). `Alter.role` stays ONE string, so older
// versions, backups, friends and exports keep reading it — but it may now
// hold several roles separated by commas ("Protector, Caretaker"), split the
// same way a custom field of the List kind is. Every surface that shows or
// matches a role goes through these helpers, never `alter.role` by hand.

const SPLIT = /[,;|]/;

// The roles in a role string (or on an alter), trimmed, empties dropped,
// repeats (any case) removed. A single-role string gives a one-item list.
export function splitRoles(raw) {
  if (typeof raw !== "string") return [];
  const out = [];
  const seen = new Set();
  for (const part of raw.split(SPLIT)) {
    const r = part.trim();
    if (!r) continue;
    const key = r.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export function alterRoles(alter) {
  return splitRoles(alter?.role);
}

// The stored form of a list of roles.
export function joinRoles(list) {
  return splitRoles((Array.isArray(list) ? list : []).join(", ")).join(", ");
}

// Roles as one line of text, for places that print plain text (reports,
// subtitles): "Protector, Caretaker".
export function rolesText(alter) {
  return alterRoles(alter).join(", ");
}

// Does the alter hold this role (case-insensitive)?
export function hasRole(alter, role) {
  const want = String(role || "").trim().toLowerCase();
  if (!want) return false;
  return alterRoles(alter).some((r) => r.toLowerCase() === want);
}
