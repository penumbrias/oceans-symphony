import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Folder, FolderOpen, ChevronRight, Users } from "lucide-react";
import AlterCard from "./AlterCard";

export default function GroupFolderView({ alters }) {
  const [openGroup, setOpenGroup] = useState(null);

  // Build group list from alters
  const groupMap = {};
  alters.forEach((alter) => {
    if (alter.groups && alter.groups.length > 0) {
      alter.groups.forEach((g) => {
        if (!groupMap[g.id]) groupMap[g.id] = { ...g, alters: [] };
        groupMap[g.id].alters.push(alter);
      });
    }
  });

  // Alters with no groups
  const ungrouped = alters.filter((a) => !a.groups || a.groups.length === 0);

  const groups = Object.values(groupMap);

  if (groups.length === 0 && ungrouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <Users className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">No groups found. Sync from Simply Plural to import groups.</p>
      </div>
    );
  }

  const allFolders = [
    ...groups,
    ...(ungrouped.length > 0
      ? [{ id: "__ungrouped__", name: "Ungrouped", color: "", alters: ungrouped }]
      : []),
  ];

  return (
    <div className="space-y-3">
      {allFolders.map((group) => {
        const isOpen = openGroup === group.id;
        const color = group.color || "";

        return (
          <div key={group.id} className="rounded-2xl border border-border/50 overflow-hidden bg-card">
            {/* Folder header */}
            <button
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
              onClick={() => setOpenGroup(isOpen ? null : group.id)}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: color ? `${color}20` : "hsl(var(--muted))",
                }}
              >
                {isOpen ? (
                  <FolderOpen className="w-5 h-5" style={{ color: color || "hsl(var(--muted-foreground))" }} />
                ) : (
                  <Folder className="w-5 h-5" style={{ color: color || "hsl(var(--muted-foreground))" }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">{group.name}</p>
                <p className="text-xs text-muted-foreground">
                  {group.alters.length} member{group.alters.length !== 1 ? "s" : ""}
                </p>
              </div>
              <ChevronRight
                className="w-4 h-4 text-muted-foreground transition-transform duration-200 flex-shrink-0"
                style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
              />
            </button>

            {/* Folder contents */}
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-t border-border/40"
                >
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-muted/10">
                    {group.alters.map((alter, i) => (
                      <AlterCard key={alter.id} alter={alter} index={i} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}