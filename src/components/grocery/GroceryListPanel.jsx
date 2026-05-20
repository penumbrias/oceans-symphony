import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { localEntities } from "@/api/base44Client";
import { Trash2, Plus, X, Check, Lock, Unlock, Star, Undo2 } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import { isEncryptionEnabled } from "@/lib/storageMode";
import { clearSession, verifyPassword } from "@/lib/localDb";
import useKeyboardInset from "@/hooks/useKeyboardInset";

const LOCK_PREF_KEY = "grocery_lock_on_close_v1";

// Privacy-cover overlay. When open, it sits on top of EVERYTHING in the app —
// including the bottom navigation bar — so a glance at the screen reveals
// nothing about Oceans Symphony. Works as both a real grocery list and a
// quick "panic-hide" surface.
//
// Open it via:
//   - the dashboard "Grocery list" button
//   - quick action `view_grocery_list`
//   - quick action `add_grocery_item`
//   - tapping the screen 3 times in a row (handled in AppLayout)
//
// State is broadcast through the global window event:
//   window.dispatchEvent(new CustomEvent("open-grocery-list", { detail: { focusInput: true } }))
//   window.dispatchEvent(new CustomEvent("close-grocery-list"))
//
// Lock-on-close (only meaningful when encryption is enabled): when toggled
// on via the lock icon in the header, closing this panel calls clearSession()
// and reloads, forcing the unlock screen on return. Lets the user use the
// grocery list as a one-tap "privatize this screen" gesture in unsafe
// environments.
//
// Frequent items: each item can be starred to remember it as a frequent
// purchase. Starred items that aren't currently in the active list appear as
// quick-add chips above the list — one tap re-adds them. Storage is a
// separate `GroceryFavorite` entity keyed by item name (case-insensitive).
export default function GroceryListPanel() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const inputRef = useRef(null);
  const [text, setText] = useState("");
  const keyboardInset = useKeyboardInset();
  const encryptionOn = isEncryptionEnabled();
  const [lockOnClose, setLockOnClose] = useState(() => {
    try { return localStorage.getItem(LOCK_PREF_KEY) === "true"; }
    catch { return false; }
  });
  // Password challenge for disabling lock-on-close. Without this, anyone
  // with brief access to the unlocked device could simply tap the lock
  // icon off and walk away with the privacy cover defused — defeating
  // the whole point of the toggle.
  const [unlockPromptOpen, setUnlockPromptOpen] = useState(false);
  const [unlockPwd, setUnlockPwd] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  // Touch-block right after open to prevent accidental check-offs when the
  // panel pops up under a moving finger (triple-tap trigger especially).
  const [interactBlocked, setInteractBlocked] = useState(false);
  useEffect(() => {
    if (!open) { setInteractBlocked(false); return; }
    setInteractBlocked(true);
    const t = setTimeout(() => setInteractBlocked(false), 300);
    return () => clearTimeout(t);
  }, [open]);

  const { data: items = [] } = useQuery({
    queryKey: ["groceryItems"],
    queryFn: () => localEntities.GroceryItem.list("created_date"),
  });

  const { data: favorites = [] } = useQuery({
    queryKey: ["groceryFavorites"],
    queryFn: () => localEntities.GroceryFavorite.list("name"),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["groceryItems"] });
  const refreshFavs = () => qc.invalidateQueries({ queryKey: ["groceryFavorites"] });

  const norm = (s) => (s || "").trim().toLowerCase();

  const isFavorite = (name) => {
    const n = norm(name);
    return favorites.some((f) => norm(f.name) === n);
  };

  const toggleFavorite = async (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    const existing = favorites.find((f) => norm(f.name) === norm(trimmed));
    if (existing) {
      await localEntities.GroceryFavorite.delete(existing.id);
    } else {
      await localEntities.GroceryFavorite.create({ name: trimmed });
    }
    refreshFavs();
  };

  const lockAndReloadIfArmed = () => {
    if (lockOnClose && encryptionOn) {
      try { clearSession(); } catch { /* ignore */ }
      // Reload back to the app entry; App.jsx will detect the locked DB and
      // route to the UnlockScreen.
      window.location.reload();
      return true;
    }
    return false;
  };

  useEffect(() => {
    const onOpen = (e) => {
      setOpen(true);
      if (e?.detail?.focusInput) {
        // Defer until the panel renders.
        setTimeout(() => inputRef.current?.focus(), 80);
      }
    };
    const onClose = () => {
      // External close event (e.g. quick action) — respect lock-on-close too.
      if (lockAndReloadIfArmed()) return;
      setOpen(false);
    };
    window.addEventListener("open-grocery-list", onOpen);
    window.addEventListener("close-grocery-list", onClose);
    return () => {
      window.removeEventListener("open-grocery-list", onOpen);
      window.removeEventListener("close-grocery-list", onClose);
    };
    // Re-bind so the close handler closes over current lockOnClose state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockOnClose, encryptionOn]);

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
    // Enabling: no challenge — only ratchets security upward.
    // Disabling while encryption is on: prove the user knows the password
    // before letting them defuse the privacy cover.
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
      if (!ok) {
        setUnlockError("Incorrect password.");
        return;
      }
      setUnlockPromptOpen(false);
      setUnlockPwd("");
      applyLockOnClose(false);
    } finally {
      setUnlockBusy(false);
    }
  };

  const addItem = async (rawName) => {
    const name = (rawName ?? text).trim();
    if (!name) return;
    // De-dupe against unchecked items — tapping a quick-add chip for
    // something already on the list shouldn't create a second row.
    const dup = items.some((i) => !i.checked && norm(i.name) === norm(name));
    if (dup) {
      if (rawName === undefined) setText("");
      return;
    }
    await localEntities.GroceryItem.create({
      name,
      checked: false,
      created_date: new Date().toISOString(),
    });
    if (rawName === undefined) setText("");
    refresh();
  };

  // Three-state lifecycle:
  //   to_buy   — !checked
  //   in_stock — checked + purchased_at set + !ran_out_at
  //   ran_out  — checked + purchased_at set + ran_out_at set
  // Backwards compat: legacy rows with checked=true and no
  // purchased_at are treated as in_stock and grouped under
  // created_date so a user's history of already-bought items
  // doesn't vanish when this feature ships.
  const getState = (item) => {
    if (!item.checked) return "to_buy";
    if (item.ran_out_at) return "ran_out";
    return "in_stock";
  };

  const toggle = async (item) => {
    const state = getState(item);
    const nowISO = new Date().toISOString();
    if (state === "to_buy") {
      await localEntities.GroceryItem.update(item.id, {
        checked: true,
        purchased_at: nowISO,
        ran_out_at: null,
      });
    } else if (state === "in_stock") {
      await localEntities.GroceryItem.update(item.id, { ran_out_at: nowISO });
    } else {
      // ran_out → in_stock (undo ran-out via tapping the red X)
      await localEntities.GroceryItem.update(item.id, { ran_out_at: null });
    }
    refresh();
  };

  const remove = async (id) => {
    await localEntities.GroceryItem.delete(id);
    refresh();
  };

  // Restore a ran-out item back to the To buy list — clears the
  // lifecycle timestamps so it shows up fresh at the top, ready to
  // be re-purchased.
  const restoreToBuy = async (item) => {
    await localEntities.GroceryItem.update(item.id, {
      checked: false,
      purchased_at: null,
      ran_out_at: null,
    });
    refresh();
  };

  // Bulk-clear: only nukes ran-out items so the in-stock history
  // stays intact. Two-tap confirm so an accidental tap doesn't wipe
  // the pile.
  const [clearArmed, setClearArmed] = useState(false);
  const clearRanOut = async () => {
    if (!clearArmed) {
      setClearArmed(true);
      setTimeout(() => setClearArmed(false), 4000);
      return;
    }
    setClearArmed(false);
    const toClear = items.filter((i) => i.ran_out_at);
    for (const i of toClear) await localEntities.GroceryItem.delete(i.id);
    refresh();
  };

  if (!open) return null;

  // Build the rendered structure: a flat "To buy" list, then date
  // groups (newest first) each containing in-stock rows followed by
  // ran-out rows.
  const toBuyItems = items.filter((i) => getState(i) === "to_buy");
  const purchasedItems = items.filter((i) => getState(i) !== "to_buy");
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
  const hasRanOut = items.some((i) => i.ran_out_at);

  // Quick-add chips: favorites not currently on the active (unchecked) list.
  const activeNames = new Set(items.filter((i) => !i.checked).map((i) => norm(i.name)));
  const availableFavs = favorites.filter((f) => !activeNames.has(norm(f.name)));

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[9999] bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 flex flex-col"
      style={{
        touchAction: "manipulation",
        paddingTop: "env(safe-area-inset-top)",
        // Keep the panel pinned to the visible viewport so the list stays
        // anchored when the keyboard opens; only the input slides up with the
        // keyboard, the list above it stays at full height instead of the
        // whole page scrolling.
        bottom: keyboardInset > 0 ? `${keyboardInset}px` : 0,
        paddingBottom: keyboardInset > 0 ? 0 : "env(safe-area-inset-bottom)",
      }}
    >
      {interactBlocked && <div aria-hidden className="absolute inset-0 z-[10000]" />}
      {/* Header — intentionally generic so the screen reads as a grocery app. */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🛒</span>
          <h1 className="text-lg font-semibold tracking-tight">Grocery list</h1>
        </div>
        <div className="flex items-center gap-1">
          {encryptionOn && (
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

      {/* Quick-add chips for favourited items not currently on the active list */}
      {availableFavs.length > 0 && (
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
        {isEmpty ? (
          <p className="text-sm text-neutral-500 italic mt-12 text-center">
            Nothing on the list yet. Add an item below.
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

      {/* Add input — fixed at the bottom, replaces what would be the app nav. */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
            placeholder="Add an item…"
            className="flex-1 px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <button
            onClick={() => addItem()}
            aria-label="Add"
            className="w-11 h-11 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Password challenge for disabling lock-on-close. Disguised as a
          generic "confirm change" prompt so a glance at the screen still
          reads as a grocery app. */}
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
            {unlockError && (
              <p className="text-xs text-red-500">{unlockError}</p>
            )}
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

// Row in any of the three lifecycle states. The checkbox cycles
// to_buy → in_stock → ran_out (and ran_out → in_stock to undo via
// the same control). Ran-out rows surface persistent Restore /
// Remove buttons since hover-gating is invisible on touch and the
// user explicitly asked for an always-visible affordance to either
// re-add the item to the shopping list or clear it.
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
      {ranOut && (
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
      )}
      {!ranOut && (
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
