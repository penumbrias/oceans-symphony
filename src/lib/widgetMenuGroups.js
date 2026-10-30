// The add-widget menu's groups (v0.281.0) and families (v0.316.0). The menu
// used to list a section per app page (18 of them, several holding one
// widget each), so widgets that do the same kind of job sat far apart.
// These groups ask what the widget is FOR instead. A widget's `category`
// stays as it is on the definition (boards and mods read it); this file
// only decides where the menu shows it.
//
// Lookup order: an explicit id below, then the widget's category, then
// "more" — so a widget nobody mapped (a mod's, a new one) still shows.
//
// v0.316.0: the menu opens on these groups as tiles instead of one long
// list, the four "profile widgets placed anywhere" groups sit together
// under one "Profiles" tile (`parent`), and widgets that are versions of
// the same thing (a profile's whole tab and its compact widget, the five
// planner views…) are one entry with a Version choice (WIDGET_FAMILIES).

import {
  Zap, PenLine, CalendarDays, BookOpen, Users, Leaf, BarChart3, Shapes, IdCard, UserCircle, Puzzle,
} from "lucide-react";

export const WIDGET_MENU_GROUPS = [
  // Only on a profile board: the parts of that profile (v0.290.0).
  { id: "profile", label: "This profile", hint: "The parts of this page — who they are, notes, history", icon: UserCircle },
  { id: "now", label: "Right now", hint: "Who's here, what's running, today at a glance", icon: Zap },
  { id: "log", label: "Log", hint: "One-tap buttons and check-ins", icon: PenLine },
  { id: "plan", label: "Plan & track", hint: "Planner views, to-dos, reminders, timeline", icon: CalendarDays },
  { id: "write", label: "Write & talk", hint: "Journals, chat, bulletins, polls", icon: BookOpen },
  { id: "alters", label: "{{Alters}} & map", hint: "Lists, pinned {{alters}}, needs, the inner world", icon: Users },
  { id: "calm", label: "Calm", hint: "Grounding, breathing, learning, music", icon: Leaf },
  { id: "lookback", label: "Look back", hint: "Analytics and logs", icon: BarChart3 },
  { id: "pieces", label: "Page pieces", hint: "Headings, text, pictures, spacing, links", icon: Shapes },
  // A profile's widgets placed anywhere else, with whose they are picked
  // in their options (v0.315.0, linkedProfileWidgets.jsx). One tile, one
  // heading per kind of profile inside it.
  { id: "profiles", label: "Profiles", hint: "One {{alter}}, group, contact or location — pick which in the widget's options", icon: IdCard },
  { id: "linked_alter", parent: "profiles", label: "{{Alter}} profiles", hint: "" },
  { id: "linked_group", parent: "profiles", label: "Group profiles", hint: "" },
  { id: "linked_contact", parent: "profiles", label: "Contact profiles", hint: "" },
  { id: "linked_location", parent: "profiles", label: "Location profiles", hint: "" },
  { id: "more", label: "More", hint: "Everything else, mods' widgets too", icon: Puzzle },
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
  calm: ["grounding_techniques", "breathing", "scratch_pad", "soundscape", "learn_modules", "song"],
  lookback: ["emotion_analytics", "symptom_analytics", "checkin_log", "fronting_leaders", "insight_spotlight"],
  pieces: [
    "heading", "text", "media", "divider", "spacer", "quick_links", "folder", "clock",
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
  profile: "profile",
  linked_alter: "linked_alter", linked_group: "linked_group",
  linked_contact: "linked_contact", linked_location: "linked_location",
};

// Widgets that are versions of one thing, listed once with a Version
// choice. `variants` are [id, label] in the order the choice shows them;
// the first one present is what the row's Add places. Only members that
// land in the SAME menu group fold together, so a family that names a
// shared id (profile_header is a different header on each kind of
// profile) only joins the one that is really this profile's — on a group
// profile, alter_identity is under Profiles and profile_header under This
// profile, so they stay apart. An id already taken by an earlier family
// isn't taken again. `label`/`description` name the entry when the family
// needs a name of its own; otherwise the first variant's are used.
export const WIDGET_FAMILIES = [
  // ── Home ─────────────────────────────────────────────────────────
  { id: "front", variants: [["presence", "Simple"], ["fronting_panel", "Full panel"]] },
  {
    id: "planner", label: "Planner", description: "The activity tracker on the page — pick the day, week, month or year view.",
    variants: [["activity_dayview", "Day"], ["activity_day", "Day grid"], ["activity_week", "Week"], ["activity_month", "Month"], ["activity_year", "Year"]],
  },
  {
    id: "journal", label: "Journal", description: "Your recent entries, a notebook to write straight onto the page, or one journal read like a book.",
    variants: [["journal", "Recent entries"], ["notebook", "Notebook"], ["journal_book", "Book"]],
  },
  { id: "chat", label: "Chat", description: "One {{system}}-chat channel to read and send in, or every channel as a list.", variants: [["chat_channel", "One channel"], ["chat_channels", "All channels"]] },
  { id: "inner_world", label: "Inner world", description: "One of your inner-world maps, or every place across them as a list.", variants: [["inner_map", "Map"], ["inner_locations", "Places list"]] },
  {
    id: "button", label: "One-tap button", description: "A single button for one thing you do often — pick which.",
    variants: [
      ["action_quick_checkin", "Check-in"], ["action_quick_note", "Quick note"], ["action_quick_thing", "Something to do"],
      ["action_set_front", "Set {{fronters}}"], ["action_start_activity", "Start an activity"],
      ["action_start_symptom", "Start a symptom"], ["action_support", "Support"],
    ],
  },
  { id: "analytics", label: "Analytics", description: "Your feelings or symptoms over a window you choose.", variants: [["emotion_analytics", "Feelings"], ["symptom_analytics", "Symptoms"]] },

  // ── An alter's profile: the compact widget and the whole tab ─────
  { id: "a_identity", variants: [["alter_identity", "Compact"], ["profile_header", "Full header"]] },
  { id: "a_fields", variants: [["profile_fields", "Filled-in fields"], ["profile_info", "Whole Info tab"], ["info", "One field"]] },
  { id: "a_preferences", variants: [["alter_preferences", "Compact"], ["profile_preferences", "Chips"]] },
  { id: "a_belongs", variants: [["alter_belongs", "Compact"], ["profile_groups", "Groups list"], ["profile_subsystems", "Sub{{system}}s list"]] },
  { id: "a_answers", variants: [["alter_answers", "Compact"], ["profile_answers", "Full list"]] },
  { id: "a_tags", variants: [["alter_tags", "Compact"], ["profile_tags", "Full list"]] },
  { id: "a_notes", variants: [["alter_notes", "Compact"], ["profile_notes", "Whole tab"]] },
  { id: "a_board", variants: [["alter_board_feed", "Compact"], ["profile_board", "Whole tab"]] },
  { id: "a_inbox", variants: [["alter_inbox", "Compact"], ["profile_inbox", "Whole tab"]] },
  { id: "a_sessions", variants: [["alter_fronting_sessions", "Compact"], ["profile_front_history", "Whole tab"]] },
  { id: "a_lineage", variants: [["alter_lineage", "Compact"], ["profile_lineage", "Whole tab"]] },
  { id: "a_relationships", variants: [["alter_relationships", "Compact"], ["profile_relationships", "Whole tab"]] },
  { id: "a_activities", variants: [["alter_activity_links", "Compact"], ["profile_activity_links", "Whole tab"]] },

  // ── A group's profile ────────────────────────────────────────────
  { id: "g_identity", variants: [["group_identity", "Compact"], ["profile_header", "Full header"]] },
  { id: "g_about", variants: [["group_about", "Compact"], ["profile_bio", "Full"]] },
  { id: "g_members", variants: [["group_members", "Compact"], ["profile_members", "Full list"]] },
  { id: "g_nested", variants: [["group_nested", "Compact"], ["profile_nested_groups", "Full list"]] },
  { id: "g_notes", variants: [["group_notes", "Compact"], ["profile_notes", "Whole tab"]] },

  // ── A contact's profile ──────────────────────────────────────────
  { id: "c_identity", variants: [["contact_identity", "Compact"], ["profile_header", "Full header"]] },
  { id: "c_details", variants: [["contact_details", "Everything"], ["profile_about", "About tab"], ["profile_boundaries", "Boundaries tab"]] },
  { id: "c_together", variants: [["contact_together", "Compact"], ["profile_encounter", "Button only"]] },
  { id: "c_notes", variants: [["contact_notes", "Compact"], ["profile_notes", "Whole tab"]] },

  // ── A location's profile ─────────────────────────────────────────
  { id: "l_identity", variants: [["location_identity", "Compact"], ["profile_header", "Full header"]] },
  { id: "l_about", variants: [["location_about", "Compact"], ["profile_bio", "Full"]] },
  { id: "l_alters", variants: [["location_alters", "Compact"], ["profile_members", "Full list"]] },
  { id: "l_places", variants: [["location_places", "Compact"], ["profile_sub_locations", "Sub-locations"], ["profile_on_map", "On the map"]] },
];

const GROUP_OF_ID = new Map();
const RANK_OF_ID = new Map();
for (const [group, ids] of Object.entries(BY_ID)) {
  ids.forEach((id, i) => { GROUP_OF_ID.set(id, group); RANK_OF_ID.set(id, i); });
}

export function widgetMenuGroup(id, def) {
  return GROUP_OF_ID.get(id) || BY_CATEGORY[def?.category] || "more";
}

// One menu entry: { id, def, variants?, family? } — `variants` (two or more
// [{ id, def, label }]) only when it stands for a family.
function foldFamilies(entries) {
  const byId = new Map(entries.map(([id, def]) => [id, def]));
  const taken = new Set();
  const out = [];
  for (const family of WIDGET_FAMILIES) {
    const buckets = new Map();
    for (const [id, label] of family.variants) {
      const def = byId.get(id);
      if (!def || taken.has(id)) continue;
      const group = widgetMenuGroup(id, def);
      if (!buckets.has(group)) buckets.set(group, []);
      buckets.get(group).push({ id, def, label });
    }
    for (const variants of buckets.values()) {
      if (variants.length < 2) continue;
      variants.forEach((v) => taken.add(v.id));
      out.push({ id: variants[0].id, def: variants[0].def, variants, family });
    }
  }
  for (const [id, def] of entries) if (!taken.has(id)) out.push({ id, def });
  return out;
}

// Does the entry (or any of its versions) match a lower-cased query?
export function widgetEntryMatches(entry, query, labelOf, descriptionOf) {
  if (!query) return true;
  const hit = (s) => String(s || "").toLowerCase().includes(query);
  if (entry.family && (hit(entry.family.label) || hit(entry.family.description))) return true;
  return (entry.variants || [entry]).some((v) => hit(labelOf(v.def)) || hit(descriptionOf(v.def)) || hit(v.label));
}

// [{ group, items: [entry…], sections? }] in menu order, empty groups left
// out. A parent group ("profiles") holds its children's items, and lists
// them under `sections` [{ group, items }] for the headings inside it.
// `entries` is [[id, def], …], already filtered (hidden widgets).
export function groupWidgetEntries(entries, labelOf = (id) => id) {
  const buckets = new Map(WIDGET_MENU_GROUPS.map((g) => [g.id, []]));
  for (const entry of foldFamilies(entries)) buckets.get(widgetMenuGroup(entry.id, entry.def)).push(entry);
  const sorted = (group) => buckets.get(group.id).sort((a, b) => {
    const ra = RANK_OF_ID.get(a.id) ?? 1e3, rb = RANK_OF_ID.get(b.id) ?? 1e3;
    return ra - rb || String(labelOf(a)).localeCompare(String(labelOf(b)));
  });
  return WIDGET_MENU_GROUPS
    .filter((group) => !group.parent)
    .map((group) => {
      const children = WIDGET_MENU_GROUPS.filter((g) => g.parent === group.id);
      if (!children.length) return { group, items: sorted(group) };
      const sections = children.map((g) => ({ group: g, items: sorted(g) })).filter((s) => s.items.length > 0);
      return { group, items: [...sorted(group), ...sections.flatMap((s) => s.items)], sections };
    })
    .filter((g) => g.items.length > 0);
}
