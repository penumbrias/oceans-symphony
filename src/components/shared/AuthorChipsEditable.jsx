import React from "react";
import { X } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { SYSTEM_SENTINEL_ID } from "@/lib/signpostAuthors";

// Minimal, live list of the authors a text entry will be attributed to, with a
// delete (×) on each. Delete-only by design — you ADD authors by signposting in
// the text (an emoji, "-name", or the fronter fallback); this just lets you
// drop one you didn't mean to include. Terms-aware; reused across the bulletin /
// comment / chat / journal composers.
export default function AuthorChipsEditable({ authors = [], onRemove, onClearAll, label }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  if (!authors.length) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-2" role="group" aria-label={label || "Signed by"}>
      <span className="text-[0.625rem] uppercase tracking-wider text-muted-foreground/80 flex-shrink-0">{label || "Signed by"}</span>
      {onClearAll && authors.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-[0.625rem] uppercase tracking-wide text-muted-foreground hover:text-destructive flex-shrink-0"
          title="Remove every author"
        >
          Clear all
        </button>
      )}
      {authors.map((a) => {
        const isSystem = a.isSystem || a.id === SYSTEM_SENTINEL_ID;
        const name = isSystem ? (terms.System || "System") : formatAlter(a);
        return (
          <span key={a.id} className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full border border-border/60 bg-muted/30 text-xs max-w-full">
            {!isSystem && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#6366f1" }} aria-hidden="true" />}
            <span className="truncate max-w-[8rem]">{name}</span>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                aria-label={`Remove ${name} as author`}
                title="Remove as author"
                className="text-muted-foreground hover:text-destructive flex-shrink-0 rounded-full"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
