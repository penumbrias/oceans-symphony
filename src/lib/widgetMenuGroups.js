// The add-widget menu's groups (v0.281.0). The menu used to list a section
// per app page (18 of them, several holding one widget each), so widgets
// that do the same kind of job sat far apart. These eight groups ask what
// the widget is FOR instead. A widget's `category` stays as it is on the
// definition (boards and mods read it); this file only decides where the
// menu shows it.
//
// Lookup order: an explicit id below, then the widget's category, then
// "more" — so a widget nobody mapped (a mod's, a new one) still shows.

export const WIDGET_MENU_GROUPS = [
  { id: "now", label: "Right now", hint: "Who's here, what's running, today at a glance" },
  { id: "log", label: "Log", hint: "One-tap buttons and check-ins" },
  { id: "plan", label: "Plan & track", hint: "Planner views, to-dos, reminders, timeline" },
  { id: "write", label: "Write & talk", hint: "Journals, chat, bulletins, polls" },
  { id: "alters", label: "{{Alters}} & map", hint: "Lists, pinned {{alters}}, needs, the inner world" },
  { id: "calm", label: "Calm", hint: "Grounding, breathing, learning, music" },
  { id: "lookback", label: "Look back", hint: "Analytics and logs" },
  { id: "pieces", label: "Page pieces", hint: "Headings, text, spacing, links, folders" },
  { id: "more", label: "More", hint: "" },
];

// Ids listed in the order the menu shows them inside their group.
const BY_ID = {
  now: [
    "presence", "running", "today", "status", "sleep", "fronting_panel",
    "current_fronters", "status_note", "active_now", "dashboard_pins", "current_focus",
  ],
  log: ["capture", "log_emotion", "log_symptom", "diary_card", "quick_checkin"],
  plan: [
    "activity_dayview", "activity_day", "activity_week", "activity_month", "activity_year",
    "plan_tracker", "recent_activities", "daily_tasks", "goals", "reminders",
    "timeline_days", "day_summary", "upcoming_top", "upcoming_bottom", "pinned_daily_tasks",
  ],
  write: ["journal", "notebook", "journal_book", "chat_channel", "chat_channels", "bulletin_board", "polls"],
  alters: [
    "alters_list", "pinned_alters", "system_identity", "system_header",
    "needs_balance", "wishes", "inner_map", "inner_locations",
  ],
  calm: ["grounding_techniques", "breathing", "learn_modules", "song"],
  lookback: ["emotion_analytics", "symptom_analytics", "checkin_log", "fronting_leaders", "insight_spotlight"],
  pieces: [
    "heading", "text", "divider", "spacer", "quick_links", "folder", "clock",
    "page_buttons", "frequently_opened", "quick_nav_menu", "new_features_bar",
  ],
};

const BY_CATEGORY = {
  home: "now", tracking: "now", sleep: "now",
  actions: "log", checkin: "log",
  activities: "plan", activity: "plan", tasks: "plan", reminders: "plan", timeline: "plan",
  journals: "write", bulletins: "write", chat: "write", content: "write",
  alters: "alters", system: "alters", needs: "alters",
  support: "calm",
  analytics: "lookback",
  nav: "pieces", layout: "pieces", chrome: "pieces", meta: "pieces",
};

const GROUP_OF_ID = new Map();
const RANK_OF_ID = new Map();
for (const [group, ids] of Object.entries(BY_ID)) {
  ids.forEach((id, i) => { GROUP_OF_ID.set(id, group); RANK_OF_ID.set(id, i); });
}

export function widgetMenuGroup(id, def) {
  return GROUP_OF_ID.get(id) || BY_CATEGORY[def?.category] || "more";
}

// [{ group, items: [[id, def], …] }] in menu order, empty groups left out.
// `entries` is already filtered (search, hidden widgets).
export function groupWidgetEntries(entries, labelOf = (id) => id) {
  const buckets = new Map(WIDGET_MENU_GROUPS.map((g) => [g.id, []]));
  for (const entry of entries) buckets.get(widgetMenuGroup(entry[0], entry[1])).push(entry);
  return WIDGET_MENU_GROUPS
    .map((group) => ({
      group,
      items: buckets.get(group.id).sort((a, b) => {
        const ra = RANK_OF_ID.get(a[0]) ?? 1e3, rb = RANK_OF_ID.get(b[0]) ?? 1e3;
        return ra - rb || String(labelOf(a)).localeCompare(String(labelOf(b)));
      }),
    }))
    .filter((g) => g.items.length > 0);
}
