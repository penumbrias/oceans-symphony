import React, { useState, useRef, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Folder, Crown, Check, Search } from "lucide-react";

// Single-select, nested, parent-respecting group/subsystem dropdown — the
// single-select sibling of GroupTreeSelect. Used as the "Parent group" picker
// so the chosen parent respects the nesting tree instead of a flat <select>.
//
// Portaled to <body> with fixed positioning so it escapes the dialog's CSS
// transform (which would otherwise detach a plain fixed popover) and any
// overflow clipping.
//
// Groups nest via `parent` (a group id OR sp_id). Cycle-safe via a `seen` set.

function childrenOf(group, groups) {
  return groups.filter((g) => {
    const p = g.parent || "";
    if (!p || p === "root") return false;
    return p === group.id || (group.sp_id && p === group.sp_id);
  });
}

// Ordered, depth-tagged, cycle-safe flatten. Skips any group in excludeIds
// (the group being edited + its descendants) so you can't pick yourself or a
// child as your own parent.
function flatten(groups, excludeIds) {
  const roots = groups.filter((g) => {
    const p = g.parent || "";
    if (!p || p === "root") return true;
    return !groups.some((x) => x.id === p || x.sp_id === p);
  });
  const rows = [];
  const walk = (group, level, seen) => {
    if (seen.has(group.id) || excludeIds.has(group.id)) return;
    rows.push({ group, level });
    const next = new Set(seen);
    next.add(group.id);
    childrenOf(group, groups).forEach((k) => walk(k, level + 1, next));
  };
  roots.forEach((r) => walk(r, 0, new Set()));
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
      setPos({ top: r.bottom + 4, left, width });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
      window.removeEventListener("scroll", compute, true);
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
    const collect = (g, seen) => {
      if (seen.has(g.id)) return;
      ids.add(g.id);
      const s = new Set(seen);
      s.add(g.id);
      childrenOf(g, groups).forEach((k) => collect(k, s));
    };
    collect(target, new Set());
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
              <div className="fixed inset-0" style={{ zIndex }} onClick={() => setOpen(false)} />
              <div
                className="bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
                style={{ position: "fixed", zIndex: zIndex + 1, top: pos.top, left: pos.left, width: pos.width, maxWidth: "calc(100vw - 16px)" }}
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
                <div className="max-h-60 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
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
