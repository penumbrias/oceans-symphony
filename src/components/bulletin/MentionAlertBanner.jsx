import React from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function MentionAlertBanner({ bulletins, currentAlterId, alters, onJumpToBulletin }) {
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

  const handleDismiss = (e) => {
    e.stopPropagation();
    markRead();
  };

  // Tapping the banner jumps to (and highlights) the first unread mention,
  // matching the notification-click flow. Also marks the mentions as read.
  const handleBannerClick = () => {
    const target = unread[0];
    onJumpToBulletin?.(target.id);
    markRead();
  };

  const fronterName = alters.find((a) => a.id === currentAlterId)?.name || "You";

  return (
    <AnimatePresence>
      <motion.button
        type="button"
        onClick={handleBannerClick}
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        className="w-full text-left bg-primary/10 border border-primary/40 rounded-2xl p-4 mb-4 flex items-start gap-3 hover:bg-primary/15 active:bg-primary/20 transition-colors"
        aria-label={`Jump to bulletin where you were mentioned`}
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
        <span
          role="button"
          tabIndex={0}
          onClick={handleDismiss}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleDismiss(e); }}
          aria-label="Dismiss"
          className="text-muted-foreground hover:text-foreground flex-shrink-0 cursor-pointer p-1 -m-1"
        >
          <X className="w-4 h-4" />
        </span>
      </motion.button>
    </AnimatePresence>
  );
}