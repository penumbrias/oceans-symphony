// Which Quick Check-In sections are shown — user-configurable so the modal
// isn't cluttered with sections someone never uses.
//
// Persisted on SystemSettings.quick_checkin_sections as an array of enabled
// section ids. Unset (the back-compat default) = every section shown.
// Configured from Manage Check-In → Sections.

export const QUICK_CHECKIN_SECTIONS = [
  { id: "feeling",  label: "Feeling" },
  { id: "fronting", label: "Fronting" },
  { id: "activity", label: "Activity" },
  { id: "symptoms", label: "Symptoms / Habits" },
  { id: "diary",    label: "Diary" },
  { id: "note",     label: "Note" },
  { id: "contacts", label: "Company" },
  { id: "location", label: "Location" },
];

const ALL_IDS = QUICK_CHECKIN_SECTIONS.map((s) => s.id);

// Ordered list of enabled section ids. Unknown/removed ids are dropped and
// the canonical order is always preserved (regardless of stored order).
// Never returns an empty list — falls back to Feeling so the modal is usable.
export function enabledCheckinSectionIds(settings) {
  const raw = settings?.quick_checkin_sections;
  if (!Array.isArray(raw)) return ALL_IDS.slice();
  const set = new Set(raw);
  const filtered = ALL_IDS.filter((id) => set.has(id));
  return filtered.length ? filtered : ["feeling"];
}
