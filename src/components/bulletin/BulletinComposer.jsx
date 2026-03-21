import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Send, Pin, BarChart2, X, Plus, AtSign } from "lucide-react";
import { toast } from "sonner";

const QUICK_EMOJIS = ["😊", "❤️", "⚠️", "📌", "🔔", "👍", "💜", "🌙"];

export default function BulletinComposer({ alters, authorAlterId, onClose }) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [saving, setSaving] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const textareaRef = useRef(null);

  const filteredAlters = alters.filter(
    (a) => !a.is_archived && 
      (a.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
       (a.alias && a.alias.toLowerCase().includes(mentionQuery.toLowerCase())))
  );

  const insertMention = (alter) => {
    const lastAt = content.lastIndexOf("@");
    if (lastAt !== -1 && !content.slice(lastAt + 1).includes(" ")) {
      // Replace the @ mention with proper mention
      const beforeAt = content.slice(0, lastAt);
      const mentionText = alter.alias || alter.name;
      const newContent = beforeAt + `@${mentionText} `;
      setContent(newContent);
    } else {
      // No incomplete mention, just append
      const mentionText = alter.alias || alter.name;
      const newContent = content + `@${mentionText} `;
      setContent(newContent);
    }
    setShowMentions(false);
    setMentionQuery("");
    textareaRef.current?.focus();
  };

  const handleContentChange = (e) => {
    const val = e.target.value;
    setContent(val);
    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1 && lastAt === val.length - 1) {
      setShowMentions(true);
      setMentionQuery("");
    } else if (lastAt !== -1 && !val.slice(lastAt + 1).includes(" ")) {
      setShowMentions(true);
      setMentionQuery(val.slice(lastAt + 1));
    } else {
      setShowMentions(false);
    }
  };

  const extractMentionedIds = () => {
    const mentioned = new Set();
    alters.forEach((a) => {
      const namePattern = `@${a.name}`;
      const aliasPattern = a.alias ? `@${a.alias}` : null;
      if (content.includes(namePattern) || (aliasPattern && content.includes(aliasPattern))) {
        mentioned.add(a.id);
      }
    });
    return Array.from(mentioned);
  };

  const handlePost = async () => {
    if (!content.trim()) return;
    setSaving(true);
    const mentionedIds = extractMentionedIds();
    const data = {
      author_alter_id: authorAlterId || null,
      content: content.trim(),
      mentioned_alter_ids: mentionedIds,
      is_pinned: pinned,
      reactions: {},
      read_by_alter_ids: authorAlterId ? [authorAlterId] : [],
    };
    if (showPoll && pollQuestion.trim()) {
      data.poll = {
        question: pollQuestion.trim(),
        options: pollOptions
          .filter((o) => o.trim())
          .map((label) => ({ label, votes: [] })),
      };
    }
    await base44.entities.Bulletin.create(data);
    qc.invalidateQueries({ queryKey: ["bulletins"] });
    toast.success("Bulletin posted!");
    setSaving(false);
    onClose?.();
  };

  return (
    <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-foreground">New Bulletin</p>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="relative">
        <Textarea
          ref={textareaRef}
          placeholder="Write a message for the system… use @ to mention an alter"
          value={content}
          onChange={handleContentChange}
          className="min-h-[80px] text-sm resize-none"
        />
        {showMentions && (
          <div className="absolute z-50 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto">
            {filteredAlters.slice(0, 8).map((a) => (
              <button
                key={a.id}
                onClick={() => insertMention(a)}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 text-left text-sm"
              >
                <div
                  className="w-6 h-6 rounded-full flex-shrink-0"
                  style={{ backgroundColor: a.color || "hsl(var(--muted))" }}
                />
                <div className="flex-1">
                  <span>{a.name}</span>
                  {a.alias && <span className="text-muted-foreground text-xs ml-1">({a.alias})</span>}
                </div>
                {a.pronouns && <span className="text-muted-foreground text-xs">· {a.pronouns}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick emoji insert */}
      <div className="flex gap-1 mt-2 flex-wrap">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => setContent((c) => c + e)}
            className="text-base hover:scale-125 transition-transform"
          >
            {e}
          </button>
        ))}
      </div>

      {/* Poll builder */}
      {showPoll && (
        <div className="mt-3 border border-border/50 rounded-xl p-3 bg-muted/20 space-y-2">
          <Input
            placeholder="Poll question…"
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
            className="text-sm"
          />
          {pollOptions.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder={`Option ${i + 1}`}
                value={opt}
                onChange={(e) => {
                  const next = [...pollOptions];
                  next[i] = e.target.value;
                  setPollOptions(next);
                }}
                className="text-sm"
              />
              {pollOptions.length > 2 && (
                <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
          ))}
          {pollOptions.length < 6 && (
            <button
              onClick={() => setPollOptions([...pollOptions, ""])}
              className="flex items-center gap-1 text-xs text-primary"
            >
              <Plus className="w-3 h-3" /> Add option
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="flex gap-2">
          <button
            onClick={() => setPinned((p) => !p)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${
              pinned ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Pin className="w-3 h-3" /> Pin
          </button>
          <button
            onClick={() => setShowPoll((p) => !p)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${
              showPoll ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart2 className="w-3 h-3" /> Poll
          </button>
          <button
            onClick={() => { setShowMentions(true); setContent((c) => c + "@"); textareaRef.current?.focus(); }}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground transition-all"
          >
            <AtSign className="w-3 h-3" /> Mention
          </button>
        </div>
        <Button onClick={handlePost} disabled={saving || !content.trim()} size="sm" className="bg-primary">
          <Send className="w-3 h-3 mr-1" /> Post
        </Button>
      </div>
    </div>
  );
}