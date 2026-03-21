import React from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

export default function MentionAlertBanner({ bulletins, currentAlterId, alters }) {
  const qc = useQueryClient();

  const unread = bulletins.filter(
    (b) =>
      b.mentioned_alter_ids?.includes(currentAlterId) &&
      !b.read_by_alter_ids?.includes(currentAlterId)
  );

  if (unread.length === 0) return null;

  const markRead = async () => {
    for (const b of unread) {
      const already = b.read_by_alter_ids || [];
      if (!already.includes(currentAlterId)) {
        await base44.entities.Bulletin.update(b.id, {
          read_by_alter_ids: [...already, currentAlterId],
        });
      }
    }
    qc.invalidateQueries({ queryKey: ["bulletins"] });
  };

  const fronterName = alters.find((a) => a.id === currentAlterId)?.name || "You";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        className="bg-primary/10 border border-primary/40 rounded-2xl p-4 mb-4 flex items-start gap-3"
      >
        <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Bell className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Hey {fronterName}! You were mentioned
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {unread.length} bulletin{unread.length > 1 ? "s" : ""} mentioned you while you were away.
            {unread[0] && (
              <span className="block mt-1 italic text-foreground/70 truncate">
                "{unread[0].content.slice(0, 60)}{unread[0].content.length > 60 ? "…" : ""}"
              </span>
            )}
          </p>
        </div>
        <button
          onClick={markRead}
          className="text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}