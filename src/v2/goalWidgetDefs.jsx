// Notebook and notes widgets, offered on every board (v0.362.0, garden
// step 4 — docs/garden.md part 4). They used to live only in a goal page's
// own registry; now the home screen and every profile can show a list, a
// flash-card deck, a note or a whole Notebook page.
//
// goalWidgetDefs({ onGoalPage }) builds the definitions. On a Notebook page
// (Goals.jsx) "Which page" starts on that page and nothing needs setting up;
// everywhere else the widget asks which list, note or page first.
// The bodies (goalPageWidgets.jsx) load the first time one is shown.

import React, { useMemo } from "react";
import { Play, StickyNote, ListTree, Link2, ListChecks, Layers } from "lucide-react";
import { lazyNamed } from "@/lib/lazyNamed";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { StackedRow } from "@/components/shared/SettingRows";
import GoalPagePicker from "@/components/goals/GoalPagePicker";
import { useNoteLists, listLabel, isNote, isItemList, isDeck } from "@/lib/noteLists";

const load = () => import("@/v2/goalPageWidgets");
const GoalActivitiesWidget = lazyNamed(load, "GoalActivitiesWidget");
const GoalNoteWidget = lazyNamed(load, "GoalNoteWidget");
const GoalListWidget = lazyNamed(load, "GoalListWidget");
const GoalDeckWidget = lazyNamed(load, "GoalDeckWidget");
const GoalLinesWidget = lazyNamed(load, "GoalLinesWidget");
const GoalConnectionsWidget = lazyNamed(load, "GoalConnectionsWidget");

// Options row: one of the person's notes / lists / decks. `pageOption`
// adds "The page's own note" first (the default).
function listPickerField(key, label, filter, { pageOption = null } = {}) {
  function ListPicker({ settings, set }) {
    const { lists } = useNoteLists();
    const options = useMemo(() => [
      ...(pageOption ? [{ id: "__page", label: pageOption }] : []),
      ...lists.filter(filter).map((l) => ({ id: l.id, label: listLabel(l) })),
    ], [lists]);
    return (
      <StackedRow label={label}>
        <SearchableSelect value={settings?.[key] || (pageOption ? "__page" : null)} options={options}
          placeholder="Choose…" searchPlaceholder="Search…"
          onChange={(id) => set({ [key]: id && id !== "__page" ? id : null })} />
      </StackedRow>
    );
  }
  return { key: `_${key}`, type: "component", label: "", Component: ListPicker };
}

// Options row: which Notebook page. On a Notebook page, empty = this page.
function goalPickerField({ onGoalPage, showIf = null }) {
  function PagePicker({ settings, set }) {
    return (
      <StackedRow label="Which page">
        <GoalPagePicker label={null} value={settings?.goalId || null} onChange={(id) => set({ goalId: id || null })}
          placeholder={onGoalPage ? "This page" : "Choose a Notebook page…"} />
      </StackedRow>
    );
  }
  return { key: "_goalId", type: "component", label: "", Component: PagePicker, ...(showIf ? { showIf } : {}) };
}

const span = { defaultSpan: { cols: 12, rows: 2 }, minSpan: { cols: 3, rows: 1 }, maxSpan: { cols: 12, rows: 20 } };

export function goalWidgetDefs({ onGoalPage = false } = {}) {
  const pagePicker = goalPickerField({ onGoalPage });
  const needsPage = onGoalPage ? undefined : (settings) => !settings?.goalId;
  return {
    goal_activities: {
      label: "Goal activities", description: "Start and stop a Notebook page's activities without leaving where you are. The time is logged like any activity and adds up on the page.",
      icon: Play, category: "needs", render: ({ settings }) => <GoalActivitiesWidget settings={settings} />,
      supportsModes: ["normal"], supportsMultiInstance: true, needsSetup: needsPage,
      configFields: [pagePicker], ...span,
    },
    goal_note: {
      label: "Note", description: "One of your notes, or a Notebook page's own note: the same note everywhere, so editing it here edits it there too.",
      icon: StickyNote, category: "needs", render: ({ settings }) => <GoalNoteWidget settings={settings} />,
      supportsModes: ["normal"], supportsMultiInstance: true,
      needsSetup: onGoalPage ? undefined : (settings) => !settings?.noteId && !settings?.goalId,
      configFields: [
        listPickerField("noteId", "Which note", isNote, { pageOption: onGoalPage ? "This page's own note" : "A Notebook page's own note" }),
        goalPickerField({ onGoalPage, showIf: (st) => !st?.noteId }),
      ], ...span,
    },
    goal_list: {
      label: "List", description: "One of your lists: tick things off and add to it here. It's the same list everywhere.",
      icon: ListChecks, category: "needs", render: ({ settings }) => <GoalListWidget settings={settings} />,
      supportsModes: ["normal"], supportsMultiInstance: true,
      needsSetup: (settings) => !settings?.listId,
      configFields: [listPickerField("listId", "Which list", isItemList)], ...span, defaultSpan: { cols: 12, rows: 4 },
    },
    goal_deck: {
      label: "Flash-card deck", description: "One of your flash-card decks: its cards, the time you've studied it, and a timer to study now.",
      icon: Layers, category: "needs", render: ({ settings }) => <GoalDeckWidget settings={settings} />,
      supportsModes: ["normal"], supportsMultiInstance: true,
      needsSetup: (settings) => !settings?.listId,
      configFields: [listPickerField("listId", "Which deck", isDeck)], ...span,
    },
    goal_lines: {
      label: "Notebook page", description: "A Notebook page itself: its sections, notes, to-dos, checkboxes, links and trackers, as an outline, a board or a map.",
      icon: ListTree, category: "needs", render: ({ settings }) => <GoalLinesWidget settings={settings} />,
      supportsModes: ["normal"], supportsMultiInstance: true, needsSetup: needsPage,
      configFields: [
        pagePicker,
        { key: "view", type: "select", label: "Show as", default: "page",
          options: [
            { value: "page", label: "The page's choice" },
            { value: "outline", label: "Outline" },
            { value: "board", label: "Board (sections as columns)" },
            { value: "map", label: "Map (how it connects)" },
          ] },
      ],
      ...span, defaultSpan: { cols: 12, rows: 6 },
    },
    goal_connections: {
      label: "Goal connections", description: "The pages a Notebook page links to, and the pages that link to it.",
      icon: Link2, category: "needs", render: ({ settings }) => <GoalConnectionsWidget settings={settings} />,
      supportsModes: ["normal"], supportsMultiInstance: true, needsSetup: needsPage,
      configFields: [pagePicker], ...span, defaultSpan: { cols: 12, rows: 1 },
    },
  };
}
