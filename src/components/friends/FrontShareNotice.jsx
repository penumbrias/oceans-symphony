import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";
import { collectFronting, frontShareBlock } from "@/lib/friendFronters";
import { setAlterFields } from "@/lib/alterEntry";
import { confirm } from "@/components/shared/ConfirmDialog";
import { toast } from "sonner";

const listNames = (names) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// Friends page: says plainly when someone is up front but friends can't see
// them, and why (v0.371.14). Front status and sharing levels are two separate
// choices — levels decide whose PROFILE a friend can open, "Show when
// fronting" decides who appears in the front status — and new or imported
// profiles start with front sharing off. Without this, a friend just saw
// "No one fronting" and nobody could tell why.
export default function FrontShareNotice() {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: activeFront = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });

  const { off, byGroup } = useMemo(() => {
    const byId = new Map(alters.map((a) => [a.id, a]));
    const hiddenByGroup = getAlterIdsByGroupFlag(groups, alters, "hide_from_friends");
    const out = { off: [], byGroup: [] };
    for (const { alterId } of collectFronting(activeFront)) {
      const alter = byId.get(alterId);
      const why = frontShareBlock(alter, hiddenByGroup);
      if (why === "off") out.off.push(alter);
      else if (why === "group") out.byGroup.push(alter);
    }
    return out;
  }, [activeFront, alters, groups]);

  if (!off.length && !byGroup.length) return null;

  const offNames = off.map((a) => formatAlter(a));
  const groupNames = byGroup.map((a) => formatAlter(a));
  const one = off.length === 1;

  const shareThem = async () => {
    const ok = await confirm({
      title: one ? `Show ${offNames[0]} to friends when ${t.fronting}?` : `Show these ${t.alters} to friends when ${t.fronting}?`,
      body: `Every friend will see ${listNames(offNames)} in your ${t.front} status from now on (a friend you set to "Hidden" or "Count only" still won't). You can turn this off again in ${one ? "their" : "each"} profile → Options.`,
      confirmLabel: `Show when ${t.fronting}`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      for (const a of off) await setAlterFields(a.id, { friends_visible: true });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      for (const a of off) queryClient.invalidateQueries({ queryKey: ["alter", a.id] });
      toast.success("Friends will see them on the next update.");
    } catch (e) {
      toast.error(e?.message || "Couldn't change that — nothing was shared.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
      <div className="flex items-start gap-2.5">
        <EyeOff className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1.5 text-xs text-foreground/90">
          {off.length > 0 && (
            <p>
              <span className="font-medium">{listNames(offNames)}</span> {one ? "is" : "are"} {t.fronting}, but friends can't see them: "Show when {t.fronting}" is off in their profile.
            </p>
          )}
          {byGroup.length > 0 && (
            <p>
              <span className="font-medium">{listNames(groupNames)}</span> {byGroup.length === 1 ? "is" : "are"} {t.fronting}, but in a group set to hide from friends.
            </p>
          )}
          <p className="text-muted-foreground">
            Sharing levels only decide whose profile a friend can see. Who shows as {t.fronting} is a separate switch on each {t.alter}.
          </p>
        </div>
      </div>
      {off.length > 0 && (
        <button
          type="button"
          onClick={shareThem}
          disabled={busy}
          className="ml-6 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50"
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
          {one ? `Show ${offNames[0]} when ${t.fronting}…` : `Show them when ${t.fronting}…`}
        </button>
      )}
    </div>
  );
}
