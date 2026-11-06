// Emergency info — the pure parts (no storage hooks): the record picker,
// the card builder and the lock-screen copy. See emergencyInfo.js for the
// record and the privacy rules. Tests: scripts/test-emergency-card.mjs.

import { plainNoteText } from "@/lib/plainNote";

export const LOCK_COPY_KEY = "symphony_emergency_lock_copy_v1";

export const SHORT = ["preferred_name", "pronouns", "date_of_birth", "language", "blood_type", "address"];
export const AUTHORED = ["communication", "allergies", "conditions", "medical_notes", "other_info", "what_helps", "what_doesnt"];
export const FLAGS = ["show_medications", "show_contacts", "show_safety_plan", "lock_copy"];
// Pulled-in sections default to on.
const FLAG_DEFAULTS = { show_medications: true, show_contacts: true, show_safety_plan: true, lock_copy: false };

export const newest = (r) => String(r?.updated_date || r?.created_date || "");
// Only a field the newest row never had is filled from an older row; one
// the person emptied ("") stays empty.
const blank = (v) => v === undefined || v === null;

export function pickEmergencyInfo(rows = []) {
  const live = (rows || []).filter((r) => r && !r.trashed_at).sort((a, b) => newest(b).localeCompare(newest(a)));
  if (!live.length) return null;
  const out = { ...live[0] };
  for (const older of live.slice(1)) {
    for (const k of [...SHORT, ...AUTHORED]) if (blank(out[k]) && !blank(older[k])) out[k] = older[k];
  }
  return out;
}

export const flagOf = (info, key) => (info && typeof info[key] === "boolean" ? info[key] : FLAG_DEFAULTS[key]);

// ── The card ─────────────────────────────────────────────────────────

// Every section the card can show, in order. None is on the lock-screen
// copy until the person picks it.
export const CARD_SECTIONS = [
  { id: "communication", label: "How to talk with me" },
  { id: "about", label: "About me", hint: "Name, pronouns, date of birth, language" },
  { id: "allergies", label: "Allergies" },
  { id: "conditions", label: "Conditions" },
  { id: "medications", label: "Medications" },
  { id: "medical", label: "Other medical", hint: "Blood type and medical notes" },
  { id: "contacts", label: "Emergency contacts", hint: "Names and numbers" },
  { id: "helps", label: "What helps and what doesn't" },
  { id: "safety", label: "My safety plan", hint: "What I will do to stay safe" },
  { id: "address", label: "Address" },
  { id: "other", label: "Anything else" },
];

const txt = (v) => plainNoteText(String(v || "")).trim();

// The card as plain data: [{ id, label, lines: [string], contacts? }].
// Empty sections are left out. Pure — the unlock screen draws the same
// shape from the lock-screen copy.
// Emergency-support contacts (contacts.js order) as the card shows them:
// a name, how they're related, and one number to call.
export function cardContacts(contacts = [], { displayName = (c) => c?.name } = {}) {
  return (contacts || []).map((c) => {
    const methods = Array.isArray(c.contact_methods) ? c.contact_methods : [];
    const phone = methods.find((m) => m?.type === "phone" && m.value) || methods.find((m) => m?.type === "sms" && m.value);
    return { name: displayName(c), relation: c.relationship_label || null, phone: phone ? String(phone.value).trim() : null };
  });
}

export function buildEmergencyCard({ info = null, medications = [], contacts = [], safetyPlan = null } = {}) {
  const i = info || {};
  const out = [];
  const push = (id, lines, extra = {}) => {
    const kept = (lines || []).map((l) => String(l || "").trim()).filter(Boolean);
    if (kept.length || extra.contacts?.length) out.push({ id, label: CARD_SECTIONS.find((s) => s.id === id).label, lines: kept, ...extra });
  };
  push("communication", [txt(i.communication)]);
  push("about", [
    i.preferred_name && `Name: ${i.preferred_name}`,
    i.pronouns && `Pronouns: ${i.pronouns}`,
    i.date_of_birth && `Date of birth: ${i.date_of_birth}`,
    i.language && `Language: ${i.language}`,
  ]);
  push("allergies", [txt(i.allergies)]);
  push("conditions", [txt(i.conditions)]);
  if (flagOf(info, "show_medications")) {
    push("medications", (medications || [])
      .filter((m) => m && !m.is_archived && !m.trashed_at && m.share_in_emergency !== false)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      .map((m) => [m.name, m.dose, m.purpose ? `for ${m.purpose}` : null].filter(Boolean).join(" · ")));
  }
  push("medical", [i.blood_type && `Blood type: ${i.blood_type}`, txt(i.medical_notes)]);
  if (flagOf(info, "show_contacts")) {
    push("contacts", [], { contacts: (contacts || []).map((c) => ({ name: c.name, relation: c.relation || null, phone: c.phone || null })).filter((c) => c.name) });
  }
  push("helps", [txt(i.what_helps) && `Helps: ${txt(i.what_helps)}`, txt(i.what_doesnt) && `Please don't: ${txt(i.what_doesnt)}`]);
  if (flagOf(info, "show_safety_plan") && safetyPlan) {
    push("safety", [txt(safetyPlan.emergency_response)]);
  }
  push("address", [i.address]);
  push("other", [txt(i.other_info)]);
  return out;
}

// ── Lock-screen copy ─────────────────────────────────────────────────

export function readLockCopy() {
  try {
    const raw = localStorage.getItem(LOCK_COPY_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && Array.isArray(v.sections) && v.sections.length ? v : null;
  } catch { return null; }
}

export function clearLockCopy() {
  try { localStorage.removeItem(LOCK_COPY_KEY); } catch { /* nothing to remove */ }
}

// Write only the picked sections; nothing picked or switched off → no copy.
export function writeLockCopy(info, card) {
  const picked = new Set(flagOf(info, "lock_copy") && Array.isArray(info?.lock_fields) ? info.lock_fields : []);
  const sections = (card || []).filter((s) => picked.has(s.id));
  if (!sections.length) { clearLockCopy(); return null; }
  const copy = { v: 1, written_at: new Date().toISOString(), sections };
  try { localStorage.setItem(LOCK_COPY_KEY, JSON.stringify(copy)); } catch { /* storage full: the in-app card still works */ }
  return copy;
}
