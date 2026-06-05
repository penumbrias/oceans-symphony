import React, { useState, useRef } from "react";
import { X } from "lucide-react";
import { isValidHexColor } from "@/lib/colorUtils";

// Alters-page filter popup: nested/flat list style, multi-select group
// and subsystem pills (searchable, scrollable), Any/All match mode, and
// Clear all. Edits the `filters` object live via onChange.
//   filters = { nested: bool, groupIds: string[], subsystemIds: string[], mode: "any" | "all" }
export default function AlterFilterPopup({ filters, onChange, regularGroups, subsystemGroups, terms, onClose }) {
  const [search, setSearch] = useState("");
  const openedAt = useRef(Date.now());
  const subTerm = terms.system === "system" ? "subsystem" : `sub${terms.system}`;
  const SubLabel = subTerm.charAt(0).toUpperCase() + subTerm.slice(1) + "s";

  const q = search.trim().toLowerCase();
  const groupsShown = regularGroups.filter((g) => (g.name || "").toLowerCase().includes(q));
  const subsShown = subsystemGroups.filter((g) => (g.name || "").toLowerCase().includes(q));

  const activeCount = filters.groupIds.length + filters.subsystemIds.length;
  const dirty = activeCount > 0 || !filters.nested || filters.mode !== "any";

  const toggleId = (key, id) => {
    const arr = filters[key];
    const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
    onChange({ ...filters, [key]: next });
  };
  const clearAll = () => onChange({ nested: true, groupIds: [], subsystemIds: [], mode: "any" });
  const backdropClick = () => { if (Date.now() - openedAt.current > 250) onClose(); };

  const Pill = ({ g, selected, onClick }) => {
    const color = isValidHexColor(g.color) ? g.color : "#8b5cf6";
    return (
      <button
        type="button"
        onClick={onClick}
        className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors max-w-[12rem] truncate flex-shrink-0"
        style={selected
          ? { backgroundColor: `${color}33`, borderColor: color, color: "hsl(var(--foreground))" }
          : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
      >
        {g.emoji ? `${g.emoji} ` : ""}{g.name}
      </button>
    );
  };

  const Segmented = ({ value, options, onSelect }) => (
    <div className="inline-flex rounded-lg border border-border/60 overflow-hidden flex-shrink-0">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onSelect(o.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${value === o.value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center" onClick={backdropClick}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[85vh] overflow-y-auto shadow-2xl pb-[calc(env(safe-area-inset-bottom)_+_var(--bottom-nav-height,56px))] sm:pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 sticky top-0 bg-background z-10">
          <span className="font-semibold text-sm">Filter {terms.alters}</span>
          <div className="flex items-center gap-3">
            {dirty && (
              <button onClick={clearAll} className="text-xs font-medium text-muted-foreground hover:text-destructive">Clear all</button>
            )}
            <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">List style</span>
            <Segmented
              value={filters.nested ? "nested" : "flat"}
              options={[{ value: "nested", label: "Nested" }, { value: "flat", label: "Flat" }]}
              onSelect={(v) => onChange({ ...filters, nested: v === "nested" })}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">Match</span>
            <Segmented
              value={filters.mode}
              options={[{ value: "any", label: "Any" }, { value: "all", label: "All" }]}
              onSelect={(v) => onChange({ ...filters, mode: v })}
            />
          </div>
          <p className="text-[0.6875rem] text-muted-foreground -mt-2 leading-snug">
            {filters.mode === "any"
              ? `Show ${terms.alters} in any selected group/${subTerm}.`
              : `Show only ${terms.alters} in every selected group/${subTerm}.`}
          </p>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups…"
            className="w-full h-8 px-3 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />

          <div>
            <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground mb-1.5">
              Groups{filters.groupIds.length ? ` (${filters.groupIds.length})` : ""}
            </p>
            {groupsShown.length === 0 ? (
              <p className="text-xs text-muted-foreground">No groups{q ? " match" : ""}.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-0.5">
                {groupsShown.map((g) => (
                  <Pill key={g.id} g={g} selected={filters.groupIds.includes(g.id)} onClick={() => toggleId("groupIds", g.id)} />
                ))}
              </div>
            )}
          </div>

          {subsystemGroups.length > 0 && (
            <div>
              <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground mb-1.5">
                {SubLabel}{filters.subsystemIds.length ? ` (${filters.subsystemIds.length})` : ""}
              </p>
              {subsShown.length === 0 ? (
                <p className="text-xs text-muted-foreground">None{q ? " match" : ""}.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-0.5">
                  {subsShown.map((g) => (
                    <Pill key={g.id} g={g} selected={filters.subsystemIds.includes(g.id)} onClick={() => toggleId("subsystemIds", g.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border/50 sticky bottom-0 bg-background">
          <button onClick={onClose} className="w-full py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
            Done{activeCount ? ` · ${activeCount} filter${activeCount === 1 ? "" : "s"}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
