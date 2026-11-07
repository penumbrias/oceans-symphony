// Has this system been used? (v0.368.1)
//
// First run is decided by the data, never by a browser-storage flag alone.
// The "setup done" flags live in localStorage, which Android cleaners wipe
// while leaving IndexedDB intact; a restore onto a new phone doesn't carry
// them either. Before this, either case sent an established system back
// through the whole first-run Guide over all their data.
//
// The answer is "yes" as soon as the active system's database holds
// anything a PERSON wrote. Catalogue rows the app seeds by itself (starter
// symptoms, grounding techniques, activity categories, routines, the
// settings row) never count, so opening Quick Check-In once doesn't make a
// brand-new system look "set up". Trashed rows count: the system was used.

import { getFullDbDump, isDbInitialized } from "@/lib/localDb";

// Records only a person creates. Keep this list to things the app never
// seeds on its own.
export const PERSONAL_DATA_ENTITIES = [
  "Alter", "FrontingSession", "EmotionCheckIn", "SymptomCheckIn", "SymptomSession",
  "SystemCheckIn", "JournalEntry", "SupportJournalEntry", "DiaryCard", "StatusNote",
  "AlterNote", "AlterMessage", "Bulletin", "BulletinComment", "Poll", "Group",
  "Activity", "PlannerEvent", "Sleep", "Task", "Location", "SystemChangeEvent",
  "SystemChatMessage", "Contact", "Medication", "EmergencyInfo", "Goal", "Wish",
  "TherapyNote", "InnerWorldLocation",
];

// Unknown (database not open yet, or a read error) answers "yes": missing
// a first-run Guide is a nuisance, re-running it over real data is not.
export function systemHasPersonalData() {
  try {
    if (!isDbInitialized()) return true;
    const db = getFullDbDump();
    return PERSONAL_DATA_ENTITIES.some((name) => {
      const coll = db?.[name];
      return !!coll && typeof coll === "object" && Object.keys(coll).length > 0;
    });
  } catch {
    return true;
  }
}
