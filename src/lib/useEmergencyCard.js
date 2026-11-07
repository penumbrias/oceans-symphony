// The emergency card's data, and the lock-screen copy kept in step with it
// (v0.368.0). Reads the same queries the Contacts, Medications and Safety
// Plan pages use, so the card always matches them.

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useMedications } from "@/lib/medications";
import { emergencySupportContacts, contactDisplayName } from "@/lib/contacts";
import { useEmergencyInfo, buildEmergencyCard, cardContacts, writeLockCopy, clearLockCopy, flagOf } from "@/lib/emergencyInfo";
import { isPreviewActive } from "@/lib/previewMode";

export const SAFETY_PLAN_EXERCISE = "m4_t3_safety_plan";

// The newest saved safety plan (same rule as SafetyPlan.jsx).
export function latestSafetyPlan(entries = []) {
  const e = [...(entries || [])]
    .filter((x) => x && x.exercise_id === SAFETY_PLAN_EXERCISE)
    .sort((a, b) => String(b.updated_date || b.created_date || "").localeCompare(String(a.updated_date || a.created_date || "")))[0];
  return e?.responses || null;
}

export function useEmergencyCard({ enabled = true } = {}) {
  const { info, isFetched } = useEmergencyInfo({ enabled });
  const { medications, isFetched: medsFetched } = useMedications({ enabled });
  const { data: contacts = [], isFetched: contactsFetched } = useQuery({
    queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list(), enabled,
  });
  const { data: entries = [], isFetched: entriesFetched } = useQuery({
    queryKey: ["supportJournalEntries"], queryFn: () => base44.entities.SupportJournalEntry.list(), enabled,
  });
  const sections = useMemo(() => buildEmergencyCard({
    info,
    medications,
    contacts: cardContacts(emergencySupportContacts(contacts), { displayName: contactDisplayName }),
    safetyPlan: latestSafetyPlan(entries),
  }), [info, medications, contacts, entries]);
  return { info, sections, isFetched: isFetched && medsFetched && contactsFetched && entriesFetched };
}

// Mounted once in App (after unlock): rewrites the lock-screen copy when
// anything on the card changes, and removes it when it's switched off.
// Preview Mode's example data never becomes a copy.
export function useEmergencyLockCopySync() {
  const { info, sections, isFetched } = useEmergencyCard();
  const last = useRef(null);
  useEffect(() => {
    if (!isFetched || isPreviewActive()) return;
    const sig = JSON.stringify([flagOf(info, "lock_copy"), info?.lock_fields || [], sections]);
    if (sig === last.current) return;
    last.current = sig;
    if (!flagOf(info, "lock_copy")) clearLockCopy();
    else writeLockCopy(info, sections);
  }, [info, sections, isFetched]);
}
