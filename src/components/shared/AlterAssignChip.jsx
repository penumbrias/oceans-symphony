// Compact per-item alter assignment: a small chip that shows who a logged
// item (an emotion, a symptom) is assigned to, opening a searchable
// multi-select on tap. Built for the Quick Check-In's per-item attribution
// (Phase B3): every item defaults to "same as the check-in" (inherit) and
// can be reassigned to specific alters.
//
// value semantics: null = INHERIT (the item follows defaultIds — the
// check-in's fronters — at save time); an array = explicit assignment.
// Follows the CLAUDE.md alter-selection rules: searchable, scrollable,
// labels via useAlterLabel, top-anchored fixed modal that escapes parent
// overflow and the on-screen keyboard. Ordering is the house standard
// (useAlterSorter: fronters first, manual arrangement, one-tap toggle),
// with the alters already assigned to this item pinned to the top — the
// membership of that band is frozen when the popup opens so rows don't
// jump around under the finger mid-toggle.
//
// The popup is its own (nested) Radix dialog, not a body portal: inside
// another modal dialog (the Quick Check-In) a plain portal sits outside
// that dialog's focus trap, so the search box could never keep focus and
// touch scrolling was swallowed. A nested dialog joins the layer stack.
// AlterAssignPopup is exported for surfaces that open it some other way
// (press-and-hold on an emotion pill).

import React, { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Users, Search, Check, X } from "lucide-react";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useTerms } from "@/lib/useTerms";
import { useAlterSorter } from "@/lib/alterSort";
import AlterSortToggle from "@/components/shared/AlterSortToggle";

export default function AlterAssignChip({ alters = [], value = null, defaultIds = [], onChange, zIndex = 90 }) {
  const t = useTerms();
  const formatAlter = useAlterLabel(); // returns the formatter fn directly
  const [open, setOpen] = useState(false);

  const active = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const byId = useMemo(() => Object.fromEntries(active.map((a) => [a.id, a])), [active]);

  const inheriting = value == null;
  const effectiveIds = inheriting ? defaultIds : value;

  const chipText = useMemo(() => {
    const names = (effectiveIds || []).map((id) => byId[id]).filter(Boolean).map((a) => formatAlter(a));
    if (names.length === 0) return inheriting ? t.system : "—";
    if (names.length <= 2) return names.join(", ");
    return `${names[0]} +${names.length - 1}`;
  }, [effectiveIds, byId, formatAlter, inheriting, t.system]);

  if (active.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={inheriting ? `Assigned to the whole check-in — tap to assign to specific ${t.alters}` : `Assigned to: ${chipText} — tap to change`}
        aria-label={`Assign to ${t.alters} (currently: ${chipText})`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[0.625rem] flex-shrink-0 transition-colors max-w-[8.5rem] ${
          inheriting
            ? "border-border/40 text-muted-foreground/70 hover:text-muted-foreground hover:border-border"
            : "border-primary/50 text-primary bg-primary/5"
        }`}
      >
        <Users className="w-2.5 h-2.5 flex-shrink-0" />
        <span className="truncate">{chipText}</span>
      </button>
      <AlterAssignPopup open={open} onOpenChange={setOpen} alters={alters}
        value={value} defaultIds={defaultIds} onChange={onChange} zIndex={zIndex} />
    </>
  );
}

// The assignment popup on its own. `title` (optional) names the item being
// assigned — shown above the search box.
export function AlterAssignPopup({ open, onOpenChange, alters = [], value = null, defaultIds = [], onChange, title = null, zIndex = 90 }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const [search, setSearch] = useState("");
  // Assigned-at-open ids: the pinned top band. Frozen so toggling doesn't
  // reshuffle the list while it's open (captured on the open transition).
  const [pinnedIds, setPinnedIds] = useState(() => new Set());
  const [wasOpen, setWasOpen] = useState(false);
  const sorter = useAlterSorter("alterAssignChip_sort");

  const active = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const inheriting = value == null;
  const effectiveIds = inheriting ? defaultIds : value;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPinnedIds(new Set(effectiveIds || []));
    else setSearch("");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? active.filter((a) =>
          (a.name || "").toLowerCase().includes(q) || (a.alias || "").toLowerCase().includes(q))
      : active;
    const sorted = sorter.sort(base);
    // Stable partition: this item's alters first, everyone else after —
    // both bands keep the house order.
    return [...sorted.filter((a) => pinnedIds.has(a.id)), ...sorted.filter((a) => !pinnedIds.has(a.id))];
  }, [active, search, sorter, pinnedIds]);

  const pinnedShown = filtered.filter((a) => pinnedIds.has(a.id)).length;

  const toggle = (id) => {
    const base = new Set(effectiveIds || []);
    if (base.has(id)) base.delete(id); else base.add(id);
    onChange([...base]);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/40" style={{ zIndex }} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-xs max-h-[60vh] flex flex-col bg-card border border-border rounded-xl shadow-2xl focus:outline-none"
          // Top-anchored so the on-screen keyboard never covers it; inline
          // because the top bar overlaps the first rows otherwise.
          style={{ zIndex, top: "max(12vh, calc(env(safe-area-inset-top, 0px) + 72px))" }}
        >
          <DialogPrimitive.Title className={title ? "px-3 pt-2 text-xs font-medium text-muted-foreground truncate" : "sr-only"}>
            {title || `Assign to ${t.alters}`}
          </DialogPrimitive.Title>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${t.alters}...`}
                className="w-full bg-muted/40 border border-border/50 rounded-lg pl-6 pr-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <AlterSortToggle sorter={sorter} className="flex-shrink-0 px-1.5 py-1" />
            <DialogPrimitive.Close aria-label="Done"
              className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground">
              <X className="w-3.5 h-3.5" />
            </DialogPrimitive.Close>
          </div>

          {/* Two ways to empty this item — different meanings, both one tap:
                • Clear (nobody): explicit empty — no one is attached to this
                  item, even if the check-in has fronters.
                • Match the check-in: back to the default. Shown only when
                  overridden. */}
          {((effectiveIds || []).length > 0 || !inheriting) && (
            <div className="flex items-center gap-1 px-2 py-1 border-b border-border/40 text-xs">
              {(effectiveIds || []).length > 0 && (
                <button type="button" onClick={() => onChange([])}
                  className="px-2 py-1 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">
                  Clear (nobody)
                </button>
              )}
              {!inheriting && (
                <button type="button" onClick={() => onChange(null)}
                  className="px-2 py-1 rounded-full border border-border/50 text-primary hover:underline">
                  ↩ Match the check-in ({defaultIds.length || "no"} {defaultIds.length === 1 ? t.alter : t.alters})
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto overscroll-contain p-1.5 space-y-0.5">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No {t.alters} found</p>
            ) : (
              filtered.map((a, i) => {
                const sel = (effectiveIds || []).includes(a.id);
                return (
                  <React.Fragment key={a.id}>
                    {/* Thin divider under the assigned band */}
                    {pinnedShown > 0 && i === pinnedShown && (
                      <div className="border-t border-border/40 mx-1 my-1" aria-hidden />
                    )}
                    <button
                      type="button"
                      onClick={() => toggle(a.id)}
                      aria-pressed={sel}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left transition-colors ${
                        sel ? "bg-primary/10 text-foreground" : "hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 border"
                        style={{ backgroundColor: a.color || "transparent", borderColor: a.color || "hsl(var(--border))" }}
                        aria-hidden
                      />
                      <span className="flex-1 truncate">{formatAlter(a)}</span>
                      {sel && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
