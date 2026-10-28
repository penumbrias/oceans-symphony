// "Try the new profile" (v0.305.0) — shown at the top of a profile still on
// the classic layout (or the v0.297 garden page). Switching only flips a
// flag on the record: the layout the profile has now is kept as it is, and
// the pencil → ⋯ menu has "Revert to the old profile" any time.
//
// "Not now" answers for this profile; "Don't ask again" for every profile
// (a field on SystemSettings, so it syncs and is in backups).

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { usesNewProfile } from "@/lib/profileBoard";
import { switchToNewProfile, revertToOldProfile, dismissNewProfileOffer, refreshAlter } from "@/lib/alterEntry";

export default function NewProfileOffer({ alter }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: settingsRows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = settingsRows[0] || null;
  if (!alter?.id || usesNewProfile(alter) || alter.new_profile_offer_dismissed || settings?.new_profile_offer_off) return null;

  const run = async (fn, done) => {
    setBusy(true);
    try { await fn(); done?.(); } catch (e) { toast.error(e?.message || "That didn't save"); } finally { setBusy(false); }
  };
  const switchNow = () => run(() => switchToNewProfile(alter.id), () => {
    refreshAlter(qc, alter.id);
    toast.success("Now showing the new profile", {
      action: { label: "Undo", onClick: async () => { await revertToOldProfile(alter.id); refreshAlter(qc, alter.id); } },
    });
  });
  const notNow = () => run(() => dismissNewProfileOffer(alter.id), () => refreshAlter(qc, alter.id));
  const never = () => run(async () => {
    const fresh = (await base44.entities.SystemSettings.list())[0];
    if (fresh?.id) await base44.entities.SystemSettings.update(fresh.id, { new_profile_offer_off: true });
    else await base44.entities.SystemSettings.create({ new_profile_offer_off: true });
  }, () => {
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
    toast.success(`Won't ask again. Settings → ${t.Alter} setup → Profile layouts can switch everyone.`);
  });

  return (
    <section aria-labelledby="new-profile-offer-title" data-new-profile-offer=""
      className="mx-2 mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-2">
      <h2 id="new-profile-offer-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" /> Try the new profile
      </h2>
      <p className="text-sm text-muted-foreground">
        Seven pages made of widgets built for profiles: Profile, {t.Fronting}, Messages, Notes, Journal, Wishes and Connections.
        This page's layout is kept, and you can go back any time from the pencil's ⋯ menu.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" disabled={busy} onClick={switchNow} className="min-h-[44px]">Switch to it</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={notNow} className="min-h-[44px]">Not now</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={never} className="min-h-[44px] text-muted-foreground">Don't ask on any profile</Button>
      </div>
    </section>
  );
}
