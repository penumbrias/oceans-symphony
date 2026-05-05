import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Mail, Pin, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format, formatDistanceToNow } from "date-fns";

function MessageCard({ message, fromAlter, currentAlterId, alters, onDelete, onTogglePinned, onMarkRead, isHighlighted, cardRef }) {
  const isSent = message.from_alter_id === currentAlterId;
  const alterColor = fromAlter?.color;

  const handleMarkRead = async () => {
    if (!message.is_read) {
      await onMarkRead(message.id);
    }
  };

  return (
    <div
      ref={cardRef}
      onClick={handleMarkRead}
      className={`rounded-xl p-3 transition-all cursor-pointer ${
        isHighlighted
          ? "border-2 ring-2 ring-primary/40 bg-primary/5"
          : message.is_read
          ? "border border-border/50 bg-card/50"
          : `border-2 bg-card`
      }`}
      style={
        isHighlighted
          ? { borderColor: "hsl(var(--primary))" }
          : !message.is_read && alterColor
          ? { borderColor: `${alterColor}40` }
          : {}
      }
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        {!isSent && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0 border border-border/30"
            style={{ backgroundColor: alterColor || "#8b5cf6" }}
          >
            {fromAlter?.name?.charAt(0)?.toUpperCase()}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <p className="text-xs font-semibold text-muted-foreground">
              {isSent ? "To " : "From "}
              <span className="text-foreground">{fromAlter?.name || "Unknown"}</span>
            </p>
            {!message.is_read && (
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: alterColor || "#3b82f6" }} />
            )}
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{message.content}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {formatDistanceToNow(new Date(message.created_date), { addSuffix: true })}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePinned(message.id, !message.pinned);
            }}
            className={`p-1 rounded transition-colors ${
              message.pinned
                ? "text-primary hover:bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            title={message.pinned ? "Unpin" : "Pin"}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(message.id);
            }}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PrivateMessagesTab({ alterId, alters, highlightMessageId }) {
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [fromAlterId, setFromAlterId] = useState(null);
  const [content, setContent] = useState("");
  const [pinToggle, setPinToggle] = useState(false);
  const [saving, setSaving] = useState(false);
  const highlightRef = useRef(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["privateMessages", alterId],
    queryFn: () => base44.entities.AlterMessage.filter({ to_alter_id: alterId }, "-created_date"),
  });

  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });

  const altersById = Object.fromEntries((alters || []).map((a) => [a.id, a]));
  const unreadCount = messages.filter((m) => !m.is_read).length;

  // Default from_alter to currently fronting (primary)
  const primarySession = activeSessions.find((s) => s.alter_id && s.is_primary);
  const currentFronter = primarySession ? altersById[primarySession.alter_id] : null;

  React.useEffect(() => {
    if (!fromAlterId && currentFronter) {
      setFromAlterId(currentFronter.id);
    }
  }, [currentFronter, fromAlterId]);

  // Scroll to and highlight a specific message when arriving from a notification
  useEffect(() => {
    if (!highlightMessageId || !highlightRef.current) return;
    const el = highlightRef.current;
    setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
  }, [highlightMessageId, messages]);

  const handleSendMessage = async () => {
    if (!content.trim() || !fromAlterId) return;
    setSaving(true);
    try {
      const msg = await base44.entities.AlterMessage.create({
        from_alter_id: fromAlterId,
        to_alter_id: alterId,
        content: content.trim(),
        is_read: false,
        pinned: pinToggle,
      });

      // Create MentionLog for notification
      const fromAlter = altersById[fromAlterId];
      await base44.entities.MentionLog.create({
        mentioned_alter_id: alterId,
        author_alter_id: fromAlterId,
        log_type: "mention",
        source_type: "message",
        source_id: msg.id,
        source_label: `Message from ${fromAlter?.name || "Unknown"}`,
        source_date: new Date().toISOString(),
        preview_text: content.trim().slice(0, 120),
        navigate_path: `/alter/${alterId}?tab=private-messages&messageId=${msg.id}`,
      });

      queryClient.invalidateQueries({ queryKey: ["privateMessages", alterId] });
      queryClient.invalidateQueries({ queryKey: ["mentionLogs"] });
      setContent("");
      setComposing(false);
      setPinToggle(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (messageId) => {
    await base44.entities.AlterMessage.delete(messageId);
    queryClient.invalidateQueries({ queryKey: ["privateMessages", alterId] });
  };

  const handleTogglePinned = async (messageId, pinned) => {
    await base44.entities.AlterMessage.update(messageId, { pinned });
    queryClient.invalidateQueries({ queryKey: ["privateMessages", alterId] });
  };

  const handleMarkRead = async (messageId) => {
    await base44.entities.AlterMessage.update(messageId, { is_read: true });
    queryClient.invalidateQueries({ queryKey: ["privateMessages", alterId] });
  };

  return (
    <div className="space-y-4">
      {/* Unread badge */}
      {unreadCount > 0 && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 text-sm text-primary flex items-center gap-2">
          <Mail className="w-4 h-4" />
          {unreadCount} unread {unreadCount === 1 ? "message" : "messages"}
        </div>
      )}

      {/* Messages */}
      {messages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <Mail className="w-8 h-8 mx-auto mb-3 opacity-20" />
          No messages yet
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => {
            const isHighlighted = msg.id === highlightMessageId;
            return (
              <MessageCard
                key={msg.id}
                message={msg}
                fromAlter={altersById[msg.from_alter_id]}
                currentAlterId={alterId}
                alters={alters}
                onDelete={handleDelete}
                onTogglePinned={handleTogglePinned}
                onMarkRead={handleMarkRead}
                isHighlighted={isHighlighted}
                cardRef={isHighlighted ? highlightRef : null}
              />
            );
          })}
        </div>
      )}

      {/* Compose */}
      {composing ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">From</label>
            <select
              value={fromAlterId || ""}
              onChange={(e) => setFromAlterId(e.target.value)}
              className="w-full h-8 px-2 rounded-lg border border-input bg-background text-xs"
            >
              {alters?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Textarea
              placeholder="Leave a message for this alter..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[80px] text-sm"
              autoFocus
            />
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={pinToggle}
              onChange={(e) => setPinToggle(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-primary"
            />
            <span className="text-muted-foreground">Keep this visible until dismissed</span>
          </label>

          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setComposing(false);
                setContent("");
                setPinToggle(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-primary"
              onClick={handleSendMessage}
              disabled={saving || !content.trim() || !fromAlterId}
            >
              Send
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setComposing(true)}>
          <Mail className="w-4 h-4" /> Leave a note
        </Button>
      )}
    </div>
  );
}