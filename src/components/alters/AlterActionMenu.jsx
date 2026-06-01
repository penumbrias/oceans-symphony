import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { User, FolderPlus, FolderTree, Zap, Star, Users, X, Loader2, Pin, UserMinus } from "lucide-react";
import { toggleFrontFor, togglePrimaryFor } from "@/hooks/useSwipeActions";
import { getSubsystemsOwnedBy } from "@/lib/subsystemUtils";
import GroupPickerModal from "@/components/groups/GroupPickerModal";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// Long-press popup for an alter chip/icon on the alters page. Actions:
// go to profile, create/open subsystem, toggle front, toggle primary,
// add to groups (reuses the same GroupPickerModal as the profile's
// "Edit groups"). Dismiss by tapping the backdrop, the X, or any action.
export default function AlterActionMenu({ alter, activeSessions = [], onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const t = useTerms();
  const resolvedAvatar = useResolvedAvatarUrl(alter?.avatar_url);
  // Ignore the synthetic click the WebView fires right after the
  // long-press — without this it could hit the backdrop and close the
  // menu the instant it opens.
  const openedAt = useRef(Date.now());
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: allGroups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const ownedSub = getSubsystemsOwnedBy(allGroups, alter.id)[0] || null;
  // Subsystems this alter is a MEMBER of (not the owner) — so they can be
  // removed from here.
  const memberOfSubs = allGroups.filter((g) =>
    g.owner_alter_id && g.owner_alter_id !== alter.id && (
      (alter.groups || []).some((ag) => ag.id === g.id || ag.sp_id === g.id) ||
      (g.member_sp_ids || []).includes(alter.sp_id || alter.id)
    )
  );

  const leaveSubsystem = async (g) => {
    try {
      const key = alter.sp_id || alter.id;
      await base44.entities.Alter.update(alter.id, {
        groups: (alter.groups || []).filter((x) => x.id !== g.id && x.sp_id !== g.id),
      });
      await base44.entities.Group.update(g.id, {
        member_sp_ids: (g.member_sp_ids || []).filter((id) => id !== key),
      });
      qc.invalidateQueries({ queryKey: ["alters"] });
      qc.invalidateQueries({ queryKey: ["alter", alter.id] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      toast.success(`${alter.name} removed from ${g.name}`);
    } catch (e) {
      toast.error(e.message || "Failed to remove");
    }
  };
  const mySession = activeSessions.find((s) => s.alter_id === alter.id);
  const isFronting = !!mySession;
  const isPrimary = mySession?.is_primary ?? false;
  const subTerm = t.system === "system" ? "subsystem" : `sub${t.system}`;

  const close = () => onClose?.();
  const backdropClick = () => { if (Date.now() - openedAt.current > 350) close(); };
  const go = (fn) => { fn?.(); close(); };

  const togglePin = async () => {
    try {
      await base44.entities.Alter.update(alter.id, { is_pinned: !alter.is_pinned });
      qc.invalidateQueries({ queryKey: ["alters"] });
      qc.invalidateQueries({ queryKey: ["alter", alter.id] });
      toast.success(alter.is_pinned ? `${alter.name} unpinned` : `${alter.name} pinned to top`);
    } catch (e) {
      toast.error(e.message || "Failed to update pin");
    }
  };

  const createSubsystem = async () => {
    setCreating(true);
    try {
      const g = await base44.entities.Group.create({
        name: `${alter.name}'s ${subTerm}`,
        color: alter.color || "#8b5cf6",
        parent: "",
        member_sp_ids: [],
        owner_alter_id: alter.id,
      });
      qc.invalidateQueries({ queryKey: ["groups"] });
      navigate(`/group/${g.id}`);
      close();
    } catch (e) {
      toast.error(e.message || "Failed to create subsystem");
      setCreating(false);
    }
  };

  // While the group picker is open, render ONLY it — unmounting the menu
  // overlay avoids any z-index fight with the picker's dialog.
  if (showGroupPicker) {
    return <GroupPickerModal alter={alter} open onClose={() => { setShowGroupPicker(false); close(); }} />;
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
      <div
        className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs max-h-[80vh] overflow-y-auto shadow-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center border border-border/40 flex-shrink-0"
            style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}>
            {resolvedAvatar
              ? <img src={resolvedAvatar} alt="" className="w-full h-full object-cover" />
              : <User className="w-4 h-4 text-white" />}
          </div>
          <span className="font-medium text-sm flex-1 truncate">{alter.emoji ? `${alter.emoji} ` : ""}{alter.name}</span>
          <button onClick={close} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="py-1">
          <Item icon={User} label="Go to profile" onClick={() => go(() => navigate(`/alter/${alter.id}`))} />
          <Item icon={Pin} label={alter.is_pinned ? "Unpin from top" : "Pin to top"} onClick={() => go(togglePin)} />
          {ownedSub
            ? <Item icon={FolderTree} label={`Go to ${ownedSub.name}`} onClick={() => go(() => navigate(`/group/${ownedSub.id}`))} />
            : <Item icon={FolderPlus} label={`Create ${subTerm}`} onClick={createSubsystem} busy={creating} />}
          <Item icon={Zap} label={isFronting ? `Remove from ${t.front}` : `Add to ${t.front}`}
            onClick={() => go(() => toggleFrontFor(alter, activeSessions, base44, qc, toast))} />
          <Item icon={Star} label={isPrimary ? "Demote from primary" : `Make primary ${t.fronter}`}
            onClick={() => go(() => togglePrimaryFor(alter, activeSessions, base44, qc, toast))} />
          <Item icon={Users} label="Add to groups" onClick={() => setShowGroupPicker(true)} />
          {memberOfSubs.map((g) => (
            <Item key={g.id} icon={UserMinus} label={`Remove from ${g.name}`} onClick={() => go(() => leaveSubsystem(g))} />
          ))}
        </div>
      </div>
    </div>
  );
}
