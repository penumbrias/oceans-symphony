// Where a system's setup stands (v0.369.0).
//
// Setup progress lives on the system's own SystemSettings row, in the
// `onboarding` field, so it rides encryption, the native private-file
// copy, backups, restore and device sync like every other record. The old
// flags lived only in browser storage, which phone cleaners wipe and a
// restore onto a new phone doesn't carry.
//
//   onboarding: {
//     version: 1,
//     started_at, notice_seen_at, words_at, first_entry_at, completed_at,  // ISO
//     packs: "express" | "custom" | "none",                  // tracking choice
//     restarted_at,                                          // last "Start over"
//   }
//
// Rules:
//  - Write it ONLY through recordOnboarding() here. Never add another
//    localStorage onboarding flag.
//  - The older browser-storage flags are still READ (so nobody who set up
//    before this is asked again) and still WRITTEN alongside (so going back
//    to an older version doesn't re-open the Guide). They are never deleted.
//  - Whether a first-run Guide opens is decided by the data first
//    (setupGate.systemHasPersonalData), then by this record.

import { localEntities } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { psGetItem, psSetItem } from "@/lib/perSystemStorage";
import { mergeOnboarding } from "@/lib/setupModel";

export const ONBOARDING_FIELD = "onboarding";
export const ONBOARDING_VERSION = 1;
// The older per-system "Guide finished" flag (Dashboard.jsx owned it).
export const ONBOARDING_DONE_KEY = "symphony_onboarding_done_v1";
const LEGACY_TERMS_KEY = "terms_setup_done";
const LEGACY_TOUR_KEY = "tour_seen";


function readLegacy() {
  const out = { guide: false, terms: false };
  try { out.guide = !!psGetItem(ONBOARDING_DONE_KEY); } catch { /* storage off */ }
  try { out.terms = !!localStorage.getItem(LEGACY_TERMS_KEY); } catch { /* storage off */ }
  return out;
}

// The record as stored, or {} when there isn't one.
export function storedOnboarding(settings) {
  const v = settings?.[ONBOARDING_FIELD];
  return v && typeof v === "object" ? v : {};
}

// What setup has recorded, with the older browser flags folded in.
export function readOnboarding(settings) {
  const stored = storedOnboarding(settings);
  const legacy = readLegacy();
  return {
    ...stored,
    wordsChosen: !!stored.words_at || legacy.terms,
    done: !!stored.completed_at || legacy.guide || legacy.terms,
  };
}

export function isOnboardingDone(settings) {
  return readOnboarding(settings).done;
}

async function primarySettingsRow() {
  const list = await localEntities.SystemSettings.list();
  return pickPrimarySystemSettings(list);
}

// Merge `patch` into the system's onboarding record, on a fresh read.
// Start times keep their first value (setupModel.ONBOARDING_SET_ONCE). Never throws: setup
// progress must not block the step the person just took.
export async function recordOnboarding(patch = {}) {
  try {
    const row = await primarySettingsRow();
    if (!row?.id) return null;
    const next = mergeOnboarding(storedOnboarding(row), patch, ONBOARDING_VERSION);
    await localEntities.SystemSettings.update(row.id, { [ONBOARDING_FIELD]: next });
    return next;
  } catch (e) {
    console.warn("[onboarding] couldn't record setup progress", e);
    return null;
  }
}

// Setup finished (or skipped, or found unnecessary because the system
// already holds data). Also writes the older flags for older versions.
export async function markOnboardingDone(extra = {}) {
  try {
    localStorage.setItem(LEGACY_TOUR_KEY, "1");
    psSetItem(ONBOARDING_DONE_KEY, "1");
  } catch { /* storage off */ }
  const now = new Date().toISOString();
  return recordOnboarding({ started_at: now, completed_at: now, ...extra });
}

// The not-medical notice was read and "I understand" pressed. Also keeps
// the older device flag DisclaimerModal and the Guide read.
export async function markNoticeSeen() {
  const now = new Date().toISOString();
  try { if (!localStorage.getItem("disclaimer_acknowledged_v1")) localStorage.setItem("disclaimer_acknowledged_v1", now); } catch { /* storage off */ }
  return recordOnboarding({ notice_seen_at: now });
}

export const markWordsChosen = () => recordOnboarding({ words_at: new Date().toISOString() });
export const markFirstEntry = () => recordOnboarding({ first_entry_at: new Date().toISOString() });
export const markPacks = (packs) => recordOnboarding({ packs });
