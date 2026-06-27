// Contacts (external relationships) — shared constants + pure helpers.
//
// "Contacts" is the directory of people OUTSIDE the system (friends, family,
// classmates, therapists). This module holds the value catalogues and tiny
// pure helpers used across the Contacts surfaces; no React, no IO, so it is
// safe to import anywhere (directory, edit modal, profile, global search,
// analytics).
//
// Entity: localEntities.Contact — see contacts-feature-plan (memory) for the
// full field list. Key fields used here: safety (string key), awareness
// (string key), contact_methods (array of { type, label, value }),
// is_emergency_support (bool), is_archived (bool).

// ── Safety / trust levels ────────────────────────────────────────────────
// Four presets. Labels are CUSTOMISABLE later (Phase 2): a future
// SystemSettings.contact_safety_levels array overrides these, keyed by the
// same `key`, so existing Contact.safety values never break when relabelled.
export const CONTACT_SAFETY_LEVELS = [
  { key: "safe",    label: "Safe",    color: "#10b981", description: "Trusted — safe to be around / share with." },
  { key: "caution", label: "Caution", color: "#f59e0b", description: "Mixed / be careful — some boundaries needed." },
  { key: "unsafe",  label: "Unsafe",  color: "#ef4444", description: "Not safe — avoid or keep firm boundaries." },
  { key: "unknown", label: "Unknown", color: "#94a3b8", description: "Not sure yet / haven't decided." },
];

export const DEFAULT_SAFETY_KEY = "unknown";

// Returns the active safety-level list — custom overrides from settings when
// present (Phase 2), otherwise the presets. Custom entries are matched to a
// preset by `key` so colours/order stay sensible if only the label changed.
export function getSafetyLevels(settings) {
  const custom = settings?.contact_safety_levels;
  if (Array.isArray(custom) && custom.length) {
    return custom
      .filter((l) => l && l.key)
      .map((l) => {
        const preset = CONTACT_SAFETY_LEVELS.find((p) => p.key === l.key);
        return {
          key: l.key,
          label: l.label || preset?.label || l.key,
          color: l.color || preset?.color || "#94a3b8",
          description: l.description ?? preset?.description ?? "",
        };
      });
  }
  return CONTACT_SAFETY_LEVELS;
}

export function getSafetyMeta(key, settings) {
  const levels = getSafetyLevels(settings);
  return (
    levels.find((l) => l.key === key) ||
    levels.find((l) => l.key === DEFAULT_SAFETY_KEY) ||
    CONTACT_SAFETY_LEVELS[3]
  );
}

// Sort weight so the directory can order "safest first" / "riskiest first"
// consistently regardless of custom labels.
const SAFETY_RANK = { safe: 0, caution: 1, unsafe: 2, unknown: 3 };
export function safetyRank(key) {
  return SAFETY_RANK[key] ?? 99;
}

// ── Awareness: do they know we're a system? ──────────────────────────────
export const AWARENESS_OPTIONS = [
  { key: "unsure",  label: "Unsure" },
  { key: "no",      label: "Doesn't know" },
  { key: "partial", label: "Knows partially" },
  { key: "yes",     label: "Knows" },
];

export const DEFAULT_AWARENESS_KEY = "unsure";

export function getAwarenessMeta(key) {
  return AWARENESS_OPTIONS.find((o) => o.key === key) || AWARENESS_OPTIONS[0];
}

// ── Contact methods (phone / email / socials / address) ──────────────────
// Each method is { type, label?, value }. `href` turns a method into a
// tappable action where the platform supports it (call / email / text);
// social handles and addresses are display-only (href null).
export const CONTACT_METHOD_TYPES = [
  { type: "phone",     label: "Phone",     scheme: "tel" },
  { type: "sms",       label: "Text",      scheme: "sms" },
  { type: "email",     label: "Email",     scheme: "mailto" },
  { type: "signal",    label: "Signal",    scheme: null },
  { type: "discord",   label: "Discord",   scheme: null },
  { type: "instagram", label: "Instagram", scheme: null },
  { type: "address",   label: "Address",   scheme: null },
  { type: "other",     label: "Other",     scheme: null },
];

