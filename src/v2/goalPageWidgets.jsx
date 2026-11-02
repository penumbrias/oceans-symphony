// The widgets a Goals page is made of (v0.338.0). A goal page is a widget
// board (PageBoardCanvas, owner "page:goal:<id>"): these four are its
// standard layout, and any other widget — Media for pictures and videos,
// Text, Image, a song — can go beside them with Edit page.
//
// They read the open page from GoalPageContext (set by Goals.jsx) and the
// workspace (WorkspaceContext), so they only exist in a goal page's own
// registry (GOAL_PAGE_REGISTRY), never in the home library.

import React, { createContext, useContext, useEffect, useState } from "react";
import { Play, StickyNote, ListTree, Link2 } from "lucide-react";
import { Section, Muted } from "@/v2/primitives";
import ActivityStrip from "@/components/goals/workspace/ActivityStrip";
import { PageNote, Connections } from "@/components/goals/workspace/PageView";
import { EntryList } from "@/components/goals/workspace/Outline";
import BoardView from "@/components/goals/workspace/BoardView";
import MapView from "@/components/goals/workspace/MapView";
import { useWorkspace } from "@/components/goals/workspace/WorkspaceContext";
import { GOAL_NOTE_EDIT_EVENT } from "@/lib/goalNoteEvents";

export const GoalPageContext = createContext(null);
export const useGoalPage = () => useContext(GoalPageContext);


function NoPage() {
  return <Muted>Shows on a Goals page.</Muted>;
}

function GoalActivitiesWidget() {
  const page = useGoalPage();
  const ws = useWorkspace();
  return (
    <Section label="Activities">
      {page && ws ? <ActivityStrip page={page} bare /> : <NoPage />}
    </Section>
  );
}

function GoalNoteWidget() {
  const page = useGoalPage();
  const ws = useWorkspace();
  const [editing, setEditing] = useState(false);
  useEffect(() => { setEditing(false); }, [page?.id]);
  useEffect(() => {
    const on = (e) => { if (page && e?.detail?.pageId === page.id) setEditing(true); };
    window.addEventListener(GOAL_NOTE_EDIT_EVENT, on);
    return () => window.removeEventListener(GOAL_NOTE_EDIT_EVENT, on);
  }, [page]);
  return (
    <Section label="Note">
      {page && ws ? <PageNote page={page} editing={editing} setEditing={setEditing} emptyPrompt /> : <NoPage />}
    </Section>
  );
}

// The page's lines and sections. "Show as" is the widget's option; left on
// "The page's choice" it follows the view the page was set to before.
function GoalLinesWidget({ settings }) {
  const page = useGoalPage();
  const ws = useWorkspace();
  if (!page || !ws) return <Section label="Page"><NoPage /></Section>;
  const pick = settings?.view && settings.view !== "page" ? settings.view : page.view;
  const view = ["outline", "board", "map"].includes(pick) ? pick : "outline";
  return (
    <Section label="Page">
      {view === "outline" && <EntryList pageId={page.id} page={page} />}
      {view === "board" && <BoardView page={page} />}
      {view === "map" && <MapView page={page} />}
    </Section>
  );
}

function GoalConnectionsWidget() {
  const page = useGoalPage();
  const ws = useWorkspace();
  return (
    <Section label="Connections">
      {page && ws
        ? <Connections page={page} bare emptyText="Nothing links here yet. Add a Link line, or type [[a page's title]] in a note." />
        : <NoPage />}
    </Section>
  );
}

const span = { defaultSpan: { cols: 12, rows: 2 }, minSpan: { cols: 3, rows: 1 }, maxSpan: { cols: 12, rows: 20 } };

export const GOAL_PAGE_WIDGETS = {
  goal_activities: {
    label: "Goal activities", description: "Start and stop this page's activities without leaving it. The time is logged like any activity and adds up here.",
    icon: Play, category: "needs", render: () => <GoalActivitiesWidget />,
    supportsModes: ["normal"], supportsMultiInstance: false, configFields: [], ...span,
  },
  goal_note: {
    label: "Goal note", description: "The page's note: what it's for and what it would change.",
    icon: StickyNote, category: "needs", render: () => <GoalNoteWidget />,
    supportsModes: ["normal"], supportsMultiInstance: false, configFields: [], ...span,
  },
  goal_lines: {
    label: "Goal page lines", description: "The page itself: its sections, notes, to-dos, checkboxes, links and trackers, as an outline, a board or a map.",
    icon: ListTree, category: "needs", render: ({ settings }) => <GoalLinesWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: false,
    configFields: [
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
    label: "Goal connections", description: "The pages this one links to, and the pages that link here.",
    icon: Link2, category: "needs", render: () => <GoalConnectionsWidget />,
    supportsModes: ["normal"], supportsMultiInstance: false, configFields: [], ...span, defaultSpan: { cols: 12, rows: 1 },
  },
};

// What a goal page shows until its first layout edit.
export const GOAL_PAGE_PAGES = [
  { tab: "page", label: "Page", widgets: [
    { widgetId: "goal_activities" },
    { widgetId: "goal_note" },
    { widgetId: "goal_lines" },
    { widgetId: "goal_connections" },
  ] },
];
