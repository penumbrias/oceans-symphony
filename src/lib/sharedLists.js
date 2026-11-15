// One way to load each shared list (v0.371.9).
//
// React Query keeps ONE cache per query key. Screens used to share a key
// (["activities"], ["bulletins"]…) but each fetch it its own way — some
// sorted, some not, some capped at 100–500 rows — so whichever screen
// loaded first decided what every other screen saw until the next refetch.
// The timeline could show only the newest 100 bulletins because the
// Bulletins page had been opened first, and a list could change order
// depending on where you'd been.
//
// Every reader of these keys spreads `sharedList(key)` into its useQuery:
// the whole list (never capped — this is a lifelong app), newest first
// unless the entity has an order of its own. A screen that wants fewer or
// a different order slices / sorts the result itself.
//
//   const { data = [] } = useQuery({ ...sharedList("activities") });

import { base44 } from "@/api/base44Client";

// key → [entity, sort]
export const SHARED_LISTS = {
  activities: ["Activity", "-timestamp"],
  bulletins: ["Bulletin", "-created_date"],
  contactEncounters: ["ContactEncounter", "-start_time"],
  customFields: ["CustomField", "order"],
  dailyProgress: ["DailyProgress", "-date"],
  dailyTaskTemplates: ["DailyTaskTemplate", "sort_order"],
  diaryCards: ["DiaryCard", "-created_date"],
  emotionCheckIns: ["EmotionCheckIn", "-timestamp"],
  frontHistory: ["FrontingSession", "-start_time"],
  frontingSessions: ["FrontingSession", "-start_time"],
  imageAssets: ["ImageAsset", "-created_date"],
  journalEntries: ["JournalEntry", "-created_date"],
  journals: ["JournalEntry", "-created_date"],
  locations: ["Location", "-timestamp"],
  polls: ["Poll", "-created_date"],
  presences: ["Presence", "-timestamp"],
  reminderInstances: ["ReminderInstance", "-scheduled_for"],
  reminders: ["Reminder", "-created_date"],
  sleep: ["Sleep", "-bedtime"],
  statusNotes: ["StatusNote", "-timestamp"],
  supportJournalAll: ["SupportJournalEntry", "-created_date"],
  symptomCheckIns: ["SymptomCheckIn", "-timestamp"],
  systemChatMessages: ["SystemChatMessage", "-timestamp"],
  systemCheckIns: ["SystemCheckIn", "-created_date"],
  tasks: ["Task", "-created_date"],
};

export function sharedList(key) {
  const spec = SHARED_LISTS[key];
  if (!spec) throw new Error(`sharedList: unknown key ${key}`);
  const [entity, sort] = spec;
  return { queryKey: [key], queryFn: () => base44.entities[entity].list(sort) };
}
