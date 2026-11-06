// Medications (v0.367.0) — THE write path and the maths for the
// Medications page, its widgets and the refill reminders. Nothing else
// writes these records.
//
// Medication — one medicine the person takes:
//   name, dose (free words: "50 mg", "2 puffs"), purpose (what it's for),
//   as_needed (no fixed times), times ["08:00", "20:00"] (a dose at each),
//   start_date / end_date ("YYYY-MM-DD", a course with an end is "time
//   limited"), units_per_dose (how many tablets/ml one dose uses, for the
//   supply maths), refill_quantity (how many came at the last refill),
//   last_refill_date ("YYYY-MM-DD"), count_by ("schedule" | "doses": work
//   out what's left from the times, or from the doses marked taken),
//   refill_reminder (bool), refill_remind_days (remind this many days
//   before it runs out), refills [{ timestamp, date, quantity, carried }]
//   (a log: never rewritten, merged as a union by sync), prescriber,
//   pharmacy, notes (authored text, the app's grammar), share_in_emergency
//   (bool, read by the emergency card), is_archived.
//
// MedicationDose — one dose marked taken or skipped:
//   medication_id, timestamp (when it was marked), slot ("YYYY-MM-DDTHH:MM"
//   for a scheduled dose, null for an as-needed one), status ("taken" |
//   "skipped"), amount (units), fronting_alter_ids (who was there, through
//   the same "entries belong to" rule as check-ins).
//
// Privacy: everything stays in the local (optionally encrypted) database.
// Refill notifications never name the medicine (they can show on a lock
// screen). Search indexes the name only.
//
// Deletes go to the trash, a medication together with its dose log.

import { useQuery } from "@tanstack/react-query";
import { localEntities } from "@/api/base44Client";
import { withTrashBatch } from "@/lib/localDb";
import { defaultAttributionIds } from "@/lib/checkinEntry";
import { dayKey, isDayKey, isTime, unitsPerDose } from "@/lib/medicationMath";

export * from "@/lib/medicationMath";

export const MEDICATIONS_KEY = ["medications"];
export const MEDICATION_DOSES_KEY = ["medicationDoses"];
export const MEDICATIONS_PATH = "/medications";


// ── Reading ──────────────────────────────────────────────────────────

export function useMedications({ enabled = true } = {}) {
  const { data = [], isFetched } = useQuery({
    queryKey: MEDICATIONS_KEY,
    queryFn: () => localEntities.Medication.list().catch(() => []),
    enabled,
  });
  return { medications: data, isFetched };
}

export function useMedicationDoses({ enabled = true } = {}) {
  const { data = [], isFetched } = useQuery({
    queryKey: MEDICATION_DOSES_KEY,
    queryFn: () => localEntities.MedicationDose.list().catch(() => []),
    enabled,
  });
  return { doses: data, isFetched };
}

export const refreshMedications = (qc) => {
  qc.invalidateQueries({ queryKey: MEDICATIONS_KEY });
  qc.invalidateQueries({ queryKey: MEDICATION_DOSES_KEY });
};

// ── Writing ──────────────────────────────────────────────────────────

const cleanTimes = (times) => [...new Set((times || []).filter(isTime))].sort();

// Only these fields are written from the sheet; anything else on the
// record is kept as it is.
const FIELDS = {
  name: (v) => String(v || "").trim().slice(0, 120),
  dose: (v) => String(v || "").trim().slice(0, 80) || null,
  purpose: (v) => String(v || "").trim().slice(0, 160) || null,
  as_needed: (v) => !!v,
  times: cleanTimes,
  start_date: (v) => (isDayKey(v) ? v : null),
  end_date: (v) => (isDayKey(v) ? v : null),
  units_per_dose: (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; },
  refill_quantity: (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; },
  last_refill_date: (v) => (isDayKey(v) ? v : null),
  count_by: (v) => (v === "doses" || v === "schedule" ? v : null),
  refill_reminder: (v) => !!v,
  refill_remind_days: (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 && n <= 60 ? n : null; },
  prescriber: (v) => String(v || "").trim().slice(0, 120) || null,
  pharmacy: (v) => String(v || "").trim().slice(0, 160) || null,
  notes: (v) => String(v || ""),
  share_in_emergency: (v) => !!v,
  is_archived: (v) => !!v,
};

function cleanPatch(patch = {}) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) if (FIELDS[k]) out[k] = FIELDS[k](v);
  return out;
}

export async function createMedication(draft = {}) {
  const name = FIELDS.name(draft.name);
  if (!name) throw new Error("Give the medication a name.");
  return localEntities.Medication.create({
    as_needed: false, times: [], refill_reminder: false, share_in_emergency: true, is_archived: false, refills: [],
    ...cleanPatch(draft),
    name,
  });
}

export async function updateMedication(id, patch) {
  const clean = cleanPatch(patch);
  if ("name" in clean && !clean.name) throw new Error("A medication needs a name.");
  return localEntities.Medication.update(id, clean);
}

// Refilled: a new supply from today. `carried` is what was still left
// (added on so the count stays honest). The refill is appended to the log.
export async function recordRefill(med, { quantity, carried = 0, date = dayKey() } = {}) {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) throw new Error("How many did you get?");
  const c = Number(carried) > 0 ? Number(carried) : 0;
  const fresh = (await localEntities.Medication.get(med.id).catch(() => null)) || med;
  const refills = Array.isArray(fresh.refills) ? fresh.refills : [];
  return localEntities.Medication.update(med.id, {
    last_refill_date: date,
    refill_quantity: q + c,
    refills: [...refills, { timestamp: new Date().toISOString(), date, quantity: q, carried: c }],
  });
}

// Mark a scheduled dose (slot) or an as-needed dose (no slot). A slot that
// already has a mark is changed, never doubled.
export async function markDose(med, { slot = null, status = "taken", amount = null, alterIds = null } = {}) {
  if (!["taken", "skipped"].includes(status)) throw new Error("Unknown dose status.");
  const who = Array.isArray(alterIds) ? alterIds : await defaultAttributionIds();
  if (slot) {
    const existing = (await localEntities.MedicationDose.filter({ medication_id: med.id, slot }).catch(() => []))
      .find((d) => !d.trashed_at);
    if (existing) return localEntities.MedicationDose.update(existing.id, { status, timestamp: new Date().toISOString() });
  }
  return localEntities.MedicationDose.create({
    medication_id: med.id,
    slot,
    status,
    timestamp: new Date().toISOString(),
    amount: Number(amount) > 0 ? Number(amount) : unitsPerDose(med),
    fronting_alter_ids: who || [],
  });
}

// Undo a mark made by mistake (it goes to the trash, so it can come back).
export const unmarkDose = (dose) => localEntities.MedicationDose.delete(dose.id);

export async function deleteMedication(med) {
  await withTrashBatch(async () => {
    const doses = await localEntities.MedicationDose.filter({ medication_id: med.id }).catch(() => []);
    for (const d of doses) if (!d.trashed_at) await localEntities.MedicationDose.delete(d.id);
    await localEntities.Medication.delete(med.id);
  });
}

// The Medications page opens the medication's sheet for ?open=<id>.
export const medicationPath = (id) => `${MEDICATIONS_PATH}?tab=list&open=${encodeURIComponent(id)}`;
