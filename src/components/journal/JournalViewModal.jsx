import React from "react";
import { journalDisplayDate, normalizeTag } from "@/lib/journalDate";
import { confirm } from "@/components/shared/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Edit2, Trash2 } from "lucide-react";
import JournalReadBody from "@/components/journal/JournalReadBody";
import { TRASH_HINT } from "@/lib/trashSettings";
import { journalCoAuthorIds } from "@/lib/journalAuthors";
import { clockPattern } from "@/lib/timeFormat";

export default function JournalViewModal({ open, onClose, entry, altersById, onEdit, onDelete }) {
  if (!entry) return null;

  // `alter_id` is where some importers (Plural Star, Ampersand) put the author.
  const author = altersById?.[entry.author_alter_id || entry.alter_id];

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          {/* pr-8 keeps the title clear of the Dialog's top-right X close. The
              Edit/Delete actions live in a footer at the bottom so Delete is
              never adjacent to the close button (a mis-tap hazard). */}
          <div className="min-w-0 pr-8">
            <DialogTitle className="text-xl font-semibold leading-tight">{entry.title}</DialogTitle>
            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-1">
              <span className="text-xs text-muted-foreground">
                {format(journalDisplayDate(entry), clockPattern("MMMM d, yyyy · h:mm a"))}
              </span>
              {author && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  ·
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: author.color || "#94a3b8" }}
                  />
                  {author.name}
                </span>
              )}
              {journalCoAuthorIds(entry).map(id => {
                const a = altersById?.[id];
                if (!a) return null;
                return (
                  <span key={id} className="flex items-center gap-1 text-xs text-muted-foreground">
                    &
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: a.color || "#94a3b8" }}
                    />
                    {a.name}
                  </span>
                );
              })}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <JournalReadBody key={entry.id} entry={entry} altersById={altersById} />
        </div>

        {entry.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-border/50">
            {[...new Set(entry.tags.map(normalizeTag).filter(Boolean))].map(tag => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Actions live here — bottom of the modal, deliberately far from the
            top-right close (X) so Delete can't be hit by mistake. */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/50">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
            // Close this view modal first, then open the editor on the next
            // paint. Without the defer, Radix batches the close-animation of
            // this modal against the editor's mount-with-open and swallows the
            // editor's open transition, leaving both modals closed.
            const target = entry;
            handleClose();
            requestAnimationFrame(() => onEdit(target));
          }}>
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </Button>
          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/40"
              onClick={async () => {
                if (!(await confirm(`Delete "${entry.title || "this entry"}"? ${TRASH_HINT}`))) return;
                const target = entry;
                handleClose();
                onDelete(target);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}