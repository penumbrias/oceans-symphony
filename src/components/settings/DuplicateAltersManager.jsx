import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Copy, Loader2, Check, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// "Find & remove duplicate imported alters."
//
// Imports from Simply Plural / PluralKit match existing alters by their source
// id (sp_id) and update in place, so RE-imports no longer create copies. But
// systems imported before that matching was solid can be left with duplicate
// alters that share one sp_id (typically the older copies ended up archived).
// This repair finds those sets, KEEPS the best one (non-archived, then the most
// complete), and removes the rest — re-pointing any fronting history onto the
// kept copy first so nothing in the timeline is orphaned.

function AlterAvatar({ alter, size = 28 }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  return resolved ? (
    <img src={resolved} alt="" className="rounded-lg object-cover flex-shrink-0 border border-border/40" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-lg flex-shrink-0 flex items-center justify-center border border-border/40"
      style={{ width: size, height: size, backgroundColor: alter?.color || "hsl(var(--muted))" }}>
      <User className="w-3.5 h-3.5 text-white/80" />
    </div>
  );
}

// How "complete" an alter record is — used to pick which copy to keep. A
// non-archived copy always wins; otherwise the one with the most filled-in
// detail. Oldest record breaks ties (the original).
function completenessScore(a) {
  let s = a.is_archived ? 0 : 100000; // non-archived strongly preferred
  if (a.avatar_url) s += 50;
  if (a.description) s += Math.min(50, String(a.description).length > 0 ? 30 : 0);
  if (a.alias) s += 5;
  if (a.pronouns) s += 5;
  if (a.role) s += 5;
  if (a.birthday) s += 3;
  if (a.color) s += 2;
  if (a.emoji) s += 2;
  s += Object.keys(a.custom_fields || {}).length;
  s += Array.isArray(a.alter_custom_fields) ? a.alter_custom_fields.length : 0;
  s += (a.groups || []).length;
  return s;
}

export default function DuplicateAltersManager() {
  const t = useTerms();
  const qc = useQueryClient();
  const [working, setWorking] = useState(false);

  const { data: alters = [], isLoading } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  // Group alters that share an sp_id (only imported ones have it). A set with
  // 2+ members is a duplicate set. Within each set, the highest-scoring alter is
  // the keeper; the rest are removed.
  const dupSets = useMemo(() => {
    const bySpId = {};
    for (const a of alters) {
      if (!a.sp_id) continue; // local alters aren't import duplicates
      (bySpId[a.sp_id] ||= []).push(a);
    }
    return Object.values(bySpId)
      .filter((group) => group.length > 1)
      .map((group) => {
        const sorted = [...group].sort((x, y) => {
          const d = completenessScore(y) - completenessScore(x);
          if (d !== 0) return d;
          // tie-break: keep the oldest (original) record
          return String(x.created_date || "").localeCompare(String(y.created_date || ""));
        });
        return { keeper: sorted[0], losers: sorted.slice(1) };
      });
  }, [alters]);

  const totalLosers = dupSets.reduce((n, s) => n + s.losers.length, 0);

  const handleRemove = async () => {
    if (totalLosers === 0) return;
    if (!window.confirm(
      `Remove ${totalLosers} duplicate ${totalLosers === 1 ? t.alter : t.alters}? ` +
      `The most complete copy of each is kept and any ${t.fronting} history is moved onto it. ` +
      `This can't be undone — consider exporting a backup first (Settings → Backup & export).`
    )) return;

    setWorking(true);
    try {
      // loser id → keeper id, across every set.
      const remap = {};
      for (const { keeper, losers } of dupSets) {
        for (const l of losers) remap[l.id] = keeper.id;
      }

      // Re-point fronting history off the removed copies onto the kept one so
      // the timeline / front history isn't orphaned. (Group membership is by
      // sp_id, which the keeper shares, so groups need no change.)
      let sessionsMoved = 0;
      try {
        const sessions = await base44.entities.FrontingSession.list();
        for (const s of sessions) {
          const updates = {};
          if (remap[s.alter_id]) updates.alter_id = remap[s.alter_id];
          if (remap[s.primary_alter_id]) updates.primary_alter_id = remap[s.primary_alter_id];
          if (Array.isArray(s.co_fronter_ids) && s.co_fronter_ids.some((id) => remap[id])) {
            updates.co_fronter_ids = [...new Set(s.co_fronter_ids.map((id) => remap[id] || id))];
          }
          if (Object.keys(updates).length) {
            await base44.entities.FrontingSession.update(s.id, updates);
            sessionsMoved++;
          }
        }
      } catch (e) {
        console.warn("[dedupe] fronting-session reassign failed:", e?.message || e);
      }

      // Remove the duplicate copies.
      let removed = 0;
      for (const loserId of Object.keys(remap)) {
        try { await base44.entities.Alter.delete(loserId); removed++; }
        catch (e) { console.error("[dedupe] delete failed", loserId, e); }
      }

      qc.invalidateQueries({ queryKey: ["alters"] });
      qc.invalidateQueries({ queryKey: ["frontHistory"] });
      qc.invalidateQueries({ queryKey: ["activeFront"] });
      toast.success(
        `Removed ${removed} duplicate ${removed === 1 ? t.alter : t.alters}` +
        (sessionsMoved ? ` and moved ${sessionsMoved} ${t.fronting} session${sessionsMoved === 1 ? "" : "s"} to the kept cop${removed === 1 ? "y" : "ies"}.` : ".")
      );
    } catch (e) {
      toast.error(e?.message || "Couldn't remove duplicates");
    } finally {
      setWorking(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Finds {t.alters} that share one import id (from Simply Plural / PluralKit) — usually leftover copies from an early import. Keeps the most complete, non-archived copy of each and removes the rest. {t.Fronting} history is moved onto the kept copy.
      </p>

      {dupSets.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5 text-sm text-muted-foreground">
          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
          No duplicate imported {t.alters} found.
        </div>
      ) : (
        <>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {dupSets.map(({ keeper, losers }) => (
              <div key={keeper.sp_id} className="rounded-lg border border-border/50 bg-muted/10 p-2.5 space-y-1.5">
                {/* Keeper */}
                <div className="flex items-center gap-2">
                  <AlterAvatar alter={keeper} />
                  <span className="text-sm font-medium text-foreground flex-1 truncate">{keeper.name}</span>
                  <span className="text-[0.625rem] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30 flex-shrink-0">
                    Keep
                  </span>
                </div>
                {/* Losers */}
                {losers.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 pl-4 opacity-70">
                    <AlterAvatar alter={l} size={22} />
                    <span className="text-xs text-foreground flex-1 truncate">{l.name}</span>
                    {l.is_archived && (
                      <span className="text-[0.5625rem] text-muted-foreground italic flex-shrink-0">archived</span>
                    )}
                    <span className="text-[0.625rem] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 flex-shrink-0">
                      Remove
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <Button
            onClick={handleRemove}
            disabled={working}
            variant="outline"
            className="w-full gap-1.5 text-destructive hover:text-destructive border-destructive/30"
          >
            {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            Remove {totalLosers} duplicate {totalLosers === 1 ? t.alter : t.alters}
          </Button>
        </>
      )}
    </div>
  );
}
