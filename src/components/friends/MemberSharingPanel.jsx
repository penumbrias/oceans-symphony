import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown, ChevronRight, Search, Settings2, ShieldCheck } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getPrivacyLevels, sortedLevels } from "@/lib/privacyLevels";
import { pushAlterShares } from "@/lib/friendsShare";
import PrivacyLevelsManager from "@/components/friends/PrivacyLevelsManager";

// Friends-page hub for member sharing: define privacy levels and assign members
// to them in one place (previously only reachable from each member's profile).
// Per-friend grants live on each friend's card; this is the "what's shareable"
// half. Collapsible so it stays out of the way.
export default function MemberSharingPanel() {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showManager, setShowManager] = useState(false);

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const levels = sortedLevels(getPrivacyLevels(settingsList[0]));

  const liveAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return liveAlters.filter((a) => !q || a.name?.toLowerCase().includes(q) || a.alias?.toLowerCase().includes(q));
  }, [liveAlters, search]);

  const sharedCount = liveAlters.filter((a) => Array.isArray(a.privacy_levels) && a.privacy_levels.length).length;

  const toggleLevel = async (alter, levelId) => {
    const cur = Array.isArray(alter.privacy_levels) ? alter.privacy_levels : [];
    const next = cur.includes(levelId) ? cur.filter((id) => id !== levelId) : [...cur, levelId];
    await base44.entities.Alter.update(alter.id, { privacy_levels: next });
    queryClient.invalidateQueries({ queryKey: ["alters"] });
    queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
    pushAlterShares().catch(() => {}); // refresh what friends see
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-muted/20 transition-colors">
        <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Member sharing &amp; privacy levels</p>
          <p className="text-xs text-muted-foreground">
            {levels.length === 0 ? "Set up levels to share members with friends" : `${sharedCount} ${sharedCount === 1 ? terms.alter : terms.alters} in a sharing level`}
          </p>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-border/30 pt-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground flex-1">
              Levels decide what each shows. Put {terms.alters} in the levels you want, then grant friends those levels on their cards. {terms.Alters} are private until added to a level.
            </p>
            <button onClick={() => setShowManager(true)} className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <Settings2 className="w-3.5 h-3.5" /> Manage levels
            </button>
          </div>

          {levels.length === 0 ? (
            <p className="text-xs text-muted-foreground/70 italic text-center py-3">No privacy levels yet — tap “Manage levels” to create some.</p>
          ) : (
            <>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${terms.alters}…`}
                  className="w-full h-8 pl-8 pr-2 text-xs rounded-lg border border-border/50 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="max-h-72 overflow-y-auto overscroll-contain space-y-1.5">
                {filtered.map((a) => {
                  const cur = Array.isArray(a.privacy_levels) ? a.privacy_levels : [];
                  return (
                    <div key={a.id} className="rounded-lg border border-border/40 bg-muted/10 p-2">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-4 h-4 rounded-full flex-shrink-0 border border-black/10 dark:border-white/15" style={{ backgroundColor: a.color || "#6366f1" }} />
                        <span className="text-xs font-medium truncate">{formatAlter(a)}</span>
                        {cur.length === 0 && <span className="text-[0.625rem] text-muted-foreground ml-auto">Private</span>}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {levels.map((l) => {
                          const on = cur.includes(l.id);
                          return (
                            <button key={l.id} type="button" aria-pressed={on} onClick={() => toggleLevel(a, l.id)}
                              className={`text-[0.6875rem] px-2 py-0.5 rounded-full border transition-colors ${on ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:bg-muted/40"}`}>
                              {l.number}. {l.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {filtered.length === 0 && <p className="text-xs text-muted-foreground/60 italic px-1 py-2 text-center">No matches.</p>}
              </div>
            </>
          )}
        </div>
      )}

      <PrivacyLevelsManager isOpen={showManager} onClose={() => setShowManager(false)} />
    </div>
  );
}
