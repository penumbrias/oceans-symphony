import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import SimplePreview from "@/components/shared/SimplePreview";
import { htmlToBlocks, blocksToHTML } from "@/components/shared/BlockEditor";

// Template gallery for the bio editor — two kinds:
// - Full pages: whole-page designs (replace the bio, or append below it).
// - Modules: small stackable sections (header, about, likes/dislikes,
//   dividers…) that always APPEND, so a profile is assembled piece by piece.
//   The picker stays open after adding a module so several can be stacked in
//   one visit.
//
// The template HTML lives in src/lib/bioTemplates.js and is DYNAMICALLY
// IMPORTED here, so the whole library is its own lazy chunk — opening this
// picker is what downloads it, keeping the main bundle lean (same pattern as
// the Preview Mode example content).
//
// Previews render through the real profile pipeline (htmlToBlocks →
// SimplePreview readOnly, with a per-entry scopeId so animated entries'
// @keyframes can't collide) — what you see is exactly what the profile shows.

let _seq = 0;
const uid = () => `tplb_${Date.now()}_${_seq++}`;

function EntryCard({ entry, tag, actionLabel, onPick }) {
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40">
        <div className="min-w-0">
          <span className="text-sm font-semibold">{entry.name}</span>
          {tag && (
            <span className="ml-2 text-[0.625rem] font-medium uppercase tracking-wider text-primary bg-primary/10 border border-primary/25 rounded-full px-2 py-0.5">{tag}</span>
          )}
          {entry.blurb && <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.blurb}</p>}
        </div>
        <button
          type="button"
          onClick={onPick}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          {actionLabel}
        </button>
      </div>
      <div className="relative pointer-events-none max-h-52 overflow-hidden p-3">
        <SimplePreview
          blocks={htmlToBlocks(entry.html)}
          onBlockChange={() => {}}
          readOnly
          scopeId={`bio-tpl-${entry.id}`}
        />
        <div className="absolute inset-x-0 bottom-0 h-8" style={{ background: "linear-gradient(transparent, hsl(var(--card)))" }} />
      </div>
    </div>
  );
}

export default function BioTemplatePicker({ current, onApply, onClose }) {
  const [lib, setLib] = useState(null); // { templates, modules, categories }
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState("modules"); // "modules" | "pages"
  const [category, setCategory] = useState("All");
  const [pending, setPending] = useState(null); // full template awaiting replace/append choice

  useEffect(() => {
    let cancelled = false;
    import("@/lib/bioTemplates")
      .then((m) => {
        if (cancelled) return;
        setLib({ templates: m.BIO_TEMPLATES, modules: m.BIO_MODULES, categories: m.MODULE_CATEGORIES });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const hasContent = !!(current && current.trim());

  const visibleModules = useMemo(() => {
    if (!lib) return [];
    return category === "All" ? lib.modules : lib.modules.filter((m) => m.category === category);
  }, [lib, category]);

  const replaceWith = (html) => onApply(blocksToHTML([{ id: uid(), type: "text", content: html }]), { close: true });

  // NEVER overwrite when appending: parse the current bio into its blocks and
  // add the new content as another block below them.
  const appendBelow = (html, { close }) => {
    const blocks = htmlToBlocks(current || "");
    blocks.push({ id: uid(), type: "text", content: html });
    onApply(blocksToHTML(blocks), { close });
  };

  const pickModule = (m) => {
    appendBelow(m.html, { close: false }); // stay open — modules stack
    toast.success(`Added "${m.name}" — keep stacking, or close and fill in the fields`);
  };

  const pickTemplate = (t) => {
    if (hasContent) { setPending(t); return; }
    replaceWith(t.html);
    toast.success("Template applied — tap the dotted fields to fill them in");
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70]" onClick={onClose}>
      <div
        className="bg-background border-2 border-border rounded-2xl w-full max-w-2xl mx-4 shadow-2xl flex flex-col"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
          <p className="text-sm font-semibold flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-primary" />
            Profile templates
          </p>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-muted/40 p-1 rounded-lg">
              <button type="button" onClick={() => setTab("modules")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${tab === "modules" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                Modules
              </button>
              <button type="button" onClick={() => setTab("pages")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${tab === "pages" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                Full pages
              </button>
            </div>
            <button type="button" onClick={onClose} aria-label="Close">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          <p className="text-xs text-muted-foreground -mt-1">
            {tab === "modules"
              ? "Modules are building blocks — each Add stacks a section below your bio. Add a few, close, then tap the dotted fields in the Simple editor to fill them in."
              : "Full pages are complete designs. Apply one, then tap the dotted fields in the Simple editor to fill it in. Raw mode shows the full HTML/CSS if you want to restyle it."}
          </p>

          {failed && (
            <p className="text-sm text-destructive">Couldn't load the template library. Check your connection and try again.</p>
          )}
          {!lib && !failed && (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
            </div>
          )}

          {lib && tab === "modules" && (
            <>
              <div className="flex flex-wrap gap-1.5 -mt-1">
                {["All", ...lib.categories].map((c) => (
                  <button key={c} type="button" onClick={() => setCategory(c)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${category === c ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {c}
                  </button>
                ))}
              </div>
              {visibleModules.map((m) => (
                <EntryCard key={m.id} entry={m} tag={m.category} actionLabel="Add" onPick={() => pickModule(m)} />
              ))}
            </>
          )}

          {lib && tab === "pages" && lib.templates.map((t) => (
            <EntryCard key={t.id} entry={t} tag={t.vibe} actionLabel="Use" onPick={() => pickTemplate(t)} />
          ))}
        </div>
      </div>

      {pending && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80]" onClick={() => setPending(null)}>
          <div className="bg-background border-2 border-border rounded-2xl p-5 space-y-4 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium">This bio already has content.</p>
            <p className="text-xs text-muted-foreground">
              You can add "{pending.name}" below what's there, or replace the whole bio. Replacing
              can be undone with the ↩ button until you save.
            </p>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => { appendBelow(pending.html, { close: true }); toast.success("Template added below your bio"); setPending(null); }}
                className="w-full px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
                Add below current bio
              </button>
              <button type="button" onClick={() => { replaceWith(pending.html); toast.success("Template applied — tap the dotted fields to fill them in"); setPending(null); }}
                className="w-full px-4 py-2 rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/80">
                Replace bio
              </button>
              <button type="button" onClick={() => setPending(null)}
                className="w-full px-4 py-2 rounded-xl text-muted-foreground text-sm font-medium hover:bg-muted/40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
