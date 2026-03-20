import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Folder, ChevronRight, ArrowLeft, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

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
        <Folder className="w-4.5 h-4.5" style={{ color: color || "hsl(var(--muted-foreground))" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">{group.name}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </motion.div>
  );
}

export default function GroupFolderView({ alters }) {
  // Stack of group objects representing navigation path
  const [navStack, setNavStack] = useState([]);

  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

  const currentGroupId = navStack.length > 0 ? navStack[navStack.length - 1].sp_id : null;

  // Children groups of current level
  const childGroups = allGroups.filter((g) => {
    const parent = g.parent || "";
    if (currentGroupId === null) return !parent || parent === "root"; // root level
    return parent === currentGroupId;
  });

  // Members directly in the current group
  const currentGroup = navStack.length > 0 ? navStack[navStack.length - 1] : null;
  const memberSpIds = currentGroup?.member_sp_ids || [];
  const memberAlters = alters.filter((a) => memberSpIds.includes(a.sp_id));

  const navigateTo = (group) => setNavStack([...navStack, group]);
  const navigateBack = () => setNavStack(navStack.slice(0, -1));

  // Breadcrumb
  const breadcrumb = ["Root", ...navStack.map((g) => g.name)];
  const breadcrumbDisplay =
    breadcrumb.length > 3
      ? ["Root/...", ...breadcrumb.slice(-2)].join(" / ")
      : breadcrumb.join(" / ");

  return (
    <div>
      {/* Header with breadcrumb and back */}
      <div className="flex items-center gap-3 mb-4">
        {navStack.length > 0 && (
          <button
            onClick={navigateBack}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        <p className="text-sm font-medium text-muted-foreground">{breadcrumbDisplay}</p>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentGroupId || "root"}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.15 }}
          className="space-y-2"
        >
          {/* Sub-group folders */}
          {childGroups.map((g) => (
            <FolderRow key={g.id} group={g} onClick={navigateTo} />
          ))}

          {/* Member rows (only shown at the current group level) */}
          {memberAlters.map((alter) => (
            <MemberRow key={alter.id} alter={alter} />
          ))}

          {/* Empty state */}
          {childGroups.length === 0 && memberAlters.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Folder className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">
                {allGroups.length === 0
                  ? "No groups found. Sync from Settings to import groups."
                  : "This group is empty."}
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}