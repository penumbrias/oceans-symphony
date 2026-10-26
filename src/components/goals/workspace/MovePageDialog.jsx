// "Move to…": a searchable list of every page, indented by nesting.
// Pages the thing can't go into (itself, its own sections) are greyed out.
import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { flattenPages, wouldNest } from "@/lib/goalTree";
import { useWorkspace, inputCls } from "./WorkspaceContext";

export default function MovePageDialog({ open, onClose, title = "Move to…", movingPageId = null, allowTop = false, currentId = null, onPick }) {
  const { index } = useWorkspace();
  const [q, setQ] = useState("");
  const rows = useMemo(() => flattenPages(index), [index]);
  const want = q.trim().toLowerCase();
  const shown = want ? rows.filter((r) => String(r.page.title || "").toLowerCase().includes(want)) : rows;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setQ(""); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages…" aria-label="Search pages" autoFocus />
        <div className="max-h-[50vh] overflow-y-auto overscroll-contain space-y-0.5 mt-2" role="listbox" aria-label="Pages">
          {allowTop && !want && (
            <button type="button" role="option" aria-selected={false} disabled={currentId === null}
              onClick={() => { onPick(null); setQ(""); }}
              className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted/50 disabled:opacity-40">
              Top level (its own goal)
            </button>
          )}
          {shown.map(({ page, depth }) => {
            const blocked = movingPageId ? wouldNest(index, movingPageId, page.id) : false;
            const here = page.id === currentId;
            return (
              <button key={page.id} type="button" role="option" aria-selected={here} disabled={blocked || here}
                onClick={() => { onPick(page.id); setQ(""); }}
                className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted/50 disabled:opacity-40 flex items-center gap-1 min-w-0">
                {!want && depth > 0 && <span style={{ width: depth * 14 }} className="flex-shrink-0 text-muted-foreground text-xs text-right">↳</span>}
                {page.icon && <span aria-hidden="true">{page.icon}</span>}
                <span className="truncate">{page.title || "Untitled"}</span>
                {here && <span className="text-xs text-muted-foreground ml-auto">here now</span>}
              </button>
            );
          })}
          {shown.length === 0 && <p className="text-sm text-muted-foreground px-2 py-3">No pages match.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
