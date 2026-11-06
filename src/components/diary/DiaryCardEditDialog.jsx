/**
 * DiaryCardEditDialog — edit or delete one saved DiaryCard.
 *
 * The fields are the SAME DiarySection the Quick Check-In's diary section and
 * the diary widget render (one diary editor, not a fork) — this dialog only
 * loads a saved card into it and writes the changes back to that card.
 *
 * Saving updates the card in place (it never creates a second card), and only
 * touches the diary fields DiarySection edits — the card's date, notes,
 * emotions and who-was-fronting stay exactly as they were. Deleting always
 * asks first.
 */
import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteWithUndo } from "@/lib/undoDelete";
import DiarySection from "@/components/diary/DiarySection";
import { diaryCardToData, diaryDataToPatch } from "@/lib/diaryData";

export { diaryCardToData, diaryDataToPatch } from "@/lib/diaryData";
import { clockPattern } from "@/lib/timeFormat";

// Goes to the trash at once, with an Undo on the toast (UI critique H3).
export async function deleteDiaryCard(card, queryClient) {
  if (!card?.id) return false;
  return deleteWithUndo({
    label: "Diary card deleted",
    run: () => base44.entities.DiaryCard.delete(card.id),
    refresh: () => queryClient?.invalidateQueries({ queryKey: ["diaryCards"] }),
  });
}

export default function DiaryCardEditDialog({ card, onClose }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState({});
  const [saving, setSaving] = useState(false);
  const isOpen = !!card;

  useEffect(() => { setData(diaryCardToData(card)); }, [card]);

  const handleSave = async () => {
    if (!card?.id || saving) return;
    setSaving(true);
    try {
      await base44.entities.DiaryCard.update(card.id, diaryDataToPatch(data));
      queryClient.invalidateQueries({ queryKey: ["diaryCards"] });
      toast.success("Diary card updated");
      onClose?.();
    } catch (e) {
      toast.error(e?.message || "Couldn't save the diary card.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (await deleteDiaryCard(card, queryClient)) onClose?.();
  };

  const when = card?.date ? format(new Date(`${card.date}T12:00:00`), "EEEE, MMM d") : "";
  const time = card?.created_date ? format(new Date(card.created_date), clockPattern("h:mm a")) : "";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-0 p-0" data-testid="diary-card-edit-dialog">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <DialogTitle>Edit diary card</DialogTitle>
          {(when || time) && (
            <p className="text-xs text-muted-foreground">{[when, time].filter(Boolean).join(" · ")}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Set a rating to 0 or switch a toggle off to clear an answer that was logged by mistake.
          </p>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
          <DiarySection data={data} onChange={(groupKey, value) => setData((prev) => ({ ...prev, [groupKey]: value }))} />
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border/50">
          <Button type="button" variant="ghost" size="sm" onClick={handleDelete} disabled={saving}
            className="text-destructive hover:text-destructive gap-1.5">
            <Trash2 className="w-4 h-4" /> Delete card
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
