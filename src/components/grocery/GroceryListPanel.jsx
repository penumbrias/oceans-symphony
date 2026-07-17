import React, { useEffect, useMemo, useRef, useState } from "react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { localEntities } from "@/api/base44Client";
import { Trash2, Plus, X, Check, Lock, Unlock, Star, Undo2, ChevronDown, Pencil } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import { isEncryptionEnabled } from "@/lib/storageMode";
import { clearSession, verifyPassword, isDbInitialized } from "@/lib/localDb";
import useKeyboardInset from "@/hooks/useKeyboardInset";
import GroceryPanicTapsSettings from "@/components/settings/GroceryPanicTapsSettings";
import {
  listUnlockedLists,
  createUnlockedList,
  renameUnlockedList,
  deleteUnlockedList,
  listItemsForUnlockedList,
  createUnlockedItem,
  updateUnlockedItem,
  deleteUnlockedItem,
  listUnlockedFavorites,
  addUnlockedFavorite,
  removeUnlockedFavorite,
} from "@/lib/localUnlockedGrocery";

const LOCK_PREF_KEY = "grocery_lock_on_close_v1";
const ACTIVE_LIST_KEY = "grocery_active_list_v1";
// One-shot flag — the first time the panel opens via the triple-tap panic
// gesture we show a "What's this?" explainer so a surprised user understands
// the cover (and can re-tune the gesture).
const PANIC_EXPLAINED_KEY = "grocery_panic_explained_v1";

