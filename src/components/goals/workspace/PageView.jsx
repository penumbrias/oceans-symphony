// One page of the Notebook: breadcrumbs, title and where it stands, above
// the page's widget board. Also the page note and connections pieces the
// goal widgets draw (goalPageWidgets.jsx).
import React, { useEffect, useState } from "react";
import { Pin, Link2 } from "lucide-react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { goalStatusLabel } from "@/lib/goals";
import { useTerms } from "@/lib/useTerms";
import {
  ancestorsOf, updatePage, deletePage, descendantIds, movePage, pageEntries, orderAfter, connectionsOf,
} from "@/lib/goalTree";
import RichText from "@/components/shared/RichText";
import { Button } from "@/components/ui/button";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { useSubtreeProgress } from "./Outline";
import MovePageDialog from "./MovePageDialog";
import { TagChips } from "./TagEditor";
import PageInfoSheet from "./PageInfoSheet";
import { sectionHeading, pageWordCount, wordTargetOf, wordProgressLabel } from "@/lib/goalWriting";
import { prepareNote, recordNote, NoteText } from "./ItemRow";
import { useWorkspace } from "./WorkspaceContext";
import BoardPageHeader from "@/components/profile/BoardPageHeader";

export function PageNote({ page, editing, setEditing, emptyPrompt = false }) {
  const { alters, run, busy } = useWorkspace();
  const t = useTerms();
  const [text, setText] = useState(page.why || "");
  useEffect(() => { if (editing) setText(page.why || ""); }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!page.why && !editing) {
    if (!emptyPrompt) return null;
    return (
      <button type="button" onClick={() => { setText(""); setEditing(true); }}
        className="block w-full text-left text-sm text-muted-foreground hover:text-foreground">
        Add a note about this page…
      </button>
    );
  }
  if (editing) {
    return (
      <div className="space-y-1.5">
        <MentionTextarea toolbar value={text} onChange={setText} alters={alters} signposts autoFocus className="min-h-[70px] text-sm" />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          <Button size="sm" disabled={busy} onClick={() => run(async () => {
            const v = text.trim();
            if (!v) { await updatePage(page.id, { why: "" }); setEditing(false); return; }
            const prepared = await prepareNote(v, { alters, terms: t });
            if (!prepared) return;
            await updatePage(page.id, { why: prepared.content });
            await recordNote(prepared, { alters, pageId: page.id, pageTitle: page.title });
            setEditing(false);
          })}>Save</Button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => { setText(page.why || ""); setEditing(true); }}
      className="block w-full text-left text-sm text-foreground/90 whitespace-pre-wrap">
      <NoteText body={page.why} />
      {page.impact && (
        <span className="block text-xs mt-1"><span className="text-muted-foreground">What it would change: </span>
          <RichText content={page.impact} alters={alters} terms={t} /></span>
      )}
    </button>
  );
}

export function Connections({ page, emptyText = null, bare = false }) {
  const { goals, steps, open } = useWorkspace();
  const { outgoing, incoming } = connectionsOf(page.id, goals, steps);
  if (!outgoing.length && !incoming.length) {
    return emptyText ? <p className="text-xs text-muted-foreground">{emptyText}</p> : null;
  }
  const chip = (c, dir) => (
    <button key={`${dir}-${c.page.id}-${c.label}`} type="button" onClick={() => open(c.page.id)}
      className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1 max-w-full">
      <Link2 className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">
        {dir === "in" ? "linked from: " : c.label ? `${c.label} → ` : "→ "}
        {c.page.icon ? `${c.page.icon} ` : ""}{c.page.title || "Untitled"}
      </span>
    </button>
  );
  if (bare) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {outgoing.map((c) => chip(c, "out"))}
        {incoming.map((c) => chip(c, "in"))}
      </div>
    );
  }
  return (
    <div className="pt-3 border-t border-border/40 space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connections</p>
      <div className="flex flex-wrap gap-1.5">
        {outgoing.map((c) => chip(c, "out"))}
        {incoming.map((c) => chip(c, "in"))}
      </div>
    </div>
  );
}

