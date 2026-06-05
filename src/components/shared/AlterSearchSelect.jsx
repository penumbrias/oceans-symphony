import React, { useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { isValidHexColor } from "@/lib/colorUtils";

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

  const selected = value ? alters.find((a) => a.id === value) : null;
  const list = alters
    .filter((a) => !a.is_archived)
    .filter((a) => !search || (a.name || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

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
            <div className="px-3 py-2 border-b border-border/50">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${terms?.alters || "alters"}...`}
                className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground"
              />
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
              {list.map((a) => {
                const disabled = disabledIds?.has(a.id);
                if (disabled) {
                  return (
                    <div key={a.id} title={disabledLabel} className="w-full px-3 py-2 text-xs opacity-50 flex items-center gap-2 cursor-not-allowed">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor(a) }} />
                      <span className="flex-1 truncate line-through">{a.name}</span>
                      <span className="text-[0.5625rem] italic text-muted-foreground flex-shrink-0">{disabledLabel}</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => pick(a.id)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 ${value === a.id ? "bg-primary/5 text-primary" : ""}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor(a) }} />
                    <span className="flex-1 truncate">{a.name}</span>
                    {value === a.id && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                  </button>
                );
              })}
              {list.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No matches.</p>}
            </div>
          </div>
        </>
      ), document.body)}
    </div>
  );
}
