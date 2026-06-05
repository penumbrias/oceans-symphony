import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Folder, ChevronRight, User, ArrowLeft, Plus, Users, Crown, ExternalLink } from "lucide-react";
import { isValidHexColor } from "@/lib/colorUtils";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import AlterEditModal from "@/components/alters/AlterEditModal";
import { useNavigate } from "react-router-dom";
import { FrontingToggleButton } from "@/components/alters/AlterCard";
import { needsHalo, haloColor, getSurfaceBackground, adjustForContrast, groupNameColor } from "@/lib/contrast";
import { useTerms } from "@/lib/useTerms";
import { getSubsystemsOwnedBy } from "@/lib/subsystemUtils";
import useLongPress from "@/hooks/useLongPress";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import AlterCard from "./AlterCard";
import SubsystemAlterList from "./SubsystemAlterList";
import AlterGridView from "./AlterGridView";
import GroupActionMenu from "./GroupActionMenu";
import GroupIcon from "@/components/shared/GroupIcon";

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--foreground))";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function MemberRow({ alter, onClick, activeSessions, ownedSubsystem, onOpenSubsystem }) {
  const hasColor = isValidHexColor(alter.color);
  const bgColor = hasColor ? alter.color : null;
  const textColor = hasColor ? getContrastColor(alter.color) : null;
  const resolvedAvatar = useResolvedAvatarUrl(alter.avatar_url);

  return (
    <div className="flex items-center gap-2">
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={onClick} className="flex-1 min-w-0">
        {/* Single card — matches the alters-section AlterCard row exactly
            (was double-boxed: an outer bg-card/border wrapping an inner
            bg-card/border, which read as a box-in-a-box). */}
        <div
          className="bg-card pt-1 pr-4 pb-2 pl-3 rounded-xl flex items-center gap-3 border border-border/50 hover:bg-muted/30 hover:border-border transition-all cursor-pointer group"
          style={{ borderLeftColor: bgColor || "transparent", borderLeftWidth: bgColor ? 3 : 1 }}>
          <div
            className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-border/40"
            style={{ backgroundColor: bgColor || "hsl(var(--muted))" }}>
            {resolvedAvatar ?
            <img src={resolvedAvatar} alt={alter.name} className="w-full h-full object-cover"
            onError={(e) => {e.target.style.display = "none";e.target.nextSibling.style.display = "flex";}} /> :
            null}
            <div className="w-full h-full items-center justify-center"
            style={{ display: resolvedAvatar ? "none" : "flex", color: textColor || "hsl(var(--muted-foreground))" }}>
              <User className="w-5 h-5" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">{alter.name}</p>
            {alter.pronouns && <p className="text-xs text-muted-foreground truncate">{alter.pronouns}</p>}
          </div>
          {alter.role && (() => {
            // Role chip sits on bg-card (surface) — add a thin halo when
            // the alter colour is too close to the surface to read on its
            // own. Preserves the user's chosen colour, only adds a ring.
            const surfaceBg = getSurfaceBackground();
            const halo = bgColor && needsHalo(bgColor, surfaceBg);
            const fillColor = halo ? adjustForContrast(bgColor, surfaceBg) : bgColor;
            return (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: fillColor ? `${fillColor}${halo ? "55" : "20"}` : "hsl(var(--muted))",
              color: halo ? "hsl(var(--foreground))" : (bgColor || "hsl(var(--muted-foreground))"),
            }}>
              {alter.role}
            </span>
            );
          })()}
        </div>
      </motion.div>
      {ownedSubsystem && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenSubsystem?.(ownedSubsystem); }}
          title={`Open ${ownedSubsystem.name}`}
          aria-label={`Open ${ownedSubsystem.name}`}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <Folder className="w-4 h-4" style={{ color: ownedSubsystem.color || undefined }} />
        </button>
      )}
      <FrontingToggleButton alter={alter} activeSessions={activeSessions} />
    </div>);

}

function FolderRow({ group, onClick, onLongOpen }) {
  const color = group.color || "";
  // Tap drills into the group (breadcrumb browse); press-and-hold opens
  // the group's profile page. Scroll-safe via useLongPress.
  const press = useLongPress({
    onClick: () => onClick(group),
    onLongPress: () => onLongOpen?.(group),
  });
  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      {...press}
      title={`${group.name} — tap to open, hold for its profile`}
      className="bg-card pr-3 pl-3 text-left rounded-xl w-full flex items-center gap-3 border border-border/50 hover:bg-muted/30 hover:border-border transition-all cursor-pointer group"
      style={{ borderLeftColor: color || "transparent", borderLeftWidth: color ? 3 : 1, touchAction: "pan-y" }}>
      <GroupIcon group={group} boxed className="w-9 h-9" boxClassName="rounded-xl border border-border/40" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground group-hover:opacity-80 transition-opacity" style={{ color: groupNameColor(group.color) }}>{group.name}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </motion.button>);

}

