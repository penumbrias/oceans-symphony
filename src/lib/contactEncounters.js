// "I'm with X" — ContactEncounter records persist time spent with a contact,
// so it can show on the dashboard, be ended later, and (Phase 4b) feed
// analytics correlating who you were with against emotions/symptoms.
//
// Entity: localEntities.ContactEncounter
//   { contact_id, start_time (ISO), end_time (ISO|null), is_active (bool),
//     kind: "session" | "visit", note, created_date }
//
//   - "session": started now, is_active:true, end_time:null until ended.
//   - "visit":   a point log ("I saw them"), created already-ended
//                (start_time === end_time, is_active:false).
//
// Persisted (not localStorage) so encounters survive, back up, and stay
// queryable for analytics. Query key everywhere: ["contactEncounters"].

import { base44 } from "@/api/base44Client";

export async function getActiveEncounters() {
  const all = await base44.entities.ContactEncounter.filter({ is_active: true });
  return Array.isArray(all) ? all : [];
}

// Start an active "I'm with them" session. Guards against double-starting: if
// an active session for this contact already exists, returns it untouched.
export async function startEncounter(contactId, { note } = {}) {
  const active = await getActiveEncounters();
  const existing = active.find((e) => e.contact_id === contactId);
  if (existing) return existing;
  const now = new Date().toISOString();
  return base44.entities.ContactEncounter.create({
    contact_id: contactId,
    start_time: now,
    end_time: null,
    is_active: true,
    kind: "session",
    note: note || "",
    created_date: now,
  });
}

export async function endEncounter(id, endTime) {
  const end = endTime || new Date().toISOString();
  return base44.entities.ContactEncounter.update(id, { end_time: end, is_active: false });
}

export async function endEncounterForContact(contactId, endTime) {
  const active = await getActiveEncounters();
  const enc = active.find((e) => e.contact_id === contactId);
  if (enc) return endEncounter(enc.id, endTime);
  return null;
}

// A point log — "I saw / was with them" with no running timer.
export async function logVisit(contactId, { note, at } = {}) {
  const now = at || new Date().toISOString();
  return base44.entities.ContactEncounter.create({
    contact_id: contactId,
    start_time: now,
    end_time: now,
    is_active: false,
    kind: "visit",
    note: note || "",
    created_date: now,
  });
}

// Most recent ENDED encounter for a contact (for a "last seen" line).
export function lastSeenEncounter(encounters, contactId) {
  return (encounters || [])
    .filter((e) => e.contact_id === contactId && !e.is_active && e.end_time)
    .sort((a, b) => (b.end_time || "").localeCompare(a.end_time || ""))[0] || null;
}
