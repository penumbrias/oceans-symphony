import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, MessageSquare, AtSign, BookOpen, CheckSquare, MessageCircle, Reply, Activity, Smile, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { isLogCommandError } from "@/lib/authoredText";
import { postBoardMessage, deleteAlterMessage, refreshBoard } from "@/lib/alterMessages";
import { useAlterBoardFeed } from "@/hooks/useAlterBoardFeed";
import { confirm } from "@/components/shared/ConfirmDialog";
import { format } from "date-fns";
import { useTerms } from "@/lib/useTerms";
import { renderBulletinContent } from "@/lib/renderBulletinContent";
import { mentionPreview, mentionPreviewText } from "@/lib/whisperRedact";

const SOURCE_TYPE_CONFIG = {
  bulletin:  { label: "Bulletin",   icon: MessageSquare, color: "text-primary",    bg: "bg-primary/10"   },
  comment:   { label: "Comment",    icon: MessageCircle, color: "text-blue-500",   bg: "bg-blue-500/10"  },
  reply:     { label: "Reply",      icon: Reply,         color: "text-indigo-500", bg: "bg-indigo-500/10" },
  journal:   { label: "Journal",    icon: BookOpen,      color: "text-emerald-500",bg: "bg-emerald-500/10" },
  checkin:   { label: "Check-in",   icon: CheckSquare,   color: "text-amber-500",  bg: "bg-amber-500/10" },
  task:      { label: "Task",       icon: CheckSquare,   color: "text-orange-500", bg: "bg-orange-500/10" },
  message:   { label: "Message",    icon: MessageSquare, color: "text-muted-foreground", bg: "bg-muted/40" },
  mention:   { label: "Mention",    icon: AtSign,        color: "text-primary",    bg: "bg-primary/10"   },
  session_note:    { label: "Session note",    icon: StickyNote, color: "text-cyan-500",   bg: "bg-cyan-500/10"   },
  session_emotion: { label: "Session emotion", icon: Smile,      color: "text-pink-500",   bg: "bg-pink-500/10"   },
  session_symptom: { label: "Session symptom", icon: Activity,   color: "text-rose-500",   bg: "bg-rose-500/10"   },
};

const FILTERS = [
  { key: "all",      label: "All" },
  { key: "mention",  label: "Mentions" },
  { key: "bulletin", label: "Bulletins" },
  { key: "comment",  label: "Comments" },
  { key: "reply",    label: "Replies" },
  { key: "journal",  label: "Journals" },
  { key: "checkin",  label: "Check-ins" },
  { key: "message",  label: "Messages" },
  { key: "session",  label: "Session" },
];

