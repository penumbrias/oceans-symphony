// Shared constants for deep-linking from the persistent "active symptoms"
// notification into the on-dashboard severity/end menu (CurrentSymptoms).
// usePersistentNotifications writes the pending sessionId + fires the event on
// a notification tap; CurrentSymptoms listens and opens that symptom's menu.

export const PENDING_SYMPTOM_MENU_KEY = "symphony_pending_symptom_menu";
export const OPEN_SYMPTOM_MENU_EVENT = "symphony:open-symptom-menu";
