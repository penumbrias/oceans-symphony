import React, { useState } from "react";
import { motion } from "framer-motion";
import { Folder, ChevronRight, User, ArrowLeft, Plus, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import AlterEditModal from "@/components/alters/AlterEditModal";
import { useNavigate } from "react-router-dom";
import { FrontingToggleButton } from "@/components/alters/AlterCard";

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--foreground))";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function MemberRow({ alter, onClick, currentSession }) {
  const hasColor = alter.color && alter.color.length > 3;
  const bgColor = hasColor ? alter.color : null;
  const textColor = hasColor ? getContrastColor(alter.color) : null;
  

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={(e) => {
        if (e.target.closest('button')) return;
        onClick();
      }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card hover:bg-muted/30 hover:border-border transition-all cursor-pointer group"
      style={{ borderLeftColor: bgColor || "transparent", borderLeftWidth: bgColor ? 3 : 1 }}>
      
      <div
        className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-border/40"
        style={{ backgroundColor: bgColor || "hsl(var(--muted))" }}>
        
        {alter.avatar_url ?
        <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" /> :

        <User className="w-5 h-5" style={{ color: textColor || "hsl(var(--muted-foreground))" }} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
          {alter.name}
        </p>
        {alter.pronouns &&
        <p className="text-xs text-muted-foreground truncate">{alter.pronouns}</p>
        }
      </div>
<FrontingToggleButton alter={alter} currentSession={currentSession} />    </motion.div>);

}

function FolderRow({ group, onClick }) {
  const color = group.color || "";
  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={() => onClick(group)}
      className="bg-card pr-3 pl-3 text-left rounded-xl w-full flex items-center gap-3 border border-border/50 hover:bg-muted/30 hover:border-border transition-all cursor-pointer group"
      style={{ borderLeftColor: color || "transparent", borderLeftWidth: color ? 3 : 1 }}>
      <div className="rounded-xl w-9 h-9 flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color ? `${color}20` : "hsl(var(--muted))" }}>
        <Folder className="w-4 h-4" style={{ color: color || "hsl(var(--muted-foreground))" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">{group.name}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </motion.button>
  );
}

export default function FolderGroupsSection({ alters, sortDir = "asc", currentSession = null }) {
  const [navStack, setNavStack] = useState([]);
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

  const currentGroup = navStack.length > 0 ? navStack[navStack.length - 1] : null;
  const currentGroupKey = currentGroup ? currentGroup.id : null;

  // Get child groups at current level
  const childGroups = allGroups.
  filter((g) => {
    if (currentGroupKey === null) {
      return !g.parent || g.parent === "" || g.parent === "root";
    }
    return g.parent && (g.parent === currentGroupKey || g.parent === currentGroup?.sp_id);
  }).
  sort((a, b) => (a.order || 0) - (b.order || 0));

  // Get members in current group (check both alter's groups array and Group entity's member_sp_ids)
  const memberAlters = currentGroup ?
  alters.filter((a) => {
    // Check if alter's groups array contains this group
    const inAlterGroups = (a.groups || []).some((g) => g.id === currentGroupKey || g.sp_id === currentGroupKey);
    // Check if this group's member_sp_ids contains the alter's sp_id
    const inGroupMembers = currentGroup.member_sp_ids?.includes(a.sp_id);
    return inAlterGroups || inGroupMembers;
  }) :
  [];

  const navigateTo = (group) => setNavStack([...navStack, group]);
  const navigateBack = () => setNavStack(navStack.slice(0, -1));

  const breadcrumb = ["Root", ...navStack.map((g) => g.name)];
  const breadcrumbDisplay =
  breadcrumb.length > 3 ?
  ["Root/...", ...breadcrumb.slice(-2)].join(" / ") :
  breadcrumb.join(" / ");

  return (
    <div>
      {/* Breadcrumb Navigation with Action Buttons */}
      <div className="pb-1 flex items-center gap-2 border-b border-border">
        {navStack.length > 0 &&
        <Button
          onClick={navigateBack}
          variant="ghost"
          size="sm"
          className="gap-2">
          
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        }
        <p className="text-sm font-medium text-muted-foreground flex-1">
          {navStack.length > 0 ? breadcrumbDisplay : "Root"}
        </p>
        {currentGroup &&
        <Button
          onClick={() => setManageMembersOpen(true)}
          variant="ghost"
          size="sm"
          className="gap-2">
          
            <Users className="w-4 h-4" />
            Members
          </Button>
        }
        <Button
          onClick={() => setCreateGroupOpen(true)}
          variant="ghost"
          size="sm"
          className="gap-2">
          
          <Plus className="w-4 h-4" />
          New Group
        </Button>
      </div>

      {/* Content: Folders and Members */}
      <motion.div
        key={currentGroupKey || "root"}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.15 }}
        className="space-y-2">
        
        {childGroups.map((g) =>
        <FolderRow key={g.id} group={g} onClick={navigateTo} />
        )}

           {memberAlters.map((alter) =>
          <MemberRow
            key={alter.id}
            alter={alter}
            currentSession={currentSession}
            onClick={() => navigate(`/alter/${alter.id}`)}
          />
        )}

        {childGroups.length === 0 && memberAlters.length === 0 && navStack.length > 0 &&
        <div className="flex flex-col items-center justify-center py-8 text-center">
            <Folder className="w-10 h-10 text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">This group is empty.</p>
          </div>
        }
      </motion.div>

      {/* Modals */}
      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => {
          setCreateGroupOpen(false);
          refetchGroups();
        }}
        parentGroupId={currentGroup?.id || null} />
      

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
          currentSession={currentSession} />
        
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