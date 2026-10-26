// One page of the Goals workspace: breadcrumbs, title, status, the
// activity strip, the page's note, its lines and sections (as an outline,
// a board or a map), and its connections.
import React, { useEffect, useState } from "react";
import { MoreHorizontal, ListTree, Columns3, Network, Pin, Link2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { confirm, promptText } from "@/components/shared/ConfirmDialog";
import { GOAL_STATUSES, goalStatusLabel, setGoalStatus } from "@/lib/goals";
import { useTerms } from "@/lib/useTerms";
import {
  ancestorsOf, updatePage, deletePage, descendantIds, movePage, pageEntries, orderAfter, connectionsOf,
} from "@/lib/goalTree";
import RichText from "@/components/shared/RichText";
import { Button } from "@/components/ui/button";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { EntryList, useSubtreeProgress } from "./Outline";
import BoardView from "./BoardView";
import MapView from "./MapView";
import ActivityStrip from "./ActivityStrip";
import MovePageDialog from "./MovePageDialog";
import { prepareNote, recordNote, NoteText } from "./ItemRow";
import { useWorkspace } from "./WorkspaceContext";

const VIEWS = [
  { id: "outline", label: "Outline", Icon: ListTree },
  { id: "board", label: "Board", Icon: Columns3 },
  { id: "map", label: "Map", Icon: Network },
];

function PageNote({ page, editing, setEditing }) {
  const { alters, run, busy } = useWorkspace();
  const t = useTerms();
  const [text, setText] = useState(page.why || "");
  useEffect(() => { if (editing) setText(page.why || ""); }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!page.why && !editing) return null;
  if (editing) {
    return (
      <div className="space-y-1.5">
        <MentionTextarea value={text} onChange={setText} alters={alters} signposts autoFocus className="min-h-[70px] text-sm" />
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

function Connections({ page }) {
  const { goals, steps, open } = useWorkspace();
  const { outgoing, incoming } = connectionsOf(page.id, goals, steps);
  if (!outgoing.length && !incoming.length) return null;
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

export default function PageView({ page }) {
  const ws = useWorkspace();
  const { index, steps, run, busy, open } = ws;
  const [title, setTitle] = useState(page.title || "");
  const [moving, setMoving] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  useEffect(() => { setNoteEditing(false); }, [page.id]);
  useEffect(() => { setTitle(page.title || ""); }, [page.id, page.title]);
  const crumbs = ancestorsOf(index, page.id).reverse();
  const { done, total } = useSubtreeProgress(page.id);
  const view = page.view && VIEWS.some((v) => v.id === page.view) ? page.view : "outline";
  const isTop = !index.parent.get(page.id);

  const saveTitle = () => {
    const v = title.trim();
    if (!v) { setTitle(page.title || ""); return; }
    if (v !== page.title) run(() => updatePage(page.id, { title: v }));
  };

  const remove = async () => {
    const inside = descendantIds(index, page.id).length;
    const ok = await confirm({
      title: `Delete "${page.title || "this page"}"?`,
      body: `It goes to the trash${inside ? ` with the ${inside === 1 ? "section" : `${inside} sections`} inside it` : ""}, its lines and the to-dos made on it. "Reached" or "Let go" keep it instead. You can put it all back from the trash.`,
      confirmLabel: "Delete", destructive: true,
    });
    if (!ok) return;
    const parent = index.parent.get(page.id) || null;
    await run(() => deletePage(index, steps, page.id), "Moved to the trash");
    open(parent);
  };

  return (
    <article className="space-y-4" data-highlight-id={page.id}>
      <nav aria-label="Where this page is" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <button type="button" onClick={() => open(null)} className="hover:text-foreground">Goals</button>
        {crumbs.map((c) => (
          <React.Fragment key={c.id}>
            <span aria-hidden="true">›</span>
            <button type="button" onClick={() => open(c.id)} className="hover:text-foreground truncate max-w-[10rem]">{c.title || "Untitled"}</button>
          </React.Fragment>
        ))}
      </nav>

      <header className="space-y-2">
        <div className="flex items-start gap-2">
          <button type="button" aria-label="Choose an icon" title="Icon"
            onClick={async () => {
              const v = await promptText({ title: "Icon", body: "An emoji for this page (leave empty for none).", defaultValue: page.icon || "" });
              if (v !== null) run(() => updatePage(page.id, { icon: String(v).trim().slice(0, 8) || null }));
            }}
            className="text-2xl leading-none mt-1 w-9 h-9 rounded-lg hover:bg-muted/50 flex items-center justify-center flex-shrink-0">
            {page.icon || <span className="text-base text-muted-foreground">＋</span>}
          </button>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} aria-label="Page title"
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className="flex-1 min-w-0 bg-transparent font-display text-2xl font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 rounded px-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Page options" className="p-1.5 rounded text-muted-foreground hover:text-foreground mt-1"><MoreHorizontal className="w-5 h-5" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => run(() => updatePage(page.id, { pinned: !page.pinned }))}>
                {page.pinned ? "Unpin from the sidebar" : "Pin to the sidebar"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNoteEditing(true)}>{page.why ? "Edit the page note" : "Add a page note"}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setMoving(true)}>Move to…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onSelect={remove}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {page.status ? goalStatusLabel(page.status) : "No status"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {GOAL_STATUSES.map((s) => (
                <DropdownMenuItem key={s.id} onSelect={() => run(() => setGoalStatus(page, s.id), s.id === "done" ? "Reached 🎉" : null)}>{s.label}</DropdownMenuItem>
              ))}
              {!isTop && <DropdownMenuItem onSelect={() => run(() => updatePage(page.id, { status: null }))}>No status</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            by
            <input type="date" value={page.target_date || ""} aria-label="Target date"
              onChange={(e) => run(() => updatePage(page.id, { target_date: e.target.value || null }))}
              className="bg-transparent border border-border/60 rounded px-1 py-0.5 text-xs" />
          </label>
          {total > 0 && <span className="text-xs text-muted-foreground tabular-nums">{done} of {total} done</span>}
          {page.pinned && <Pin className="w-3 h-3 text-muted-foreground" aria-label="Pinned" />}
          <span className="flex-1" />
          <div role="tablist" aria-label="View" className="flex gap-0.5 p-0.5 rounded-lg bg-muted/40">
            {VIEWS.map(({ id, label, Icon }) => (
              <button key={id} type="button" role="tab" aria-label={label} title={label} aria-selected={view === id} disabled={busy}
                onClick={() => run(() => updatePage(page.id, { view: id }))}
                className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 ${view === id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
        {total > 0 && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
            <div className="h-full bg-primary transition-all" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        )}
      </header>

      <ActivityStrip page={page} />
      <PageNote page={page} editing={noteEditing} setEditing={setNoteEditing} />

      {view === "outline" && <EntryList pageId={page.id} page={page} />}
      {view === "board" && <BoardView page={page} />}
      {view === "map" && <MapView page={page} />}

      <Connections page={page} />

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
