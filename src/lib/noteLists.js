// Notes, lists and flash-card decks, read from anywhere in the app (v0.346.0).
//
// They live in two stores (see GroceryListPanel.jsx):
//   - localEntities.GroceryList + GroceryItem: encrypted with everything else
//   - localUnlockedGrocery.js: the plaintext "available when locked" lists
// Every reader outside the lists panel goes through this file, so a goal, a
// widget or the Notes page sees one combined catalogue (each list tagged with
// its `source`) and writes back to the store the list came from. Nothing here
// ever moves or deletes a list between stores.
//
// List kinds: shopping / wishlist / checklist (item rows), note (free text in
// note_content on the list itself), flashcards (items are cards: name = front,
// back, optional pictures).

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { localEntities } from "@/api/base44Client";
import { clockPattern } from "@/lib/timeFormat";
import { isDbInitialized } from "@/lib/localDb";
import {
  listUnlockedLists, loadStore, updateUnlockedList, updateUnlockedItem, createUnlockedItem,
} from "@/lib/localUnlockedGrocery";
import { combineLists, itemsForList } from "@/lib/noteListModel";

export * from "@/lib/noteListModel";

// The plaintext store, re-read whenever it changes (in this tab or another).
export function useUnlockedStore() {
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const bump = () => setNonce((n) => n + 1);
    window.addEventListener("grocery-unlocked-store-changed", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("grocery-unlocked-store-changed", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  return useMemo(() => {
    const store = loadStore();
    return { lists: listUnlockedLists(), items: store.items };
  }, [nonce]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Everything: { lists, idbItems, unlockedItems, items(listId), byId }.
// Uses the lists panel's own query keys, so a change in either place shows
// in the other.
export function useNoteLists({ enabled = true } = {}) {
  const ready = enabled && isDbInitialized();
  const { data: idbLists = [] } = useQuery({
    queryKey: ["groceryLists"], queryFn: () => localEntities.GroceryList.list().catch(() => []), enabled: ready,
  });
  const { data: idbItems = [] } = useQuery({
    queryKey: ["groceryItems"], queryFn: () => localEntities.GroceryItem.list("created_date").catch(() => []), enabled: ready,
  });
  const unlocked = useUnlockedStore();
  return useMemo(() => {
    const lists = combineLists(ready ? idbLists : [], unlocked.lists);
    const byId = new Map(lists.map((l) => [l.id, l]));
    const src = { idbItems: ready ? idbItems : [], unlockedItems: unlocked.items };
    return { lists, byId, ...src, items: (listId) => itemsForList(listId, src) };
  }, [ready, idbLists, idbItems, unlocked]);
}

// ── Writes (routed to the list's own store) ──────────────────────────

export function useNoteListWriters() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["groceryLists"] });
    qc.invalidateQueries({ queryKey: ["groceryItems"] });
  };
  return {
    // A note's text — the one copy, wherever it's edited from.
    async saveNote(list, content) {
      const patch = typeof content === "string" ? { note_content: content } : content;
      if (list.source === "local") updateUnlockedList(list.id, { note_content: patch.note_content });
      else { await localEntities.GroceryList.update(list.id, patch); refresh(); }
    },
    // Tick / untick an item the way the lists panel's two-state lists do.
    async setChecked(list, item, checked) {
      const patch = checked
        ? { checked: true, purchased_at: new Date().toISOString(), ran_out_at: null }
        : { checked: false, purchased_at: null, ran_out_at: null };
      if (list.source === "local") updateUnlockedItem(item.id, patch);
      else { await localEntities.GroceryItem.update(item.id, patch); refresh(); }
    },
    // A new note in the normal (encrypted) store — the same record the
    // lists panel's "New note" makes there (v0.363.0).
    async createNote(name) {
      const made = await localEntities.GroceryList.create({
        name: String(name || "").trim() || `Note — ${format(new Date(), clockPattern("MMM d, h:mm a"))}`, list_type: "note", created_date: new Date().toISOString(),
      });
      refresh();
      return made;
    },
    async addItem(list, name) {
      const v = String(name || "").trim();
      if (!v) return null;
      if (list.source === "local") return createUnlockedItem(list.id, v);
      const made = await localEntities.GroceryItem.create({
        list_id: list.id, name: v, checked: false, created_date: new Date().toISOString(),
      });
      refresh();
      return made;
    },
  };
}

// Where a list, note or deck opens: the Notes & lists page.
export const notesPath = (listId) => (listId ? `/notes?list=${encodeURIComponent(listId)}` : "/notes");

// ── Writing a note: the app's full text grammar (v0.347.1) ────────────
//
// A note autosaves its raw text while you type (so nothing is ever lost);
// tapping Done runs the same pipeline every other text box uses — ~commands,
// /w whispers, -name/+name signposts, @mentions (authoredText.js) — saves the
// result and records the mentions. An "available when locked" note lives in
// plaintext storage, so it never offers or records anyone by name: there the
// grammar is off and Done just saves.
export const noteSpeaksGrammar = (list, { dbReady = isDbInitialized() } = {}) => !!list && list.source !== "local" && dbReady;

// Runs one piece of text written on a list through the shared pipeline.
// Returns { content, authorIds } or null when the save should stop (a broken
// ~command was shown as a toast, or the whisper warning was cancelled).
// Plaintext ("available when locked") lists skip it: the text comes back as
// typed, and nobody is recorded by name.
export async function prepareListText(list, text, { alters = [], terms = {}, surfaceLabel = "note", sourceType = "note", sourceLabel } = {}) {
  const raw = typeof text === "string" ? text : "";
  if (!noteSpeaksGrammar(list)) return { content: raw, authorIds: [] };
  const { prepareAuthoredText, recordAuthoredText, isLogCommandError } = await import("@/lib/authoredText");
  let prepared;
  try {
    prepared = await prepareAuthoredText(raw, { alters, terms, surfaceLabel });
  } catch (e) {
    if (isLogCommandError(e)) {
      const { toast } = await import("sonner");
      toast.error(e.message);
      return null;
    }
    throw e;
  }
  if (!prepared) return null;
  await recordAuthoredText({
    ...prepared, alters, sourceType, sourceId: list.id,
    sourceLabel: sourceLabel || `Note: ${list.name || "note"}`, navigatePath: notesPath(list.id),
  });
  return { content: prepared.content, authorIds: prepared.authorIds || [] };
}

// Returns the patch to save ({ note_content, author_alter_ids? }), or null
// when the save should stop. Signed only when the person signposted.
export async function finishNoteText(list, text, opts = {}) {
  const done = await prepareListText(list, text, opts);
  if (!done) return null;
  return {
    note_content: done.content,
    ...(done.authorIds.length ? { author_alter_ids: done.authorIds } : {}),
  };
}

// A flash card's two sides (v0.347.2): each side runs the pipeline on Save.
// Returns { name, back, author_alter_ids? } or null when the save should stop.
export async function finishCardText(list, front, back, opts = {}) {
  const sourceLabel = `Flash cards: ${list?.name || "deck"}`;
  const f = await prepareListText(list, front, { ...opts, surfaceLabel: "flash card", sourceType: "flashcard", sourceLabel });
  if (!f) return null;
  const b = await prepareListText(list, back, { ...opts, surfaceLabel: "flash card", sourceType: "flashcard", sourceLabel });
  if (!b) return null;
  const authors = [...new Set([...f.authorIds, ...b.authorIds])];
  return { name: f.content, back: b.content, ...(authors.length ? { author_alter_ids: authors } : {}) };
}
