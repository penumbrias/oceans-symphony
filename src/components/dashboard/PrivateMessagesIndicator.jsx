import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Mail, MessageCircle } from "lucide-react";

export default function PrivateMessagesIndicator({ activeFronters = [] }) {
  const { data: allMessages = [] } = useQuery({
    queryKey: ["allPrivateMessages"],
    queryFn: () => base44.entities.AlterMessage.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const altersById = React.useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  // For each fronting alter, get unread messages and pinned messages
  const messagesForFronters = useMemo(() => {
    const map = {};
    activeFronters.forEach((alter) => {
      const alterMessages = allMessages.filter((m) => m.to_alter_id === alter.id);
      const unread = alterMessages.filter((m) => !m.is_read);
      const pinned = alterMessages.filter((m) => m.pinned).slice(0, 1); // Limit to 1

      if (unread.length > 0 || pinned.length > 0) {
        map[alter.id] = { unread, pinned };
      }
    });
    return map;
  }, [allMessages, activeFronters]);

  if (Object.keys(messagesForFronters).length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {activeFronters.map((alter) => {
        const data = messagesForFronters[alter.id];
        if (!data) return null;

        const { unread, pinned } = data;
        const hasUnread = unread.length > 0;
        const hasPinned = pinned.length > 0;

        return (
          <div key={alter.id} className="space-y-2">
            {/* Unread badge */}
            {hasUnread && (
              <Link to={`/alter/${alter.id}?tab=private-messages`}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 hover:bg-primary/15 transition-colors cursor-pointer">
                  <Mail className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span className="text-xs text-primary font-medium flex-1">
                    {unread.length} {unread.length === 1 ? "unread message" : "unread messages"}
                  </span>
                  <span className="text-primary text-sm">→</span>
                </div>
              </Link>
            )}

            {/* Pinned message display */}
            {hasPinned && pinned.length > 0 && (
              <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pinned message</p>
                </div>
                <p className="text-sm text-foreground leading-relaxed line-clamp-2">{pinned[0].content}</p>
                <p className="text-xs text-muted-foreground">
                  from {altersById[pinned[0].from_alter_id]?.name || "Unknown"}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}