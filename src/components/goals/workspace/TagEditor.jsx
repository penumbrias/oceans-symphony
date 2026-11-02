// Tags on a goal page or section: the chips under a title, and the
// "Tags" dialog that adds and removes them (with the tags already used
// elsewhere one tap away). Tapping a chip shows every page with that tag.
import React, { useMemo, useState } from "react";
import { X, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { updatePage } from "@/lib/goalTree";
import { pageTags, withTag, withoutTag, allPageTags } from "@/lib/goalWriting";
import { useWorkspace, inputCls } from "./WorkspaceContext";

export function TagChips({ page, onAdd = null, className = "" }) {
  const { showTag } = useWorkspace();
  const tags = pageTags(page);
  if (!tags.length && !onAdd) return null;
  return (
    <span className={`flex flex-wrap items-center gap-1 ${className}`}>
      {tags.map((t) => (
        <button key={t} type="button" onClick={(e) => { e.stopPropagation(); showTag?.(t); }}
          title={`Every page tagged #${t}`}
          className="text-[0.7em] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground hover:text-foreground max-w-[10rem] truncate">
          #{t}
        </button>
      ))}
      {onAdd && (
        <button type="button" onClick={onAdd} aria-label="Edit tags"
          className="text-[0.7em] px-1.5 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground flex items-center gap-0.5">
          <Plus className="w-3 h-3" /> {tags.length ? "" : "Tag"}
        </button>
      )}
    </span>
  );
}

export default function TagEditor({ page, open, onClose }) {
  const { goals, run, busy } = useWorkspace();
  const [text, setText] = useState("");
  const tags = pageTags(page);
  const suggestions = useMemo(() => {
    const have = new Set(tags.map((t) => t.toLowerCase()));
    const want = text.trim().replace(/^#+/, "").toLowerCase();
    return allPageTags(goals)
      .filter(({ tag }) => !have.has(tag.toLowerCase()) && (!want || tag.toLowerCase().includes(want)))
      .slice(0, 12);
  }, [goals, tags, text]);

  const save = (next) => run(() => updatePage(page.id, { tags: next }));
  const add = (t) => {
    const next = withTag(tags, t);
    setText("");
    if (next.length !== tags.length) save(next);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setText(""); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Tags for "{page.title || "Untitled"}"</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-1.5 min-h-[1.75rem]">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted/50 border border-border/40">
              #{t}
              <button type="button" disabled={busy} onClick={() => save(withoutTag(tags, t))} aria-label={`Remove tag ${t}`}
                className="-mr-1 p-0.5 rounded-full text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
            </span>
          ))}
          {tags.length === 0 && <span className="text-sm text-muted-foreground">No tags yet.</span>}
        </div>
        <div className="flex gap-1.5">
          <input className={`${inputCls} flex-1`} value={text} autoFocus aria-label="New tag"
            placeholder="Add a tag, like plot or character"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { e.preventDefault(); add(text); } }} />
          <Button size="sm" disabled={busy || !text.trim()} onClick={() => add(text)}>Add</Button>
        </div>
        {suggestions.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Used on other pages</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map(({ tag }) => (
                <button key={tag} type="button" disabled={busy} onClick={() => add(tag)}
                  className="text-xs px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground">
                  + #{tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
