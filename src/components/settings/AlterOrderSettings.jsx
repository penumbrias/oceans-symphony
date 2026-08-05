// Settings → {Alter} setup → "Order your {alters}".
//
// The system-wide manual arrangement (src/lib/alterOrder.js): what you
// place here is the order alters appear in EVERYWHERE — the {alters}
// page, the Set {Front} window, dropdowns and pickers — not just one
// widget. Anyone you don't place follows afterwards in the surface's
// normal order, so a partial arrangement is fine.

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { useAlterOrder } from "@/lib/alterOrder";
import AlterArrangementEditor from "@/components/shared/AlterArrangementEditor";

export default function AlterOrderSettings() {
  const terms = useTerms();
  const qc = useQueryClient();
  const { entries, hasOrder, settingsId } = useAlterOrder();
  const [busy, setBusy] = useState(false);

  const save = async (next) => {
    setBusy(true);
    try {
      if (settingsId) await base44.entities.SystemSettings.update(settingsId, { alter_order: next });
      else await base44.entities.SystemSettings.create({ alter_order: next });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch {
      toast.error("Couldn't save the order");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Drag {terms.alters} and whole groups into the order you want them listed. This order is used
        everywhere {terms.alters} appear — the {terms.alters} page, the Set {terms.Front} window, and
        every picker. Anyone you don't place is listed afterwards as usual.
      </p>
      <AlterArrangementEditor value={entries} onChange={save} />
      {hasOrder && (
        <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" disabled={busy}
          onClick={() => save([])}>
          Clear my order
        </Button>
      )}
    </div>
  );
}
