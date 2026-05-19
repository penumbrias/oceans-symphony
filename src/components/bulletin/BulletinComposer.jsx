import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Send, Pin, BarChart2, X, Plus, AtSign } from "lucide-react";
import { toast } from "sonner";
import { saveMentions, saveAuthoredLog } from "@/lib/mentionUtils";
import { parseAndStripSignposts, isSystemSignpost, SYSTEM_SENTINEL_ID } from "@/lib/signpostAuthors";
import { useTerms } from "@/lib/useTerms";
import { useSystemIdentity } from "@/lib/useSystemIdentity";
import SystemAvatar from "@/components/shared/SystemAvatar";

const QUICK_EMOJIS = ["😊", "❤️", "⚠️", "📌", "🔔", "👍", "💜", "🌙"];

// `-system` (or the user's custom term, or the first word of their
// system name) resolves to the system-level sentinel — bulletin gets
// attributed to the system as a whole, no specific alter.
function parseSignposts(content, alters, systemKeywords) {
  const { authors, cleanText } = parseAndStripSignposts(content, alters, systemKeywords);
  return { authors, cleanContent: cleanText };
}

export default function BulletinComposer({ alters, authorAlterId, frontingAlterIds = [], onClose, initialContent = "" }) {
  const qc = useQueryClient();
  const terms = useTerms();
  const systemIdentity = useSystemIdentity();
  // Build the recognised system keywords from the user's preferences:
  // their term for "system" (e.g. "collective"), plus the first token
  // of their system name (e.g. "penumbrial" for "Penumbrial Ecosystem")
  // so `-penumbrial` works as a signpost. We also keep the literal
  // word "system" as a fallback via the parser's own default.
  const systemKeywords = React.useMemo(() => {
    const out = [];
    if (terms.system) out.push(terms.system);
    if (systemIdentity.name) {
      systemIdentity.name
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 3)
        .forEach((w) => out.push(w));
    }
    return out;
  }, [terms.system, systemIdentity.name]);
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
  // First-compose discoverability hint for the Pin / Poll buttons. Stored
  // in localStorage so it only shows once per device.
  const [showHint, setShowHint] = useState(() => {
    try { return localStorage.getItem("symphony_bulletin_compose_hint_seen") !== "1"; }
    catch { return true; }
  });
  const dismissHint = () => {
    setShowHint(false);
    try { localStorage.setItem("symphony_bulletin_compose_hint_seen", "1"); } catch {}
  };

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

  // System-level signpost suggestion. Surfaces in the dropdown just
  // like an alter would, with the user's system name + system avatar
  // so it reads as another author option. Matches the query against
  // the canonical "system" word, the user's term, and any word in the
  // system name.
  const systemSignpostMatches = (() => {
    const q = (signpostQuery || "").toLowerCase();
    if (!q) return true;
    if ("system".startsWith(q)) return true;
    if (terms.system && terms.system.toLowerCase().startsWith(q)) return true;
    if (systemIdentity.name) {
      const tokens = systemIdentity.name.toLowerCase().split(/\s+/);
      if (tokens.some((t) => t.startsWith(q))) return true;
    }
    return false;
  })();

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
    const token = alter.isSystem ? "system" : (alter.alias || alter.name);
    setContent(before + `-${token} `);
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
    const { authors: signpostedAuthors, cleanContent } = parseSignposts(content, alters, systemKeywords);
    // An explicit `-system` signpost short-circuits the whole
    // fronter-fallback path: the user has chosen to attribute this
    // bulletin to the system as a whole, even if someone is currently
    // fronting. Everything goes through as "no specific author".
    const signpostHeadIsSystem = isSystemSignpost(signpostedAuthors[0]);
    const signpostedIds = signpostedAuthors
      .filter((a) => !isSystemSignpost(a))
      .map((a) => a.id);
    let finalAuthorIds;
    if (signpostHeadIsSystem) {
      finalAuthorIds = [];
    } else if (signpostedIds.length > 0) {
      finalAuthorIds = signpostedIds;
    } else {
      finalAuthorIds = frontingAlterIds;
      // Defensive live-fetch when the prop-passed front is empty —
      // covers first-render hydration windows where the parent query
      // hasn't returned yet, so a post made right after page load
      // doesn't fall through to a "System"-attributed bulletin while
      // someone is clearly fronting.
      if (finalAuthorIds.length === 0) {
        try {
          const active = await base44.entities.FrontingSession.filter({ is_active: true });
          const liveIds = active
            .map(s => s.alter_id || s.primary_alter_id)
            .filter(Boolean);
          if (liveIds.length > 0) finalAuthorIds = liveIds;
        } catch { /* fall through */ }
      }
    }
    const mentionedIds = extractMentionedIds(cleanContent);

    const data = {
      author_alter_id: signpostHeadIsSystem ? null : (finalAuthorIds[0] || authorAlterId || null),
      author_alter_ids: finalAuthorIds,
      content: cleanContent,
      mentioned_alter_ids: mentionedIds,
      is_pinned: pinned,
      reactions: {},
      read_by_alter_ids: signpostHeadIsSystem
        ? []
        : (finalAuthorIds.length > 0 ? finalAuthorIds : (authorAlterId ? [authorAlterId] : [])),
    };

    if (showPoll && pollQuestion.trim()) {
      // Create the linked Poll entity FIRST so the bulletin can store its
      // id. Both the bulletin's poll block and the standalone Polls page
      // read/write the same Poll record, so voting is unified.
      const filledOptions = pollOptions.filter((o) => o.trim());
      const votes = {};
      filledOptions.forEach((_, idx) => { votes[String(idx)] = []; });
      // Inherit the user's last-used voting mode (alter vs anonymous
      // tally count) from the same localStorage key the Polls page
      // CreatePollModal writes. Same default contract: missing/0 = alter
      // mode, "1" = tally mode. Per-poll override is still possible from
      // the poll's detail view.
      let tallyDefault = false;
      try { tallyDefault = localStorage.getItem("symphony_polls_default_tally_mode") === "1"; }
      catch { /* localStorage might be off; default to alter mode */ }
      const createdPoll = await base44.entities.Poll.create({
        question: pollQuestion.trim(),
        options: filledOptions,
        votes,
        is_closed: false,
        tally_mode: tallyDefault,
        // New polls posted to the Bulletin Board auto-pin themselves to
        // the board so the question is hard to miss; the user can unpin
        // anytime from either surface.
        pinned_to_dashboard: true,
        // In tally mode there's no per-alter accounting — leave the
        // creator alter null even if a fronter is set.
        created_by_alter_id: tallyDefault ? null : (finalAuthorIds[0] || authorAlterId || null),
        // Back-ref filled in after the bulletin exists.
      });
      data.poll_id = createdPoll.id;
      // Auto-pin the bulletin so its poll block surfaces in the
      // BulletinBoard's Pinned section without the user having to long-
      // press → Pin afterwards.
      data.is_pinned = true;
      // Keep an inline copy in the legacy shape (label+votes) so any
      // surface that still reads `bulletin.poll` (older builds, exports,
      // …) keeps showing the question and options. The render path
      // prefers the Poll entity for vote state — the inline copy is only
      // a label fallback and is NOT kept in sync after creation.
      data.poll = {
        question: pollQuestion.trim(),
        options: filledOptions.map((label) => ({ label, votes: [] })),
      };
    }

    const bulletin = await base44.entities.Bulletin.create(data);
    // Close the loop on the Poll → Bulletin back-ref now that we have an id.
    if (data.poll_id) {
      try { await base44.entities.Poll.update(data.poll_id, { bulletin_id: bulletin.id }); }
      catch { /* non-fatal — the bulletin already references the poll */ }
      qc.invalidateQueries({ queryKey: ["polls"] });
    }
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
        {showSignpostMenu && (filteredSignposts.length > 0 || systemSignpostMatches) && (
          <div className="absolute z-50 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto">
            <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b border-border/50">Sign as author…</div>
            {systemSignpostMatches && (
              <button
                key={SYSTEM_SENTINEL_ID}
                onClick={() => insertSignpost({ id: SYSTEM_SENTINEL_ID, isSystem: true, name: systemIdentity.name })}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 text-left text-sm"
              >
                <SystemAvatar size="sm" />
                <span>{systemIdentity.name}</span>
                <span className="text-muted-foreground text-xs ml-1">(no specific {terms.alter})</span>
              </button>
            )}
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

      {showHint && (
        <div className="mt-3 flex items-start gap-2 text-xs px-3 py-2 rounded-xl border border-primary/30 bg-primary/5 text-foreground">
          <span className="text-base leading-none mt-px">💡</span>
          <p className="flex-1 leading-relaxed">
            Tip: tap <b>Poll</b> to attach a vote, <b>Pin</b> to keep the post at the top, or <b>Mention</b> to tag an alter.
          </p>
          <button onClick={dismissHint} aria-label="Dismiss hint" className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="mt-3">
        <div className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground/80 mb-1.5">Add to post</div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setPinned(p => !p); dismissHint(); }}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${pinned ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
              <Pin className="w-3.5 h-3.5" /> Pin
            </button>
            <button onClick={() => { setShowPoll(p => !p); dismissHint(); }}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${showPoll ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
              <BarChart2 className="w-3.5 h-3.5" /> Poll
            </button>
            <button onClick={() => { setShowMentions(true); setContent(c => c + "@"); textareaRef.current?.focus(); dismissHint(); }}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground transition-all">
              <AtSign className="w-3.5 h-3.5" /> Mention
            </button>
          </div>
          <Button onClick={() => { dismissHint(); handlePost(); }} disabled={saving || !content.trim()} size="sm" className="bg-primary">
            <Send className="w-3 h-3 mr-1" /> Post
          </Button>
        </div>
      </div>
    </div>
  );
}