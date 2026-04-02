import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { CheckSquare, Square, Loader2, Trash2, Pin, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import AuthorsRow from "./AuthorsRow";
import BulletinCommentThread from "./BulletinCommentThread";

function parseTaskBulletin(content) {
  const match = content.match(/^\[task:([^:\]]+)(:done)?\]\s*(.*)/s);
  if (match) return { taskId: match[1], completed: !!match[2], title: match[3] };
  return null;
}

export default function TaskBulletinCard({ bulletin, alters, currentAlterId, frontingAlterIds = [], highlight }) {
  const qc = useQueryClient();
  const [toggling, setToggling] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ["bulletinComments", bulletin.id],
    queryFn: () => base44.entities.BulletinComment.filter({ bulletin_id: bulletin.id }, "created_date"),
    enabled: showComments,
  });

  const parsed = parseTaskBulletin(bulletin.content);
  if (!parsed) return null;

  const authorIds = bulletin.author_alter_ids?.length > 0
    ? bulletin.author_alter_ids
    : (bulletin.author_alter_id ? [bulletin.author_alter_id] : frontingAlterIds);

const rawDate = bulletin.created_date;
const timeAgo = formatDistanceToNow(new Date(rawDate.endsWith("Z") ? rawDate : rawDate + "Z"), { addSuffix: true });
  const isCompleted = parsed.completed;

  const handleToggle = async (e) => {
    e.stopPropagation();
    if (toggling) return;
    setToggling(true);
    const newCompleted = !isCompleted;
    const newContent = newCompleted
      ? `[task:${parsed.taskId}:done] ${parsed.title}`
      : `[task:${parsed.taskId}] ${parsed.title}`;
    await base44.entities.Bulletin.update(bulletin.id, { content: newContent });
    await base44.entities.Task.update(parsed.taskId, {
      completed: newCompleted,
      completed_date: newCompleted ? new Date().toISOString() : null,
    });
    qc.invalidateQueries({ queryKey: ["bulletins"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    setToggling(false);
  };

  const handlePin = async (e) => {
    e.stopPropagation();
    const newPinned = !bulletin.is_pinned;
    qc.setQueriesData({ queryKey: ["bulletins"] }, (old) =>
      Array.isArray(old) ? old.map((b) => b.id === bulletin.id ? { ...b, is_pinned: newPinned } : b) : old
    );
    await base44.entities.Bulletin.update(bulletin.id, { is_pinned: newPinned });
    qc.invalidateQueries({ queryKey: ["bulletins"] });
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    await base44.entities.Bulletin.delete(bulletin.id);
    qc.invalidateQueries({ queryKey: ["bulletins"] });
  };

  return (
    <div className={`border-2 border-dashed rounded-2xl p-3.5 transition-all ${
      highlight ? "border-primary/60 bg-primary/5" :
      isCompleted ? "border-green-500/40 bg-green-500/5" : "border-border/60 bg-muted/15"
    }`}>
      <div className="flex items-start gap-3">
        <button
          onClick={handleToggle}
          className={`mt-0.5 flex-shrink-0 transition-colors ${isCompleted ? "text-green-500" : "text-muted-foreground hover:text-primary"}`}
          disabled={toggling}
        >
          {toggling ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isCompleted ? (
            <CheckSquare className="w-5 h-5" />
          ) : (
            <Square className="w-5 h-5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {parsed.title}
          </p>
          <div className="mt-1">
            <AuthorsRow authorIds={authorIds} fallbackIds={frontingAlterIds} alters={alters} timestamp={timeAgo} />
          </div>
        </div>

        {/* Pin + Delete buttons */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handlePin}
            className="text-muted-foreground hover:text-foreground p-1 transition-opacity"
            title={bulletin.is_pinned ? "Unpin" : "Pin"}
          >
            <Pin className={`w-3.5 h-3.5 ${bulletin.is_pinned ? "text-primary" : ""}`} />
          </button>
          <button
            onClick={handleDelete}
            className="text-muted-foreground hover:text-destructive p-1 opacity-50 hover:opacity-100 transition-opacity"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Comment toggle */}
      <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setShowComments((p) => !p)}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-border/40 text-muted-foreground hover:bg-muted/50"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {showComments ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Comments
        </button>
      </div>

      {/* Comment thread */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-border/30" onClick={(e) => e.stopPropagation()}>
          <BulletinCommentThread
            comments={comments}
            bulletinId={bulletin.id}
            alters={alters}
            currentAlterId={currentAlterId}
            frontingAlterIds={frontingAlterIds}
            onRefresh={refetchComments}
            maxDepth={2}
            isFullPage={false}
          />
        </div>
      )}
    </div>
  );
}