// "Try the new profile" (alters v0.305.0, groups v0.307.0) — shown at the
// top of a profile still on its old layout. Switching only flips a flag on
// the record: the layout the profile has now is kept as it is, and the
// pencil has "Revert to the old profile" any time.
//
// "Not now" answers for this profile; "Don't ask again" for every profile
// of that type (a field on SystemSettings, so it syncs and is in backups).

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { usesNewProfile } from "@/lib/profileBoard";
import { refreshAlter } from "@/lib/alterEntry";
import {
  switchRecordToNewProfile, revertRecordToOldProfile, dismissRecordNewProfileOffer, turnOffNewProfileOffer, OFFER_OFF_FIELD,
} from "@/lib/profileLayoutSwitch";

const refresh = (qc, ownerType, id) => {
  if (ownerType === "alter") refreshAlter(qc, id);
  else qc.invalidateQueries({ queryKey: ["groups"] });
};

export default function NewProfileOffer({ alter = null, record = null, ownerType = "alter" }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const rec = record || alter;
  const { data: settingsRows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = settingsRows[0] || null;
  if (!rec?.id || usesNewProfile(rec) || rec.new_profile_offer_dismissed || settings?.[OFFER_OFF_FIELD[ownerType]]) return null;

  const run = async (fn, done) => {
    setBusy(true);
    try { await fn(); done?.(); } catch (e) { toast.error(e?.message || "That didn't save"); } finally { setBusy(false); }
  };
  const switchNow = () => run(() => switchRecordToNewProfile(ownerType, rec.id), () => {
    refresh(qc, ownerType, rec.id);
    toast.success("Now showing the new profile", {
      action: { label: "Undo", onClick: async () => { await revertRecordToOldProfile(ownerType, rec.id); refresh(qc, ownerType, rec.id); } },
    });
  });
  const notNow = () => run(() => dismissRecordNewProfileOffer(ownerType, rec.id), () => refresh(qc, ownerType, rec.id));
  const never = () => run(() => turnOffNewProfileOffer(ownerType), () => {
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
    toast.success(`Won't ask again. Settings → ${t.Alter} setup → Profile layouts can switch everyone.`);
  });

  const what = ownerType === "group"
    ? `Five pages made of widgets built for groups: Profile, ${t.Fronting}, Board, Notes and Journal. This page's layout is kept, and you can go back any time from the pencil.`
    : `Seven pages made of widgets built for profiles: Profile, ${t.Fronting}, Messages, Notes, Journal, Wishes and Connections. This page's layout is kept, and you can go back any time from the pencil's ⋯ menu.`;
  return (
    <section aria-labelledby="new-profile-offer-title" data-new-profile-offer=""
      className="mx-2 mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-2">
      <h2 id="new-profile-offer-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" /> Try the new profile
      </h2>
      <p className="text-sm text-muted-foreground">{what}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" disabled={busy} onClick={switchNow} className="min-h-[44px]">Switch to it</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={notNow} className="min-h-[44px]">Not now</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={never} className="min-h-[44px] text-muted-foreground">{ownerType === "group" ? "Don't ask on any group" : "Don't ask on any profile"}</Button>
      </div>
    </section>
  );
}
