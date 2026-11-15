import React, { useState, useRef, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Crown, Check, Search } from "lucide-react";
import { flattenGroupTree, descendantGroupIds } from "@/lib/groupTree";

const PANEL_MAX = 290; // the panel's full height (search + list)

// Single-select, nested, parent-respecting group/subsystem dropdown — the
// single-select group picker. Used as the "Parent group" picker
// so the chosen parent respects the nesting tree instead of a flat <select>.
//
// Portaled to <body> with fixed positioning so it escapes the dialog's CSS
// transform (which would otherwise detach a plain fixed popover) and any
// overflow clipping.
//
// Groups nest via `parent` (a group id OR sp_id); the tree, its cycle guard
// and depth clamp all come from groupTree.

// Ordered, depth-tagged flatten. Skips any group in excludeIds (the group
// being edited + its descendants) so you can't pick yourself or a child as
// your own parent. Groups whose parent is gone or loops show at the top.
function flatten(groups, excludeIds) {
  const rows = [];
  for (const g of flattenGroupTree(groups, { sort: "order" })) {
    if (excludeIds.has(g.id)) continue;
    rows.push({ group: g, level: g._depth || 0 });
  }
  return rows;
}

export default function GroupSelect({
  groups = [],
  value = "",
  onChange,
  excludeId = null,
  placeholder = "None (top level)",
  zIndex = 10000,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 260 });

  useLayoutEffect(() => {
    if (!open) return undefined;
    const compute = () => {
      const node = triggerRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const width = Math.round(Math.max(220, Math.min(340, r.width)));
      let left = r.left;
      const maxLeft = window.innerWidth - width - 8;
      left = maxLeft >= 8 ? Math.min(Math.max(left, 8), maxLeft) : 8;
      // Visible-viewport aware (like SearchableSelect): with the keyboard
      // up the real bottom is visualViewport, so flip above the field
      // when there's more room there, and never run under the keyboard.
      const vv = window.visualViewport;
      const visTop = vv ? vv.offsetTop : 0;
      const visBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const below = visBottom - r.bottom - 12;
      const above = r.top - visTop - 12;
      const up = below < 200 && above > below;
      const maxHeight = Math.max(120, Math.min(PANEL_MAX, up ? above : below));
      const top = up ? r.top - 4 - maxHeight : r.bottom + 4;
      setPos({ top, left, width, maxHeight, up });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    window.addEventListener("scroll", compute, true);
    window.visualViewport?.addEventListener("resize", compute);
    window.visualViewport?.addEventListener("scroll", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
      window.removeEventListener("scroll", compute, true);
      window.visualViewport?.removeEventListener("resize", compute);
      window.visualViewport?.removeEventListener("scroll", compute);
    };
  }, [open]);

  // Exclude self + descendant subtree from being selectable as a parent.
  const excludeIds = useMemo(() => {
    const ids = new Set();
    if (!excludeId) return ids;
    const target = groups.find((g) => g.id === excludeId || g.sp_id === excludeId);
    if (!target) {
      ids.add(excludeId);
      return ids;
    }
    ids.add(target.id);
    for (const id of descendantGroupIds(groups, target.id)) ids.add(id);
    return ids;
  }, [groups, excludeId]);

  const rows = useMemo(() => flatten(groups, excludeIds), [groups, excludeIds]);
  const q = search.trim().toLowerCase();
  const visible = q ? rows.filter((row) => (row.group.name || "").toLowerCase().includes(q)) : rows;

  const selectedGroup = value ? groups.find((g) => g.id === value || g.sp_id === value) : null;
  const pick = (id) => {
    onChange?.(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-input bg-background text-sm text-left"
      >
        {selectedGroup ? (
          <>
            {selectedGroup.owner_alter_id ? (
              <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedGroup.color || "#94a3b8" }} />
            )}
            <span className="flex-1 truncate">{selectedGroup.name}</span>
          </>
        ) : (
          <span className="flex-1 truncate text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
      </button>

      {open &&
        createPortal(
          (
            <>
              {/* pointer-events-auto + stopPropagation: the parent may be a
                  Radix modal dialog (body{pointer-events:none}); keep the
                  portaled layer tappable and stop taps/focus here from being
                  read as an outside-dismiss by the parent dialog. */}
              <div className="fixed inset-0 pointer-events-auto" style={{ zIndex }} onClick={() => setOpen(false)} onPointerDown={(e) => e.stopPropagation()} />
              <div
                className="bg-popover border border-border rounded-xl shadow-xl overflow-hidden pointer-events-auto flex flex-col"
                style={{ position: "fixed", zIndex: zIndex + 1, top: pos.top, left: pos.left, width: pos.width, maxWidth: "calc(100vw - 16px)", maxHeight: pos.maxHeight, ...(pos.up ? { top: "auto", bottom: window.innerHeight - pos.top - pos.maxHeight } : null) }}
                onPointerDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 border-b border-border/50 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search groups…"
                    className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="max-h-60 min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
                  <button
                    type="button"
                    onClick={() => pick("")}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors ${!value ? "text-primary font-medium" : "text-muted-foreground"}`}
                  >
                    {placeholder}
                  </button>
                  {visible.map(({ group, level }) => {
                    const id = group.sp_id || group.id;
                    const isSel = value === id || value === group.id;
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => pick(id)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 ${isSel ? "bg-primary/5 text-primary" : ""}`}
                        style={{ paddingLeft: `${12 + (q ? 0 : level * 14)}px` }}
                      >
                        {group.owner_alter_id ? (
                          <Crown className="w-3 h-3 text-amber-500 flex-shrink-0" />
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color || "#94a3b8" }} />
                        )}
                        <span className="flex-1 truncate">{group.name}</span>
                        {isSel && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                      </button>
                    );
                  })}
                  {visible.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No matches.</p>}
                </div>
              </div>
            </>
          ),
          document.body
        )}
    </div>
  );
}
