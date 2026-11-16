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

// Friends page: says plainly when someone is up front but some or all friends
// can't see them, and why (v0.371.14, levels v0.372.2). Friends given sharing
// levels see exactly the alters in those levels; other friends see whoever has
// "Show when fronting" on — and new or imported profiles start with it off.
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
      if (why === "off") out.off.push(alter); // in levels or not, see below
      else if (why === "group") out.byGroup.push(alter);
    }
    return out;
  }, [activeFront, alters, groups]);

  if (!off.length && !byGroup.length) return null;

  const inLevels = (a) => Array.isArray(a.privacy_levels) && a.privacy_levels.length > 0;
  const offNames = off.map((a) => formatAlter(a));
  const offNowhere = off.filter((a) => !inLevels(a)).map((a) => formatAlter(a));
  const offLevelled = off.filter(inLevels).map((a) => formatAlter(a));
  const groupNames = byGroup.map((a) => formatAlter(a));
  const one = off.length === 1;

  const shareThem = async () => {
    const ok = await confirm({
      title: `Turn on "Show when ${t.fronting}" for ${one ? offNames[0] : `these ${t.alters}`}?`,
      body: `Friends you haven't given sharing levels will see ${listNames(offNames)} in your ${t.front} status from now on (friends with levels still see only their levels, and a friend set to "Hidden" or "Count only" still won't). You can turn this off again in ${one ? "their" : "each"} profile → Options.`,
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
          {offNowhere.length > 0 && (
            <p>
              <span className="font-medium">{listNames(offNowhere)}</span> {offNowhere.length === 1 ? "is" : "are"} {t.fronting}, but no friend can see them: "Show when {t.fronting}" is off and they're in no sharing level.
            </p>
          )}
          {offLevelled.length > 0 && (
            <p>
              <span className="font-medium">{listNames(offLevelled)}</span> {offLevelled.length === 1 ? "is" : "are"} {t.fronting}. Only friends you've given one of their sharing levels can see them, because "Show when {t.fronting}" is off.
            </p>
          )}
          {byGroup.length > 0 && (
            <p>
              <span className="font-medium">{listNames(groupNames)}</span> {byGroup.length === 1 ? "is" : "are"} {t.fronting}, but in a group set to hide from friends.
            </p>
          )}
          <p className="text-muted-foreground">
            Friends you've given sharing levels see the {t.alters} in those levels. Other friends see whoever has "Show when {t.fronting}" on.
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
