// English source strings for the rebuilt UI.
//
// This is the reference locale: every key lives here first, and any other
// locale falls back to these values for keys it hasn't translated yet.
//
// Conventions for translators:
//   • {name} is a runtime value (a count, a time) — keep it as-is.
//   • {{Alter}} / {{System}} / {{fronters}} etc. are the USER'S OWN words
//     for their system, filled in after translation. Keep them, and keep
//     the capitalisation ({{Alter}} renders capitalised, {{alter}} lower).
//   • Keys are grouped by area; please keep the grouping.

export default {
  // ── Bottom bar / navigation ──
  "nav.quickActions": "Quick actions",
  "nav.showQuickActions": "Show quick actions",
  "nav.hideQuickActions": "Hide quick actions",
  "nav.appNav": "App navigation",
  "nav.customize": "Customize",
  "nav.dockDragHint": "Hold and drag to move",
  "nav.everythingElse": "Everything else",

  // ── Top bar ──
  "top.search": "Search",
  "top.notifications": "Notifications",
  "top.displayOptions": "Display options",
  "top.apps": "Apps",
  "top.noFronter": "no {{fronter}} set",

  // ── Display options ──
  "options.title": "Display options",
  "options.subtitle": "Changes apply instantly, across the whole app, and save.",
  "options.editHome": "Edit the home screen",
  "options.appsIcon": "Apps button icon",
  "options.appsIconPick": "Choose an image",
  "options.appsIconReset": "Use the default",
  "options.showHide": "Show / hide",
  "options.preview": "Preview",
  "options.previewRow": "A row of something",
  "options.previewSecondary": "Cancel",
  "options.previewPill": "Tag",
  "options.peek": "Peek",
  "options.fullPanel": "Full panel",
  "options.peekHint": "Keep adjusting — the app is visible above.",
  "options.appWide": "App-wide",
  "options.bars": "Whole app",
  "options.textSize": "Text size",
  "options.textNormal": "normal",
  "options.language": "Language",
  "options.topBar": "Top bar",
  "options.quickActionRow": "Quick-action row",
  "options.sectionTabs": "Bottom buttons",
  "options.sideRail": "Side rail (wide screens)",
  "options.waveHeader": "Wave animation in the header",
  "options.everythingElse": "Everything else",
  "options.everythingElseHint": "Themes, colours, fonts, sizes and navigation.",
  "options.recoveryHint": "With the top bar hidden, a small button stays in the corner so you can always get back here.",

  "search.subtitle": "Searches everything — {{alters}}, journals, plans, notes and more.",

  // ── Quick note ──
  "note.title": "Quick note",
  "note.subtitle": "Save a status note here, or start a longer entry.",
  "note.placeholder": "Status note…",
  "note.save": "Save",
  "note.saved": "Status note saved",
  "note.newJournal": "New journal entry",
  "note.newPost": "New board post",

  // ── Capture ──
  "capture.checkIn": "Check-in",
  "capture.note": "Note",
  "capture.activity": "Activity",
  "capture.symptom": "Symptom",
  "capture.task": "Task",
  "capture.plan": "Plan",
  "capture.front": "{{Front}}",
  "capture.support": "Support",

  // ── Widgets ──
  "widget.presence.label": "Who's here",
  "widget.presence.desc": "Current {{fronters}}, with time since each arrived.",
  "widget.presence.title": "Here now",
  "widget.presence.empty": "No {{fronter}} set.",
  "widget.presence.primary": "primary",
  "widget.presence.primaryOf": "Primary {{fronter}}",

  "widget.active.label": "Active",
  "widget.active.empty": "Nothing active right now.",
  "widget.active.sleep": "Sleep",
  "widget.active.activity": "Activity",

  "widget.today.label": "Today",
  "widget.today.desc": "Plans and tasks due today, plus anything unresolved.",
  "widget.today.empty": "Nothing scheduled or due.",
  "widget.today.unresolved": "unresolved",
  "widget.today.unresolvedCount": "{count} unresolved",
  "widget.today.review": "review",
  "widget.today.open": "Open",
  "widget.today.task": "task",
  "widget.today.planned": "Planned",
  "widget.today.dueLabel": "Due today",
  "widget.today.dueToday": "today",

  "widget.status.label": "Status",
  "widget.status.desc": "The latest status note.",
  "widget.status.empty": "No status notes yet.",
  "widget.status.log": "Log",
  "widget.status.placeholder": "Set a new status…",
  "widget.status.save": "Save",

  "widget.recent.label": "Recent check-ins",
  "widget.recent.desc": "Your most recent check-ins.",
  "widget.recent.empty": "Nothing logged yet.",
  "widget.recent.all": "All",
  "widget.recent.item": "Check-in",

  "widget.capture.label": "Capture",
  "widget.capture.desc": "One-tap buttons for the things you log most.",

  "widget.identity.count": "{count} {{alters}}",
  "widget.identity.open": "Open",
  "widget.identity.addPicture": "Add a picture",
  "widget.identity.changePicture": "Change the picture",

  "widget.alters.label": "{{Alters}}",
  "widget.alters.empty": "No {{alters}} yet.",

  "widget.journal.label": "Journal",
  "widget.journal.empty": "No entries yet.",
  "widget.journal.untitled": "Untitled entry",
  "widget.journal.new": "New",

  "widget.book.allJournals": "All journals",
  "widget.book.switch": "Switch",
  "widget.book.newPage": "New page",
  "widget.book.noJournals": "No journals yet — a new page can start one.",
  "widget.book.empty": "Nothing written in here yet.",
  "widget.book.page": "page {n} of {total}",
  "widget.book.newer": "Newer page",
  "widget.book.older": "Older page",

  "widget.notebook.save": "Save page",
  "widget.notebook.saved": "Saved to your journal",
  "widget.notebook.titlePlaceholder": "Title (optional)",
  "widget.notebook.placeholder": "Write here\u2026",

  "widget.tasks.label": "To-dos",
  "widget.tasks.empty": "Nothing open.",

  "widget.sleep.label": "Sleep",
  "widget.sleep.empty": "No sleep logged yet.",
  "widget.sleep.inProgress": "Sleeping since",
  "widget.sleep.lastNight": "{hours}h last night",

  "widget.board.label": "Board",
  "widget.board.empty": "No posts yet.",
  "widget.board.item": "Post",

  "widget.reminders.label": "Reminders",
  "widget.reminders.empty": "Nothing coming up.",
  "widget.reminders.item": "Reminder",

  "widget.folder.label": "Folder",
  "widget.folder.empty": "Nothing in here yet — add apps in this widget's options.",
  "widget.folder.count": "{count} apps",

  "widget.bboard.system": "{{System}} board",
  "widget.bboard.boards": "Boards",
  "widget.bboard.prev": "Previous board",
  "widget.bboard.next": "Next board",

  "widget.app.missing": "Missing shortcut — remove me",

  // ── Shared ──
  "common.switch": "{{Switch}}",
  "common.loading": "Loading…",
};
