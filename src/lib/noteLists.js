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
  createUnlockedList, deleteUnlockedList, deleteUnlockedItem,
  listUnlockedFavorites, addUnlockedFavorite, removeUnlockedFavorite,
} from "@/lib/localUnlockedGrocery";
import { combineLists, itemsForList, tickPatch, UNTICK_PATCH } from "@/lib/noteListModel";

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

// ── Writes: the one write path for notes, lists and decks (v0.365.0) ──
//
// Every change to a list, its items or its favourites goes through here —
// the list sheet, the widgets, goals AND the lists panel (the privacy cover)
// all call these, so a write lands the same way from every door. Each call
// is routed to the store the list lives in (list.source: "local" = the
// plaintext "available when locked" store, otherwise the encrypted one).
// Nothing here moves a list between stores, and no person's id is ever
// written to the plaintext store.
//
// Lists, items and favourites are removed at once, not trashed (they are
// TRASH_INSTANT: the cover keeps its contents out of app history).

const isLocal = (list) => list?.source === "local";
const norm = (s) => String(s || "").trim().toLowerCase();
const nowIso = () => new Date().toISOString();
const quickNoteName = () => `Note — ${format(new Date(), clockPattern("MMM d, h:mm a"))}`;

async function forgetPictures(urls) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) return;
  const { getLocalImageId } = await import("@/lib/localImageStorage");
  const { deleteLocalImageIfUnused } = await import("@/lib/localImageUsage");
  for (const url of list) {
    try { const id = getLocalImageId(url); if (id) await deleteLocalImageIfUnused(id); } catch { /* non-fatal */ }
  }
}

