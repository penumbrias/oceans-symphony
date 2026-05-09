import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Pin, PinOff, Trash2, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Shared long-press action menu for BulletinCard and TaskBulletinCard.
 *
 * Surfaces the actions that already exist on the inline icon row plus the
 * new Pin-to-dashboard action, so the user can reach all of them via the
 * long-press gesture.
 *
 * Props:
 *   bulletin     — the record (Bulletin entity, may be a task)
 *   open / onClose
 *   onOpen?      — optional "expand the bulletin" callback (BulletinCard only;
 *                  task cards expand inline elsewhere so this is omitted there)
 */
export default function BulletinActionMenu({ bulletin, open, onClose, onOpen }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null); // "board" | "dash" | "delete" | null
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isBoardPinned = !!bulletin.is_pinned;
  const isDashPinned  = !!bulletin.dashboard_pinned;

  async function toggle(field, label) {
    setBusy(field === "is_pinned" ? "board" : "dash");
    try {
      await base44.entities.Bulletin.update(bulletin.id, { [field]: !bulletin[field] });
      qc.invalidateQueries({ queryKey: ["bulletins"] });
      toast.success(label);
      onClose();
    } catch (e) {
      toast.error(e.message || "Couldn't update");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy("delete");
    try {
      await base44.entities.Bulletin.delete(bulletin.id);
      qc.invalidateQueries({ queryKey: ["bulletins"] });
      toast.success("Deleted");
      onClose();
    } catch (e) {
      toast.error(e.message || "Couldn't delete");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xs">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => toggle("dashboard_pinned", isDashPinned ? "Unpinned from dashboard" : "Pinned to dashboard")}
            disabled={busy !== null}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border/60 bg-card hover:bg-muted/40 transition-colors text-left"
          >
            {isDashPinned ? <PinOff className="w-4 h-4 text-primary" /> : <Pin className="w-4 h-4 text-primary fill-primary/20" />}
            <span className="text-sm">{isDashPinned ? "Unpin from dashboard" : "Pin to top of dashboard"}</span>
            {busy === "dash" && <Loader2 className="ml-auto w-3.5 h-3.5 animate-spin" />}
          </button>

          <button
            type="button"
            onClick={() => toggle("is_pinned", isBoardPinned ? "Unpinned from board" : "Pinned on board")}
            disabled={busy !== null}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border/60 bg-card hover:bg-muted/40 transition-colors text-left"
          >
            {isBoardPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            <span className="text-sm">{isBoardPinned ? "Unpin from board" : "Pin on board"}</span>
            {busy === "board" && <Loader2 className="ml-auto w-3.5 h-3.5 animate-spin" />}
          </button>

          {onOpen && (
            <button
              type="button"
              onClick={() => { onOpen(); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border/60 bg-card hover:bg-muted/40 transition-colors text-left"
            >
              <Eye className="w-4 h-4" />
              <span className="text-sm">Open</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDelete}
            disabled={busy !== null}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-colors text-left ${
              confirmDelete
                ? "border-destructive/60 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "border-border/60 text-destructive/85 hover:bg-destructive/10 hover:text-destructive"
            }`}
          >
            {busy === "delete" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span className="text-sm">{confirmDelete ? "Tap again to delete" : "Delete"}</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
