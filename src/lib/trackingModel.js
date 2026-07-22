// Tracking data-model v2 — the shared vocabulary for symptoms/habits and
// their check-ins. (Phase A2 of the onboarding/customization initiative;
// see docs/onboarding-customization-design.md.)
//
// The Symptom entity is schemaless, so new rows MAY carry these fields
// explicitly (`kind`, `direction`) while every legacy row derives them from
// what it already has. All consumers go through the helpers here — never
// re-derive inline.
//
// The measurement semantics this module encodes (owner-decided):
//   - A check-in row with severity 0 = "observed, absent" — a real data
//     point ("no anxiety today ✓"). It belongs in averages and coverage.
//   - A check-in row with severity null = "occurred, intensity unspecified"
//     (the user ticked the box without rating). Analytics treat it as the
//     scale MIDPOINT — deterministic, so historic charts never shift as new
//     data arrives. The stored value stays null: we impute at read time,
//     never fabricate a number in the data.
//   - No row at all = not asked / not answered. Never coerced to zero.

// ── Kinds ────────────────────────────────────────────────────────────────
// state     — continuous, has intensity ("how I am right now"): anxiety, fog
// event     — discrete, countable, timestamped: a switch, a flashback
// behaviour — something you DID (protective/coping): therapy, movement
// context   — a condition/trigger, a correlation FACTOR — never averaged
//             into symptom scores: work stress, routine break
export const TRACKING_KINDS = ["state", "event", "behaviour", "context"];

// Legacy rows that are really contexts/triggers, not symptoms. Matched by
// normalized label because the original seed had no kind field.
const LEGACY_CONTEXT_LABELS = new Set([
  "work / school stress",
  "general stress",
  "relationship stress",
]);

// The four legacy switch booleans overlap each other AND duplicate the real
// switch record (FrontingSession). They derive as events and stop being
// offered to new users (Phase B); existing users keep them + their history.
export const DEPRECATED_SWITCH_LABELS = new Set([
  "triggered switch",
  "random switch",
  "rapid switching",
  "lots of switching",
]);

const normLabel = (s) => String(s?.label || "").trim().toLowerCase();

export function deriveKind(symptom) {
  if (!symptom) return "state";
  if (TRACKING_KINDS.includes(symptom.kind)) return symptom.kind;
  const label = normLabel(symptom);
  if (LEGACY_CONTEXT_LABELS.has(label)) return "context";
  if (DEPRECATED_SWITCH_LABELS.has(label)) return "event";
  if (symptom.category === "habit") return "behaviour";
  return "state";
}

export const isContextItem = (symptom) => deriveKind(symptom) === "context";

// ── Direction ────────────────────────────────────────────────────────────
// higher_worse | higher_better | bipolar. Legacy rows derive from
// is_positive (which stays authoritative for old report logic).
export const TRACKING_DIRECTIONS = ["higher_worse", "higher_better", "bipolar"];

export function deriveDirection(symptom) {
  if (!symptom) return "higher_worse";
  if (TRACKING_DIRECTIONS.includes(symptom.direction)) return symptom.direction;
  return symptom.is_positive ? "higher_better" : "higher_worse";
}

// ── Severity semantics ───────────────────────────────────────────────────
export const SEVERITY_MAX = 5;

// Checked-but-unrated imputes the scale midpoint in aggregates. Midpoint
// (not the user's personal mean) keeps analytics deterministic and
// reproducible — old charts never silently change as new data arrives.
export const SEVERITY_MIDPOINT = SEVERITY_MAX / 2; // 2.5

// The value to use in means/aggregates for a check-in row. `null` severity
// means "occurred, intensity unspecified" → midpoint. An explicit 0 is a
// real observed "none" and passes through.
export function effectiveSeverity(checkIn) {
  if (!checkIn) return null;
  return checkIn.severity == null ? SEVERITY_MIDPOINT : checkIn.severity;
}

// Labelled anchors for the 0–5 unipolar scale (index = severity value).
// Unanchored numbers drift in meaning across days — and across alters —
// so every rating surface shows these as tooltips/aria-labels.
export const SEVERITY_ANCHORS = ["None", "Mild", "Moderate", "Strong", "Severe", "Extreme"];
export const SEVERITY_SKIP_LABEL = "Skip — no answer";

// Short display for a logged severity. An explicit 0 reads as "none" so a
// reassuring "checked, and it was absent" entry doesn't render like a
// symptom occurrence ("Anxiety · 0/5" looked identical to a real episode).
export function formatSeverityShort(severity) {
  if (severity == null) return null;
  if (severity === 0) return "none";
  return `${severity}/${SEVERITY_MAX}`;
}
