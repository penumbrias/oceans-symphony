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
