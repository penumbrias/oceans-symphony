import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FolderTree } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { pushAlterShares } from "@/lib/friendsShare";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";

// Assign ALTERS to a single privacy level — the inverse of the per-alter pills.
// Uses the shared AlterTreeSelect (Members by-subsystem/flat + Groups tabs,
// search, lazy load, select/clear-all). Selection writes alter.privacy_levels.
export default function LevelMembersModal({ isOpen, onClose, level }) {
  const terms = useTerms();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  if (!level) return null;

  const isSelected = (id) => {
    const a = altersById[id];
    return Array.isArray(a?.privacy_levels) && a.privacy_levels.includes(level.id);
  };

  const onSetMany = async (targets, on) => {
    if (!targets.length) return;
    setBusy(true);
    try {
      for (const a of targets) {
        const cur = Array.isArray(a.privacy_levels) ? a.privacy_levels : [];
        const has = cur.includes(level.id);
        if (on && !has) await base44.entities.Alter.update(a.id, { privacy_levels: [...cur, level.id] });
        else if (!on && has) await base44.entities.Alter.update(a.id, { privacy_levels: cur.filter((x) => x !== level.id) });
      }
      qc.invalidateQueries({ queryKey: ["alters"] });
      pushAlterShares().catch(() => {});
    } catch (e) { toast.error(e?.message || "Couldn't update"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><FolderTree className="w-4 h-4" /> “{level.number}. {level.name}”</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Add or remove {terms.alters} from this level. A friend sees a level only if you grant it to them on their card.
        </p>
        <AlterTreeSelect isSelected={isSelected} onToggle={(a, on) => onSetMany([a], on)} onSetMany={onSetMany} busy={busy} />
      </DialogContent>
    </Dialog>
  );
}
