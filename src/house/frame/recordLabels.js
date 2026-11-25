// What a kind of record is called, in the person's words (the History tab
// of the frame's dock; Phase 2 check finding 5). Recent changes rows
// (HistoryEvent) carry the raw entity name ("FrontingSession"); a stranger
// should read "Fronting record", and a person who says "part" and
// "switching" should read their own words. Pure, so
// scripts/test-house-frame.mjs can check it.

const LABELS = {
  Alter: (t) => t.Alter,
  AlterNote: (t) => `${t.Alter} note`,
  AlterMessage: (t) => `${t.Alter} message`,
  AlterRelationship: () => "Relationship",
  FrontingSession: (t) => `${t.Fronting} record`,
  EmotionCheckIn: () => "Feelings check-in",
  SymptomCheckIn: () => "Symptom check-in",
  SymptomSession: () => "Symptom episode",
  SymptomDefinition: () => "Symptom",
  JournalEntry: () => "Journal entry",
  StatusNote: () => "Status",
  Location: () => "Location",
  Activity: () => "Activity or plan",
  ActivityCategory: () => "Activity category",
  ActivityGoal: () => "Goal",
  Task: () => "To-do",
  DailyTaskTemplate: () => "Routine",
  Group: () => "Group",
  SystemChangeEvent: (t) => `${t.System} change`,
  SystemCheckIn: (t) => `${t.System} meeting`,
  SystemSettings: () => "Settings",
  ProfileBoard: () => "Profile layout",
  Bulletin: () => "Post",
  BulletinComment: () => "Comment",
  ChatMessage: () => "Chat message",
  Sleep: () => "Sleep",
  Reminder: () => "Reminder",
  Contact: () => "Contact",
  InnerWorldLocation: () => "Inner world place",
  DiaryCard: () => "Diary card",
  Poll: () => "Poll",
  CustomEmotion: () => "Custom emotion",
  CustomField: () => "Custom field",
  QuickAction: () => "Shortcut",
};

const DEFAULT_TERMS = { Alter: "Alter", System: "System", Fronting: "Fronting" };

/** "FrontingSession" → "Fronting record" (in the person's words). */
export function recordKindLabel(entity, terms = {}) {
  const t = { ...DEFAULT_TERMS, ...terms };
  const fn = LABELS[entity];
  if (fn) return fn(t);
  // An entity this map doesn't know: split the name into plain words.
  const words = String(entity || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Record";
}
