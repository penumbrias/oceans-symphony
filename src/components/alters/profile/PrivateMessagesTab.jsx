import React, { useState, useEffect, useRef } from "react";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Mail, Pin, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import MentionTextarea from "@/components/shared/MentionTextarea";
import RichText from "@/components/shared/RichText";
import { isLogCommandError } from "@/lib/authoredText";
import { sendInboxMessage, editInboxMessage, setInboxMessagePinned, setInboxMessageRead, deleteAlterMessage, refreshInbox, inboxKey } from "@/lib/alterMessages";
import { confirm } from "@/components/shared/ConfirmDialog";
import { formatDistanceToNow } from "date-fns";
import { useTerms } from "@/lib/useTerms";

function MessageCard({ message, fromAlter, currentAlterId, alters, onDelete, onEdit, onTogglePinned, onMarkRead, isHighlighted, cardRef }) {
  const isSent = message.from_alter_id === currentAlterId;
  const alterColor = fromAlter?.color;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content || "");

  const handleMarkRead = async () => {
    if (!message.is_read) {
      await onMarkRead(message.id);
    }
  };

  const saveEdit = async () => {
    const v = draft.trim();
    if (!v) return;
    const ok = await onEdit(message.id, v);
    if (ok !== false) setEditing(false);
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
          {editing ? (
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <MentionTextarea toolbar
                value={draft}
                onChange={setDraft}
                alters={alters || []}
                signposts
                className="text-sm min-h-[60px]"
                autoFocus
              />
              <div className="flex gap-1.5">
                <Button size="sm" onClick={saveEdit} disabled={!draft.trim()}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => { setDraft(message.content || ""); setEditing(false); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-foreground leading-relaxed break-words"><RichText content={message.content} alters={alters || []} /></div>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            {formatDistanceToNow(new Date(message.created_date), { addSuffix: true })}
            {message.edited_date && <span className="ml-1 italic">· edited</span>}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!editing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDraft(message.content || "");
                setEditing(true);
              }}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Edit" aria-label="Edit this message"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
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
            title={message.pinned ? "Unpin" : "Pin"} aria-label={message.pinned ? "Unpin this message" : "Pin this message"}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(message.id);
            }}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete" aria-label="Delete this message"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PrivateMessagesTab({ alterId, alters, highlightMessageId, autoOpenCompose = false }) {
  const queryClient = useQueryClient();
  const terms = useTerms();
  const [composing, setComposing] = useState(false);
  const [fromAlterId, setFromAlterId] = useState(null);
  const [content, setContent] = useState("");
  const [pinToggle, setPinToggle] = useState(false);
  const [saving, setSaving] = useState(false);
  const highlightRef = useRef(null);
  const [activeHighlightId, setActiveHighlightId] = useState(highlightMessageId || null);

  const { data: messages = [] } = useQuery({
    queryKey: inboxKey(alterId),
    queryFn: () => base44.entities.AlterMessage.filter({ to_alter_id: alterId }, "-created_date"),
  });

  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });

  const altersById = Object.fromEntries((alters || []).map((a) => [a.id, a]));
  const unreadCount = messages.filter((m) => !m.is_read).length;

  // Default "From" to someone in front, preferring anyone but the recipient.
  const frontSession = activeSessions.find((s) => s.alter_id && s.alter_id !== alterId) || activeSessions.find((s) => s.alter_id);
  const currentFronter = frontSession ? altersById[frontSession.alter_id] : null;

  React.useEffect(() => {
    if (!fromAlterId && currentFronter) {
      setFromAlterId(currentFronter.id);
    }
  }, [currentFronter, fromAlterId]);

  // Triggered by the alter-profile header Message button (which sets
  // ?compose=1 in the URL). Opens the compose form once on mount when
  // that param is set, without continuously reopening it if the user
  // closes it and the URL is still present.
  const didAutoOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (autoOpenCompose && !didAutoOpenRef.current) {
      didAutoOpenRef.current = true;
      setComposing(true);
    }
  }, [autoOpenCompose]);

  // Scroll to and highlight a specific message when arriving from a notification
  useEffect(() => {
    if (!highlightMessageId || !highlightRef.current) return;
    const el = highlightRef.current;
    setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    const timer = setTimeout(() => setActiveHighlightId(null), 5000);
    return () => clearTimeout(timer);
  }, [highlightMessageId, messages]);

  const handleSendMessage = async () => {
    if (!content.trim() || !fromAlterId) return;
    setSaving(true);
    try {
      const msg = await sendInboxMessage({ toAlterId: alterId, fromAlterId, text: content, pinned: pinToggle, alters: alters || [], terms });
      if (msg === null) return; // backed out of the whisper warning
      refreshInbox(queryClient, alterId);
      queryClient.invalidateQueries({ queryKey: ["mentionLogs"] });
      setContent("");
      setComposing(false);
      setPinToggle(false);
    } catch (e) {
      if (isLogCommandError(e)) toast.error(e.message); else toast.error("Couldn't send the message");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (messageId) => {
    if (!(await confirm("Delete this message? It goes to the trash, where it can be restored for a while."))) return;
    await deleteAlterMessage(messageId);
    refreshInbox(queryClient, alterId);
  };

  const handleEdit = async (messageId, text) => {
    const existing = messages.find((m) => m.id === messageId);
    if (!existing) return false;
    try {
      const out = await editInboxMessage({ message: existing, text, alters: alters || [], terms });
      if (out === null) return false;
    } catch (e) {
      if (isLogCommandError(e)) { toast.error(e.message); return false; }
      throw e;
    }
    refreshInbox(queryClient, alterId);
    queryClient.invalidateQueries({ queryKey: ["mentionLogs"] });
    return true;
  };

  const handleTogglePinned = async (messageId, pinned) => {
    await setInboxMessagePinned(messageId, pinned);
    refreshInbox(queryClient, alterId);
  };

  const handleMarkRead = async (messageId) => {
    await setInboxMessageRead(messageId, true);
    refreshInbox(queryClient, alterId);
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
        <div className="text-center py-10 text-muted-foreground text-sm space-y-3 rounded-2xl" data-pf-surface>
          <Mail className="w-8 h-8 mx-auto opacity-20" />
          <p>No messages yet</p>
          <p className="text-xs text-muted-foreground/70 max-w-xs mx-auto leading-relaxed">
            Messages left here appear on the dashboard while this {terms.alter} is {terms.fronting}. Pin a message to keep it always visible at the top of the home screen.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => {
            const isHighlighted = msg.id === activeHighlightId;
            return (
              <MessageCard
                key={msg.id}
                message={msg}
                fromAlter={altersById[msg.from_alter_id]}
                currentAlterId={alterId}
                alters={alters}
                onDelete={handleDelete}
                onEdit={handleEdit}
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
            <AlterSearchSelect
              alters={(alters || []).filter((a) => !a.is_archived)}
              value={fromAlterId || null}
              onChange={(id) => setFromAlterId(id)}
              terms={terms}
              showNone={false}
              placeholder="Choose who this is from…"
              zIndex={80}
            />
          </div>

          <div>
            <MentionTextarea toolbar
              placeholder={`Leave a message for this ${terms.alter}...`}
              value={content}
              onChange={setContent}
              alters={alters || []}
              signposts
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