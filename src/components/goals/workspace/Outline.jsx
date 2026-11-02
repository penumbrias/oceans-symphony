// A page's lines and sections, as an outline. Sections show inline as
// headings that fold; tap the name to open one as its own page. Inline
// nesting stops at MAX_INLINE_DEPTH — deeper sections open as their page.
import React from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { pageEntries, liveSteps, descendantIds, updatePage } from "@/lib/goalTree";
import { stepState } from "@/lib/goals";
import ItemRow, { EntryMenu } from "./ItemRow";
import AddLine from "./AddLine";
import { TagChips } from "./TagEditor";
import { sectionHeading, pageWordCount, wordTargetOf, wordProgressLabel } from "@/lib/goalWriting";
import { useWorkspace } from "./WorkspaceContext";

const MAX_INLINE_DEPTH = 6;
const UNCOUNTED = new Set(["text", "link"]);

// Done / total over a page and everything inside it.
export function useSubtreeProgress(pageId) {
  const { index, steps, ctx } = useWorkspace();
  const ids = new Set([pageId, ...descendantIds(index, pageId)]);
  let done = 0, total = 0, notes = 0;
  for (const s of liveSteps(steps)) {
    if (!ids.has(s.goal_id)) continue;
    if (UNCOUNTED.has(s.kind)) { notes += 1; continue; }
    const st = stepState(s, ctx);
    if (st.ongoing) continue;
    total += 1;
    if (st.done) done += 1;
  }
  return { done, total, notes, sections: ids.size - 1 };
}

function SectionBlock({ section, parentId, depth }) {
  const { open, run, index, steps } = useWorkspace();
  const { done, total, notes, sections } = useSubtreeProgress(section.id);
  const collapsed = !!section.collapsed || depth >= MAX_INLINE_DEPTH;
  // A chapter, part or scene: its number above the title, words written.
  const heading = sectionHeading(index, section);
  const target = wordTargetOf(section);
  const words = heading || target ? pageWordCount(index, steps, section.id) : 0;
  const summary = [
    (heading && words) || target ? wordProgressLabel(words, target) : null,
    total ? `${done} of ${total} done` : null,
    !heading && !total && notes ? `${notes} ${notes === 1 ? "note" : "notes"}` : null,
    sections ? `${sections} ${sections === 1 ? "section" : "sections"}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <li className={`space-y-1.5 ${heading && depth === 0 ? "pt-2" : ""}`} data-highlight-id={section.id}>
      {heading && (
        <p className="ml-6 text-[0.7em] font-semibold uppercase tracking-wide text-primary/80">{heading}</p>
      )}
      <div className="flex items-center gap-1">
        <button type="button" aria-label={collapsed ? `Show ${section.title}` : `Fold ${section.title}`} aria-expanded={!collapsed}
          disabled={depth >= MAX_INLINE_DEPTH}
          onClick={() => run(() => updatePage(section.id, { collapsed: !section.collapsed }))}
          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-40">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button type="button" onClick={() => open(section.id)}
          className={`text-left font-semibold min-w-0 truncate hover:underline ${depth === 0 ? "text-base" : "text-sm"} ${section.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {section.icon && <span className="mr-1" aria-hidden="true">{section.icon}</span>}
          {section.title || "Untitled"}
        </button>
        {summary && (collapsed || heading) && <span className="text-xs text-muted-foreground truncate">· {summary}</span>}
        <span className="flex-1" />
        <EntryMenu entry={{ type: "page", rec: section }} pageId={parentId} label={section.title || "section"} />
      </div>
      <TagChips page={section} className="ml-6" />
      {!collapsed && (
        <div className="pl-4 border-l-2 border-border/50 ml-2">
          <EntryList pageId={section.id} page={section} depth={depth + 1} compactAdd />
        </div>
      )}
      {depth >= MAX_INLINE_DEPTH && (
        <button type="button" onClick={() => open(section.id)} className="ml-6 text-xs text-primary">Open to see what's inside</button>
      )}
    </li>
  );
}

export function EntryList({ pageId, page, depth = 0, compactAdd = false }) {
  const { index, steps } = useWorkspace();
  const entries = pageEntries(index, steps, pageId);
  return (
    <div className="space-y-2">
      {entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((e) => e.type === "page"
            ? <SectionBlock key={e.rec.id} section={e.rec} parentId={pageId} depth={depth} />
            : <ItemRow key={e.rec.id} item={e.rec} pageId={pageId} page={page} />)}
        </ul>
      )}
      <AddLine pageId={pageId} page={page} compact={compactAdd} />
    </div>
  );
}
