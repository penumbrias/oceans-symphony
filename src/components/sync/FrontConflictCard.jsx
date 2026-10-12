// "Your devices disagree about who's fronting" — the person settles it.
// Logic and the meaning of each answer: src/lib/frontConflicts.js.
//
// variant="floating": the app-wide notice (mounted once in AppLayout), so a
// background sync's conflict is seen without opening Settings.
// variant="inline": the same card inside Settings → Device sync.

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getFrontConflicts, resolveFrontConflict, FRONT_CONFLICTS_EVENT } from "@/lib/frontConflicts";

let inlineCount = 0;
const INLINE_EVENT = "symphony-front-conflict-inline";

const timeOf = (iso) => {
  try { return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }); }
  catch { return ""; }
};

export default function FrontConflictCard({ variant = "inline" }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);
  const [later, setLater] = useState(false);
  const { data: cachedAlters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  // A sync can bring alters this screen's cache hasn't seen yet — read them
  // with the conflict so no name shows as unknown.
  const [freshAlters, setFreshAlters] = useState(null);
  const alters = freshAlters || cachedAlters;

  const load = useCallback(async () => {
    try {
      const [c] = await getFrontConflicts();
      setConflict(c || null);
      if (c) setFreshAlters(await base44.entities.Alter.list());
    } catch { setConflict(null); }
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(FRONT_CONFLICTS_EVENT, load);
    return () => window.removeEventListener(FRONT_CONFLICTS_EVENT, load);
  }, [load]);
  // The floating notice steps aside while the Settings copy is on screen.
  const [inlineShown, setInlineShown] = useState(inlineCount > 0);
  useEffect(() => {
    if (variant === "inline") {
      inlineCount += 1;
      window.dispatchEvent(new Event(INLINE_EVENT));
      return () => { inlineCount -= 1; window.dispatchEvent(new Event(INLINE_EVENT)); };
    }
    const sync = () => setInlineShown(inlineCount > 0);
    window.addEventListener(INLINE_EVENT, sync);
    return () => window.removeEventListener(INLINE_EVENT, sync);
  }, [variant]);

  if (!conflict || (variant === "floating" && (later || inlineShown))) return null;

  const device = conflict.devices.length === 1 ? conflict.devices[0] : "your other device";
  const names = (sessions) => {
    if (!sessions.length) return `No one is ${t.fronting}`;
    return sessions.map((s) => {
      const a = alters.find((x) => x.id === (s.alter_id || s.primary_alter_id));
      return a ? (formatAlter(a) || a.name) : `Unknown ${t.alter}`;
    }).join(", ");
  };
  const since = (sessions) => {
    const starts = sessions.map((s) => s.start_time).filter(Boolean).sort();
    return starts.length ? ` since ${timeOf(starts[starts.length - 1])}` : "";
  };

  const choose = async (choice, label) => {
    setBusy(true);
    try {
      await resolveFrontConflict(choice);
      qc.invalidateQueries();
      toast.success(`${label}. Sync will update ${device} too.`);
      await load();
    } catch (e) {
      toast.error(e?.message || "Couldn't save that. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <ArrowLeftRight className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-sm space-y-1 min-w-0">
          <p className="font-semibold leading-tight">This device and {device} disagree about who&apos;s {t.fronting}</p>
          <p className="text-xs text-muted-foreground">
            Each one logged a {t.switch} before they synced. Pick what&apos;s true. You can still edit the times in your {t.front} history afterwards.
          </p>
        </div>
      </div>
      <div className="text-xs rounded-lg border border-border/60 divide-y divide-border/60">
        <p className="px-2.5 py-1.5"><span className="text-muted-foreground">This device: </span><span className="font-medium">{names(conflict.mine)}</span>{since(conflict.mine)}</p>
        <p className="px-2.5 py-1.5"><span className="text-muted-foreground">{device}: </span><span className="font-medium">{names(conflict.theirs)}</span>{since(conflict.theirs)}</p>
      </div>
      <div className="grid gap-1.5">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => choose("mine", "Kept this device's")}>
          Keep this device&apos;s
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => choose("theirs", `Used ${device}'s`)}>
          Use {device}&apos;s
        </Button>
        {conflict.mine.length > 0 && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => choose("both", `Both kept as ${t.fronting}`)}>
            Both are {t.fronting}
          </Button>
        )}
        {variant === "floating" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setLater(true)} className="text-muted-foreground">
            Decide later
          </Button>
        )}
      </div>
    </div>
  );

  if (variant === "floating") {
    return (
      <div
        role="dialog"
        aria-label={`${t.Fronting} conflict between devices`}
        className="fixed right-4 left-4 sm:left-auto sm:right-6 z-[190] max-w-sm mx-auto sm:mx-0 bg-card border border-border shadow-xl rounded-2xl p-4"
        style={{ bottom: "calc(var(--bottom-nav-height, 64px) + 16px)" }}
      >
        {body}
      </div>
    );
  }
  return <div className="rounded-lg border border-primary/40 bg-card p-3">{body}</div>;
}