// Privacy-cover overlay + multi-list grocery store. When open, it sits
// on top of EVERYTHING in the app — including the bottom navigation
// bar — so a glance at the screen reveals nothing about Oceans
// Symphony. Works as both a real grocery list and a quick "panic-hide"
// surface.
//
// Open it via:
//   - the dashboard "Grocery list" button
//   - quick action `view_grocery_list`
//   - quick action `add_grocery_item`
//   - tapping the screen 3 times in a row (handled in AppLayout)
//   - "Open grocery list" link on the Unlock screen (lockedMode)
//
// State is broadcast through the global window event:
//   window.dispatchEvent(new CustomEvent("open-grocery-list", { detail: { focusInput: true, lockedMode: true } }))
//   window.dispatchEvent(new CustomEvent("close-grocery-list"))
//
// Multi-list model. Two stores side-by-side:
//   - `localEntities.GroceryList` + `GroceryItem` for lists that
//     should be encrypted with the rest of the app's data.
//   - `localUnlockedGrocery.js` (plaintext localStorage) for lists
//     that the user has explicitly marked "Available when locked".
//     Those lists stay accessible even when the IDB is encrypted /
//     not yet unlocked, which is the whole point of being able to
//     open the panel from the Unlock screen.
//
// `lockedMode` (passed when mounted alongside the UnlockScreen):
// hides encrypted lists entirely, so the panel can only see the
// unlocked-flagged ones. Items on encrypted lists are unreadable in
// that mode by design.
//
// Lock-on-close (only meaningful when encryption is enabled): when
// toggled on via the lock icon in the header, closing this panel
// calls clearSession() and reloads, forcing the unlock screen on
// return. Lets the user use the grocery list as a one-tap "privatize
// this screen" gesture in unsafe environments.
//
// Frequent items: each item can be starred to remember it as a
// frequent purchase. Starred items that aren't currently in the
// active list appear as quick-add chips above the list — one tap
// re-adds them. Favourites are scoped per-store (so unlocked-list
// favourites don't bleed across into the encrypted store and vice
// versa).
export default function GroceryListPanel({ lockedMode = false }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const inputRef = useRef(null);
  const [text, setText] = useState("");
  const keyboardInset = useKeyboardInset();
  const encryptionOn = isEncryptionEnabled();
  const dbReady = isDbInitialized();

  const [lockOnClose, setLockOnClose] = useState(() => {
    try { return localStorage.getItem(LOCK_PREF_KEY) === "true"; }
    catch { return false; }
  });
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [unlockPromptOpen, setUnlockPromptOpen] = useState(false);
  const [unlockPwd, setUnlockPwd] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [interactBlocked, setInteractBlocked] = useState(false);

  // Multi-list state. activeListId is persisted to localStorage so
  // closing and re-opening returns to the same list.
  const [activeListId, setActiveListIdState] = useState(() => {
    try { return localStorage.getItem(ACTIVE_LIST_KEY); }
    catch { return null; }
  });
  const setActiveListId = (id) => {
    setActiveListIdState(id);
    try {
      if (id) localStorage.setItem(ACTIVE_LIST_KEY, id);
    } catch { /* non-fatal */ }
  };

  // List switcher overlay state.
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [createListOpen, setCreateListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListUnlocked, setNewListUnlocked] = useState(false);
  const [editingList, setEditingList] = useState(null); // { id, name, source, unlocked }
  const [editingListName, setEditingListName] = useState("");

  useEffect(() => {
    if (!open) { setInteractBlocked(false); return; }
    setInteractBlocked(true);
    const t = setTimeout(() => setInteractBlocked(false), 300);
    return () => clearTimeout(t);
  }, [open]);

  // ── Encrypted-store queries. Skip when the IDB isn't initialised
  // (i.e. when this panel is mounted alongside the UnlockScreen)
  // — those reads would throw before initLocalDb succeeds.
  const idbAvailable = dbReady && !lockedMode;

  const { data: idbLists = [] } = useQuery({
    queryKey: ["groceryLists"],
    queryFn: () => localEntities.GroceryList.list(),
    enabled: idbAvailable,
  });
  const { data: idbItems = [] } = useQuery({
    queryKey: ["groceryItems"],
    queryFn: () => localEntities.GroceryItem.list("created_date"),
    enabled: idbAvailable,
  });
  const { data: idbFavorites = [] } = useQuery({
    queryKey: ["groceryFavorites"],
    queryFn: () => localEntities.GroceryFavorite.list("name"),
    enabled: idbAvailable,
  });

  // ── Unlocked-store snapshot. Subscribe to changes so updates
  // (including from another panel instance) refresh this one.
  const [unlockedNonce, setUnlockedNonce] = useState(0);
  useEffect(() => {
    const handler = () => setUnlockedNonce((n) => n + 1);
    window.addEventListener("grocery-unlocked-store-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("grocery-unlocked-store-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const unlockedLists = useMemo(() => listUnlockedLists(), [unlockedNonce]);

  // ── Combined list catalogue.
  const allLists = useMemo(() => {
    const idb = idbAvailable
      ? idbLists.map((l) => ({ ...l, source: "idb", unlocked: false }))
      : [];
    const local = unlockedLists.map((l) => ({ ...l, source: "local", unlocked: true }));
    return [...idb, ...local];
  }, [idbLists, unlockedLists, idbAvailable]);

  // ── Auto-create a default list on first open so the user always
  // has somewhere to add items. The new record gets backfilled to
  // every existing GroceryItem that lacks a list_id (one-shot,
  // idempotent) so legacy data ends up in the visible list rather
  // than orphaned.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (!open || lockedMode || !idbAvailable) return;
    if (bootstrappedRef.current) return;
    if (idbLists.length > 0 || unlockedLists.length > 0) {
      bootstrappedRef.current = true;
      return;
    }
    bootstrappedRef.current = true;
    (async () => {
      try {
        const created = await localEntities.GroceryList.create({
          name: "Grocery list",
          created_date: new Date().toISOString(),
        });
        const orphans = idbItems.filter((i) => !i.list_id);
        for (const item of orphans) {
          await localEntities.GroceryItem.update(item.id, { list_id: created.id });
        }
        qc.invalidateQueries({ queryKey: ["groceryLists"] });
        qc.invalidateQueries({ queryKey: ["groceryItems"] });
        setActiveListId(created.id);
      } catch (err) {
        toast.error(err?.message || "Couldn't create the default list");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockedMode, idbAvailable, idbLists.length, unlockedLists.length, idbItems]);

  // Also backfill orphan items if a default list already exists.
  // Items created before multi-list shipped would otherwise be
  // invisible.
  useEffect(() => {
    if (!idbAvailable || idbLists.length === 0) return;
    const defaultListId = idbLists[0].id;
    const orphans = idbItems.filter((i) => !i.list_id);
    if (orphans.length === 0) return;
    (async () => {
      for (const item of orphans) {
        try { await localEntities.GroceryItem.update(item.id, { list_id: defaultListId }); }
        catch { /* non-fatal */ }
      }
      qc.invalidateQueries({ queryKey: ["groceryItems"] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idbAvailable, idbLists, idbItems]);

  // ── Resolve the active list. Fall back to the first visible one.
  const activeList = useMemo(() => {
    if (allLists.length === 0) return null;
    const match = allLists.find((l) => l.id === activeListId);
    return match || allLists[0];
  }, [allLists, activeListId]);

  // ── Items + favourites for the active list, routed through the
  // matching backing store.
  const activeItems = useMemo(() => {
    if (!activeList) return [];
    if (activeList.source === "local") return listItemsForUnlockedList(activeList.id);
    return idbItems.filter((i) => i.list_id === activeList.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList, idbItems, unlockedNonce]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const localFavorites = useMemo(() => listUnlockedFavorites(), [unlockedNonce]);
  const activeFavorites = activeList?.source === "local" ? localFavorites : idbFavorites;

  const norm = (s) => (s || "").trim().toLowerCase();
  const isFavorite = (name) => activeFavorites.some((f) => norm(f.name) === norm(name));

  const toggleFavorite = async (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    if (!activeList) return;
    if (activeList.source === "local") {
      if (isFavorite(trimmed)) removeUnlockedFavorite(trimmed);
      else addUnlockedFavorite(trimmed);
    } else {
      const existing = activeFavorites.find((f) => norm(f.name) === norm(trimmed));
      if (existing) await localEntities.GroceryFavorite.delete(existing.id);
      else await localEntities.GroceryFavorite.create({ name: trimmed });
      qc.invalidateQueries({ queryKey: ["groceryFavorites"] });
    }
  };

  const lockAndReloadIfArmed = () => {
    if (lockOnClose && encryptionOn && !lockedMode) {
      try { clearSession(); } catch { /* ignore */ }
      window.location.reload();
      return true;
    }
    return false;
  };

  useEffect(() => {
    const onOpen = (e) => {
      // lockedMode-flagged mount only listens for lockedMode opens
      // (so the post-unlock instance isn't accidentally activated
      // by a pre-unlock event, and vice versa).
      if (!!e?.detail?.lockedMode !== lockedMode) return;
      setOpen(true);
      // First-ever panic-gesture open → surface the explainer.
      if (e?.detail?.source === "panic") {
        let explained = false;
        try { explained = localStorage.getItem(PANIC_EXPLAINED_KEY) === "1"; } catch { /* ignore */ }
        if (!explained) setExplainerOpen(true);
      }
      if (e?.detail?.focusInput) setTimeout(() => inputRef.current?.focus(), 80);
    };
    const onClose = () => {
      if (lockAndReloadIfArmed()) return;
      setOpen(false);
    };
    window.addEventListener("open-grocery-list", onOpen);
    window.addEventListener("close-grocery-list", onClose);
    return () => {
      window.removeEventListener("open-grocery-list", onOpen);
      window.removeEventListener("close-grocery-list", onClose);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockOnClose, encryptionOn, lockedMode]);

  const handleCloseClick = () => {
    if (lockAndReloadIfArmed()) return;
    setOpen(false);
  };

  const applyLockOnClose = (next) => {
    setLockOnClose(next);
    try { localStorage.setItem(LOCK_PREF_KEY, next ? "true" : "false"); } catch { /* ignore */ }
    toast.success(next
      ? "Lock-on-close enabled — closing this list will require your password."
      : "Lock-on-close disabled.");
  };

  const toggleLockOnClose = () => {
    if (!lockOnClose) { applyLockOnClose(true); return; }
    if (!encryptionOn) { applyLockOnClose(false); return; }
    setUnlockPwd("");
    setUnlockError("");
    setUnlockPromptOpen(true);
  };

  const confirmDisableLockOnClose = async () => {
    if (!unlockPwd || unlockBusy) return;
    setUnlockBusy(true);
    setUnlockError("");
    try {
      const ok = await verifyPassword(unlockPwd);
      if (!ok) { setUnlockError("Incorrect password."); return; }
      setUnlockPromptOpen(false);
      setUnlockPwd("");
      applyLockOnClose(false);
    } finally {
      setUnlockBusy(false);
    }
  };

  // ── Item operations. Route by the active list's source.
  const addItem = async (rawName) => {
    const name = (rawName ?? text).trim();
    if (!name || !activeList) return;
    const dup = activeItems.some((i) => !i.checked && norm(i.name) === norm(name));
    if (dup) {
      if (rawName === undefined) setText("");
      return;
    }
    if (activeList.source === "local") {
      createUnlockedItem(activeList.id, name);
    } else {
      await localEntities.GroceryItem.create({
        list_id: activeList.id,
        name,
        checked: false,
        created_date: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ["groceryItems"] });
    }
    if (rawName === undefined) setText("");
  };

  const getState = (item) => {
    if (!item.checked) return "to_buy";
    if (item.ran_out_at) return "ran_out";
    return "in_stock";
  };

  const patchItem = async (item, patch) => {
    if (activeList?.source === "local") {
      updateUnlockedItem(item.id, patch);
    } else {
      await localEntities.GroceryItem.update(item.id, patch);
      qc.invalidateQueries({ queryKey: ["groceryItems"] });
    }
  };

  const toggle = async (item) => {
    const state = getState(item);
    const nowISO = new Date().toISOString();
    if (state === "to_buy") {
      await patchItem(item, { checked: true, purchased_at: nowISO, ran_out_at: null });
    } else if (state === "in_stock") {
      await patchItem(item, { ran_out_at: nowISO });
    } else {
      await patchItem(item, { ran_out_at: null });
    }
  };

  const remove = async (id) => {
    if (activeList?.source === "local") {
      deleteUnlockedItem(id);
    } else {
      await localEntities.GroceryItem.delete(id);
      qc.invalidateQueries({ queryKey: ["groceryItems"] });
    }
  };

  const restoreToBuy = async (item) => {
    await patchItem(item, { checked: false, purchased_at: null, ran_out_at: null });
  };

  const [clearArmed, setClearArmed] = useState(false);
  const clearRanOut = async () => {
    if (!clearArmed) {
      setClearArmed(true);
      setTimeout(() => setClearArmed(false), 4000);
      return;
    }
    setClearArmed(false);
    const toClear = activeItems.filter((i) => i.ran_out_at);
    for (const i of toClear) await remove(i.id);
  };

  // ── List CRUD.
  const handleCreateList = async () => {
    const name = newListName.trim();
    if (!name) return;
    let created;
    if (newListUnlocked) {
      created = createUnlockedList(name);
    } else {
      created = await localEntities.GroceryList.create({
        name,
        created_date: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ["groceryLists"] });
    }
    if (created) {
      setActiveListId(created.id);
      toast.success(newListUnlocked
        ? `Created "${name}" — available even when the app is locked.`
        : `Created "${name}".`);
    }
    setNewListName("");
    setNewListUnlocked(false);
    setCreateListOpen(false);
  };

  const handleRenameList = async () => {
    const next = editingListName.trim();
    if (!editingList || !next) return;
    if (editingList.source === "local") {
      renameUnlockedList(editingList.id, next);
    } else {
      await localEntities.GroceryList.update(editingList.id, { name: next });
      qc.invalidateQueries({ queryKey: ["groceryLists"] });
    }
    setEditingList(null);
    setEditingListName("");
  };

  const handleDeleteList = async (list) => {
    const itemCount = list.source === "local"
      ? listItemsForUnlockedList(list.id).length
      : idbItems.filter((i) => i.list_id === list.id).length;
    const confirmText = itemCount > 0
      ? `Delete "${list.name}" and its ${itemCount} item${itemCount === 1 ? "" : "s"}? This cannot be undone.`
      : `Delete "${list.name}"? This cannot be undone.`;
    if (!(await confirm(confirmText))) return;
    if (list.source === "local") {
      deleteUnlockedList(list.id);
    } else {
      for (const item of idbItems.filter((i) => i.list_id === list.id)) {
        try { await localEntities.GroceryItem.delete(item.id); } catch { /* non-fatal */ }
      }
      await localEntities.GroceryList.delete(list.id);
      qc.invalidateQueries({ queryKey: ["groceryLists"] });
      qc.invalidateQueries({ queryKey: ["groceryItems"] });
    }
    if (activeListId === list.id) setActiveListId(null);
    setEditingList(null);
  };

  if (!open) return null;

  // ── Build rendered structure.
  const toBuyItems = activeItems.filter((i) => getState(i) === "to_buy");
  const purchasedItems = activeItems.filter((i) => getState(i) !== "to_buy");
  const dateGroupsMap = new Map();
  for (const item of purchasedItems) {
    const ref = item.purchased_at || item.created_date || new Date().toISOString();
    let d;
    try { d = new Date(ref); } catch { d = new Date(); }
    if (Number.isNaN(d.getTime())) d = new Date();
    const key = format(d, "yyyy-MM-dd");
    if (!dateGroupsMap.has(key)) dateGroupsMap.set(key, { key, date: d, items: [] });
    dateGroupsMap.get(key).items.push(item);
  }
  const dateGroups = [...dateGroupsMap.values()]
    .sort((a, b) => b.date - a.date)
    .map((g) => ({
      ...g,
      items: [
        ...g.items.filter((i) => getState(i) === "in_stock"),
        ...g.items.filter((i) => getState(i) === "ran_out"),
      ],
    }));

  const headerLabel = (d) => {
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "EEE, MMM d");
  };

  const isEmpty = toBuyItems.length === 0 && dateGroups.length === 0;
  const hasRanOut = activeItems.some((i) => i.ran_out_at);

  const activeNames = new Set(activeItems.filter((i) => !i.checked).map((i) => norm(i.name)));
  const availableFavs = activeFavorites.filter((f) => !activeNames.has(norm(f.name)));

  const noListsAtAll = allLists.length === 0;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[9999] bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 flex flex-col"
      style={{
        touchAction: "manipulation",
        paddingTop: "env(safe-area-inset-top)",
        bottom: keyboardInset > 0 ? `${keyboardInset}px` : 0,
        paddingBottom: keyboardInset > 0 ? 0 : "env(safe-area-inset-bottom)",
      }}
    >
      {interactBlocked && <div aria-hidden className="absolute inset-0 z-[10000]" />}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => setSwitcherOpen((v) => !v)}
          className="flex items-center gap-2 -ml-1 px-1 py-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors max-w-[70%]"
          aria-haspopup="menu"
          aria-expanded={switcherOpen}
        >
          <span className="text-2xl">🛒</span>
          <h1 className="text-lg font-semibold tracking-tight truncate">
            {activeList?.name || "Grocery list"}
          </h1>
          {activeList?.unlocked && (
            <Unlock className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" aria-label="Available when locked" />
          )}
          <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform ${switcherOpen ? "rotate-180" : ""}`} />
        </button>
        <div className="flex items-center gap-1">
          {encryptionOn && !lockedMode && (
            <button
              onClick={toggleLockOnClose}
              aria-label={lockOnClose ? "Disable lock on close" : "Enable lock on close"}
              title={lockOnClose
                ? "Lock-on-close is ON — closing this list will require your password"
                : "Lock-on-close is OFF — tap to require your password when closing this list"}
              className={`p-2 rounded-md transition-colors ${
                lockOnClose
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {lockOnClose ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
            </button>
          )}
          <button
            onClick={handleCloseClick}
            aria-label="Close"
            className="p-2 -mr-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* List switcher overlay */}
      {switcherOpen && (
        <div className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 max-h-[60vh] overflow-y-auto">
          <ul className="py-1">
            {allLists.map((list) => {
              const isActive = activeList?.id === list.id;
              return (
                <li key={`${list.source}-${list.id}`} className="flex items-center gap-2 px-3 py-2 group hover:bg-neutral-100 dark:hover:bg-neutral-900">
                  <button
                    type="button"
                    onClick={() => { setActiveListId(list.id); setSwitcherOpen(false); }}
                    className="flex-1 text-left flex items-center gap-2 min-w-0"
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${isActive ? "bg-emerald-500 border-emerald-500" : "border-neutral-300 dark:border-neutral-700"}`} />
                    <span className="truncate text-sm">{list.name}</span>
                    {list.unlocked && (
                      <Unlock className="w-3 h-3 text-emerald-500 flex-shrink-0" aria-label="Available when locked" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingList(list); setEditingListName(list.name); }}
                    aria-label={`Rename ${list.name}`}
                    className="p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteList(list)}
                    aria-label={`Delete ${list.name}`}
                    className="p-1 text-neutral-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
            {allLists.length === 0 && (
              <li className="px-3 py-3 text-sm text-neutral-500 italic">
                {lockedMode
                  ? "No always-unlocked lists yet. Create one below."
                  : "No lists yet. Create one to get started."}
              </li>
            )}
          </ul>
          <div className="border-t border-neutral-200 dark:border-neutral-800 p-2">
            <button
              type="button"
              onClick={() => {
                // Open the modal FIRST (it sits at z-[10001] over the
                // switcher), then close the switcher on the next
                // frame. Closing both in the same render causes a
                // visible "flash" — the switcher dropdown is a
                // flow-layout block that, when unmounted, lets the
                // grocery items below jump up before the modal
                // overlay paints over them.
                setNewListUnlocked(lockedMode);
                setCreateListOpen(true);
                requestAnimationFrame(() => setSwitcherOpen(false));
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
            >
              <Plus className="w-4 h-4" /> New list…
            </button>
          </div>
        </div>
      )}

      {/* Quick-add chips */}
      {!switcherOpen && availableFavs.length > 0 && activeList && (
        <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/60">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1.5">Frequent items</p>
          <div className="flex flex-wrap gap-1.5">
            {availableFavs.map((f) => (
              <button
                key={f.id}
                onClick={() => addItem(f.name)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs"
              >
                <Plus className="w-3 h-3" />
                <span>{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {noListsAtAll && lockedMode ? (
          <p className="text-sm text-neutral-500 italic mt-12 text-center px-6">
            No always-unlocked lists yet. Unlock the app for access to your other lists, or create a new always-unlocked list above.
          </p>
        ) : !activeList ? (
          <p className="text-sm text-neutral-500 italic mt-12 text-center">Loading…</p>
        ) : isEmpty ? (
          <p className="text-sm text-neutral-500 italic mt-12 text-center">
            Nothing on this list yet. Add an item below.
          </p>
        ) : (
          <>
            {toBuyItems.length > 0 && (
              <ul className="space-y-1">
                {toBuyItems.map((item) => (
                  <GroceryRow
                    key={item.id}
                    item={item}
                    state={getState(item)}
                    isFavorite={isFavorite(item.name)}
                    onToggle={() => toggle(item)}
                    onToggleFavorite={() => toggleFavorite(item.name)}
                    onRemove={() => remove(item.id)}
                    onRestore={() => restoreToBuy(item)}
                  />
                ))}
              </ul>
            )}

            {dateGroups.map((group) => (
              <section key={group.key} className="mt-4 first:mt-0">
                <h2 className="text-[11px] uppercase tracking-wide text-neutral-500 px-1 mb-1">
                  {headerLabel(group.date)} · purchased
                </h2>
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <GroceryRow
                      key={item.id}
                      item={item}
                      state={getState(item)}
                      isFavorite={isFavorite(item.name)}
                      onToggle={() => toggle(item)}
                      onToggleFavorite={() => toggleFavorite(item.name)}
                      onRemove={() => remove(item.id)}
                      onRestore={() => restoreToBuy(item)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}

        {hasRanOut && (
          <button
            onClick={clearRanOut}
            className={`mt-4 mx-auto block text-xs underline underline-offset-2 transition-colors ${
              clearArmed
                ? "text-red-500 font-semibold"
                : "text-neutral-500 hover:text-red-500"
            }`}
          >
            {clearArmed ? "Tap again to clear" : "Clear all ran-out items"}
          </button>
        )}
      </div>

      {/* Add input */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
            placeholder={activeList ? `Add to ${activeList.name}…` : "Add an item…"}
            disabled={!activeList}
            className="flex-1 px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
          />
          <button
            onClick={() => addItem()}
            aria-label="Add"
            disabled={!activeList}
            className="w-11 h-11 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* First-time panic-gesture explainer */}
      {explainerOpen && (
        <div className="absolute inset-0 z-[10002] flex items-center justify-center bg-black/50 px-5">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-2xl space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <span className="text-xl">🛒</span> What's this?
              </h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                You just opened the <strong>Grocery List</strong> — a quick-access <strong>privacy screen</strong>. Tapping the screen a few times in a row covers Oceans Symphony with a real-looking grocery list, so a glance reveals nothing about your system.
              </p>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                It's also a fully <strong>functioning inventory tracker</strong> — add items, mark what you've bought, star frequent buys, and keep multiple lists. Nothing here is fake.
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
              <GroceryPanicTapsSettings />
            </div>
            <button
              type="button"
              onClick={() => {
                try { localStorage.setItem(PANIC_EXPLAINED_KEY, "1"); } catch { /* ignore */ }
                setExplainerOpen(false);
              }}
              className="w-full px-3 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* New-list dialog */}
      {createListOpen && (
        <div className="absolute inset-0 z-[10001] flex items-center justify-center bg-black/40 px-6 animate-in fade-in duration-150">
          <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150">
            <h2 className="text-base font-semibold">New list</h2>
            <input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateList(); }}
              placeholder="Wish list, hardware, anywhere…"
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newListUnlocked}
                onChange={(e) => setNewListUnlocked(e.target.checked)}
                disabled={lockedMode}
                className="w-4 h-4 mt-0.5 accent-emerald-500"
              />
              <span>
                <span className="block font-medium">Available when the app is locked</span>
                <span className="text-xs text-neutral-500">
                  Stored unencrypted so this list is accessible from the unlock screen too. Don't enable this for anything sensitive.
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { setCreateListOpen(false); setNewListName(""); setNewListUnlocked(false); }}
                className="px-3 py-1.5 text-sm rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateList}
                disabled={!newListName.trim()}
                className="px-3 py-1.5 text-sm rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename-list dialog */}
      {editingList && (
        <div className="absolute inset-0 z-[10001] flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-2xl space-y-3">
            <h2 className="text-base font-semibold">Rename list</h2>
            <input
              value={editingListName}
              onChange={(e) => setEditingListName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRenameList(); }}
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <p className="text-xs text-neutral-500">
              {editingList.unlocked
                ? "This list is available even when the app is locked."
                : "This list is encrypted with the rest of your data."}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { setEditingList(null); setEditingListName(""); }}
                className="px-3 py-1.5 text-sm rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameList}
                disabled={!editingListName.trim()}
                className="px-3 py-1.5 text-sm rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password challenge for disabling lock-on-close. */}
      {unlockPromptOpen && (
        <div className="absolute inset-0 z-[10001] flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-2xl space-y-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Confirm change</h2>
              <p className="text-xs text-neutral-500">
                Enter your password to turn off lock-on-close.
              </p>
            </div>
            <input
              type="password"
              value={unlockPwd}
              onChange={(e) => { setUnlockPwd(e.target.value); setUnlockError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") confirmDisableLockOnClose(); }}
              placeholder="Password"
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            {unlockError && <p className="text-xs text-red-500">{unlockError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { setUnlockPromptOpen(false); setUnlockPwd(""); setUnlockError(""); }}
                className="px-3 py-1.5 text-sm rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmDisableLockOnClose}
                disabled={!unlockPwd || unlockBusy}
                className="px-3 py-1.5 text-sm rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
              >
                {unlockBusy ? "Checking…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroceryRow({ item, state, isFavorite, onToggle, onToggleFavorite, onRemove, onRestore }) {
  const inStock = state === "in_stock";
  const ranOut = state === "ran_out";
  const toBuy = state === "to_buy";
  return (
    <li className="flex items-center gap-3 py-2 px-1 group">
      <button
        onClick={onToggle}
        aria-label={
          toBuy ? "Mark as purchased"
            : inStock ? "Mark as ran out"
              : "Undo ran out"
        }
        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          inStock
            ? "bg-emerald-500 border-emerald-500"
            : ranOut
              ? "bg-red-500 border-red-500"
              : "border-neutral-300 dark:border-neutral-700 hover:border-emerald-500"
        }`}
      >
        {inStock && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
        {ranOut && <X className="w-4 h-4 text-white" strokeWidth={3} />}
      </button>
      <span
        onClick={onToggle}
        className={`flex-1 text-base cursor-pointer ${
          ranOut
            ? "line-through text-neutral-500 dark:text-neutral-400"
            : inStock
              ? "line-through text-neutral-400 dark:text-neutral-500"
              : "text-neutral-900 dark:text-neutral-100"
        }`}
      >
        {item.name}
      </span>
      {ranOut ? (
        <>
          <button
            onClick={onRestore}
            aria-label="Restore to shopping list"
            title="Restore to shopping list"
            className="p-1 text-neutral-400 hover:text-emerald-500"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRemove}
            aria-label="Remove permanently"
            title="Remove permanently"
            className="p-1 text-neutral-400 hover:text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onToggleFavorite}
            aria-label={isFavorite ? "Remove from frequent items" : "Save as a frequent item"}
            title={isFavorite ? "Frequent item — tap to forget" : "Save as a frequent item to re-add later"}
            className={`p-1 transition-colors ${
              isFavorite
                ? "text-amber-500 hover:text-amber-600"
                : "text-neutral-400 hover:text-amber-500 opacity-0 group-hover:opacity-100"
            }`}
          >
            <Star className={`w-4 h-4 ${isFavorite ? "fill-current" : ""}`} />
          </button>
          <button
            onClick={onRemove}
            aria-label="Remove"
            className="p-1 text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </li>
  );
}
