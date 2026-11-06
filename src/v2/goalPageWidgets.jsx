// The bodies of the Notebook widgets (v0.338.0; on every board since
// v0.362.0). Their definitions are in goalWidgetDefs.jsx, which loads this
// file the first time one is shown.
//
// On a Notebook page they read the open page (GoalPageContext, set by
// Goals.jsx) and the workspace (WorkspaceContext). Anywhere else, or when
// the widget's "Which page" names another page, GoalScope gives them that
// page and a workspace of their own, so they work the same on any board.

import { useNavigate } from "react-router-dom";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { GOALS_QUERY_KEY, GOAL_STEPS_QUERY_KEY } from "@/lib/goals";
import { indexPages } from "@/lib/goalTree";
import { useGoalCtx } from "@/lib/useGoalCtx";
import { Section, Muted, TextAction } from "@/v2/primitives";
import StudyDeckButton from "@/components/goals/StudyDeckButton";
import {
  useNoteLists, useNoteListWriters, listLabel, listProgress, notesPath,
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
import { useWorkspace, WorkspaceProvider } from "@/components/goals/workspace/WorkspaceContext";
import { GOAL_NOTE_EDIT_EVENT } from "@/lib/goalNoteEvents";

export const GoalPageContext = createContext(null);
export const useGoalPage = () => useContext(GoalPageContext);

const listOf = (entity) => () => base44.entities[entity].list().catch(() => []);

// A workspace for a widget that isn't on a Notebook page: the same records
// and the same write rules (WorkspaceProvider's run) as the Notebook.
function OwnWorkspace({ children }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: goals = [] } = useQuery({ queryKey: GOALS_QUERY_KEY, queryFn: listOf("Goal") });
  const { data: steps = [] } = useQuery({ queryKey: GOAL_STEPS_QUERY_KEY, queryFn: listOf("GoalStep") });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: listOf("Alter") });
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const { ctx } = useGoalCtx();
  const index = useMemo(() => indexPages(goals), [goals]);
  const value = useMemo(() => ({
    goals, steps, index, ctx, alters, isFetched: true,
    settings: pickPrimarySystemSettings(settingsList) || null,
    refresh: () => {
      for (const key of [GOALS_QUERY_KEY, GOAL_STEPS_QUERY_KEY, ["tasks"], ["activities"], ["dailyProgress"], ["groceryLists"], ["groceryItems"]]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
    open: (id) => navigate(id ? `/goals?page=${id}` : "/goals"),
    tag: null,
    showTag: () => navigate("/goals"),
  }), [goals, steps, index, ctx, alters, settingsList, qc, navigate]);
  return <WorkspaceProvider value={value}>{children}</WorkspaceProvider>;
}

function PageFromIndex({ goalId, children }) {
  const ws = useWorkspace();
  const page = goalId ? ws?.index?.byId?.get(goalId) || null : null;
  return <GoalPageContext.Provider value={page}>{children}</GoalPageContext.Provider>;
}

// The page a widget shows: its own "Which page", else the Notebook page
// it sits on. Builds a workspace when there is none.
function GoalScope({ goalId, children }) {
  const here = useGoalPage();
  const ws = useWorkspace();
  if (!goalId) return children;
  if (here?.id === goalId) return children;
  if (ws) return <PageFromIndex goalId={goalId}>{children}</PageFromIndex>;
  return <OwnWorkspace><PageFromIndex goalId={goalId}>{children}</PageFromIndex></OwnWorkspace>;
}

const scoped = (Body) => function ScopedGoalWidget({ settings }) {
  return <GoalScope goalId={settings?.goalId || null}><Body settings={settings} /></GoalScope>;
};


function NoPage() {
  return <Muted>Choose a Notebook page in this widget's options.</Muted>;
}

function GoalActivitiesBody() {
  const page = useGoalPage();
  const ws = useWorkspace();
  return (
    <Section label="Activities">
      {page && ws ? <ActivityStrip page={page} bare /> : <NoPage />}
    </Section>
  );
}

// ── The person's own notes, lists and decks ─────────────────────────

function MissingList({ what }) {
  return <Muted>{`That ${what} was deleted, or isn't here. Choose another in the widget's options.`}</Muted>;
}

// A note from the person's notes: the one copy, edited right here.
function SharedNote({ list }) {
  const { saveNote } = useNoteListWriters();
  const ws = useWorkspace();
  const terms = useTerms();
  const { data: ownAlters = [] } = useQuery({ queryKey: ["alters"], queryFn: listOf("Alter"), enabled: !ws });
  const alters = ws?.alters || ownAlters;
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

function GoalNoteBody({ settings }) {
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
export function GoalListWidget({ settings }) {
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
export function GoalDeckWidget({ settings }) {
  const navigate = useNavigate();
  const page = useGoalPage();
  const ws = useWorkspace();
  const { byId, items } = useNoteLists();
  const { data: ownActivities = [] } = useQuery({ queryKey: ["activities"], queryFn: listOf("Activity"), enabled: !ws });
  const deck = settings?.listId ? byId.get(settings.listId) : null;
  if (!settings?.listId) return <Section label="Flash cards"><Muted>Choose a deck in this widget's options.</Muted></Section>;
  if (!deck) return <Section label="Flash cards"><MissingList what="deck" /></Section>;
  const cards = items(deck.id);
  const acts = ws?.ctx?.activities || ownActivities;
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
function GoalLinesBody({ settings }) {
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

function GoalConnectionsBody() {
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

export const GoalActivitiesWidget = scoped(GoalActivitiesBody);
export const GoalNoteWidget = scoped(GoalNoteBody);
export const GoalLinesWidget = scoped(GoalLinesBody);
export const GoalConnectionsWidget = scoped(GoalConnectionsBody);

// What a goal page shows until its first layout edit.
export const GOAL_PAGE_PAGES = [
  { tab: "page", label: "Page", widgets: [
    { widgetId: "goal_activities" },
    { widgetId: "goal_note" },
    { widgetId: "goal_lines" },
    { widgetId: "goal_connections" },
  ] },
];
