import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, MessageSquare, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

export default function MessagesTab({ alterId, alters }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all"); // all | messages | mentions

  const { data: messages = [] } = useQuery({
    queryKey: ["alterMessages", alterId],
    queryFn: () => base44.entities.AlterMessage.filter({ alter_id: alterId }, "-created_date"),
  });

  const { data: mentions = [] } = useQuery({
    queryKey: ["mentionLogs", alterId],
    queryFn: () => base44.entities.MentionLog.filter({ mentioned_alter_id: alterId }, "-created_date"),
  });

  const altersById = Object.fromEntries((alters || []).map((a) => [a.id, a]));

  const postMessage = async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    await base44.entities.AlterMessage.create({ alter_id: alterId, content: newContent.trim() });
    queryClient.invalidateQueries({ queryKey: ["alterMessages", alterId] });
    setNewContent("");
    setComposing(false);
    setSaving(false);
  };

  const deleteMessage = async (id) => {
    await base44.entities.AlterMessage.delete(id);
    queryClient.invalidateQueries({ queryKey: ["alterMessages", alterId] });
  };

  const showMessages = activeFilter === "all" || activeFilter === "messages";
  const showMentions = activeFilter === "all" || activeFilter === "mentions";

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border/40 pb-2">
        {[{ key: "all", label: "All" }, { key: "messages", label: "Messages" }, { key: "mentions", label: "Mentions" }].map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              activeFilter === f.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
            {f.key === "messages" && messages.length > 0 && (
              <span className="ml-1 text-[10px] bg-muted rounded-full px-1">{messages.length}</span>
            )}
            {f.key === "mentions" && mentions.length > 0 && (
              <span className="ml-1 text-[10px] bg-primary/20 text-primary rounded-full px-1">{mentions.length}</span>
            )}
          </button>
        ))}
      </div>

      {mentions.length === 0 && messages.length === 0 && !composing && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          No messages or mentions found on this member's board
        </div>
      )}

      {showMentions && mentions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mentions</h3>
          {mentions.map((mention) => (
            <div
              key={mention.id}
              className={`rounded-xl border border-primary/20 bg-primary/5 p-4 ${mention.source_id ? "cursor-pointer hover:bg-primary/10 transition-colors" : ""}`}
              onClick={() => {
                if (mention.source_id) navigate("/", { state: { highlightBulletinId: mention.source_id } });
              }}
            >
              <p className="text-sm text-foreground whitespace-pre-wrap">{mention.preview_text}</p>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-primary/10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/20 text-primary w-fit">
                    {mention.source_type}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {mention.source_label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {mention.source_date ? format(new Date(mention.source_date), "MMM d, yyyy") : ""}
                  </span>
                </div>
                {mention.source_id && <span className="text-[10px] text-primary">tap to view →</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showMessages && showMentions && messages.length > 0 && mentions.length > 0 && (
        <div className="border-t border-border/30 my-4" />
      )}

      {showMessages && messages.length > 0 && (
        <div className="space-y-3">
          {mentions.length > 0 && showMentions && <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Messages</h3>}
          {messages.map((msg) => {
            const author = altersById[msg.author_alter_id];
            return (
              <div key={msg.id} className="rounded-xl border border-border/50 bg-muted/10 p-4">
                <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30">
                  <div className="flex items-center gap-2">
                    {author && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: author.color ? `${author.color}20` : "hsl(var(--muted))",
                          color: author.color || "hsl(var(--foreground))",
                        }}
                      >
                        {author.name}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {msg.created_date ? format(new Date(msg.created_date), "MMM d, yyyy") : ""}
                    </span>
                  </div>
                  <button onClick={() => deleteMessage(msg.id)} className="text-muted-foreground hover:text-destructive p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {composing ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <Textarea
            placeholder="Leave a message for this alter..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            className="min-h-[100px] text-sm"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setComposing(false); setNewContent(""); }}>Cancel</Button>
            <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={postMessage} disabled={saving || !newContent.trim()}>
              Post
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setComposing(true)}>
          <Plus className="w-4 h-4" /> Post Message
        </Button>
      )}
    </div>
  );
}