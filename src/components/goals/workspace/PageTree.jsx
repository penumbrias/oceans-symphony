// The sidebar: every page as a tree that folds, a search box, pinned pages
// first and finished goals in their own group at the bottom. Since v0.376.0
// the person's notes, lists and flash-card decks are here too (Notes &
// lists, below the goals); search finds them, and one opens in the list
// sheet. They stay stored in the lists panel's stores (noteLists.js).
import React, { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useNoteLists, useNoteListWriters, listLabel, notesFiledIn, filedPageOf } from "@/lib/noteLists";
import { NoteMenu } from "./FiledNotes";
import { rootPages, childPages, ancestorsOf, flattenPages, createPage, orderAfter, MAX_PAGE_DEPTH } from "@/lib/goalTree";
import { isOpenGoal } from "@/lib/goals";
import { allPageTags, pageHasTag, pageTags, sectionHeading } from "@/lib/goalWriting";
import { promptText } from "@/components/shared/ConfirmDialog";
import { useWorkspace, inputCls } from "./WorkspaceContext";

function Node({ page, depth, currentId, expanded, toggle, onOpen, seen, noteLists = [], onOpenList = null }) {
  const { index } = useWorkspace();
  if (seen.has(page.id) || depth > MAX_PAGE_DEPTH) return null;
  const nextSeen = new Set(seen); nextSeen.add(page.id);
  const pageKids = childPages(index, page.id);
  // Notes, lists and decks filed in this page sit after its sections.
  const notesHere = onOpenList ? notesFiledIn(noteLists, page.id, index) : [];
  const kids = [...pageKids, ...notesHere];
  const isOpen = expanded.has(page.id);
  const here = page.id === currentId;
  return (
    <li>
      <div className={`flex items-center gap-0.5 rounded-md pr-1 ${here ? "bg-primary/10 text-primary" : "hover:bg-muted/40"}`}
        style={{ paddingLeft: depth * 12 }}>
        {kids.length > 0 ? (
          <button type="button" onClick={() => toggle(page.id)} aria-label={isOpen ? `Fold ${page.title}` : `Show inside ${page.title}`} aria-expanded={isOpen}
            className="p-0.5 text-muted-foreground hover:text-foreground flex-shrink-0">
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : <span className="w-[18px] flex-shrink-0" />}
        <button type="button" onClick={() => onOpen(page.id)} aria-current={here ? "page" : undefined}
          className={`flex-1 min-w-0 text-left text-sm py-1 truncate ${page.status === "done" || page.status === "let_go" ? "text-muted-foreground" : ""}`}>
          {page.icon && <span className="mr-1" aria-hidden="true">{page.icon}</span>}
          {page.title || "Untitled"}
        </button>
      </div>
      {isOpen && kids.length > 0 && (
        <ul>
          {pageKids.map((k) => <Node key={k.id} page={k} depth={depth + 1} currentId={currentId} expanded={expanded} toggle={toggle} onOpen={onOpen} seen={nextSeen} noteLists={noteLists} onOpenList={onOpenList} />)}
          {notesHere.length > 0 && (
            <li style={{ paddingLeft: (depth + 1) * 12 + 18 }}>
              <ul className="space-y-0.5">
                {notesHere.map((l) => <NoteRow key={`f-${l.id}`} list={l} onOpenList={onOpenList} />)}
              </ul>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

const newestFirst = (a, b) => String(b.updated_date || b.created_date || "").localeCompare(String(a.updated_date || a.created_date || ""));
const NOTES_SHOWN = 8;

function NoteRow({ list, onOpenList, menu = true }) {
  return (
    <li className="flex items-center gap-0.5 min-w-0">
      <button type="button" onClick={() => onOpenList(list.id)}
        className="flex-1 min-w-0 text-left text-sm px-2 py-1 rounded-md hover:bg-muted/40 flex items-center gap-1.5">
        <span className="truncate">{listLabel(list)}</span>
      </button>
      {menu && <NoteMenu list={list} />}
    </li>
  );
}

function NotesSection({ notesOpen, onOpenNotes, onOpenList }) {
  const { index } = useWorkspace();
  const { lists: all } = useNoteLists();
  // Filed ones show inside their page in the tree; the rest are here.
  const lists = useMemo(() => all.filter((l) => !filedPageOf(l, index)), [all, index]);
  const { createNote } = useNoteListWriters();
  const [open, setOpen] = useState(true);
  const sorted = useMemo(() => [...lists].sort(newestFirst), [lists]);
  const newNote = async () => {
    try {
      const made = await createNote();
      if (made?.id) onOpenList(made.id);
    } catch (e) { toast.error(e?.message || "Couldn't make a note."); }
  };
  return (
    <div className="space-y-1 pt-1 border-t border-border/40">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? "Fold notes and lists" : "Show notes and lists"}
          className="p-0.5 text-muted-foreground hover:text-foreground flex-shrink-0">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={onOpenNotes} aria-current={notesOpen ? "page" : undefined}
          className={`flex-1 min-w-0 text-left text-sm font-medium py-1 px-1 rounded-md truncate ${notesOpen ? "bg-primary/10 text-primary" : "hover:bg-muted/40"}`}>
          Notes &amp; lists
        </button>
        <button type="button" onClick={newNote} aria-label="New note" title="New note"
          className="w-8 h-8 flex items-center justify-center rounded-md text-primary hover:bg-primary/10 flex-shrink-0">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {open && (
        sorted.length === 0
          ? <p className="text-xs text-muted-foreground px-2">{all.length ? "Every note is filed in a page." : "No notes or lists yet."}</p>
          : (
            <ul className="space-y-0.5 pl-3">
              {sorted.slice(0, NOTES_SHOWN).map((l) => <NoteRow key={`${l.source || "db"}-${l.id}`} list={l} onOpenList={onOpenList} />)}
              {sorted.length > NOTES_SHOWN && (
                <li><button type="button" onClick={onOpenNotes} className="text-xs text-primary px-2 py-1">All {sorted.length}</button></li>
              )}
            </ul>
          )
      )}
    </div>
  );
}

export default function PageTree({ currentId, onOpen }) {
  const { index, goals, run, busy, tag, showTag, openList, openNotes, notesOpen } = useWorkspace();
  const { lists: noteLists } = useNoteLists();
  const [q, setQ] = useState("");
  const [manual, setManual] = useState(() => new Map()); // id → open?
  const [showFinished, setShowFinished] = useState(false);
  const autoOpen = useMemo(() => new Set(currentId ? [currentId, ...ancestorsOf(index, currentId).map((p) => p.id)] : []), [index, currentId]);
  const expanded = useMemo(() => {
    const s = new Set(autoOpen);
    for (const [id, on] of manual) { if (on) s.add(id); else s.delete(id); }
    return s;
  }, [autoOpen, manual]);
  const toggle = (id) => setManual((m) => new Map(m).set(id, !expanded.has(id)));

  const roots = rootPages(index);
  const pinned = useMemo(() => flattenPages(index).map((r) => r.page).filter((p) => p.pinned), [index]);
  const openRoots = roots.filter((p) => isOpenGoal(p));
  const finished = roots.filter((p) => !isOpenGoal(p));
  const tags = useMemo(() => allPageTags(goals), [goals]);
  // Search matches titles and tags ("#plot" matches only tags).
  const want = q.trim().toLowerCase();
  const tagOnly = want.startsWith("#");
  const wantTag = want.replace(/^#+/, "");
  const hits = tag
    ? flattenPages(index).filter((r) => pageHasTag(r.page, tag))
    : want ? flattenPages(index).filter((r) => (!tagOnly && String(r.page.title || "").toLowerCase().includes(want))
      || (wantTag && pageTags(r.page).some((t) => t.toLowerCase().includes(wantTag)))) : [];
  // Notes, lists and decks by name (not while showing a #tag).
  const noteHits = want && !tagOnly && !tag && openList
    ? noteLists.filter((l) => listLabel(l).toLowerCase().includes(want)).sort(newestFirst) : [];

  const addPage = async () => {
    const v = await promptText({ title: "New goal", placeholder: "What's it called?" });
    if (!v || !v.trim()) return;
    const made = await run(() => createPage({ title: v.trim(), order: orderAfter(roots.map((rec) => ({ rec }))) }));
    if (made?.id) onOpen(made.id);
  };

  const list = (pages) => (
    <ul className="space-y-0.5">
      {pages.map((p) => <Node key={p.id} page={p} depth={0} currentId={currentId} expanded={expanded} toggle={toggle} onOpen={onOpen} seen={new Set()}
        noteLists={noteLists} onOpenList={openList || null} />)}
    </ul>
  );

  return (
    <nav aria-label="Notebook pages" className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onOpen(null)} className="font-display text-lg font-semibold flex-1 text-left">Notebook</button>
        <button type="button" onClick={addPage} disabled={busy} className="text-xs px-2 py-1 rounded-full border border-primary/40 text-primary flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> New goal
        </button>
      </div>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className={`${inputCls} pl-8 py-1.5`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages, notes and #tags" aria-label="Search pages" />
      </div>
      {tags.length > 0 && !want && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Tags">
          {tags.map(({ tag: t, count }) => {
            const on = !!tag && t.toLowerCase() === tag.toLowerCase();
            return (
              <button key={t} type="button" aria-pressed={on} onClick={() => showTag(on ? null : t)}
                className={`text-[0.7rem] px-1.5 py-0.5 rounded-full max-w-[9rem] truncate ${on ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground hover:text-foreground"}`}>
                #{t} <span className="opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}
      {want || tag ? (
        <ul className="space-y-0.5">
          {tag && !want && (
            <li className="flex items-center gap-1 px-1 pb-1">
              <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground flex-1 truncate">Tagged #{tag}</span>
              <button type="button" onClick={() => showTag(null)} aria-label="Show every page" className="p-0.5 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            </li>
          )}
          {hits.map(({ page }) => {
            const path = ancestorsOf(index, page.id).reverse().map((p) => p.title || "Untitled").join(" › ");
            const heading = sectionHeading(index, page);
            return (
              <li key={page.id}>
                <button type="button" onClick={() => { onOpen(page.id); setQ(""); }}
                  className={`w-full text-left rounded-md px-2 py-1 ${page.id === currentId ? "bg-primary/10 text-primary" : "hover:bg-muted/40"}`}>
                  <span className="block text-sm truncate">{page.icon ? `${page.icon} ` : ""}{heading ? `${heading}: ` : ""}{page.title || "Untitled"}</span>
                  {path && <span className="block text-xs text-muted-foreground truncate">{path}</span>}
                </button>
              </li>
            );
          })}
          {noteHits.length > 0 && (
            <li className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes &amp; lists</li>
          )}
          {noteHits.map((l) => <NoteRow key={`n-${l.source || "db"}-${l.id}`} list={l} onOpenList={(id) => { openList(id); setQ(""); }} />)}
          {hits.length === 0 && noteHits.length === 0 && <li className="text-sm text-muted-foreground px-2">Nothing matches.</li>}
        </ul>
      ) : (
        <>
          {pinned.length > 0 && (
            <div className="space-y-1">
              <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground px-1">Pinned</p>
              <ul className="space-y-0.5">
                {pinned.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => onOpen(p.id)}
                      className={`w-full text-left text-sm px-2 py-1 rounded-md truncate ${p.id === currentId ? "bg-primary/10 text-primary" : "hover:bg-muted/40"}`}>
                      {p.icon ? `${p.icon} ` : ""}{p.title || "Untitled"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {openRoots.length > 0 ? list(openRoots) : <p className="text-sm text-muted-foreground px-1">No goals yet.</p>}
          {finished.length > 0 && (
            <div className="space-y-1">
              <button type="button" onClick={() => setShowFinished((v) => !v)} aria-expanded={showFinished}
                className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground px-1 flex items-center gap-1">
                {showFinished ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Finished · {finished.length}
              </button>
              {showFinished && list(finished)}
            </div>
          )}
          {openList && <NotesSection notesOpen={!!notesOpen} onOpenNotes={openNotes} onOpenList={openList} />}
        </>
      )}
    </nav>
  );
}
