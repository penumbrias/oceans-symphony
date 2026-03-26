import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Trash2, Reply, Link as LinkIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
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
  const [showSignpostMenu, setShowSignpostMenu] = useState(false);
  const [signpostQuery, setSignpostQuery] = useState("");

  const filteredAlters = alters.filter(a =>
    !a.is_archived &&
    (a.name.toLowerCase().includes(signpostQuery.toLowerCase()) ||
     (a.alias && a.alias.toLowerCase().includes(signpostQuery.toLowerCase())))
  );

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    const lastDash = val.lastIndexOf("-");
    if (lastDash !== -1 && !val.slice(lastDash + 1).includes(" ") && val.slice(lastDash + 1).length > 0) {
      setShowSignpostMenu(true);
      setSignpostQuery(val.slice(lastDash + 1));
    } else if (val.endsWith("-")) {
      setShowSignpostMenu(true);
      setSignpostQuery("");
    } else {
      setShowSignpostMenu(false);
    }
  };

  const insertSignpost = (alter) => {
    const lastDash = text.lastIndexOf("-");
    const before = lastDash !== -1 ? text.slice(0, lastDash) : text;
    setText(before + `-${alter.alias || alter.name} `);
    setShowSignpostMenu(false);
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
    // Log authored entry + mentions for each author
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
    <div className="relative mt-2">
      <div className="flex gap-2">
        <input
          className="flex-1 h-8 px-3 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Reply… use -name to sign (Cmd+Enter to post)"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={handleSubmit}
          disabled={saving || !text.trim()}
          className="text-xs px-3 py-1 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 font-medium"
        >
          {saving ? "..." : "Reply"}
        </button>
      </div>
      {showSignpostMenu && filteredAlters.length > 0 && (
        <div className="absolute z-50 left-0 right-16 bg-popover border border-border rounded-xl shadow-lg mt-1 max-h-36 overflow-y-auto">
          {filteredAlters.slice(0, 6).map(a => (
            <button key={a.id} onClick={() => insertSignpost(a)}
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

function CommentNode({ comment, allComments, bulletinId, depth, maxDepth, alters, currentAlterId, frontingAlterIds, onRefresh, isFullPage }) {
  const qc = useQueryClient();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [showReactPicker, setShowReactPicker] = useState(false);
  const children = allComments.filter(c => c.parent_comment_id === comment.id);
  const hasMoreDepth = children.length > 0 && maxDepth !== null && depth >= maxDepth;
  const shouldRenderChildren = maxDepth === null || depth < maxDepth;
  const reactions = comment.reactions || {};
  const timeAgo = formatDistanceToNow(new Date(comment.created_date), { addSuffix: true });
  const authorIds = comment.author_alter_ids?.length > 0 ? comment.author_alter_ids : (comment.author_alter_id ? [comment.author_alter_id] : frontingAlterIds);

  const handleReact = async (emoji) => {
    const existing = reactions[emoji] || [];
    const next = existing.includes(currentAlterId)
      ? existing.filter(id => id !== currentAlterId)
      : [...existing, currentAlterId];
    await base44.entities.BulletinComment.update(comment.id, { reactions: { ...reactions, [emoji]: next } });
    qc.invalidateQueries({ queryKey: ["bulletinComments", bulletinId] });
    setShowReactPicker(false);
  };

  const handleDelete = async () => {
    await base44.entities.BulletinComment.delete(comment.id);
    onRefresh();
  };

  return (
    <div className={`${depth > 0 ? "pl-4 border-l border-border/30" : ""}`}>
      <div className="py-2">
        <div className="flex items-start justify-between gap-1 mb-1">
          <AuthorsRow authorIds={authorIds} alters={alters} timestamp={timeAgo} showNames={depth === 0} />
          {(currentAlterId === comment.author_alter_id || authorIds.includes(currentAlterId)) && (
            <button onClick={handleDelete} className="text-muted-foreground hover:text-destructive p-0.5 flex-shrink-0">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
        <p className="text-xs text-foreground leading-relaxed mt-1">{comment.content}</p>

        {/* Reactions */}
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
          <CommentInput
            bulletinId={bulletinId}
            parentCommentId={comment.id}
            alters={alters}
            frontingAlterIds={frontingAlterIds}
            onRefresh={() => { setShowReplyInput(false); onRefresh(); }}
          />
        )}
      </div>

      {/* Children */}
      {shouldRenderChildren && children.map(child => (
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
        />
      ))}

      {/* "See full thread" link when truncated */}
      {hasMoreDepth && !isFullPage && (
        <Link to={`/bulletin/${bulletinId}`}
          className="flex items-center gap-1 text-xs text-primary hover:underline mt-1 pl-4">
          <LinkIcon className="w-3 h-3" />
          See full thread ({children.length} {children.length === 1 ? "reply" : "replies"})
        </Link>
      )}
    </div>
  );
}

// Renders the full comment thread for a bulletin
// comments: flat array of all comments for the bulletin
// maxDepth: null = unlimited, 2 = dashboard mode
export default function BulletinCommentThread({ comments, bulletinId, alters, currentAlterId, frontingAlterIds, onRefresh, maxDepth = 2, isFullPage = false }) {
  const rootComments = comments.filter(c => !c.parent_comment_id);
  return (
    <div className="space-y-1">
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
        />
      ))}
      {/* Root-level reply input */}
      <CommentInput
        bulletinId={bulletinId}
        parentCommentId={null}
        alters={alters}
        frontingAlterIds={frontingAlterIds}
        onRefresh={onRefresh}
      />
    </div>
  );
}