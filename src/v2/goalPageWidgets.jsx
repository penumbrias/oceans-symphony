// The widgets a Goals page is made of (v0.338.0). A goal page is a widget
// board (PageBoardCanvas, owner "page:goal:<id>"): these four are its
// standard layout, and any other widget — Media for pictures and videos,
// Text, Image, a song — can go beside them with Edit page.
//
// They read the open page from GoalPageContext (set by Goals.jsx) and the
// workspace (WorkspaceContext), so they only exist in a goal page's own
// registry (GOAL_PAGE_REGISTRY), never in the home library.

import { useNavigate } from "react-router-dom";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Play, StickyNote, ListTree, Link2, ListChecks, Layers, Check, Plus } from "lucide-react";
import { Section, Muted, TextAction } from "@/v2/primitives";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { StackedRow } from "@/components/shared/SettingRows";
import StudyDeckButton from "@/components/goals/StudyDeckButton";
import {
  useNoteLists, useNoteListWriters, listLabel, listProgress, isNote, isItemList, isDeck, notesPath,
  deckStudySessions, finishNoteText, noteSpeaksGrammar,
} from "@/lib/noteLists";
import MentionTextarea from "@/components/shared/MentionTextarea";
import RichText from "@/components/shared/RichText";
import { useTerms } from "@/lib/useTerms";
import { goalWeekWindow } from "@/lib/goalCounting";
import { formatMinutes } from "@/lib/goalTree";
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

// ── The person's own notes, lists and decks ─────────────────────────

// Options row: pick one of the person's notes / lists / decks.
function listPickerField(key, label, filter, { pageNote = false } = {}) {
  function ListPicker({ settings, set }) {
    const { lists } = useNoteLists();
    const options = useMemo(() => [
      ...(pageNote ? [{ id: "__page", label: "This goal page's own note" }] : []),
      ...lists.filter(filter).map((l) => ({ id: l.id, label: listLabel(l) })),
    ], [lists]);
    return (
      <StackedRow label={label}>
        <SearchableSelect value={settings?.[key] || (pageNote ? "__page" : null)} options={options}
          placeholder="Choose…" searchPlaceholder="Search…"
          onChange={(id) => set({ [key]: id && id !== "__page" ? id : null })} />
      </StackedRow>
    );
  }
  return { key: `_${key}`, type: "component", label: "", Component: ListPicker };
}

function MissingList({ what }) {
  return <Muted>{`That ${what} was deleted, or isn't here. Choose another in the widget's options.`}</Muted>;
}

// A note from the person's notes: the one copy, edited right here.
function SharedNote({ list }) {
  const { saveNote } = useNoteListWriters();
  const ws = useWorkspace();
  const terms = useTerms();
  const alters = ws?.alters || [];
  const grammar = noteSpeaksGrammar(list);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(list.note_content || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!editing) setText(list.note_content || ""); }, [list.note_content, editing]);
  const save = async () => {
    setSaving(true);
    try {
      const patch = await finishNoteText(list, text, { alters, terms });
      if (!patch) return; // a broken ~command or a cancelled whisper: keep editing
      await saveNote(list, patch);
      setEditing(false);
    } finally { setSaving(false); }
  };
  if (editing) {
    return (
      <div className="space-y-1.5">
        <MentionTextarea toolbar value={text} onChange={setText} autoFocus aria-label={list.name || "Note"}
          alters={grammar ? alters : []} signposts={grammar} commands={grammar}
          className="w-full min-h-[8em] bg-transparent text-sm" style={{ borderColor: "var(--v2-accent)" }} />
        <div className="flex justify-end gap-3">
          <TextAction onClick={() => { setText(list.note_content || ""); setEditing(false); }}>Cancel</TextAction>
          <TextAction onClick={saving ? undefined : save}>{saving ? "Saving…" : "Save"}</TextAction>
        </div>
      </div>
    );
  }
  const body = String(list.note_content || "").trim();
  const photos = Array.isArray(list.note_images) ? list.note_images.length : 0;
  return (
    <div className="space-y-1">
      <button type="button" onClick={() => setEditing(true)} className="w-full text-left text-sm whitespace-pre-wrap break-words">
        {body ? <RichText content={body} alters={alters} terms={terms} /> : <span className="opacity-60">Empty note. Tap to write.</span>}
      </button>
      {photos > 0 && <p className="text-xs opacity-70">{photos === 1 ? "1 photo" : `${photos} photos`} on this note</p>}
    </div>
  );
}