export function getContactMethodMeta(type) {
  return CONTACT_METHOD_TYPES.find((m) => m.type === type) || CONTACT_METHOD_TYPES[CONTACT_METHOD_TYPES.length - 1];
}

// Build a tappable href for a contact method, or null if it isn't actionable.
// Phone/sms strip spaces and punctuation Android's dialer dislikes.
export function contactMethodHref(method) {
  if (!method || !method.value) return null;
  const meta = getContactMethodMeta(method.type);
  if (!meta.scheme) return null;
  const v = String(method.value).trim();
  if (!v) return null;
  if (meta.scheme === "tel" || meta.scheme === "sms") {
    const tel = v.replace(/[^\d+]/g, "");
    return tel ? `${meta.scheme}:${tel}` : null;
  }
  if (meta.scheme === "mailto") return `mailto:${v}`;
  return null;
}

// ── Contact relationship types ───────────────────────────────────────────
// A SEPARATE catalogue from the internal alter RelationshipType set — the
// alter dynamics ("Split from", "Protected by", "Created by"…) don't make
// sense for outside people. These are suggestions for the free-entry picker
// AND a managed, editable list. Entity: localEntities.ContactRelationshipType
// { label, color, order, is_default, is_archived }. The relationship row
// stores the LABEL string, so renaming/deleting a type never rewrites history.
export const DEFAULT_CONTACT_RELATIONSHIP_TYPES = [
  { label: "Friend", color: "#3b82f6" },
  { label: "Close friend", color: "#8b5cf6" },
  { label: "Best friend", color: "#a855f7" },
  { label: "Partner", color: "#ec4899" },
  { label: "Family", color: "#f59e0b" },
  { label: "Parent", color: "#f97316" },
  { label: "Sibling", color: "#eab308" },
  { label: "Relative", color: "#f59e0b" },
  { label: "Therapist", color: "#10b981" },
  { label: "Doctor", color: "#10b981" },
  { label: "Support worker", color: "#06b6d4" },
  { label: "Coworker", color: "#6366f1" },
  { label: "Boss", color: "#6366f1" },
  { label: "Classmate", color: "#3b82f6" },
  { label: "Teacher", color: "#6366f1" },
  { label: "Mentor", color: "#14b8a6" },
  { label: "Neighbor", color: "#64748b" },
  { label: "Acquaintance", color: "#9ca3af" },
  { label: "Online friend", color: "#0ea5e9" },
  { label: "Ex", color: "#ef4444" },
];

// Hook-free loader: returns the active contact relationship types, seeding the
// defaults on first call. Always re-lists after seeding so callers get REAL
// rows (with ids) — never synthesized id:null placeholders — so the same
// ["contactRelationshipTypes"] cache is safe for both the picker (by label)
// and the manager (by id).
export async function fetchActiveContactRelationshipTypes(entities) {
  let all = await entities.ContactRelationshipType.list();
  if (all.length === 0) {
    await Promise.all(
      DEFAULT_CONTACT_RELATIONSHIP_TYPES.map((t, i) =>
        entities.ContactRelationshipType.create({ ...t, order: i, is_default: true })
      )
    );
    all = await entities.ContactRelationshipType.list();
  }
  return all.filter((t) => !t.is_archived).sort((a, b) => (a.order || 0) - (b.order || 0));
}

// ── Misc helpers ─────────────────────────────────────────────────────────
export function contactDisplayName(c) {
  if (!c) return "";
  return (c.nickname && c.nickname.trim()) || (c.name && c.name.trim()) || "Unnamed";
}

// Emergency-support contacts, sorted by their explicit priority then name —
// the order used by the "who can I ask for help?" surfaces.
export function emergencySupportContacts(contacts = []) {
  return contacts
    .filter((c) => c && c.is_emergency_support && !c.is_archived)
    .sort((a, b) => {
      const pa = Number.isFinite(a.support_priority) ? a.support_priority : 999;
      const pb = Number.isFinite(b.support_priority) ? b.support_priority : 999;
      if (pa !== pb) return pa - pb;
      return contactDisplayName(a).localeCompare(contactDisplayName(b));
    });
}
