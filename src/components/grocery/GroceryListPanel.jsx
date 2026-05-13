import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { localEntities } from "@/api/base44Client";
import { Trash2, Plus, X, Check, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { isEncryptionEnabled } from "@/lib/storageMode";
import { clearSession } from "@/lib/localDb";
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

  const { data: items = [] } = useQuery({
    queryKey: ["groceryItems"],
    queryFn: () => localEntities.GroceryItem.list("created_date"),
  });

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
    // lockOnClose intentionally not in deps — we re-read it from state inside
    // the handler via the closure-fresh `lockAndReloadIfArmed`. Re-binding
    // listeners every keystroke would churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockOnClose, encryptionOn]);

  const handleCloseClick = () => {
    if (lockAndReloadIfArmed()) return;
    setOpen(false);
  };

  const toggleLockOnClose = () => {
    const next = !lockOnClose;
    setLockOnClose(next);
    try { localStorage.setItem(LOCK_PREF_KEY, next ? "true" : "false"); } catch { /* ignore */ }
    toast.success(next
      ? "Lock-on-close enabled — closing this list will require your password."
      : "Lock-on-close disabled.");
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ["groceryItems"] });

  const addItem = async () => {
    const name = text.trim();
    if (!name) return;
    await localEntities.GroceryItem.create({
      name,
      checked: false,
      created_date: new Date().toISOString(),
    });
    setText("");
    refresh();
  };

  const toggle = async (item) => {
    await localEntities.GroceryItem.update(item.id, { checked: !item.checked });
    refresh();
  };

  const remove = async (id) => {
    await localEntities.GroceryItem.delete(id);
    refresh();
  };

  // Two-tap confirm so an accidental tap on this button doesn't wipe the
  // list. First tap arms it for 4s; second tap actually deletes. Items
  // never disappear unless the user has explicitly done both taps.
  const [clearArmed, setClearArmed] = useState(false);
  const clearChecked = async () => {
    if (!clearArmed) {
      setClearArmed(true);
      setTimeout(() => setClearArmed(false), 4000);
      return;
    }
    setClearArmed(false);
    const checked = items.filter((i) => i.checked);
    for (const i of checked) await localEntities.GroceryItem.delete(i.id);
    refresh();
  };

  if (!open) return null;

  // Sort: unchecked on top (oldest first), then checked at the bottom.
  const sorted = [
    ...items.filter((i) => !i.checked),
    ...items.filter((i) => i.checked),
  ];

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

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {sorted.length === 0 ? (
          <p className="text-sm text-neutral-500 italic mt-12 text-center">
            Nothing on the list yet. Add an item below.
          </p>
        ) : (
          <ul className="space-y-1">
            {sorted.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 py-2 px-1 group"
              >
                <button
                  onClick={() => toggle(item)}
                  aria-label={item.checked ? "Uncheck" : "Check"}
                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    item.checked
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-neutral-300 dark:border-neutral-700 hover:border-emerald-500"
                  }`}
                >
                  {item.checked && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </button>
                <span
                  onClick={() => toggle(item)}
                  className={`flex-1 text-base cursor-pointer ${
                    item.checked
                      ? "line-through text-neutral-400 dark:text-neutral-500"
                      : "text-neutral-900 dark:text-neutral-100"
                  }`}
                >
                  {item.name}
                </span>
                <button
                  onClick={() => remove(item.id)}
                  aria-label="Remove"
                  className="p-1 text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {items.some((i) => i.checked) && (
          <button
            onClick={clearChecked}
            className={`mt-4 mx-auto block text-xs underline underline-offset-2 transition-colors ${
              clearArmed
                ? "text-red-500 font-semibold"
                : "text-neutral-500 hover:text-red-500"
            }`}
          >
            {clearArmed ? "Tap again to clear" : "Clear checked items"}
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
            onClick={addItem}
            aria-label="Add"
            className="w-11 h-11 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
