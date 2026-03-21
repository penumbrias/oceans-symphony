import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Folder, ChevronRight, ArrowLeft, User, Users, FolderPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ManageMembersModal from "@/components/groups/ManageMembersModal";
import CreateGroupModal from "@/components/groups/CreateGroupModal";

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--foreground))";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function MemberRow({ alter }) {
  const hasColor = alter.color && alter.color.length > 3;
  const bgColor = hasColor ? alter.color : null;
  const textColor = hasColor ? getContrastColor(alter.color) : null;

  return (
    <Link to={`/alter/${alter.id}`}>
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card hover:bg-muted/30 hover:border-border transition-all cursor-pointer group"
        style={{ borderLeftColor: bgColor || "transparent", borderLeftWidth: bgColor ? 3 : 1 }}
      >
        <div
          className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-border/40"
          style={{ backgroundColor: bgColor || "hsl(var(--muted))" }}
        >
          {alter.avatar_url ? (
            <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
          ) : (
            <User className="w-5 h-5" style={{ color: textColor || "hsl(var(--muted-foreground))" }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
            {alter.name}
          </p>
          {alter.pronouns && (
            <p className="text-xs text-muted-foreground truncate">{alter.pronouns}</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </motion.div>
    </Link>
  );
}

function FolderRow({ group, onClick }) {
  const color = group.color || "";
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={() => onClick(group)}
      className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border/50 bg-card hover:bg-muted/30 hover:border-border transition-all cursor-pointer group"
      style={{ borderLeftColor: color || "transparent", borderLeftWidth: color ? 3 : 1 }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color ? `${color}20` : "hsl(var(--muted))" }}
      >
        <Folder className="w-4 h-4" style={{ color: color || "hsl(var(--muted-foreground))" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">{group.name}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </motion.div>
  );
}

function GroupRow({ group, allGroups, alters, level = 0, expanded = true, onToggleExpanded }) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const childGroups = allGroups
    .filter((g) => g.parent && (g.parent === group.id || g.parent === group.sp_id))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  
  const memberAlters = alters.filter((a) =>
    (a.groups || []).some((g) => g.id === group.id || g.sp_id === group.id)
  );

  const hasChildren = childGroups.length > 0 || memberAlters.length > 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2"
        style={{ paddingLeft: `${level * 20}px` }}
      >
        {hasChildren && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? (
              <ChevronRight className="w-4 h-4 rotate-90" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        )}
        {!hasChildren && <div className="w-5" />}
        <FolderRow group={group} onClick={() => {}} />
      </motion.div>

      {isExpanded && (
        <div>
          {childGroups.map((g) => (
            <GroupRow key={g.id} group={g} allGroups={allGroups} alters={alters} level={level + 1} onToggleExpanded={onToggleExpanded} />
          ))}
          {memberAlters.map((alter) => (
            <motion.div key={alter.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ paddingLeft: `${(level + 1) * 20 + 20}px` }}>
              <MemberRow alter={alter} />
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}

export default function FolderGroupsSection({ alters, sortDir = "asc" }) {
  const [managingGroup, setManagingGroup] = useState(null);

  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

  const rootGroups = allGroups
    .filter((g) => !g.parent || g.parent === "" || g.parent === "root")
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="space-y-1">
      {rootGroups.map((group) => (
        <GroupRow
          key={group.id}
          group={group}
          allGroups={allGroups}
          alters={alters}
          level={0}
        />
      ))}
      
      <ManageMembersModal
        group={managingGroup}
        allAlters={alters}
        open={!!managingGroup}
        onClose={() => setManagingGroup(null)}
      />
    </div>
  );
}