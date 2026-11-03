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
import { localEntities } from "@/api/base44Client";
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
      if (list.source === "local") updateUnlockedList(list.id, { note_content: content });
      else { await localEntities.GroceryList.update(list.id, { note_content: content }); refresh(); }
    },
    // Tick / untick an item the way the lists panel's two-state lists do.
    async setChecked(list, item, checked) {
      const patch = checked
        ? { checked: true, purchased_at: new Date().toISOString(), ran_out_at: null }
        : { checked: false, purchased_at: null, ran_out_at: null };
      if (list.source === "local") updateUnlockedItem(item.id, patch);
      else { await localEntities.GroceryItem.update(item.id, patch); refresh(); }
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

// Where the lists panel opens to a given list.
export const ACTIVE_LIST_KEY = "grocery_active_list_v1";
export function openListInPanel(listId) {
  try { if (listId) localStorage.setItem(ACTIVE_LIST_KEY, listId); } catch { /* storage off */ }
  window.dispatchEvent(new CustomEvent("open-grocery-list", { detail: { listId } }));
}
