import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown, ChevronRight, Settings2, ShieldCheck, Users } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { getPrivacyLevels, sortedLevels, selectablePillClass } from "@/lib/privacyLevels";
import { pushAlterShares } from "@/lib/friendsShare";
import PrivacyLevelsManager from "@/components/friends/PrivacyLevelsManager";
import LevelMembersModal from "@/components/friends/LevelMembersModal";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";

// Friends-page hub for member sharing: define privacy levels and assign members
// to them in one place (previously only reachable from each member's profile).
// Per-friend grants live on each friend's card; this is the "what's shareable"
// half. Collapsible so it stays out of the way.
export default function MemberSharingPanel() {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [levelMembersFor, setLevelMembersFor] = useState(null);

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const levels = sortedLevels(getPrivacyLevels(settingsList[0]));

  const liveAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const altersById = useMemo(() => Object.fromEntries(liveAlters.map((a) => [a.id, a])), [liveAlters]);

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
              {/* Per-level member management — assign whole groups / subsystems
                  or individual {alters} to a level (the inverse of the pills
                  below). */}
              <div className="space-y-1">
                <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground px-0.5">Manage by level</p>
                {levels.map((l) => {
                  const count = liveAlters.filter((a) => Array.isArray(a.privacy_levels) && a.privacy_levels.includes(l.id)).length;
                  return (
                    <button key={l.id} type="button" onClick={() => setLevelMembersFor(l)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/40 bg-muted/10 hover:bg-muted/30 text-left transition-colors">
                      <Users className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <span className="text-xs font-medium flex-1 truncate">{l.number}. {l.name}</span>
                      <span className="text-[0.625rem] text-muted-foreground">{count} {count === 1 ? terms.alter : terms.alters}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    </button>
                  );
                })}
              </div>

              <p className="text-[0.625rem] text-muted-foreground px-0.5 pt-1">Or set levels per {terms.alter}:</p>

              <AlterTreeSelect
                isSelected={(id) => { const a = altersById[id]; return Array.isArray(a?.privacy_levels) && a.privacy_levels.length > 0; }}
                renderControl={(a) => {
                  const cur = Array.isArray(a.privacy_levels) ? a.privacy_levels : [];
                  return (
                    <div className="flex flex-wrap gap-1 items-center">
                      {cur.length === 0 && <span className="text-[0.625rem] text-muted-foreground mr-1">Private</span>}
                      {levels.map((l) => {
                        const on = cur.includes(l.id);
                        return (
                          <button key={l.id} type="button" aria-pressed={on} onClick={() => toggleLevel(a, l.id)}
                            className={`text-[0.6875rem] px-2 py-0.5 rounded-full border transition-colors ${selectablePillClass(on)}`}>
                            {on ? "✓ " : ""}{l.number}. {l.name}
                          </button>
                        );
                      })}
                    </div>
                  );
                }}
                maxHeight="48vh"
              />
            </>
          )}
        </div>
      )}

      <PrivacyLevelsManager isOpen={showManager} onClose={() => setShowManager(false)} />
      <LevelMembersModal isOpen={!!levelMembersFor} level={levelMembersFor} onClose={() => setLevelMembersFor(null)} />
    </div>
  );
}
