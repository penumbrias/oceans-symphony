import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Users, UserPlus, FolderTree, Folder, Crown, X, Loader2 } from "lucide-react";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import AlterEditModal from "@/components/alters/AlterEditModal";
import { useTerms } from "@/lib/useTerms";

// Popup for acting on a subsystem (an alter-owned group). Used by the
// alters-list long-press, the alters-grid "manage" tile, and anywhere a
// subsystem needs quick actions: manage members, create a new member, or
// open the subsystem's profile page.
export default function SubsystemActionMenu({ group, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const t = useTerms();
  const openedAt = useRef(Date.now());
  const [showMembers, setShowMembers] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const { data: allGroups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const owner = group?.owner_alter_id ? alters.find((a) => a.id === group.owner_alter_id) : null;
  const subTerm = t.system === "system" ? "subsystem" : `sub${t.system}`;

  const close = () => onClose?.();
  const backdropClick = () => { if (Date.now() - openedAt.current > 350) close(); };

  // While managing members or creating, render only that modal (avoids any
  // z-index fight) and close the whole menu when it's dismissed.
  if (showMembers) {
    return <GroupMembersModal group={group} allGroups={allGroups} isOpen onClose={() => { setShowMembers(false); close(); }} />;
  }
  if (showCreate) {
    // Opens the full "Add New" modal prefilled into this subsystem, so the
    // user can fill out the whole profile and it lands in the subsystem.
    return <AlterEditModal alter={null} open mode="create" initialGroupIds={[group.id]} onClose={() => { setShowCreate(false); close(); }} />;
  }

  const Item = ({ icon: Icon, label, onClick, busy }) => (
    <button type="button" onClick={onClick} disabled={busy}
      className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted/50 transition-colors disabled:opacity-60">
      {busy ? <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-muted-foreground" /> : <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />}
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center" onClick={backdropClick}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs max-h-[80vh] overflow-y-auto shadow-2xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: group.color ? `${group.color}20` : "hsl(var(--muted))" }}>
            <Folder className="w-4 h-4" style={{ color: group.color || "hsl(var(--muted-foreground))" }} />
          </div>
          <span className="flex-1 min-w-0">
            <span className="block font-medium text-sm truncate">{group.emoji ? `${group.emoji} ` : ""}{group.name}</span>
            {owner && <span className="text-[0.625rem] text-muted-foreground inline-flex items-center gap-1"><Crown className="w-2.5 h-2.5 text-amber-500" /> {owner.name}'s {subTerm}</span>}
          </span>
          <button onClick={close} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="py-1">
          <Item icon={Users} label="Manage members" onClick={() => setShowMembers(true)} />
          <Item icon={UserPlus} label={`Create a new member`} onClick={() => setShowCreate(true)} />
          <Item icon={FolderTree} label="Go to profile" onClick={() => { navigate(`/group/${group.id}`); close(); }} />
        </div>
      </div>
    </div>
  );
}
