import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Users, Crown, FolderTree, X, ArrowLeft, ArrowRightLeft } from "lucide-react";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import TransferToSystemModal from "@/components/systems/TransferToSystemModal";
import { hasMultipleSystems } from "@/lib/systems";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import GroupIcon from "@/components/shared/GroupIcon";
import { useTerms } from "@/lib/useTerms";
import { groupNameColor } from "@/lib/contrast";
import { wouldCreateOwnershipCycle } from "@/lib/subsystemUtils";

// Popup for acting on a regular group folder (parity with the alter and
// subsystem menus): manage members, assign a "root" (turns it into a
// subsystem), or open the group's profile.
export default function GroupActionMenu({ group, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const t = useTerms();
  const openedAt = useRef(Date.now());
  const [showMembers, setShowMembers] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const { data: allGroups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const subTerm = t.system === "system" ? "subsystem" : `sub${t.system}`;

  const close = () => onClose?.();
  const backdropClick = () => { if (Date.now() - openedAt.current > 350) close(); };

  if (showMembers) {
    return <GroupMembersModal group={group} allGroups={allGroups} isOpen onClose={() => { setShowMembers(false); close(); }} />;
  }

  if (showTransfer) {
    return <TransferToSystemModal group={group} onClose={() => { setShowTransfer(false); close(); }} />;
  }

  const candidates = alters.filter((a) => !a.is_archived);
  const disabledIds = new Set(
    candidates.filter((a) => wouldCreateOwnershipCycle(allGroups, alters, group.id, a.id)).map((a) => a.id)
  );

  const assignRoot = async (id) => {
    try {
      await base44.entities.Group.update(group.id, { owner_alter_id: id || "" });
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["alters"] });
      toast.success(id ? `Root set — this is now a ${subTerm}.` : "Root cleared.");
      close();
    } catch (e) {
      toast.error(e.message || "Failed to set root");
    }
  };

  const Item = ({ icon: Icon, label, onClick }) => (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted/50 transition-colors">
      <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center" onClick={backdropClick}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs max-h-[80vh] overflow-y-auto shadow-2xl pb-[calc(env(safe-area-inset-bottom)_+_var(--bottom-nav-height,56px))] sm:pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <GroupIcon group={group} boxed className="w-9 h-9" boxClassName="rounded-lg border border-border/40" />
          <span className="flex-1 min-w-0 font-medium text-sm truncate" style={{ color: groupNameColor(group.color) }}>{group.emoji ? `${group.emoji} ` : ""}{group.name}</span>
          <button onClick={close} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {assigning ? (
          <div className="p-3 space-y-2">
            <button type="button" onClick={() => setAssigning(false)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground" aria-label="Back" title="Back">
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <p className="text-[0.6875rem] text-muted-foreground leading-snug">
              Pick an {t.alter} to be this group's root — that turns it into their {subTerm}.
            </p>
            <AlterSearchSelect
              alters={candidates}
              value={group.owner_alter_id || null}
              onChange={assignRoot}
              terms={t}
              placeholder="Choose a root…"
              noneLabel="No root (regular group)"
              disabledIds={disabledIds}
              disabledLabel="would loop"
              zIndex={80}
            />
          </div>
        ) : (
          <div className="py-1">
            <Item icon={Users} label="Manage members" onClick={() => setShowMembers(true)} />
            <Item icon={Crown} label={group.owner_alter_id ? "Change root" : "Assign root"} onClick={() => setAssigning(true)} />
            {hasMultipleSystems() && (
              <Item icon={ArrowRightLeft} label={`Move to another ${t.system}`} onClick={() => setShowTransfer(true)} />
            )}
            <Item icon={FolderTree} label="Go to profile" onClick={() => { navigate(`/group/${group.id}`); close(); }} />
          </div>
        )}
      </div>
    </div>
  );
}
