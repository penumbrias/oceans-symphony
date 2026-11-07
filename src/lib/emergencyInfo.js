// Emergency info (v0.368.0) — THE write path for what the person wants a
// helper to know in an emergency (when they can't speak, are hurt, or
// someone needs to help them), and the builder for the emergency card.
//
// EmergencyInfo — one record the person fills in themselves:
//   preferred_name, pronouns, date_of_birth, language, blood_type, address
//   (short text); communication, allergies, conditions, medical_notes,
//   other_info, what_helps, what_doesnt (authored text, the app's grammar,
//   no whispers); show_medications / show_contacts / show_safety_plan
//   (what the card pulls in from elsewhere); lock_copy (bool) and
//   lock_fields [card section ids] (see below).
//
// One row is expected, but two can meet after a sync or a merge import:
// pickEmergencyInfo reads the newest and fills its empty fields from the
// older ones, so nothing anyone typed is ever hidden. Writes go to the
// newest row.
//
// The card is built from this record plus the medications marked "show on
// my emergency card" (medications.js) and the contacts marked emergency
// support (contacts.js), plus the safety plan's "what I will do to stay
// safe" (Learn → safety plan exercise).
//
// LOCK-SCREEN COPY (owner decision, 2026-11-06): off by default. When the
// person turns it on, ONLY the sections they pick are written, as plain
// text, to localStorage under LOCK_COPY_KEY, so the unlock screen can show
// them without the password. Everything else stays in the encrypted
// database only. Turning it off (or picking nothing) removes the copy. The
// copy is derived — it is NOT in BACKUP_LS_KEYS, and "Delete all local
// data" removes it with every other symphony_ key.

import { useQuery } from "@tanstack/react-query";
import { localEntities } from "@/api/base44Client";
import { pickEmergencyInfo, newest, SHORT, AUTHORED, FLAGS, CARD_SECTIONS } from "@/lib/emergencyCard";

export * from "@/lib/emergencyCard";

export const EMERGENCY_INFO_KEY = ["emergencyInfo"];
export const EMERGENCY_PATH = "/emergency";

export function useEmergencyInfo({ enabled = true } = {}) {
  const { data = [], isFetched } = useQuery({
    queryKey: EMERGENCY_INFO_KEY,
    queryFn: () => localEntities.EmergencyInfo.list().catch(() => []),
    enabled,
  });
  return { info: pickEmergencyInfo(data), isFetched };
}

function clean(patch = {}) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (SHORT.includes(k)) out[k] = String(v || "").trim().slice(0, 300);
    else if (AUTHORED.includes(k)) out[k] = String(v || "");
    else if (FLAGS.includes(k)) out[k] = !!v;
    else if (k === "lock_fields") out[k] = Array.isArray(v) ? [...new Set(v.filter((x) => CARD_SECTIONS.some((s) => s.id === x)))] : [];
  }
  return out;
}

// Save fields onto the newest row (fresh read), or make the first one.
export async function saveEmergencyInfo(patch) {
  const rows = await localEntities.EmergencyInfo.list().catch(() => []);
  const row = (rows || []).filter((r) => !r.trashed_at).sort((a, b) => newest(b).localeCompare(newest(a)))[0];
  const data = clean(patch);
  return row ? localEntities.EmergencyInfo.update(row.id, data) : localEntities.EmergencyInfo.create(data);
}

