import React, { useState, useRef, useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAlterSorter } from "@/lib/alterSort";
import AlterSortToggle from "@/components/shared/AlterSortToggle";
import { createPortal } from "react-dom";
import { ChevronDown, Check, FolderTree } from "lucide-react";
import { isValidHexColor } from "@/lib/colorUtils";
import { groupedAlterSections } from "@/lib/alterSections";

const GROUPED_KEY = "symphony_alterSearchSelect_grouped";

// Single-select alter picker styled like the Journals "filter by alter"
// popover: a trigger button + a fixed-positioned, searchable, scrollable
// dropdown. Fixed positioning is deliberate — it escapes any parent
// overflow clipping so the list always scrolls.
export default function AlterSearchSelect({
  alters = [],
  value = null,
  onChange,
  terms,
  placeholder = "Select…",
  noneLabel = "None",
  showNone = true,
  disabledIds = null,        // Set of alter ids that can't be picked
  disabledLabel = "unavailable",
  buttonClassName = "",
  zIndex = 60,               // raise when nested inside another overlay
  frontingFirst = true,      // float current fronters to the top
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240 });

  useLayoutEffect(() => {
    if (!open) return undefined;
    const compute = () => {
      const node = triggerRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const width = Math.round(Math.max(220, Math.min(300, r.width)));
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

  // Sorting is the shared vocabulary: the hand-set arrangement (Settings →
  // {Alter} setup) when the user has one, otherwise A→Z, with a one-tap
  // toggle in the search row. Whoever is fronting stays on top either way.
  const sorter = useAlterSorter("alterSearchSelect_sort", { frontingFirst });
  const selected = value ? alters.find((a) => a.id === value) : null;
  const list = sorter.sort(
    alters
      .filter((a) => !a.is_archived)
      .filter((a) => !search || (a.name || "").toLowerCase().includes(search.toLowerCase())),
  );
  // Nested view (rule 23): the same sections every grouped member list
  // uses — a header per group/subsystem in the user's own tree order.
  // Groups are fetched here so no caller has to thread them through.
  const [grouped, setGrouped] = useState(() => {
    try { return localStorage.getItem(GROUPED_KEY) === "1"; } catch { return false; }
  });
  const toggleGrouped = () => setGrouped((g) => {
    try { localStorage.setItem(GROUPED_KEY, g ? "0" : "1"); } catch { /* storage off */ }
    return !g;
  });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list(), enabled: open && grouped });
  const sections = open && grouped && !search
    ? groupedAlterSections({ alters, groups, sort: sorter.sort, toOption: (a) => a })
    : null;

  const pick = (id) => { onChange?.(id); setOpen(false); setSearch(""); };
  const dotColor = (a) => (isValidHexColor(a?.color) ? a.color : "#94a3b8");

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-input bg-background text-sm text-left ${buttonClassName}`}
      >
        {selected ? (
          <>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor(selected) }} />
            <span className="flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 truncate text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
      </button>

      {open && createPortal((
        <>
          {/* pointer-events-auto: the parent may be a Radix modal dialog,
              which sets body{pointer-events:none}; without this the portaled
              layer is un-tappable and taps fall through to the page behind.
              stopPropagation on pointer/focus keeps the parent dialog from
              treating taps here as an "outside" dismiss / focus escape. */}
          <div className="fixed inset-0 pointer-events-auto" style={{ zIndex }} onClick={() => setOpen(false)} onPointerDown={(e) => e.stopPropagation()} />
          <div
            className="bg-popover border border-border rounded-xl shadow-xl overflow-hidden pointer-events-auto"
            style={{ position: "fixed", zIndex: zIndex + 1, top: pos.top, left: pos.left, width: pos.width, maxWidth: "calc(100vw - 16px)" }}
            onPointerDown={(e) => e.stopPropagation()}
            onFocus={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-border/50 flex items-center gap-1">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${terms?.alters || "alters"}...`}
                className="flex-1 min-w-0 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
              />
              <AlterSortToggle sorter={sorter} className="flex-shrink-0 px-1.5 py-1" />
              <button type="button" onClick={toggleGrouped} aria-pressed={grouped}
                aria-label={`View by ${terms?.system || "system"} groups`} title={`View by ${terms?.system || "system"} groups`}
                className={`flex-shrink-0 px-1.5 py-1 rounded ${grouped ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <FolderTree className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
              {showNone && (
                <button
                  type="button"
                  onClick={() => pick(null)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors ${!value ? "text-primary font-medium" : "text-muted-foreground"}`}
                >
                  {noneLabel}
                </button>
              )}
              {(() => {
                const row = (a, keyPrefix = "") => {
                  const disabled = disabledIds?.has(a.id);
                  if (disabled) {
                    return (
                      <div key={keyPrefix + a.id} title={disabledLabel} className="w-full px-3 py-2 text-xs opacity-50 flex items-center gap-2 cursor-not-allowed">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor(a) }} />
                        <span className="flex-1 truncate line-through">{a.name}</span>
                        <span className="text-[0.5625rem] italic text-muted-foreground flex-shrink-0">{disabledLabel}</span>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={keyPrefix + a.id}
                      type="button"
                      onClick={() => pick(a.id)}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 ${value === a.id ? "bg-primary/5 text-primary" : ""}`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor(a) }} />
                      <span className="flex-1 truncate">{a.name}</span>
                      {value === a.id && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                    </button>
                  );
                };
                if (sections) {
                  return sections.map((sec) => (
                    <React.Fragment key={sec.id}>
                      {sec.label !== null && (
                        <p className="px-3 pt-2 pb-0.5 text-[0.625rem] font-semibold uppercase tracking-wide truncate"
                          style={{ paddingLeft: 12 + (sec.depth || 0) * 10, color: sec.color || undefined }}>
                          {sec.label}
                        </p>
                      )}
                      {sec.label === null && sections.length > 1 && (
                        <p className="px-3 pt-2 pb-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                          No group
                        </p>
                      )}
                      {sec.options.map((a) => row(a, `${sec.id}_`))}
                    </React.Fragment>
                  ));
                }
                return list.map((a) => row(a));
              })()}
              {(sections ? sections.length === 0 : list.length === 0) && <p className="px-3 py-3 text-xs text-muted-foreground">No matches.</p>}
            </div>
          </div>
        </>
      ), document.body)}
    </div>
  );
}
