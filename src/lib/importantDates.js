// "Date" custom-field support: parse stored date values and collect the
// annual important dates (birthdays, anniversaries, etc.) an alter carries in
// its date-typed custom fields, so date surfaces (Activity Tracker calendar,
// …) can mark them.
//
// Stored value format (a plain string in the custom-field value):
//   "YYYY-MM-DD"  → a specific date (year known)
//   "MM-DD"       → an annual date (no year — e.g. a birthday)

export function parseDateFieldValue(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const month = +m[2], day = +m[3];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year: +m[1], month, day };
  }
  m = /^(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const month = +m[1], day = +m[2];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year: null, month, day };
  }
  return null;
}

// Format a parsed date for display. Annual dates omit the year.
export function formatDateField(value) {
  const p = parseDateFieldValue(value);
  if (!p) return "";
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const base = `${months[p.month - 1]} ${p.day}`;
  return p.year != null ? `${base}, ${p.year}` : base;
}

// Gather every date-typed custom field across alters into a flat list of
// annual events. Covers BOTH system-wide custom field defs (value lives at
// alter.custom_fields[defId]) and per-alter ad-hoc fields
// (alter.alter_custom_fields[] entries with field_type === "date").
export function collectAlterDates(alters = [], systemFields = []) {
  const dateDefs = (systemFields || []).filter((f) => f.field_type === "date");
  const out = [];
  for (const a of alters || []) {
    if (!a || a.is_archived) continue;
    const cf = a.custom_fields || {};
    for (const def of dateDefs) {
      const p = parseDateFieldValue(cf[def.id]);
      if (p) out.push({ alterId: a.id, alterName: a.name, color: a.color || null, fieldName: def.name, ...p });
    }
    const adhoc = Array.isArray(a.alter_custom_fields) ? a.alter_custom_fields : [];
    for (const f of adhoc) {
      if (f?.field_type === "date") {
        const p = parseDateFieldValue(f.value);
        if (p) out.push({ alterId: a.id, alterName: a.name, color: a.color || null, fieldName: f.name, ...p });
      }
    }
  }
  return out;
}

// Filter collected dates to those that fall on a given calendar day
// (month/day match — year is ignored so annual events recur every year).
export function datesForDay(allDates = [], date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return allDates.filter((x) => x.month === m && x.day === d);
}
