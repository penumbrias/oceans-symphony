import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Square, Loader2, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import AuthorsRow from "./AuthorsRow";

function parseTaskBulletin(content) {
  const match = content.match(/^\[task:([^:\]]+)(:done)?\]\s*(.*)/s);
  if (match) return { taskId: match[1], completed: !!match[2], title: match[3] };
  return null;
}

export default function TaskBulletinCard({ bulletin, alters, frontingAlterIds = [], highlight }) {
  const qc = useQueryClient();
  const [toggling, setToggling] = useState(false);

  const parsed = parseTaskBulletin(bulletin.content);
  if (!parsed) return null;

  const authorIds = bulletin.author_alter_ids?.length > 0
    ? bulletin.author_alter_ids
    : (bulletin.author_alter_id ? [bulletin.author_alter_id] : frontingAlterIds);

  const timeAgo = formatDistanceToNow(new Date(bulletin.created_date), { addSuffix: true });
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

        <button onClick={handleDelete} className="flex-shrink-0 text-muted-foreground hover:text-destructive p-1 opacity-50 hover:opacity-100 transition-opacity">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}