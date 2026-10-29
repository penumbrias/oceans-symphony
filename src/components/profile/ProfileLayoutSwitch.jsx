// Old ↔ new profile (groups v0.307.0, contacts v0.308.0) — a small block on
// the record's own settings (a group's pencil form, a contact's Options).
// Only a flag on the record moves; each layout keeps its own row, so both
// ways are lossless. Alters have it in Alter info's ⋯ menu instead.
import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usesNewProfile } from "@/lib/profileBoard";
import { switchRecordToNewProfile, revertRecordToOldProfile } from "@/lib/profileLayoutSwitch";

const QUERY_KEY = { group: ["groups"], contact: ["contacts"] };

export default function ProfileLayoutSwitch({ ownerType, record, noun = ownerType }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!record?.id) return null;
  const onNew = usesNewProfile(record);
  const run = async () => {
    setBusy(true);
    try {
      if (onNew) await revertRecordToOldProfile(ownerType, record.id);
      else await switchRecordToNewProfile(ownerType, record.id);
      if (QUERY_KEY[ownerType]) qc.invalidateQueries({ queryKey: QUERY_KEY[ownerType] });
      toast.success(onNew ? "Back on the old profile — the new one is kept for later" : "Now showing the new profile");
    } catch (e) { toast.error(e?.message || "That didn't save"); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-3 space-y-2" data-profile-layout-switch={ownerType}>
      <p className="text-sm font-medium">Profile layout</p>
      <p className="text-xs text-muted-foreground">
        {onNew
          ? `This ${noun} uses the new profile. Going back brings the old layout back exactly as it was.`
          : `The new profile is made of widgets built for ${noun === "group" ? "groups" : "contacts"}. This page's layout is kept, so you can come back to it.`}
      </p>
      <Button variant="outline" size="sm" onClick={run} disabled={busy} className="min-h-[44px] gap-1.5">
        {onNew ? <Undo2 className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
        {onNew ? "Revert to the old profile" : "Switch to the new profile"}
      </Button>
    </div>
  );
}
