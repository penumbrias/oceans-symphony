// The sidebar: every page as a tree that folds, a search box, pinned pages
// first and finished goals in their own group at the bottom.
import React, { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Plus, Search } from "lucide-react";
import { rootPages, childPages, ancestorsOf, flattenPages, createPage, orderAfter, MAX_PAGE_DEPTH } from "@/lib/goalTree";
import { isOpenGoal } from "@/lib/goals";
import { promptText } from "@/components/shared/ConfirmDialog";
import { useWorkspace, inputCls } from "./WorkspaceContext";

function Node({ page, depth, currentId, expanded, toggle, onOpen, seen }) {
  const { index } = useWorkspace();
  if (seen.has(page.id) || depth > MAX_PAGE_DEPTH) return null;
  const nextSeen = new Set(seen); nextSeen.add(page.id);
  const kids = childPages(index, page.id);
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
          {kids.map((k) => <Node key={k.id} page={k} depth={depth + 1} currentId={currentId} expanded={expanded} toggle={toggle} onOpen={onOpen} seen={nextSeen} />)}
        </ul>
      )}
    </li>
  );
}

export default function PageTree({ currentId, onOpen }) {
  const { index, run, busy } = useWorkspace();
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
  const want = q.trim().toLowerCase();
  const hits = want ? flattenPages(index).filter((r) => String(r.page.title || "").toLowerCase().includes(want)) : [];

  const addPage = async () => {
    const v = await promptText({ title: "New goal", placeholder: "What's it called?" });
    if (!v || !v.trim()) return;
    const made = await run(() => createPage({ title: v.trim(), order: orderAfter(roots.map((rec) => ({ rec }))) }));
    if (made?.id) onOpen(made.id);
  };

  const list = (pages) => (
    <ul className="space-y-0.5">
      {pages.map((p) => <Node key={p.id} page={p} depth={0} currentId={currentId} expanded={expanded} toggle={toggle} onOpen={onOpen} seen={new Set()} />)}
    </ul>
  );

  return (
    <nav aria-label="Goals pages" className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onOpen(null)} className="font-display text-lg font-semibold flex-1 text-left">Goals</button>
        <button type="button" onClick={addPage} disabled={busy} className="text-xs px-2 py-1 rounded-full border border-primary/40 text-primary flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> New goal
        </button>
      </div>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className={`${inputCls} pl-8 py-1.5`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages" aria-label="Search pages" />
      </div>
      {want ? (
        <ul className="space-y-0.5">
          {hits.map(({ page }) => {
            const path = ancestorsOf(index, page.id).reverse().map((p) => p.title || "Untitled").join(" › ");
            return (
              <li key={page.id}>
                <button type="button" onClick={() => { onOpen(page.id); setQ(""); }} className="w-full text-left rounded-md px-2 py-1 hover:bg-muted/40">
                  <span className="block text-sm truncate">{page.icon ? `${page.icon} ` : ""}{page.title || "Untitled"}</span>
                  {path && <span className="block text-xs text-muted-foreground truncate">{path}</span>}
                </button>
              </li>
            );
          })}
          {hits.length === 0 && <li className="text-sm text-muted-foreground px-2">No pages match.</li>}
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
        </>
      )}
    </nav>
  );
}