// The page's own chrome — where it is, its title and a line about where
// it stands — above `body`: the page's widget board (Goals.jsx). Everything
// about the page (title, icon, status, tags, word target, chapters; pin,
// move, delete) is entered on its Info sheet (PageInfoSheet, v0.359.0);
// how the lines show (outline, board, map) is the Page widget's option.
export default function PageView({ page, body, onEditLayout = null, layoutEditing = false }) {
  const ws = useWorkspace();
  const { index, steps, run, open } = ws;
  const [moving, setMoving] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  useEffect(() => { setInfoOpen(false); }, [page.id]);
  const crumbs = ancestorsOf(index, page.id).reverse();
  const { done, total } = useSubtreeProgress(page.id);
  const heading = sectionHeading(index, page);
  const wordTarget = wordTargetOf(page);
  const words = heading || page.child_section_style || wordTarget ? pageWordCount(index, steps, page.id) : 0;

  const remove = async () => {
    const inside = descendantIds(index, page.id).length;
    const ok = await confirm({
      title: `Delete "${page.title || "this page"}"?`,
      body: `It goes to the trash${inside ? ` with the ${inside === 1 ? "section" : `${inside} sections`} inside it` : ""}, its lines and the to-dos made on it. "Reached" or "Let go" keep it instead. You can put it all back from the trash.`,
      confirmLabel: "Delete", destructive: true,
    });
    if (!ok) return;
    setInfoOpen(false);
    const parent = index.parent.get(page.id) || null;
    await run(() => deletePage(index, steps, page.id), "Moved to the trash");
    open(parent);
  };

  const facts = [
    page.status ? goalStatusLabel(page.status) : null,
    page.target_date ? `by ${new Date(`${page.target_date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : null,
    total > 0 ? `${done} of ${total} done` : null,
    words > 0 || wordTarget ? wordProgressLabel(words, wordTarget) : null,
  ].filter(Boolean);

  return (
    <article className="space-y-4" data-highlight-id={page.id}>
      <nav aria-label="Where this page is" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <button type="button" onClick={() => open(null)} className="hover:text-foreground min-h-[1.75rem]">Notebook</button>
        {crumbs.map((c) => (
          <React.Fragment key={c.id}>
            <span aria-hidden="true">›</span>
            <button type="button" onClick={() => open(c.id)} className="hover:text-foreground truncate max-w-[10rem] min-h-[1.75rem]">{c.title || "Untitled"}</button>
          </React.Fragment>
        ))}
      </nav>

      <BoardPageHeader title={page.title || "Untitled"} icon={page.icon || null} size="md"
        before={heading ? <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">{heading}</p> : null}
        layoutEditing={layoutEditing} onEditLayout={onEditLayout} tourId="goals-layout-btn"
        info={{ open: infoOpen, onToggle: () => setInfoOpen((v) => !v), "data-tour": "goals-info-btn",
          title: "Everything about this page: title, icon, status, tags, word target, chapters" }}
        after={<>
        {(facts.length > 0 || page.pinned) && (
          <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 tabular-nums">
            {facts.map((f) => <span key={f}>{f}</span>)}
            {page.pinned && <Pin className="w-3 h-3" aria-label="Pinned" />}
          </p>
        )}
        {wordTarget && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden" role="progressbar" aria-label="Words written"
            aria-valuemin={0} aria-valuemax={wordTarget} aria-valuenow={Math.min(words, wordTarget)}>
            <div className="h-full bg-primary/60 transition-all" style={{ width: `${Math.min(100, (words / wordTarget) * 100)}%` }} />
          </div>
        )}
        <TagChips page={page} />
        {total > 0 && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
            <div className="h-full bg-primary transition-all" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        )}
        </>} />

      {body}

      <PageInfoSheet page={page} open={infoOpen && !layoutEditing} onClose={() => setInfoOpen(false)}
        onMove={() => { setInfoOpen(false); setMoving(true); }} onDelete={remove} />
      {moving && (
        <MovePageDialog open title={`Move "${page.title || "page"}" to…`} movingPageId={page.id} allowTop
          currentId={index.parent.get(page.id) || null} onClose={() => setMoving(false)}
          onPick={(target) => {
            setMoving(false);
            run(() => movePage(index, page.id, target, target ? orderAfter(pageEntries(index, steps, target)) : null), "Moved");
          }} />
      )}
    </article>
  );
}
