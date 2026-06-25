import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { Trash2, Reply, Link as LinkIcon, ChevronDown, ChevronRight, ArrowUpDown, Undo2, Sparkles, ImagePlus, Loader2, Lock, Check, Search, X, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import AuthorsRow from "./AuthorsRow";
import { saveAuthoredLog, saveMentions } from "@/lib/mentionUtils";
import { applyWhisper, whisperSpan } from "@/lib/whisperUtils";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useTerms } from "@/lib/useTerms";
import { parseAndStripSignposts, isSystemSignpost, SYSTEM_SENTINEL_ID } from "@/lib/signpostAuthors";
import { useSystemIdentity } from "@/lib/useSystemIdentity";
import SystemAvatar from "@/components/shared/SystemAvatar";
import { MiniToolbar, useTextareaInsert } from "@/components/shared/MiniToolbar";
import { processUploadedImage, saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { isLocalMode } from "@/lib/storageMode";
import { renderBulletinContent } from "@/lib/renderBulletinContent";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import AuthorChipsEditable from "@/components/shared/AuthorChipsEditable";

const REACTION_EMOJIS = ["👍", "❤️", "😊", "😂", "😢", "💜", "🔥", "⚠️"];

function parseSignposts(content, alters, systemKeywords) {
  const { authors, cleanText } = parseAndStripSignposts(content, alters, systemKeywords);
  return { authors, cleanContent: cleanText };
}

function CommentInput({ bulletinId, parentCommentId, alters, frontingAlterIds, onRefresh }) {
  const terms = useTerms();
  const systemIdentity = useSystemIdentity();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [removedAuthorIds, setRemovedAuthorIds] = useState(() => new Set());
  const [whisperOn, setWhisperOn] = useState(false);
  const [whisperTo, setWhisperTo] = useState(() => new Set());
  const [whisperSearch, setWhisperSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuMode, setMenuMode] = useState("signpost");
  const [query, setQuery] = useState("");
  // "Fancy" mode: a formatting toolbar + image/GIF upload over the same
  // box (the @mention/-signpost typing + parsing below is unchanged).
  // Persisted so the choice sticks across comments.
  const [richMode, setRichMode] = useState(() => {
    try { return localStorage.getItem("symphony_bulletin_comment_rich_mode") === "1"; } catch { return false; }
  });
  const toggleRich = () => setRichMode((v) => {
    const next = !v;
    try { localStorage.setItem("symphony_bulletin_comment_rich_mode", next ? "1" : "0"); } catch {}
    return next;
  });
  const inputRef = React.useRef(null);
  const imageInputRef = React.useRef(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const insertHtml = useTextareaInsert(inputRef, text, setText);
  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("That doesn't look like an image."); return; }
    setUploadingImage(true);
    try {
      const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, 800, 0.85);
      if (isGif && sizeKB > 3000) toast.warning(`Large GIF (${(sizeKB / 1024).toFixed(1)}MB) — grows your storage & backups.`);
      let url = dataUrl;
      if (isLocalMode()) {
        const id = `commentimg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(id, dataUrl);
        url = createLocalImageUrl(id);
      }
      insertHtml(`<img src="${url}" alt="" />`, "");
      toast.success(isGif ? "GIF added!" : "Image added!");
    } catch (err) {
      toast.error(err?.message || "Couldn't add that image.");
    } finally {
      setUploadingImage(false);
    }
  };

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

  const filteredAlters = alters.filter(a =>
    !a.is_archived &&
    (a.name.toLowerCase().includes(query.toLowerCase()) ||
     (a.alias && a.alias.toLowerCase().includes(query.toLowerCase())))
  );

  const systemSignpostMatches = (() => {
    if (menuMode !== "signpost") return false;
    const q = (query || "").toLowerCase();
    if (!q) return true;
    if ("system".startsWith(q)) return true;
    if (terms.system && terms.system.toLowerCase().startsWith(q)) return true;
    if (systemIdentity.name) {
      const tokens = systemIdentity.name.toLowerCase().split(/\s+/);
      if (tokens.some((t) => t.startsWith(q))) return true;
    }
    return false;
  })();

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);

    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1 && !val.slice(lastAt + 1).includes(" ")) {
      setShowMenu(true);
      setMenuMode("mention");
      setQuery(val.slice(lastAt + 1));
      return;
    }

    const lastDash = val.lastIndexOf("-");
    if (lastDash !== -1 && !val.slice(lastDash + 1).includes(" ") && val.slice(lastDash + 1).length > 0) {
      setShowMenu(true);
      setMenuMode("signpost");
      setQuery(val.slice(lastDash + 1));
      return;
    }

    setShowMenu(false);
  };

  const insertMention = (alter) => {
    const lastAt = text.lastIndexOf("@");
    const before = lastAt !== -1 ? text.slice(0, lastAt) : text;
    setText(before + `@${alter.alias || alter.name} `);
    setShowMenu(false);
  };

  const insertSignpost = (alter) => {
    const lastDash = text.lastIndexOf("-");
    const before = lastDash !== -1 ? text.slice(0, lastDash) : text;
    const token = alter.isSystem ? "system" : (alter.alias || alter.name);
    setText(before + `-${token} `);
    setShowMenu(false);
  };

  const handleSelect = (alter) => {
    if (menuMode === "mention") insertMention(alter);
    else insertSignpost(alter);
  };

  // Live attribution preview (signpost / emoji wins, else fronters) minus any
  // the user removed; falls back to a System chip so it's always visible.
  const resolvedAuthors = React.useMemo(() => {
    const { authors } = parseAndStripSignposts(text, alters, systemKeywords);
    if (isSystemSignpost(authors[0])) return [{ id: SYSTEM_SENTINEL_ID, isSystem: true }];
    const ids = authors.filter((a) => !isSystemSignpost(a)).map((a) => a.id);
    const useIds = ids.length > 0 ? ids : frontingAlterIds;
    return useIds.map((id) => alters.find((a) => a.id === id)).filter(Boolean);
  }, [text, alters, systemKeywords, frontingAlterIds]);
  const liveAuthors = resolvedAuthors.filter((a) => !removedAuthorIds.has(a.id));
  const displayAuthors = liveAuthors.length ? liveAuthors : [{ id: SYSTEM_SENTINEL_ID, isSystem: true }];
  const removeAuthor = (id) => setRemovedAuthorIds((s) => new Set(s).add(id));

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    // Parse signpost authorship from the ORIGINAL text first so whisper
    // wrapping can't be mangled by signpost stripping.
    const { authors: signpostedAuthors, cleanContent: signpostClean } = parseSignposts(text, alters, systemKeywords);
    // Whisper — explicit toggle is the reliable path; inline "/w" is the fallback.
    let cleanContent = signpostClean;
    let whisperRecipientIds = [];
    let isWhisper = false;
    if (whisperOn && whisperTo.size > 0) {
      const names = [...whisperTo]
        .map((id) => { const a = alters.find((x) => x.id === id); return a ? (a.alias || a.name) : null; })
        .filter(Boolean);
      cleanContent = whisperSpan(signpostClean, names);
      whisperRecipientIds = [...whisperTo];
      isWhisper = true;
    } else {
      const w = applyWhisper(signpostClean, alters, { rich: true, surfaceLabel: "comment" });
      if (w === null) { setSaving(false); return; } // user backed out of the whole-blur warning
      cleanContent = w.content;
      whisperRecipientIds = w.recipientIds || [];
      isWhisper = !!w.isWhisper;
    }
    const signpostHeadIsSystem = isSystemSignpost(signpostedAuthors[0]);
    const authorIds = signpostedAuthors
      .filter((a) => !isSystemSignpost(a))
      .map((a) => a.id);
    let finalAuthorIds;
    if (signpostHeadIsSystem) {
      finalAuthorIds = [];
    } else if (authorIds.length > 0) {
      finalAuthorIds = authorIds;
    } else {
      finalAuthorIds = frontingAlterIds;
      // Defensive: if no @ signposts and the prop-passed
      // frontingAlterIds is empty (the parent query might still be
      // hydrating, or a session was just created and not yet
      // propagated), refetch live so the comment isn't attributed to
      // "System" while there's clearly a fronter set.
      if (finalAuthorIds.length === 0) {
        try {
          const active = await base44.entities.FrontingSession.filter({ is_active: true });
          const liveIds = active
            .map(s => s.alter_id || s.primary_alter_id)
            .filter(Boolean);
          if (liveIds.length > 0) finalAuthorIds = liveIds;
        } catch { /* fall through with the system-attributed save */ }
      }
    }
    // Honour authors removed from the live chip list.
    finalAuthorIds = finalAuthorIds.filter((id) => !removedAuthorIds.has(id));
    const comment = await base44.entities.BulletinComment.create({
      bulletin_id: bulletinId,
      parent_comment_id: parentCommentId || null,
      author_alter_id: signpostHeadIsSystem ? null : (finalAuthorIds[0] || null),
      author_alter_ids: finalAuthorIds,
      content: cleanContent,
      // A whisper embeds an HTML span — force rich rendering so it shows the
      // hidden bar rather than raw tags.
      is_rich: richMode || isWhisper,
      reactions: {},
    });

    // Update last_activity_at on the parent bulletin for sort-by-activity
    await base44.entities.Bulletin.update(bulletinId, {
      last_activity_at: new Date().toISOString(),
    });

    const sourceType = parentCommentId ? "reply" : "comment";
    const commentNavPath = `/bulletin/${bulletinId}?commentId=${comment.id}`;
    for (const authorId of finalAuthorIds) {
      await saveAuthoredLog({
        authorAlterId: authorId,
        sourceType,
        sourceId: comment.id,
        sourceLabel: `${sourceType === "reply" ? "Reply" : "Comment"} on bulletin`,
        navigatePath: commentNavPath,
        previewText: cleanContent,
      });
    }
    // Skip public @mention notifications for whispers (the body is hidden;
    // only the chosen recipients are notified, via the loop below).
    if (!isWhisper) {
      await saveMentions({
        content: cleanContent,
        alters,
        sourceType,
        sourceId: comment.id,
        sourceLabel: `${sourceType === "reply" ? "Reply" : "Comment"} on bulletin`,
        navigatePath: commentNavPath,
        authorAlterId: finalAuthorIds[0] || null,
      });
    }
    // Whisper recipients are peeled off the body — notify them explicitly.
    for (const rid of whisperRecipientIds) {
      try {
        await base44.entities.MentionLog.create({
          mentioned_alter_id: rid,
          author_alter_id: finalAuthorIds[0] || null,
          log_type: "mention",
          source_type: sourceType,
          source_id: comment.id,
          source_label: `${sourceType === "reply" ? "Reply" : "Comment"} (whisper)`,
          source_date: new Date().toISOString(),
          preview_text: "🔒 private whisper",
          navigate_path: commentNavPath,
        });
      } catch { /* notification best-effort */ }
    }
    setText("");
    setSaving(false);
    onRefresh();
    // Refresh the board-level count badge.
    qc.invalidateQueries({ queryKey: ["bulletinCommentsAll"] });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
  };

  return (
    <div className="relative">
      <div className="flex gap-2 items-end">
        {richMode ? (
          <textarea
            ref={inputRef}
            className="flex-1 min-h-[56px] max-h-40 px-3 py-2 rounded-lg border border-input bg-background text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={parentCommentId ? "Reply… @ mention, -name to sign, /w @name [secret]" : "Add a comment… @ mention, -name to sign, /w @name [secret]"}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <input
            ref={inputRef}
            className="flex-1 h-8 px-3 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={parentCommentId ? "Reply… @ mention, -name, /w @name [secret] (Cmd+Enter)" : "Add a comment… @ mention, -name, /w @name [secret] (Cmd+Enter)"}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
        )}
        <button
          type="button"
          onClick={toggleRich}
          title={richMode ? "Switch to plain comment" : "Fancy formatting + image/GIF"}
          aria-pressed={richMode}
          className={`flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border transition-colors ${richMode ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setWhisperOn((v) => !v)}
          title="Whisper — only chosen recipients can read it"
          aria-pressed={whisperOn}
          className={`flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border transition-colors ${whisperOn ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}
        >
          <Lock className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !text.trim()}
          className="text-xs px-3 h-8 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 font-medium flex-shrink-0"
        >
          {saving ? "..." : parentCommentId ? "Reply" : "Post"}
        </button>
      </div>

      {whisperOn && (
        <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5 space-y-2">
          <p className="text-xs font-medium text-primary flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Whisper — only the {terms.alters} you pick can read this
          </p>
          {whisperTo.size > 0 && (
            <div className="flex flex-wrap gap-1">
              {[...whisperTo].map((id) => {
                const a = alters.find((x) => x.id === id);
                if (!a) return null;
                return (
                  <span key={id} className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full border border-border/60 bg-card text-xs">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#6366f1" }} />
                    <span className="truncate max-w-[7rem]">{formatAlter(a)}</span>
                    <button type="button" aria-label={`Remove ${formatAlter(a)}`} onClick={() => setWhisperTo((s) => { const n = new Set(s); n.delete(id); return n; })} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={whisperSearch}
              onChange={(e) => setWhisperSearch(e.target.value)}
              aria-label={`Search ${terms.alters}`}
              placeholder={`Search ${terms.alters}…`}
              className="w-full h-8 pl-8 pr-2.5 text-xs rounded-lg border border-border/50 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="max-h-40 overflow-y-auto overscroll-contain space-y-0.5">
            {(alters || [])
              .filter((a) => !a.is_archived)
              .filter((a) => { const q = whisperSearch.toLowerCase(); return !q || a.name?.toLowerCase().includes(q) || a.alias?.toLowerCase().includes(q); })
              .slice(0, 50)
              .map((a) => {
                const on = whisperTo.has(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setWhisperTo((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors min-h-[36px] ${on ? "bg-primary/10" : "hover:bg-muted/40"}`}
                  >
                    <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: a.color || "#6366f1" }}>
                      {on && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span className="flex-1 truncate">{formatAlter(a)}</span>
                  </button>
                );
              })}
          </div>
          {whisperTo.size === 0 && (
            <p className="text-[0.625rem] text-amber-600 dark:text-amber-400">Pick at least one recipient — otherwise this posts as a normal comment.</p>
          )}
        </div>
      )}

      <AuthorChipsEditable authors={displayAuthors} onRemove={removeAuthor} label="Signed by" />

      {richMode && (
        <div className="mt-1.5 rounded-lg border border-border/40 overflow-hidden">
          <div className="flex items-center gap-1 px-1.5 py-1 bg-muted/10">
            <button type="button" title="Insert image / GIF" disabled={uploadingImage}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => imageInputRef.current?.click()}
              className="h-6 px-1.5 flex items-center gap-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs font-medium flex-shrink-0 disabled:opacity-50">
              {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Image / GIF
            </button>
            <AssetButton onPick={(url) => insertHtml(`<img src="${url}" alt="" />`, "")} className="h-6 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 flex-shrink-0" title="Insert from assets" />
            <span className="text-[0.625rem] text-muted-foreground/70 ml-1 truncate">Select text, then tap a style</span>
          </div>
          <MiniToolbar onInsert={insertHtml} />
          <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImage} />
        </div>
      )}
      {showMenu && (filteredAlters.length > 0 || systemSignpostMatches) && (
        <div className="absolute z-50 left-0 right-16 bg-popover border border-border rounded-xl shadow-lg mt-1 max-h-36 overflow-y-auto">
          <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b border-border/50">
            {menuMode === "mention" ? `Mention ${terms.alter}…` : "Sign as author…"}
          </div>
          {systemSignpostMatches && (
            <button
              key={SYSTEM_SENTINEL_ID}
              onClick={() => handleSelect({ id: SYSTEM_SENTINEL_ID, isSystem: true, name: systemIdentity.name })}
              className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-muted/50 text-left text-xs"
            >
              <SystemAvatar size="sm" />
              <span>{systemIdentity.name}</span>
              <span className="text-muted-foreground">(no specific {terms.alter})</span>
            </button>
          )}
          {filteredAlters.slice(0, 6).map(a => (
            <button key={a.id} onClick={() => handleSelect(a)}
              className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-muted/50 text-left text-xs">
              <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#8b5cf6" }} />
              <span>{a.name}</span>
              {a.alias && <span className="text-muted-foreground">({a.alias})</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentNode({ comment, allComments, bulletinId, depth, maxDepth, alters, currentAlterId, frontingAlterIds, onRefresh, isFullPage, pendingDeletes, onDeleteTap, onUndoDelete, highlightedCommentId }) {
  const qc = useQueryClient();
  const terms = useTerms();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [showReactPicker, setShowReactPicker] = useState(false);
  const [childrenCollapsed, setChildrenCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content || "");

  const saveEdit = async () => {
    const v = draft.trim();
    if (!v) return;
    await base44.entities.BulletinComment.update(comment.id, { content: v, edited_date: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: ["bulletinComments", bulletinId] });
    qc.invalidateQueries({ queryKey: ["bulletinCommentsAll"] });
    setEditing(false);
  };

  const children = allComments.filter(c => c.parent_comment_id === comment.id);
  const hasChildren = children.length > 0;
  const hasMoreDepth = hasChildren && maxDepth !== null && depth >= maxDepth;
  const shouldRenderChildren = maxDepth === null || depth < maxDepth;
  const reactions = comment.reactions || {};
  const rawDate = comment.created_date;
  const dateObj = new Date(rawDate.endsWith("Z") ? rawDate : rawDate + "Z");
  const timeAgo = `${format(dateObj, "MMM d 'at' h:mm a")} · ${formatDistanceToNow(dateObj, { addSuffix: true })}`;
  // Authors are FIXED to whatever was saved on the comment at post time
  // (current front or signposts). Never fall back to the live
  // frontingAlterIds — the comment shouldn't appear to switch authors
  // when the front changes.
  const authorIds = comment.author_alter_ids?.length > 0
    ? comment.author_alter_ids
    : (comment.author_alter_id ? [comment.author_alter_id] : []);
  const canDelete = currentAlterId === comment.author_alter_id || authorIds.includes(currentAlterId);
  const pending = pendingDeletes[comment.id];

  const handleReact = async (emoji) => {
    const existing = reactions[emoji] || [];
    const next = existing.includes(currentAlterId)
      ? existing.filter(id => id !== currentAlterId)
      : [...existing, currentAlterId];
    await base44.entities.BulletinComment.update(comment.id, { reactions: { ...reactions, [emoji]: next } });
    qc.invalidateQueries({ queryKey: ["bulletinComments", bulletinId] });
    setShowReactPicker(false);
  };

  if (pending) {
    return (
      <div className={`${depth > 0 ? "pl-4 border-l border-border/30" : ""}`}>
        <div className="py-1.5 px-2 rounded-lg bg-destructive/5 border border-destructive/20 flex items-center gap-2 text-xs text-muted-foreground">
          <Trash2 className="w-3 h-3 text-destructive/60 flex-shrink-0" />
          <span className="flex-1 italic truncate">Deleting in {pending.countdown}s…</span>
          <button onClick={() => onUndoDelete(comment.id)} className="flex items-center gap-1 text-primary font-medium hover:underline flex-shrink-0">
            <Undo2 className="w-3 h-3" /> Undo
          </button>
          <button onClick={() => onDeleteTap(comment)} title="Tap 3× to delete now" className="text-destructive/60 hover:text-destructive flex-shrink-0">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  const isHighlighted = highlightedCommentId === comment.id;

  return (
    <div id={`comment-${comment.id}`} className={`${depth > 0 ? "pl-4 border-l border-border/30" : ""}`}>
      <div className={`py-2 rounded-lg transition-all duration-500 ${isHighlighted ? "bg-primary/10 ring-2 ring-primary/40 px-2" : ""}`}>
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-0.5 flex-1 min-w-0">
            {hasChildren && (
              <button onClick={() => setChildrenCollapsed(p => !p)} className="flex-shrink-0 text-muted-foreground hover:text-foreground p-0.5 mr-0.5">
                {childrenCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
            <AuthorsRow authorIds={authorIds} alters={alters} timestamp={timeAgo} showNames={depth === 0} />
          </div>
          {canDelete && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {!editing && (
                <button onClick={() => { setDraft(comment.content || ""); setEditing(true); }} className="text-muted-foreground hover:text-foreground p-0.5" title="Edit">
                  <Pencil className="w-3 h-3" />
                </button>
              )}
              <button onClick={() => onDeleteTap(comment)} className="text-muted-foreground hover:text-destructive p-0.5" title="Delete">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <div className="mt-1 space-y-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
              className="w-full text-xs p-2 rounded-lg border border-input bg-background resize-y"
            />
            <div className="flex items-center gap-1.5">
              <button onClick={saveEdit} disabled={!draft.trim()}
                className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">Save</button>
              <button onClick={() => { setDraft(comment.content || ""); setEditing(false); }}
                className="px-2.5 py-1 rounded-md border border-border text-xs">Cancel</button>
            </div>
            {comment.is_rich && (
              <p className="text-[0.625rem] text-muted-foreground">This is a formatted comment — you're editing its underlying text/markup.</p>
            )}
          </div>
        ) : (
          <div className="text-xs text-foreground leading-relaxed mt-1 break-words wysiwyg-content">
            {renderBulletinContent(comment.content, alters, terms, { isRich: !!comment.is_rich })}
            {comment.edited_date && <span className="text-[0.625rem] text-muted-foreground/70 italic ml-1">· edited</span>}
          </div>
        )}

        <div className="flex flex-wrap gap-1 mt-1.5 items-center">
          {Object.entries(reactions).filter(([, ids]) => ids.length > 0).map(([emoji, ids]) => (
            <button key={emoji} onClick={() => handleReact(emoji)}
              className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border transition-all ${
                currentAlterId && ids.includes(currentAlterId) ? "border-primary/50 bg-primary/10" : "border-border/40 hover:bg-muted/50"
              }`}>
              {emoji} <span className="text-muted-foreground text-[0.625rem]">{ids.length}</span>
            </button>
          ))}
          <div className="relative">
            <button onClick={() => setShowReactPicker(p => !p)}
              className="text-[0.625rem] px-1.5 py-0.5 rounded-full border border-border/40 text-muted-foreground hover:bg-muted/50">
              + React
            </button>
            {showReactPicker && (
              <div className="absolute bottom-6 left-0 z-50 bg-popover border border-border rounded-xl shadow-xl p-2 flex gap-1 flex-wrap w-40">
                {REACTION_EMOJIS.map(e => (
                  <button key={e} onClick={() => handleReact(e)} className="text-base hover:scale-125 transition-transform">{e}</button>
                ))}
              </div>
            )}
          </div>
          {(maxDepth === null || depth < maxDepth) && (
            <button onClick={() => setShowReplyInput(p => !p)}
              className="text-[0.625rem] px-1.5 py-0.5 rounded-full border border-border/40 text-muted-foreground hover:bg-muted/50 flex items-center gap-1">
              <Reply className="w-2.5 h-2.5" /> Reply
            </button>
          )}
        </div>

        {showReplyInput && (
          <div className="mt-1.5">
            <CommentInput
              bulletinId={bulletinId}
              parentCommentId={comment.id}
              alters={alters}
              frontingAlterIds={frontingAlterIds}
              onRefresh={() => { setShowReplyInput(false); onRefresh(); }}
            />
          </div>
        )}
      </div>

      {!childrenCollapsed && shouldRenderChildren && children.map(child => (
        <CommentNode
          key={child.id}
          comment={child}
          allComments={allComments}
          bulletinId={bulletinId}
          depth={depth + 1}
          maxDepth={maxDepth}
          alters={alters}
          currentAlterId={currentAlterId}
          frontingAlterIds={frontingAlterIds}
          onRefresh={onRefresh}
          isFullPage={isFullPage}
          pendingDeletes={pendingDeletes}
          onDeleteTap={onDeleteTap}
          onUndoDelete={onUndoDelete}
          highlightedCommentId={highlightedCommentId}
        />
      ))}

      {!childrenCollapsed && hasMoreDepth && !isFullPage && (
        <Link to={`/bulletin/${bulletinId}`}
          className="flex items-center gap-1 text-xs text-primary hover:underline mt-1 pl-4">
          <LinkIcon className="w-3 h-3" />
          See full thread ({children.length} {children.length === 1 ? "reply" : "replies"})
        </Link>
      )}
    </div>
  );
}

export default function BulletinCommentThread({ comments, bulletinId, alters, currentAlterId, frontingAlterIds, onRefresh, maxDepth = 2, isFullPage = false, highlightedCommentId = null }) {
  const qc = useQueryClient();
  const [sortOrder, setSortOrder] = useState("oldest");
  const [pendingDeletes, setPendingDeletes] = useState({});
  const [deleteTapCounts, setDeleteTapCounts] = useState({});

  useEffect(() => {
    if (Object.keys(pendingDeletes).length === 0) return;
    const interval = setInterval(() => {
      setPendingDeletes(prev => {
        const next = { ...prev };
        let changed = false;
        for (const id of Object.keys(next)) {
          const newCount = next[id].countdown - 1;
          if (newCount <= 0) {
            base44.entities.BulletinComment.delete(id).then(() => {
              onRefresh();
              qc.invalidateQueries({ queryKey: ["bulletinCommentsAll"] });
            });
            delete next[id];
          } else {
            next[id] = { ...next[id], countdown: newCount };
          }
          changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [JSON.stringify(Object.keys(pendingDeletes))]);

  const handleDeleteTap = (comment) => {
    const now = Date.now();
    const tapInfo = deleteTapCounts[comment.id] || { count: 0, lastTime: 0 };

    if (!pendingDeletes[comment.id]) {
      setPendingDeletes(p => ({ ...p, [comment.id]: { countdown: 10 } }));
      setDeleteTapCounts(p => ({ ...p, [comment.id]: { count: 1, lastTime: now } }));
      return;
    }

    if (now - tapInfo.lastTime < 600) {
      const newCount = tapInfo.count + 1;
      if (newCount >= 3) {
        setPendingDeletes(p => { const n = { ...p }; delete n[comment.id]; return n; });
        setDeleteTapCounts(p => { const n = { ...p }; delete n[comment.id]; return n; });
        base44.entities.BulletinComment.delete(comment.id).then(() => {
          onRefresh();
          qc.invalidateQueries({ queryKey: ["bulletinCommentsAll"] });
        });
      } else {
        setDeleteTapCounts(p => ({ ...p, [comment.id]: { count: newCount, lastTime: now } }));
      }
    } else {
      setDeleteTapCounts(p => ({ ...p, [comment.id]: { count: 1, lastTime: now } }));
    }
  };

  const handleUndoDelete = (commentId) => {
    setPendingDeletes(p => { const n = { ...p }; delete n[commentId]; return n; });
    setDeleteTapCounts(p => { const n = { ...p }; delete n[commentId]; return n; });
  };

  const rootComments = comments
    .filter(c => !c.parent_comment_id)
    .sort((a, b) => {
      const diff = new Date(a.created_date) - new Date(b.created_date);
      return sortOrder === "oldest" ? diff : -diff;
    });

  return (
    <div className="space-y-2">
      <CommentInput
        bulletinId={bulletinId}
        parentCommentId={null}
        alters={alters}
        frontingAlterIds={frontingAlterIds}
        onRefresh={onRefresh}
      />

      {rootComments.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={() => setSortOrder(p => p === "oldest" ? "newest" : "oldest")}
            className="flex items-center gap-1 text-[0.625rem] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-full border border-border/40 hover:bg-muted/50 transition-colors"
          >
            <ArrowUpDown className="w-2.5 h-2.5" />
            {sortOrder === "oldest" ? "Oldest first" : "Newest first"}
          </button>
        </div>
      )}

      {rootComments.map(comment => (
        <CommentNode
          key={comment.id}
          comment={comment}
          allComments={comments}
          bulletinId={bulletinId}
          depth={0}
          maxDepth={maxDepth}
          alters={alters}
          currentAlterId={currentAlterId}
          frontingAlterIds={frontingAlterIds}
          onRefresh={onRefresh}
          isFullPage={isFullPage}
          pendingDeletes={pendingDeletes}
          onDeleteTap={handleDeleteTap}
          onUndoDelete={handleUndoDelete}
          highlightedCommentId={highlightedCommentId}
        />
      ))}
    </div>
  );
}