function LogItem({ item, onDelete, alters = [], terms = null }) {
  const navigate = useNavigate();
  const cfg = SOURCE_TYPE_CONFIG[item.source_type] || SOURCE_TYPE_CONFIG.message;
  const Icon = cfg.icon;
  const isAuthored = item.log_type === "authored";
  const isSession = item.log_type === "session";

  const handleClick = () => {
    if (item.navigate_path) navigate(item.navigate_path);
  };

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${item.navigate_path ? "cursor-pointer hover:bg-muted/20" : ""} ${isAuthored ? "border-border/50 bg-muted/5" : "border-primary/20 bg-primary/5"}`}
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        <div className={`p-1.5 rounded-lg flex-shrink-0 mt-0.5 ${cfg.bg}`}>
          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className={`text-[0.625rem] font-semibold uppercase tracking-wide ${cfg.color}`}>
              {isSession ? cfg.label : (isAuthored ? `Authored ${cfg.label}` : `Mentioned in ${cfg.label}`)}
            </span>
            {item.source_label && (
              <span className="text-[0.625rem] text-muted-foreground">· {item.source_label}</span>
            )}
            {item.source_date && (
              <span className="text-[0.625rem] text-muted-foreground ml-auto flex-shrink-0">
                {format(new Date(item.source_date), "MMM d, yyyy")}
              </span>
            )}
          </div>
          {item.preview_text && (
            // Render the post/comment/journal exactly how it renders at its
            // source — bold, italics, headings, links, images — via the shared
            // bulletin renderer (same as BulletinCard). Constrained height +
            // image cap keeps the feed scannable; "tap to view" opens the full
            // thing. NOT stripped to plain text.
            <div className="text-xs text-foreground leading-relaxed break-words wysiwyg-content max-h-48 overflow-hidden [&_img]:max-h-40 [&_img]:rounded-lg">
              {renderBulletinContent(mentionPreview(item), alters, terms)}
            </div>
          )}
          {item.navigate_path && (
            <p className="text-[0.625rem] text-primary mt-1">tap to view →</p>
          )}
        </div>
        {onDelete && (
          <button onClick={e => { e.stopPropagation(); onDelete(item.id); }} className="text-muted-foreground hover:text-destructive p-0.5 flex-shrink-0" aria-label="Delete this message">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function MessagesTab({ alterId, alters }) {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { items: allItems } = useAlterBoardFeed(alterId, { alters, sessionLabel: `${terms.Alter} session`, systemLabel: terms.System });
  const messages = allItems.filter((i) => i._is_message);
  const sessionFeedItems = allItems.filter((i) => i._is_session);

  const filtered = allItems.filter(item => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!mentionPreviewText(item).toLowerCase().includes(q) && !item.source_label?.toLowerCase().includes(q)) return false;
    }
    if (activeFilter === "all") return true;
    if (activeFilter === "mention") return item.log_type === "mention" || (!item.log_type && !item._is_message && !item._is_session);
    if (activeFilter === "message") return item._is_message;
    if (activeFilter === "session") return item._is_session;
    return item.source_type === activeFilter;
  });

  const countFor = (key) => {
    if (key === "all") return allItems.length;
    if (key === "mention") return allItems.filter(i => i.log_type === "mention" || (!i.log_type && !i._is_message && !i._is_session)).length;
    if (key === "message") return messages.length;
    if (key === "session") return sessionFeedItems.length;
    return allItems.filter(i => i.source_type === key).length;
  };

  const postMessage = async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    try {
      const msg = await postBoardMessage({ alterId, text: newContent, alters: alters || [], terms });
      if (msg === null) return; // backed out of the whisper warning
      refreshBoard(queryClient, alterId);
      setNewContent("");
      setComposing(false);
    } catch (e) {
      if (isLogCommandError(e)) toast.error(e.message); else toast.error("Couldn't post the message");
    } finally {
      setSaving(false);
    }
  };

  const deleteMessage = async (rawId) => {
    if (!(await confirm("Delete this message? It goes to the trash, where it can be restored for a while."))) return;
    await deleteAlterMessage(rawId);
    refreshBoard(queryClient, alterId);
  };

  return (
    <div className="space-y-3">
      {/* Help text — explains what the Board is. The Board is this {terms.alter}'s
          in-app activity log: every bulletin or comment they author, every
          journal entry, every check-in, every mention directed at them. */}
      <p className="text-xs text-muted-foreground leading-relaxed" data-pf-chrome-label>
        This {terms.alter}'s activity feed — every bulletin or comment they post, journals they author,
        check-ins they make, and any @mentions directed at them. Tap any item to jump to it.
      </p>
      {/* Search */}
      <input
        className="w-full h-8 px-3 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        placeholder="Search board…"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
      />

      {/* Filter chips */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none" data-pf-chrome>
        {FILTERS.map(f => {
          const count = countFor(f.key);
          if (count === 0 && f.key !== "all" && f.key !== activeFilter) return null;
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                activeFilter === f.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {f.label}
              {count > 0 && <span className="text-[0.625rem] opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm rounded-2xl" data-pf-surface>
          <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-20" />
          Nothing here yet — anything this {terms.alter} posts, comments on, journals, or gets mentioned in will show up here.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            item._is_message ? (
              <LogItem key={item.id} item={item} alters={alters} terms={terms} onDelete={() => deleteMessage(item._raw_id)} />
            ) : (
              <LogItem key={item.id} item={item} alters={alters} terms={terms} />
            )
          ))}
        </div>
      )}

      {/* Compose */}
      {composing ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
          <MentionTextarea toolbar
            placeholder={`Leave a message for this ${terms.alter}...`}
            value={newContent}
            onChange={setNewContent}
            alters={alters || []}
            signposts
            className="min-h-[80px] text-sm"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setComposing(false); setNewContent(""); }}>Cancel</Button>
            <Button size="sm" className="bg-primary" onClick={postMessage} disabled={saving || !newContent.trim()}>Post</Button>
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