function GoalNoteWidget({ settings }) {
  const navigate = useNavigate();
  const page = useGoalPage();
  const ws = useWorkspace();
  const { byId } = useNoteLists();
  if (settings?.noteId) {
    const note = byId.get(settings.noteId);
    return (
      <Section label={note?.name || "Note"}
        action={note ? <TextAction onClick={() => navigate(notesPath(note.id))}>Open</TextAction> : undefined}>
        {note ? <SharedNote list={note} /> : <MissingList what="note" />}
      </Section>
    );
  }
  return <PageNoteWidget page={page} ws={ws} />;
}

// One of the person's lists, ticked from here.
function GoalListWidget({ settings }) {
  const navigate = useNavigate();
  const { byId, items } = useNoteLists();
  const { setChecked, addItem } = useNoteListWriters();
  const [text, setText] = useState("");
  const list = settings?.listId ? byId.get(settings.listId) : null;
  if (!settings?.listId) return <Section label="List"><Muted>Choose a list in this widget's options.</Muted></Section>;
  if (!list) return <Section label="List"><MissingList what="list" /></Section>;
  const rows = items(list.id);
  const p = listProgress(rows);
  const open = rows.filter((i) => !i.checked);
  const done = rows.filter((i) => i.checked);
  const add = async () => { const v = text.trim(); if (!v) return; await addItem(list, v); setText(""); };
  const row = (i) => (
    <li key={i.id} className="flex items-start gap-2">
      <button type="button" role="checkbox" aria-checked={!!i.checked} aria-label={i.name}
        onClick={() => setChecked(list, i, !i.checked)}
        className="mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
        style={{ borderColor: "var(--v2-accent)", background: i.checked ? "var(--v2-accent)" : "transparent" }}>
        {i.checked && <Check className="w-3 h-3" />}
      </button>
      <span className={`text-sm min-w-0 break-words ${i.checked ? "line-through opacity-60" : ""}`}>{i.name}</span>
    </li>
  );
  return (
    <Section label={listLabel(list)} action={<TextAction onClick={() => navigate(notesPath(list.id))}>Open</TextAction>}>
      <p className="text-xs opacity-70 tabular-nums">{p.total ? `${p.done} of ${p.total} ticked` : "Nothing on it yet"}</p>
      <ul className="space-y-1 mt-1">{open.map(row)}{done.map(row)}</ul>
      <div className="flex gap-1.5 mt-1.5">
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label={`Add to ${list.name || "the list"}`}
          placeholder="Add…" onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          className="flex-1 min-w-0 rounded-md border bg-transparent px-2 py-1 text-sm" style={{ borderColor: "var(--v2-accent)" }} />
        <button type="button" onClick={add} aria-label="Add" disabled={!text.trim()}
          className="p-1.5 rounded-md border disabled:opacity-40" style={{ borderColor: "var(--v2-accent)" }}><Plus className="w-3.5 h-3.5" /></button>
      </div>
    </Section>
  );
}

// A flash-card deck: how many cards, time studied, and a timer to study it.
function GoalDeckWidget({ settings }) {
  const navigate = useNavigate();
  const page = useGoalPage();
  const ws = useWorkspace();
  const { byId, items } = useNoteLists();
  const deck = settings?.listId ? byId.get(settings.listId) : null;
  if (!settings?.listId) return <Section label="Flash cards"><Muted>Choose a deck in this widget's options.</Muted></Section>;
  if (!deck) return <Section label="Flash cards"><MissingList what="deck" /></Section>;
  const cards = items(deck.id);
  const acts = ws?.ctx?.activities || [];
  const now = new Date();
  const week = deckStudySessions(deck.id, acts, { from: goalWeekWindow(now).start, to: now }).reduce((n, x) => n + (x.minutes || 0), 0);
  const all = deckStudySessions(deck.id, acts, { to: now }).reduce((n, x) => n + (x.minutes || 0), 0);
  return (
    <Section label={listLabel(deck)} action={<TextAction onClick={() => navigate(notesPath(deck.id))}>Open</TextAction>}>
      <p className="text-sm tabular-nums">{cards.length === 1 ? "1 card" : `${cards.length} cards`}</p>
      <p className="text-xs opacity-70 tabular-nums">
        {all > 0 ? `${formatMinutes(week)} studied this week · ${formatMinutes(all)} in all` : "Not studied with the timer yet."}
      </p>
      <StudyDeckButton deck={deck} goalId={page?.id || null} className="mt-1.5" />
    </Section>
  );
}

function PageNoteWidget({ page, ws }) {
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
    label: "Goal note", description: "The page's note (what it's for and what it would change), or one of your own notes: the same note everywhere, so editing it here edits it in your notes too.",
    icon: StickyNote, category: "needs", render: ({ settings }) => <GoalNoteWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [listPickerField("noteId", "Which note", isNote, { pageNote: true })], ...span,
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
