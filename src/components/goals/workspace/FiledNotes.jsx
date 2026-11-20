// Notes, lists and flash-card decks inside the Notebook (v0.376.1). A note
// row opens the list sheet; its ⋯ files it inside a page or takes it back
// out to Notes & lists. Filing only sets the list's `notebook_page_id`
// (noteLists.fileInPage) — the note itself never moves or changes.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNoteLists, useNoteListWriters, listLabel, notesPath, notesFiledIn, filedPageOf } from "@/lib/noteLists";
import { plainNoteText } from "@/lib/plainNote";
import MovePageDialog from "./MovePageDialog";
import { useWorkspace } from "./WorkspaceContext";

export function useOpenList() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  return (id) => (ws?.openList ? ws.openList(id) : navigate(notesPath(id)));
}

export function NoteMenu({ list }) {
  const { index } = useWorkspace();
  const { fileInPage } = useNoteListWriters();
  const [moving, setMoving] = useState(false);
  const filed = filedPageOf(list, index);
  const file = async (pageId) => {
    setMoving(false);
    try {
      await fileInPage(list, pageId);
      const page = pageId ? index.byId.get(pageId) : null;
      toast.success(page ? `Filed in "${page.title || "Untitled"}"` : "Back in Notes & lists");
    } catch (e) { toast.error(e?.message || "Couldn't move that."); }
  };
  if (list.source === "local") return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Options for ${listLabel(list)}`}
            className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground flex-shrink-0">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMoving(true)}>{filed ? "Move to another page…" : "File in a page…"}</DropdownMenuItem>
          {filed && <DropdownMenuItem onSelect={() => file(null)}>Take out of this page</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      {moving && (
        <MovePageDialog open title={`File "${listLabel(list)}" in…`} allowTop topLabel="Notes & lists (no page)"
          currentId={filed} onClose={() => setMoving(false)} onPick={file} />
      )}
    </>
  );
}

// The notes filed in one page, as rows in that page's outline.
export function FiledNotesList({ pageId }) {
  const { index } = useWorkspace();
  const { lists, items } = useNoteLists();
  const openList = useOpenList();
  const here = notesFiledIn(lists, pageId, index);
  if (!here.length) return null;
  return (
    <ul className="space-y-1" aria-label="Notes and lists on this page">
      {here.map((l) => {
        const count = items(l.id).length;
        const first = plainNoteText(l.note_content || "").split("\n").find((x) => x.trim()) || "";
        return (
          <li key={l.id} className="flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1" data-highlight-id={l.id}>
            <button type="button" onClick={() => openList(l.id)} className="flex-1 min-w-0 text-left py-0.5">
              <span className="block text-sm font-medium truncate">{listLabel(l)}</span>
              {(first || count > 0) && (
                <span className="block text-xs text-muted-foreground truncate">
                  {[count > 0 ? (count === 1 ? "1 item" : `${count} items`) : null, first || null].filter(Boolean).join(" · ")}
                </span>
              )}
            </button>
            <NoteMenu list={l} />
          </li>
        );
      })}
    </ul>
  );
}
