import React, { useState, useRef, useEffect, useMemo } from "react";
import { Check, ChevronDown, Users, Globe, Search } from "lucide-react";
import { useTerms } from "@/lib/useTerms";

// Compact dropdown-style alter picker for surfaces where the
// SetFrontModal-style full grid is too heavy (Polls, small inline
// selectors, etc.). Modeled after the Journals fronter-view filter
// dropdown:
//   - Trigger button summarises the current selection
//   - Clicking opens a positioned popover with search + scrollable
//     checkbox list
// Replaces the previous "big grid of avatar tiles" pattern that broke
// scrolling inside constrained modals.
//
// Props:
//   alters         — array of Alter records
//   value          — single-select: id string; multi: array of ids
//   onChange       — (id | id[]) callback
//   mode           — "single" | "multi" (default single)
//   allowSystemWide — show a "System-wide" pseudo-option that maps to
//                    empty string (single) or "" inside the array
//                    (multi). Useful for Polls.
//   triggerLabel   — optional override for the trigger's prefix text
//   placeholder    — text when nothing is selected
//   defaultIds     — for multi: array of ids used by "Reset"
const POPOVER_WIDTH = 260;
const VIEWPORT_MARGIN = 8;

export default function AlterDropdownPicker({
  alters,
  value,
  onChange,
  mode = "single",
  allowSystemWide = false,
  triggerLabel,
  placeholder,
  defaultIds,
}) {
  const terms = useTerms();
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0, width: POPOVER_WIDTH });

  const isMulti = mode === "multi";
  const multiValue = useMemo(() => (Array.isArray(value) ? value : []), [value]);

  const computePos = () => {
    const node = triggerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    const top = rect.bottom + 4;
    let left;
    if (rect.left + POPOVER_WIDTH <= vw - VIEWPORT_MARGIN) left = rect.left;
    else if (rect.right - POPOVER_WIDTH >= VIEWPORT_MARGIN) left = rect.right - POPOVER_WIDTH;
    else left = VIEWPORT_MARGIN;
    const maxLeft = vw - POPOVER_WIDTH - VIEWPORT_MARGIN;
    if (maxLeft >= VIEWPORT_MARGIN) left = Math.min(Math.max(left, VIEWPORT_MARGIN), maxLeft);
    setPos({ top, left, width: POPOVER_WIDTH });
  };

  useEffect(() => {
    if (!open) return undefined;
    computePos();
    const onResize = () => computePos();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  const activeAlters = useMemo(
    () => (alters || []).filter((a) => !a.is_archived).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [alters]
  );
  const filteredAlters = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return activeAlters;
    return activeAlters.filter((a) => (a.name || "").toLowerCase().includes(s) || (a.alias || "").toLowerCase().includes(s));
  }, [activeAlters, search]);

  const triggerText = useMemo(() => {
    if (isMulti) {
      const sysSelected = allowSystemWide && multiValue.includes("");
      const named = multiValue.filter((id) => id).map((id) => alters?.find((a) => a.id === id)).filter(Boolean);
      if (named.length === 0 && sysSelected) return `${terms.System || "System"}-wide`;
      if (named.length === 0) return placeholder || `Pick ${terms.alters || "alters"}…`;
      const head = named[0].alias || named[0].name;
      const extras = named.length - 1 + (sysSelected ? 1 : 0);
      return extras > 0 ? `${head} + ${extras} other${extras !== 1 ? "s" : ""}` : head;
    }
    if (!value) return allowSystemWide ? `${terms.System || "System"}-wide` : placeholder || `Pick an ${terms.alter || "alter"}…`;
    const a = alters?.find((x) => x.id === value);
    return a ? a.alias || a.name : placeholder || `Pick an ${terms.alter || "alter"}…`;
  }, [value, multiValue, alters, isMulti, allowSystemWide, terms, placeholder]);

  const toggle = (id) => {
    if (isMulti) {
      const next = multiValue.includes(id) ? multiValue.filter((x) => x !== id) : [...multiValue, id];
      onChange(next);
    } else {
      onChange(id);
      setOpen(false);
    }
  };

  const isSelected = (id) => (isMulti ? multiValue.includes(id) : value === id);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-border/60 bg-card hover:bg-muted/30 transition-colors text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm truncate">{triggerLabel ? `${triggerLabel}: ${triggerText}` : triggerText}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
            }}
            role="listbox"
          >
            <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between gap-2">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                {isMulti ? `Pick ${terms.alters || "alters"}` : `Pick ${terms.alter || "alter"}`}
              </span>
              {isMulti && defaultIds && (
                <button
                  type="button"
                  onClick={() => onChange(defaultIds)}
                  className="text-[0.625rem] font-medium text-primary hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="px-3 py-2 border-b border-border/50 relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${terms.alters || "alters"}…`}
                className="w-full pl-6 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-60 overflow-y-auto">
              {allowSystemWide && (
                <button
                  type="button"
                  onClick={() => toggle("")}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 ${
                    isSelected("") ? "bg-primary/5" : ""
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: isSelected("") ? "hsl(var(--muted-foreground))" : "transparent",
                      borderColor: isSelected("") ? "hsl(var(--muted-foreground))" : "hsl(var(--border))",
                    }}
                  >
                    {isSelected("") && <Check className="w-3 h-3 text-background" />}
                  </div>
                  <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className={`flex-1 truncate ${isSelected("") ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {terms.System || "System"}-wide
                  </span>
                </button>
              )}
              {filteredAlters.length === 0 && (
                <p className="px-3 py-3 text-xs text-muted-foreground italic">No matching {terms.alters || "alters"}.</p>
              )}
              {filteredAlters.map((a) => {
                const selected = isSelected(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggle(a.id)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 ${selected ? "bg-primary/5" : ""}`}
                  >
                    <div
                      className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: selected ? a.color || "#94a3b8" : "transparent",
                        borderColor: selected ? a.color || "#94a3b8" : "hsl(var(--border))",
                      }}
                    >
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#94a3b8" }} />
                    <span className={`flex-1 truncate ${selected ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {a.alias || a.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="px-3 py-2 border-t border-border/50 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-primary hover:underline">
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
