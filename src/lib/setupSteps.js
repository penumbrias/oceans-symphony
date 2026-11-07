// What's set up so far (v0.369.0): the live hook behind the "What we've set
// up so far" card and Settings → Setup. The step list itself is pure and
// lives in setupModel.js; add a step there and both surfaces show it.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { readOnboarding } from "@/lib/onboardingState";
import { bundlesChosen } from "@/utils/symptomDefaults";
import { getAutoBackupMode, getAutoBackupLastAt, BACKUP_MODES } from "@/lib/autoBackup";
import { evaluateSetup, SETUP_STEPS, SETUP_GROUPS } from "@/lib/setupModel";
import { latestSafetyPlan } from "@/lib/useEmergencyCard";
import { emergencySupportContacts } from "@/lib/contacts";

export { evaluateSetup, SETUP_STEPS, SETUP_GROUPS };

// The steps for the active system, live. Uses the same query keys as the
// pages that write these records, so the card updates as things are saved.
export function useSetupSteps({ enabled = true } = {}) {
  const t = useTerms();
  const settingsQ = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list(), enabled });
  const altersQ = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled });
  const checkInsQ = useQuery({ queryKey: ["emotionCheckIns"], queryFn: () => base44.entities.EmotionCheckIn.list(), enabled });
  const symptomsQ = useQuery({ queryKey: ["symptoms"], queryFn: () => base44.entities.Symptom.list(), enabled });
  const contactsQ = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list(), enabled });
  const entriesQ = useQuery({ queryKey: ["supportJournalEntries"], queryFn: () => base44.entities.SupportJournalEntry.list(), enabled });
  const categoriesQ = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list(), enabled });
  const all = [settingsQ, altersQ, checkInsQ, symptomsQ, contactsQ, entriesQ, categoriesQ];
  const isFetched = all.every((x) => x.isFetched);
  const steps = useMemo(() => {
    const settings = pickPrimarySystemSettings(settingsQ.data || []);
    let backupMode = BACKUP_MODES.OFF, backupLastAt = null, chose = false;
    try { backupMode = getAutoBackupMode(); backupLastAt = getAutoBackupLastAt(); chose = bundlesChosen(); } catch { /* storage off */ }
    return evaluateSetup({
      settings,
      onboarding: readOnboarding(settings),
      alters: altersQ.data,
      checkIns: checkInsQ.data,
      symptoms: symptomsQ.data,
      activityCategories: categoriesQ.data,
      supportContacts: emergencySupportContacts(contactsQ.data || []),
      safetyPlan: latestSafetyPlan(entriesQ.data || []),
      backupMode, backupLastAt, bundlesChosen: chose,
    }, t);
  }, [settingsQ.data, altersQ.data, checkInsQ.data, symptomsQ.data, contactsQ.data, entriesQ.data, categoriesQ.data, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneCount = steps.filter((s) => s.done).length;
  return {
    steps,
    isFetched,
    doneCount,
    total: steps.length,
    allDone: doneCount === steps.length,
    next: steps.find((s) => !s.done) || null,
  };
}