export default function FolderGroupsSection({ alters, sortDir = "asc", activeSessions = [], headerControls, anonymize = "off", displayMode = "list" }) {
  const terms = useTerms();
  // Breadcrumb stack, persisted so returning from an alter profile lands
  // back in the folder you were browsing.
  const [navStack, setNavStack] = useState(() => {
    try { const raw = sessionStorage.getItem("groupsNav"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [menuGroup, setMenuGroup] = useState(null); // group folder for the actions popup
  // Subsystems (alter-owned groups) are hidden from the root groups list by
  // default — they live under their owner in the alters list. Toggle to
  // surface them here too. Persisted so the choice sticks.
  const [showSubsystems, setShowSubsystems] = useState(() => localStorage.getItem("alter_show_subsystems") === "true");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [setFrontOpen, setSetFrontOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedAlter, setSelectedAlter] = useState(null);
  const navigate = useNavigate();

  const { data: allGroups = [], refetch: refetchGroups } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list()
  });

  // Persist + prune the breadcrumb so it survives a trip to an alter
  // profile and back, but drops groups deleted while away.
  useEffect(() => {
    try { sessionStorage.setItem("groupsNav", JSON.stringify(navStack)); } catch { /* storage off */ }
  }, [navStack]);
  useEffect(() => {
    if (navStack.length === 0 || allGroups.length === 0) return;
    const valid = navStack.filter((g) => allGroups.some((x) => x.id === g.id));
    if (valid.length !== navStack.length) setNavStack(valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGroups]);

  const currentGroup = navStack.length > 0 ? navStack[navStack.length - 1] : null;
  const currentGroupKey = currentGroup ? currentGroup.id : null;

  // Get child groups at current level
  const childGroups = allGroups.
  filter((g) => {
    if (currentGroupKey === null) {
      const isRoot = !g.parent || g.parent === "" || g.parent === "root";
      // At the top level, keep subsystems out unless the toggle is on.
      if (isRoot && g.owner_alter_id && !showSubsystems) return false;
      return isRoot;
    }
    return g.parent && (g.parent === currentGroupKey || g.parent === currentGroup?.sp_id);
  }).
  sort((a, b) => (a.order || 0) - (b.order || 0));

  // Are there any subsystems at root that the toggle could reveal?
  const rootSubsystemCount = allGroups.filter((g) => (!g.parent || g.parent === "" || g.parent === "root") && g.owner_alter_id).length;

  // The owner alter of a subsystem group, if any. Shown as the "parent"
  // at the top, and excluded from the member list below so they don't
  // appear twice.
  const ownerAlter = currentGroup?.owner_alter_id
    ? alters.find((a) => a.id === currentGroup.owner_alter_id)
    : null;

  // Get members in current group (check both alter's groups array and Group entity's member_sp_ids)
  const memberAlters = currentGroup ?
  alters.filter((a) => {
    if (a.id === currentGroup.owner_alter_id) return false; // owner is the parent, not a child
    // Check if alter's groups array contains this group
    const inAlterGroups = (a.groups || []).some((g) => g.id === currentGroupKey || g.sp_id === currentGroupKey);
    // Check if this group's member_sp_ids contains the alter's sp_id
    const inGroupMembers = currentGroup.member_sp_ids?.includes(a.sp_id);
    return inAlterGroups || inGroupMembers;
  }) :
  [];

  const navigateTo = (group) => {
    if (!group) return;
    // Never push a group already in the breadcrumb — defends against any
    // ownership loop turning subsystem drill-down into an endless chain.
    if (navStack.some((g) => g.id === group.id)) return;
    setNavStack([...navStack, group]);
  };
  const navigateBack = () => setNavStack(navStack.slice(0, -1));

  return (
    <div>
      {/* Breadcrumb Navigation with Action Buttons */}
      <div className="pb-1 flex items-center gap-1 border-b border-border min-w-0">
        {navStack.length > 0 &&
        <Button
          onClick={navigateBack}
          variant="ghost"
          size="sm"
          className="gap-1.5 flex-shrink-0 px-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        }

        {/* Clickable breadcrumb — each ancestor navigates back to that level */}
        <div className="flex items-center gap-0.5 min-w-0 flex-1 text-sm overflow-hidden">
          {navStack.length === 0 ? (
            <span className="text-muted-foreground font-medium px-1">Root</span>
          ) : (
            <>
              <button
                onClick={() => setNavStack([])}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 px-1">
                Root
              </button>
              {navStack.map((group, i) => {
                const isLast = i === navStack.length - 1;
                return (
                  <React.Fragment key={group.id}>
                    <span className="text-muted-foreground/40 flex-shrink-0">/</span>
                    {isLast ? (
                      <span className="font-medium text-foreground truncate min-w-0 px-1" style={{ color: groupNameColor(group.color) }}>{group.name}</span>
                    ) : (
                      <button
                        onClick={() => setNavStack(navStack.slice(0, i + 1))}
                        className="text-muted-foreground hover:text-foreground transition-colors truncate min-w-0 max-w-[7rem] px-1">
                        {group.name}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </>
          )}
        </div>

        {navStack.length === 0 && rootSubsystemCount > 0 && (
          <Button
            onClick={() => {
              const next = !showSubsystems;
              setShowSubsystems(next);
              try { localStorage.setItem("alter_show_subsystems", String(next)); } catch {}
            }}
            variant="ghost"
            size="sm"
            className={`gap-1.5 flex-shrink-0 px-2 ${showSubsystems ? "text-amber-500" : "text-muted-foreground"}`}
            title={showSubsystems ? `Hide sub${terms.system}s` : `Show sub${terms.system}s (${rootSubsystemCount})`}>
            <Crown className="w-3.5 h-3.5" />
            {showSubsystems ? "Hide" : `Sub${terms.system}s`}
          </Button>
        )}
        {currentGroup &&
        <Button
          onClick={() => navigate(`/group/${currentGroup.id}`)}
          variant="ghost"
          size="icon"
          className="flex-shrink-0 w-8 h-8"
          title="Open group profile">
            <ExternalLink className="w-4 h-4" />
          </Button>
        }
        {currentGroup &&
        <Button
          onClick={() => setManageMembersOpen(true)}
          variant="ghost"
          size="icon"
          className="flex-shrink-0 w-8 h-8"
          title={`Manage ${terms.alters}`}>
            <Users className="w-4 h-4" />
          </Button>
        }
        {headerControls || (
          <Button
            onClick={() => setCreateGroupOpen(true)}
            variant="ghost"
            size="sm"
            className="gap-1.5 flex-shrink-0 px-2">
            <Plus className="w-4 h-4" />
            New Group
          </Button>
        )}
      </div>

      {/* Content: Folders and Members */}
      <motion.div
        key={currentGroupKey || "root"}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.15 }}
        className="space-y-2">

        {/* Subsystem root (parent) — pinned at the top of an owned group.
            Rendered with the full AlterCard so it gets the same swipe /
            long-press / blur behaviour as anywhere else. */}
        {ownerAlter && (
          <div className="space-y-1">
            <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1">
              <Crown className="w-3 h-3 text-amber-500" /> Root of this {terms.system === "system" ? "subsystem" : `sub${terms.system}`}
            </p>
            <AlterCard alter={ownerAlter} index={0} activeSessions={activeSessions} anonymize={anonymize} />
            <div className="h-px bg-border/40 my-1" />
          </div>
        )}

        {/* Group folders — tap to drill in, hold for the actions popup. */}
        {childGroups.map((g) =>
        <FolderRow key={g.id} group={g} onClick={navigateTo} onLongOpen={(grp) => setMenuGroup(grp)} />
        )}

        {/* Member alters — rendered with the exact same components as the
            alters section, so they get swipe-to-front, the long-press
            action menu, anonymize blur, subsystem nesting, and the
            grid/list display mode. */}
        {memberAlters.length > 0 && (
          displayMode === "list" ? (
            <SubsystemAlterList
              topAlters={memberAlters}
              allAlters={alters}
              allGroups={allGroups}
              activeSessions={activeSessions}
              anonymize={anonymize}
            />
          ) : (
            <AlterGridView
              alters={memberAlters}
              activeSessions={activeSessions}
              allAlters={alters}
              allGroups={allGroups}
              cols={parseInt(displayMode) || 3}
              anonymize={anonymize}
            />
          )
        )}

        {childGroups.length === 0 && memberAlters.length === 0 && navStack.length > 0 &&
        <div className="flex flex-col items-center justify-center py-8 text-center">
            <Folder className="w-10 h-10 text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">This group is empty.</p>
          </div>
        }
      </motion.div>

      {menuGroup && <GroupActionMenu group={menuGroup} onClose={() => setMenuGroup(null)} />}

      {/* Modals */}
      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => {
          setCreateGroupOpen(false);
          refetchGroups();
        }}
        parentGroup={currentGroup || null} />
      

      {currentGroup &&
      <GroupMembersModal
        group={currentGroup}
        allGroups={allGroups}
        isOpen={manageMembersOpen}
        onClose={() => {
          setManageMembersOpen(false);
          refetchGroups();
        }} />

      }

      {selectedAlter &&
      <>
          <SetFrontModal
          open={setFrontOpen}
          onClose={() => {
            setSetFrontOpen(false);
            setSelectedAlter(null);
          }}
          alters={alters}
          currentSession={activeSessions[0] || null} />
        
          <AlterEditModal
          alter={selectedAlter}
          open={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setSelectedAlter(null);
          }} />
        
        </>
      }
    </div>);

}