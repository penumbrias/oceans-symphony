import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Send, Pin, BarChart2, X, Plus, AtSign } from "lucide-react";
import { toast } from "sonner";
import { saveMentions, saveAuthoredLog } from "@/lib/mentionUtils";

const QUICK_EMOJIS = ["😊", "❤️", "⚠️", "📌", "🔔", "👍", "💜", "🌙"];

function parseSignposts(content, alters) {
  const pattern = /-(\w+)/g;
  const authorIds = [];
  let cleanContent = content;
  const matches = [...content.matchAll(pattern)];
  for (const match of matches) {
    const term = match[1].toLowerCase();
    const alter = alters.find(a =>
      a.name.toLowerCase() === term || (a.alias && a.alias.toLowerCase() === term)
    );
    if (alter && !authorIds.includes(alter.id)) {
      authorIds.push(alter.id);
      cleanContent = cleanContent.replace(match[0], "");
    }
  }
  return { authorIds, cleanContent: cleanContent.trim() };
}

export default function BulletinComposer({ alters, authorAlterId, frontingAlterIds = [], onClose, initialContent = "" }) {
  const qc = useQueryClient();
  const [content, setContent] = useState(initialContent);
  const [pinned, setPinned] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [saving, setSaving] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [showSignpostMenu, setShowSignpostMenu] = useState(false);
  const [signpostQuery, setSignpostQuery] = useState("");
  const textareaRef = useRef(null);

  // Fix cursor position: when opened with initialContent, move cursor to end
  React.useEffect(() => {
    if (initialContent && textareaRef.current) {
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
      textareaRef.current.focus();
    }
  }, []);

  const activeAlters = alters.filter(a => !a.is_archived);

  const filteredMentions = activeAlters.filter(a =>
    a.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
    (a.alias && a.alias.toLowerCase().includes(mentionQuery.toLowerCase()))
  );

  const filteredSignposts = activeAlters.filter(a =>
    a.name.toLowerCase().includes(signpostQuery.toLowerCase()) ||
    (a.alias && a.alias.toLowerCase().includes(signpostQuery.toLowerCase()))
  );

  const insertMention = (alter) => {
    const lastAt = content.lastIndexOf("@");
    const beforeAt = lastAt !== -1 ? content.slice(0, lastAt) : content;
    setContent(beforeAt + `@${alter.alias || alter.name} `);
    setShowMentions(false);
    setMentionQuery("");
    textareaRef.current?.focus();
  };

  const insertSignpost = (alter) => {
    const lastDash = content.lastIndexOf("-");
    const before = lastDash !== -1 ? content.slice(0, lastDash) : content;
    setContent(before + `-${alter.alias || alter.name} `);
    setShowSignpostMenu(false);
    setSignpostQuery("");
    textareaRef.current?.focus();
  };

  const handleContentChange = (e) => {
    const val = e.target.value;
    setContent(val);

    // @ mention detection
    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1 && !val.slice(lastAt + 1).includes(" ")) {
      setShowMentions(true);
      setMentionQuery(val.slice(lastAt + 1));
      setShowSignpostMenu(false);
    } else {
      setShowMentions(false);
    }

    // - signpost detection
    const lastDash = val.lastIndexOf("-");
    if (lastDash !== -1 && !val.slice(lastDash + 1).includes(" ") && !showMentions) {
      const afterDash = val.slice(lastDash + 1);
      setShowSignpostMenu(true);
      setSignpostQuery(afterDash);
      setShowMentions(false);
    } else if (!val.endsWith("-") || showMentions) {
      setShowSignpostMenu(false);
    }
  };

  const extractMentionedIds = (text) => {
    const mentioned = new Set();
    alters.forEach(a => {
      if (text.includes(`@${a.name}`) || (a.alias && text.includes(`@${a.alias}`))) mentioned.add(a.id);
    });
    return Array.from(mentioned);
  };

  const handlePost = async () => {
    if (!content.trim()) return;
    setSaving(true);
    const { authorIds: signpostedIds, cleanContent } = parseSignposts(content, alters);
    const finalAuthorIds = signpostedIds.length > 0 ? signpostedIds : frontingAlterIds;
    const mentionedIds = extractMentionedIds(cleanContent);

    const data = {
      author_alter_id: finalAuthorIds[0] || authorAlterId || null,
      author_alter_ids: finalAuthorIds,
      content: cleanContent,
      mentioned_alter_ids: mentionedIds,
      is_pinned: pinned,
      reactions: {},
      read_by_alter_ids: finalAuthorIds.length > 0 ? finalAuthorIds : (authorAlterId ? [authorAlterId] : []),
    };

    if (showPoll && pollQuestion.trim()) {
      data.poll = {
        question: pollQuestion.trim(),
        options: pollOptions.filter(o => o.trim()).map(label => ({ label, votes: [] })),
      };
    }

    const bulletin = await base44.entities.Bulletin.create(data);
    qc.invalidateQueries({ queryKey: ["bulletins"] });
    await saveMentions({
      content: cleanContent,
      alters,
      sourceType: "bulletin",
      sourceId: bulletin.id,
      sourceLabel: "Bulletin Board",
      navigatePath: `/bulletin/${bulletin.id}`,
      authorAlterId: finalAuthorIds[0] || authorAlterId || null,
    });
    // Log authored entry for each author's board
    for (const authorId of finalAuthorIds) {
      await saveAuthoredLog({
        authorAlterId: authorId,
        sourceType: "bulletin",
        sourceId: bulletin.id,
        sourceLabel: "Bulletin Board",
        navigatePath: `/bulletin/${bulletin.id}`,
        previewText: cleanContent,
      });
    }
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
          placeholder="Write a message… use @ to mention, -name to sign as author"
          value={content}
          onChange={handleContentChange}
          className="min-h-[80px] text-sm resize-none"
          autoFocus
        />
        {showMentions && filteredMentions.length > 0 && (
          <div className="absolute z-50 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto">
            {filteredMentions.slice(0, 8).map(a => (
              <button key={a.id} onClick={() => insertMention(a)}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 text-left text-sm">
                <div className="w-6 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "hsl(var(--muted))" }} />
                <span>{a.name}</span>
                {a.alias && <span className="text-muted-foreground text-xs ml-1">({a.alias})</span>}
              </button>
            ))}
          </div>
        )}
        {showSignpostMenu && filteredSignposts.length > 0 && (
          <div className="absolute z-50 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto">
            <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b border-border/50">Sign as author…</div>
            {filteredSignposts.slice(0, 8).map(a => (
              <button key={a.id} onClick={() => insertSignpost(a)}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 text-left text-sm">
                <div className="w-6 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "hsl(var(--muted))" }} />
                <span>{a.name}</span>
                {a.alias && <span className="text-muted-foreground text-xs ml-1">({a.alias})</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-1 mt-2 flex-wrap">
        {QUICK_EMOJIS.map(e => (
          <button key={e} onClick={() => setContent(c => c + e)} className="text-base hover:scale-125 transition-transform">{e}</button>
        ))}
      </div>

      {showPoll && (
        <div className="mt-3 border border-border/50 rounded-xl p-3 bg-muted/20 space-y-2">
          <Input placeholder="Poll question…" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} className="text-sm" />
          {pollOptions.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder={`Option ${i + 1}`} value={opt}
                onChange={e => { const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next); }}
                className="text-sm" />
              {pollOptions.length > 2 && (
                <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}><X className="w-4 h-4 text-muted-foreground" /></button>
              )}
            </div>
          ))}
          {pollOptions.length < 6 && (
            <button onClick={() => setPollOptions([...pollOptions, ""])} className="flex items-center gap-1 text-xs text-primary">
              <Plus className="w-3 h-3" /> Add option
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setPinned(p => !p)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${pinned ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
            <Pin className="w-3 h-3" /> Pin
          </button>
          <button onClick={() => setShowPoll(p => !p)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${showPoll ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
            <BarChart2 className="w-3 h-3" /> Poll
          </button>
          <button onClick={() => { setShowMentions(true); setContent(c => c + "@"); textareaRef.current?.focus(); }}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground transition-all">
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