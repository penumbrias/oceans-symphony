// The goal page header's "Edit the page note" opens the Note widget on the
// page's board (src/v2/goalPageWidgets.jsx).
export const GOAL_NOTE_EDIT_EVENT = "os-goal-note-edit";
export const openGoalNoteEditor = (pageId) =>
  window.dispatchEvent(new CustomEvent(GOAL_NOTE_EDIT_EVENT, { detail: { pageId } }));
