import React, { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bell } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PAGE_SIZE = 20;

export default function NotificationHistoryModal({ open, onClose, alters = [], onNotifClick, frontingAlterIds = [] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: rawLogs = [] } = useQuery({
    queryKey: ["mentionLogs"],
    queryFn: () => base44.entities.MentionLog.list("-created_date", 200),
    enabled: open,
  });

  const mentionLogs = rawLogs.filter((m) => m.log_type !== "authored");

  useEffect(() => {
    if (!open) { setVisibleCount(PAGE_SIZE); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount((v) => Math.min(v + PAGE_SIZE, mentionLogs.length));
    }, { threshold: 0.1 });
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [open, mentionLogs.length]);

  const handleDismiss = async (e, m) => {
    e.stopPropagation();
    const dismissedBy = m.dismissed_by_alter_ids || [];
    if (dismissedBy.includes(m.mentioned_alter_id)) return;
    await base44.entities.MentionLog.update(m.id, {
      dismissed_by_alter_ids: [...dismissedBy, m.mentioned_alter_id],
    });
    queryClient.invalidateQueries({ queryKey: ["mentionLogs"] });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            Notification History
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2 mt-2">
          {mentionLogs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No mentions yet</p>
          )}
          {mentionLogs.slice(0, visibleCount).map((m) => {
            const alter = alters.find((a) => a.id === m.mentioned_alter_id);
            const dismissedBy = m.dismissed_by_alter_ids || [];
            const isDismissed = dismissedBy.includes(m.mentioned_alter_id);
            const isForCurrentFronter = frontingAlterIds.includes(m.mentioned_alter_id);

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
                  {alter?.name?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {alter?.name} · {m.source_label}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isDismissed && isForCurrentFronter && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {m.source_date ? format(new Date(m.source_date), "MM/dd/yyyy") : ""}
                      </span>
                    </div>
                  </div>
                  {m.preview_text && (
                    <p className="text-xs text-muted-foreground line-clamp-2 italic">"{m.preview_text}"</p>
                  )}
                  {isDismissed && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">Seen</p>
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