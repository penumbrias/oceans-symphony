import React, { useState, useRef, useEffect } from "react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bell, EyeOff, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mentionPreviewText } from "@/lib/whisperRedact";
import { mentionLogsQuery, isMentionNotice, isMentionDismissed, mentionRecipientId, dismissMention } from "@/lib/mentionNotices";

const PAGE_SIZE = 20;

export default function NotificationHistoryModal({ open, onClose, alters = [], onNotifClick, frontingAlterIds = [] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [clearing, setClearing] = useState(false);
  const loaderRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: rawLogs = [] } = useQuery({
    ...mentionLogsQuery,
    enabled: open,
  });

  const [showCleared, setShowCleared] = useState(false);

  // Filter out authored self-logs; also skip entries with no identifiable recipient
  const allMentionLogs = rawLogs.filter(isMentionNotice);
  // "Clear all" hides from this list; it never deletes (the rows are also
  // what @mention history and "who wrote this" read).
  const clearedCount = allMentionLogs.filter((m) => m.history_cleared_at).length;
  const mentionLogs = showCleared ? allMentionLogs : allMentionLogs.filter((m) => !m.history_cleared_at);

  useEffect(() => {
    if (!open) { setVisibleCount(PAGE_SIZE); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount((v) => Math.min(v + PAGE_SIZE, mentionLogs.length));
    }, { threshold: 0.1 });
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [open, mentionLogs.length]);

  const handleClearAll = async () => {
    const targets = allMentionLogs.filter((m) => !m.history_cleared_at);
    const n = targets.length;
    if (!n) return;
    if (!(await confirm({ title: "Clear all notifications?", body: `${n} notification${n === 1 ? "" : "s"} will be hidden from this list and marked as seen. Nothing is deleted, and "Show cleared" brings them back.`, confirmLabel: "Clear all" }))) return;
    setClearing(true);
    const now = new Date().toISOString();
    try {
      await Promise.all(
        targets.map((m) => {
          const patch = { history_cleared_at: now };
          if (m.mentioned_alter_id) {
            const by = m.dismissed_by_alter_ids || [];
            if (!by.includes(m.mentioned_alter_id)) patch.dismissed_by_alter_ids = [...by, m.mentioned_alter_id];
          } else {
            patch.is_read = true;
          }
          return base44.entities.MentionLog.update(m.id, patch).catch(() => null);
        })
      );
      setShowCleared(false);
      queryClient.invalidateQueries({ queryKey: ["mentionLogs"] });
    } finally {
      setClearing(false);
    }
  };

  const handleDismiss = async (e, m) => {
    e.stopPropagation();
    await dismissMention(m, { queryClient });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          {/* Reserve room on the right for Radix's own X close button so
              "Clear all" doesn't sit directly underneath it. */}
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle className="flex items-center gap-2 min-w-0">
              <Bell className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="truncate">Notification History</span>
            </DialogTitle>
            <div className="flex items-center gap-3 flex-shrink-0">
              {clearedCount > 0 && (
                <button
                  onClick={() => setShowCleared((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showCleared ? "Hide cleared" : `Show cleared (${clearedCount})`}
                </button>
              )}
              {allMentionLogs.length > clearedCount && (
                <button
                  onClick={handleClearAll}
                  disabled={clearing}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Hide everything here and mark it seen"
                >
                  {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />}
                  Clear all
                </button>
              )}
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2 mt-2">
          {mentionLogs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">{clearedCount > 0 ? "All caught up" : "No mentions yet"}</p>
          )}
          {mentionLogs.slice(0, visibleCount).map((m) => {
            // Graceful fallbacks for legacy notifications created with wrong field names
            const recipientId = mentionRecipientId(m);
            const alter = alters.find((a) => a.id === recipientId);
            const isDismissed = isMentionDismissed(m);
            const isForCurrentFronter = frontingAlterIds.includes(recipientId);
            const displayLabel = m.source_label || (m.content ? "Message" : "Notification");
            const displayPreview = mentionPreviewText({ ...m, preview_text: m.preview_text || m.content }) || null;
            const displayDate = m.source_date || m.created_date || null;

            return (
              <button
                key={m.id}
                onClick={() => { onClose(); onNotifClick?.(m); }}
                className={`w-full text-left rounded-xl border p-3 flex gap-3 transition-colors ${
                  isDismissed
                    ? "border-border/30 bg-muted/5 opacity-50 hover:opacity-70"
                    : isForCurrentFronter
                    ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
                    : "border-border/50 bg-muted/10 hover:bg-muted/30"
                }`}
              >
                <div
                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5"
                  style={{ backgroundColor: alter?.color || "#8b5cf6" }}
                >
                  {alter?.name?.charAt(0) || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {alter?.name || "Unknown"} · {displayLabel}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isDismissed && isForCurrentFronter && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                      <span className="text-[0.625rem] text-muted-foreground">
                        {displayDate ? format(new Date(displayDate), "MM/dd/yyyy") : ""}
                      </span>
                    </div>
                  </div>
                  {displayPreview && (
                    <p className="text-xs text-muted-foreground line-clamp-2 italic">"{displayPreview}"</p>
                  )}
                  {isDismissed && (
                    <p className="text-[0.625rem] text-muted-foreground mt-0.5">Seen</p>
                  )}
                </div>
                {!isDismissed && isForCurrentFronter && (
                  <button
                    onClick={(e) => handleDismiss(e, m)}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground p-0.5 self-start"
                    title="Mark as seen"
                  >
                    ✓
                  </button>
                )}
              </button>
            );
          })}
          {visibleCount < mentionLogs.length && (
            <div ref={loaderRef} className="py-3 text-center text-xs text-muted-foreground">Loading more...</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}