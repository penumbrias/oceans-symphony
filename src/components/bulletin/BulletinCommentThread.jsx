import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Trash2, Reply, Link as LinkIcon, ChevronDown, ChevronRight, ArrowUpDown, Undo2 } from "lucide-react";
import { Link } from "react-router-dom";
import AuthorsRow from "./AuthorsRow";
import { saveAuthoredLog, saveMentions } from "@/lib/mentionUtils";

const REACTION_EMOJIS = ["👍", "❤️", "😊", "😂", "😢", "💜", "🔥", "⚠️"];

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

function CommentInput({ bulletinId, parentCommentId, alters, frontingAlterIds, onRefresh }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuMode, setMenuMode] = useState("signpost"); // "signpost" | "mention"
  const [query, setQuery] = useState("");

  const filteredAlters = alters.filter(a =>
    !a.is_archived &&
    (a.name.toLowerCase().includes(query.toLowerCase()) ||
     (a.alias && a.alias.toLowerCase().includes(query.toLowerCase())))
  );

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);

    // Check for @ mention
    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1 && !val.slice(lastAt + 1).includes(" ")) {
      setShowMenu(true);
      setMenuMode("mention");
      setQuery(val.slice(lastAt + 1));
      return;
    }

    // Check for - signpost
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
    setText(before + `-${alter.alias || alter.name} `);
    setShowMenu(false);
  };

  const handleSelect = (alter) => {
    if (menuMode === "mention") insertMention(alter);
    else insertSignpost(alter);
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    const { authorIds, cleanContent } = parseSignposts(text, alters);
    const finalAuthorIds = authorIds.length > 0 ? authorIds : frontingAlterIds;
    const comment = await base44.entities.BulletinComment.create({
      bulletin_id: bulletinId,
      parent_comment_id: parentCommentId || null,
      author_alter_id: finalAuthorIds[0] || null,
      author_alter_ids: finalAuthorIds,
      content: cleanContent,
      reactions: {},
    });
    const sourceType = parentCommentId ? "reply" : "comment";
    for (const authorId of finalAuthorIds) {
      await saveAuthoredLog({
        authorAlterId: authorId,
        sourceType,
        sourceId: bulletinId,
        sourceLabel: `${sourceType === "reply" ? "Reply" : "Comment"} on bulletin`,
        navigatePath: `/bulletin/${bulletinId}`,
        previewText: cleanContent,
      });
    }
    await saveMentions({
      content: cleanContent,
      alters,
      sourceType,
      sourceId: bulletinId,
      sourceLabel: `${sourceType === "reply" ? "Reply" : "Comment"} on bulletin`,
      navigatePath: `/bulletin/${bulletinId}`,
      authorAlterId: finalAuthorIds[0] || null,
    });
    setText("");
    setSaving(false);
    onRefresh();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          className="flex-1 h-8 px-3 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder={parentCommentId ? "Reply… use @ to mention, -name to sign (Cmd+Enter)" : "Add a comment… use @ to mention, -name to sign (Cmd+Enter)"}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={handleSubmit}
          disabled={saving || !text.trim()}
          className="text-xs px-3 py-1 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 font-medium"
        >
          {saving ? "..." : parentCommentId ? "Reply" : "Post"}
        </button>
      </div>
      {showMenu && filteredAlters.length > 0 && (
        <div className="absolute z-50 left-0 right-16 bg-popover border border-border rounded-xl shadow-lg mt-1 max-h-36 overflow-y-auto">
          <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b border-border/50">
            {menuMode === "mention" ? "Mention alter…" : "Sign as author…"}
          </div>
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

function CommentNode({ comment, allComments, bulletinId, depth, maxDepth, alters, currentAlterId, frontingAlterIds, onRefresh, isFullPage, pendingDeletes, onDeleteTap, onUndoDelete }) {
  const qc = useQueryClient();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [showReactPicker, setShowReactPicker] = useState(false);
  const [childrenCollapsed, setChildrenCollapsed] = useState(false);

  const children = allComments.filter(c => c.parent_comment_id === comment.id);
  const hasChildren = children.length > 0;
  const hasMoreDepth = hasChildren && maxDepth !== null && depth >= maxDepth;
  const shouldRenderChildren = maxDepth === null || depth < maxDepth;
  const reactions = comment.reactions || {};
const rawDate = comment.created_date;
const timeAgo = formatDistanceToNow(new Date(rawDate.endsWith("Z") ? rawDate : rawDate + "Z"), { addSuffix: true });
  const authorIds = comment.author_alter_ids?.length > 0 ? comment.author_alter_ids : (comment.author_alter_id ? [comment.author_alter_id] : frontingAlterIds);
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

  return (
    <div className={`${depth > 0 ? "pl-4 border-l border-border/30" : ""}`}>
      <div className="py-2">
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
            <button onClick={() => onDeleteTap(comment)} className="text-muted-foreground hover:text-destructive p-0.5 flex-shrink-0">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
        <p className="text-xs text-foreground leading-relaxed mt-1">{comment.content}</p>

        <div className="flex flex-wrap gap-1 mt-1.5 items-center">
          {Object.entries(reactions).filter(([, ids]) => ids.length > 0).map(([emoji, ids]) => (
            <button key={emoji} onClick={() => handleReact(emoji)}
              className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border transition-all ${
                currentAlterId && ids.includes(currentAlterId) ? "border-primary/50 bg-primary/10" : "border-border/40 hover:bg-muted/50"
              }`}>
              {emoji} <span className="text-muted-foreground text-[10px]">{ids.length}</span>
            </button>
          ))}
          <div className="relative">
            <button onClick={() => setShowReactPicker(p => !p)}
              className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/40 text-muted-foreground hover:bg-muted/50">
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
              className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/40 text-muted-foreground hover:bg-muted/50 flex items-center gap-1">
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

export default function BulletinCommentThread({ comments, bulletinId, alters, currentAlterId, frontingAlterIds, onRefresh, maxDepth = 2, isFullPage = false }) {
  const [sortOrder, setSortOrder] = useState("oldest");
  const [pendingDeletes, setPendingDeletes] = useState({});
  const [deleteTapCounts, setDeleteTapCounts] = useState({});

  // Countdown ticker for pending deletes
  useEffect(() => {
    if (Object.keys(pendingDeletes).length === 0) return;
    const interval = setInterval(() => {
      setPendingDeletes(prev => {
        const next = { ...prev };
        let changed = false;
        for (const id of Object.keys(next)) {
          const newCount = next[id].countdown - 1;
          if (newCount <= 0) {
            base44.entities.BulletinComment.delete(id).then(() => onRefresh());
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
      // First tap: start pending
      setPendingDeletes(p => ({ ...p, [comment.id]: { countdown: 10 } }));
      setDeleteTapCounts(p => ({ ...p, [comment.id]: { count: 1, lastTime: now } }));
      return;
    }

    // Already pending: check triple-tap
    if (now - tapInfo.lastTime < 600) {
      const newCount = tapInfo.count + 1;
      if (newCount >= 3) {
        // Force immediate delete
        setPendingDeletes(p => { const n = { ...p }; delete n[comment.id]; return n; });
        setDeleteTapCounts(p => { const n = { ...p }; delete n[comment.id]; return n; });
        base44.entities.BulletinComment.delete(comment.id).then(() => onRefresh());
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
      {/* New comment input at TOP */}
      <CommentInput
        bulletinId={bulletinId}
        parentCommentId={null}
        alters={alters}
        frontingAlterIds={frontingAlterIds}
        onRefresh={onRefresh}
      />

      {/* Sort toggle */}
      {rootComments.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={() => setSortOrder(p => p === "oldest" ? "newest" : "oldest")}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-full border border-border/40 hover:bg-muted/50 transition-colors"
          >
            <ArrowUpDown className="w-2.5 h-2.5" />
            {sortOrder === "oldest" ? "Oldest first" : "Newest first"}
          </button>
        </div>
      )}

      {/* Comment list */}
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
        />
      ))}
    </div>
  );
}