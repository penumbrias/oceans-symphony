import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Archive, Loader2 } from "lucide-react";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { toast } from "sonner";

// Bulk-archive several alters at once. Reuses the standard searchable/
// nested AlterTreeSelect (multi-select) so it's consistent with every
// other alter-picker; archiving is non-destructive (is_archived: true) and
// reversible from Settings → Archived, so no data is lost.
export default function MassArchiveModal({ open, onClose }) {
  const terms = useTerms();
  const qc = useQueryClient();
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (alter, on) => setSelected((s) => {
    const n = new Set(s);
    if (on) n.add(alter.id); else n.delete(alter.id);
    return n;
  });
  const setMany = (arr, on) => setSelected((s) => {
    const n = new Set(s);
    for (const a of arr) { if (on) n.add(a.id); else n.delete(a.id); }
    return n;
  });

  const close = () => { setSelected(new Set()); onClose?.(); };

  const handleArchive = async () => {
    if (selected.size === 0) return;
    const n = selected.size;
    const word = n === 1 ? terms.alter : terms.alters;
    if (typeof window !== "undefined" && !window.confirm(
      `Archive ${n} ${word}? They'll be hidden from lists but all their data is kept — restore anytime from Settings → ${terms.Alter} setup → Archived.`
    )) return;
    setBusy(true);
    try {
      for (const id of selected) {
        await base44.entities.Alter.update(id, { is_archived: true });
      }
      qc.invalidateQueries({ queryKey: ["alters"] });
      toast.success(`Archived ${n} ${word}`);
      close();
    } catch (e) {
      toast.error(e?.message || "Failed to archive");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Archive className="w-4 h-4" /> Archive {terms.alters}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Select the {terms.alters} to archive. Archiving hides them from lists but keeps all their data — you can restore them anytime from Settings.
        </p>
        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          <AlterTreeSelect
            isSelected={(id) => selected.has(id)}
            onToggle={toggle}
            onSetMany={setMany}
            selectionMode="multi"
            maxHeight="50vh"
          />
        </div>
        <div className="flex gap-2 pt-2 flex-shrink-0">
          <Button variant="outline" onClick={close} className="flex-1">Cancel</Button>
          <Button onClick={handleArchive} disabled={busy || selected.size === 0} className="flex-1">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}
            Archive{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
