import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { localEntities } from "@/api/base44Client";
import { Trash2, Plus, X, Check } from "lucide-react";

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
export default function GroceryListPanel() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const inputRef = useRef(null);
  const [text, setText] = useState("");

  const { data: items = [] } = useQuery({
    queryKey: ["groceryItems"],
    queryFn: () => localEntities.GroceryItem.list("created_date"),
  });

  useEffect(() => {
    const onOpen = (e) => {
      setOpen(true);
      if (e?.detail?.focusInput) {
        // Defer until the panel renders.
        setTimeout(() => inputRef.current?.focus(), 80);
      }
    };
    const onClose = () => setOpen(false);
    window.addEventListener("open-grocery-list", onOpen);
    window.addEventListener("close-grocery-list", onClose);
    return () => {
      window.removeEventListener("open-grocery-list", onOpen);
      window.removeEventListener("close-grocery-list", onClose);
    };
  }, []);

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
      className="fixed inset-0 z-[9999] bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 flex flex-col"
      style={{ touchAction: "manipulation" }}
    >
      {/* Header — intentionally generic so the screen reads as a grocery app. */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🛒</span>
          <h1 className="text-lg font-semibold tracking-tight">Grocery list</h1>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="p-2 -mr-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          <X className="w-5 h-5" />
        </button>
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