export function noteListWriters(qc) {
  const refresh = (...keys) => {
    for (const k of keys.length ? keys : ["groceryLists", "groceryItems"]) qc?.invalidateQueries({ queryKey: [k] });
  };
  const w = {
    // ── Lists ──
    // A new list, note or deck. `unlocked` puts it in the plaintext store
    // (only ever by the person's explicit choice); an owner is only kept in
    // the encrypted store. Returns the record, or null.
    async createList({ name, kind = "shopping", ownerId = null, unlocked = false } = {}) {
      const n = String(name || "").trim();
      if (!n) return null;
      if (unlocked) return createUnlockedList(n, { list_type: kind });
      const made = await localEntities.GroceryList.create({
        name: n, list_type: kind, owner_alter_id: ownerId || null, created_date: nowIso(),
      });
      refresh("groceryLists");
      return made;
    },
    // A new note named for the moment it was made.
    async createNote(name, { unlocked = false } = {}) {
      return w.createList({ name: String(name || "").trim() || quickNoteName(), kind: "note", unlocked });
    },
    // Name, kind and owner. The plaintext store keeps name and kind only.
    async updateList(list, patch = {}) {
      if (!list) return;
      if (isLocal(list)) {
        const safe = {};
        if (typeof patch.name === "string") safe.name = patch.name;
        if (typeof patch.list_type === "string") safe.list_type = patch.list_type;
        updateUnlockedList(list.id, safe);
        return;
      }
      await localEntities.GroceryList.update(list.id, patch);
      refresh("groceryLists");
    },
    // A note's text (and its pictures / authors) — the one copy, wherever
    // it's edited from. The plaintext store only takes the text.
    async saveNote(list, content) {
      const patch = typeof content === "string" ? { note_content: content } : (content || {});
      if (isLocal(list)) updateUnlockedList(list.id, { note_content: patch.note_content });
      else { await localEntities.GroceryList.update(list.id, patch); refresh("groceryLists"); }
    },
    // The list, every item on it, and the pictures only it used.
    async deleteList(list) {
      if (!list) return;
      if (isLocal(list)) { deleteUnlockedList(list.id); return; }
      const all = await localEntities.GroceryItem.list("created_date").catch(() => []);
      for (const item of all.filter((i) => i.list_id === list.id)) {
        try { await localEntities.GroceryItem.delete(item.id); } catch { /* non-fatal */ }
        await forgetPictures([item.front_image, item.back_image]);
      }
      await localEntities.GroceryList.delete(list.id);
      // After the record is gone, so the in-use check doesn't count it.
      await forgetPictures(Array.isArray(list.note_images) ? list.note_images : []);
      refresh();
    },

    // ── Items ──
    // Adds one item; skips a name that's already waiting on the list.
    async addItem(list, name, { existing = [] } = {}) {
      const v = String(name || "").trim();
      if (!list || !v) return null;
      if ((existing || []).some((i) => i && !i.checked && norm(i.name) === norm(v))) return null;
      if (isLocal(list)) return createUnlockedItem(list.id, v);
      const made = await localEntities.GroceryItem.create({ list_id: list.id, name: v, checked: false, created_date: nowIso() });
      refresh("groceryItems");
      return made;
    },
    async patchItem(list, item, patch) {
      if (!item || !patch) return;
      if (isLocal(list)) updateUnlockedItem(item.id, patch);
      else { await localEntities.GroceryItem.update(item.id, patch); refresh("groceryItems"); }
    },
    // One tap: to do → ticked (→ ran out, on a shopping list) → back.
    tick: (list, item) => w.patchItem(list, item, tickPatch(list, item)),
    untick: (list, item) => w.patchItem(list, item, { ...UNTICK_PATCH }),
    // Tick / untick outright (a widget's checkbox).
    setChecked: (list, item, checked) => w.patchItem(list, item, checked
      ? { checked: true, purchased_at: nowIso(), ran_out_at: null } : { ...UNTICK_PATCH }),
    async removeItem(list, item) {
      if (!item) return;
      if (isLocal(list)) deleteUnlockedItem(item.id);
      else { await localEntities.GroceryItem.delete(item.id); refresh("groceryItems"); }
      await forgetPictures([item.front_image, item.back_image]);
    },
    async clearRanOut(list, items = []) {
      for (const i of (items || []).filter((x) => x?.ran_out_at)) await w.removeItem(list, i);
    },
    // A flash card: an item with a back and optional pictures.
    async addCard(list, patch = {}) {
      if (!list) return null;
      if (isLocal(list)) {
        const made = createUnlockedItem(list.id, patch.name);
        if (made) updateUnlockedItem(made.id, { back: patch.back, front_image: patch.front_image, back_image: patch.back_image });
        return made;
      }
      const made = await localEntities.GroceryItem.create({ list_id: list.id, ...patch, checked: false, created_date: nowIso() });
      refresh("groceryItems");
      return made;
    },

    // ── Frequent items (each store keeps its own) ──
    async toggleFavorite(list, name, favorites = []) {
      const v = String(name || "").trim();
      if (!list || !v) return;
      const existing = (favorites || []).find((f) => norm(f.name) === norm(v));
      if (isLocal(list)) {
        if (existing) removeUnlockedFavorite(v); else addUnlockedFavorite(v);
        return;
      }
      if (existing) await localEntities.GroceryFavorite.delete(existing.id);
      else await localEntities.GroceryFavorite.create({ name: v });
      refresh("groceryFavorites");
    },
  };
  return w;
}

export function useNoteListWriters() {
  const qc = useQueryClient();
  return useMemo(() => noteListWriters(qc), [qc]);
}

// Frequent items for a list's store.
export function useListFavorites(list, { enabled = true } = {}) {
  const ready = enabled && isDbInitialized();
  const { data: idbFavorites = [] } = useQuery({
    queryKey: ["groceryFavorites"], queryFn: () => localEntities.GroceryFavorite.list("name").catch(() => []), enabled: ready,
  });
  const unlocked = useUnlockedStore();
  return useMemo(() => (isLocal(list) ? listUnlockedFavorites() : idbFavorites),
    [list, idbFavorites, unlocked]); // eslint-disable-line react-hooks/exhaustive-deps
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
