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
// overflow and the on-screen keyboard.

import React, { useMemo, useState } from "react";
import { Users, Search, Check, X } from "lucide-react";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useTerms } from "@/lib/useTerms";

export default function AlterAssignChip({ alters = [], value = null, defaultIds = [], onChange, zIndex = 90 }) {
  const t = useTerms();
  const formatAlter = useAlterLabel(); // returns the formatter fn directly
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const active = useMemo(
    () => alters.filter((a) => !a.is_archived).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [alters]
  );
  const byId = useMemo(() => Object.fromEntries(active.map((a) => [a.id, a])), [active]);

  const inheriting = value == null;
  const effectiveIds = inheriting ? defaultIds : value;

  const chipText = useMemo(() => {
    const names = (effectiveIds || []).map((id) => byId[id]).filter(Boolean).map((a) => formatAlter(a));
    if (names.length === 0) return inheriting ? t.system : "—";
    if (names.length <= 2) return names.join(", ");
    return `${names[0]} +${names.length - 1}`;
  }, [effectiveIds, byId, formatAlter, inheriting, t.system]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return active;
    return active.filter((a) =>
      (a.name || "").toLowerCase().includes(q) || (a.alias || "").toLowerCase().includes(q)
    );
  }, [active, search]);

  const toggle = (id) => {
    const base = new Set(effectiveIds || []);
    if (base.has(id)) base.delete(id); else base.add(id);
    onChange([...base]);
  };

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

      {open && (
        <div
          className="fixed inset-0 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
          style={{ zIndex }}
          onClick={() => { setOpen(false); setSearch(""); }}
          role="dialog"
          aria-modal="true"
          aria-label={`Assign to ${t.alters}`}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-xs max-h-[60vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${t.alters}...`}
                  className="w-full bg-muted/40 border border-border/50 rounded-lg pl-6 pr-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button type="button" onClick={() => { setOpen(false); setSearch(""); }} aria-label="Done"
                className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {!inheriting && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-left text-xs text-primary hover:underline px-3 py-1.5 border-b border-border/40"
              >
                ↩ Match the check-in ({defaultIds.length || "no"} {defaultIds.length === 1 ? t.alter : t.alters})
              </button>
            )}

            <div className="flex-1 overflow-y-auto overscroll-contain p-1.5 space-y-0.5">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No {t.alters} found</p>
              ) : (
                filtered.map((a) => {
                  const sel = (effectiveIds || []).includes(a.id);
                  return (
                    <button
                      key={a.id}
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
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
