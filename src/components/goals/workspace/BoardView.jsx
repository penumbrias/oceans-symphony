// Board view: each section of the page is a column, with its lines inside.
// Lines that sit straight on the page go in the first column. Sections
// inside a column show as cards that open.
import React from "react";
import { Plus, ChevronRight } from "lucide-react";
import { pageEntries, createPage, orderAfter } from "@/lib/goalTree";
import { promptText } from "@/components/shared/ConfirmDialog";
import ItemRow, { EntryMenu } from "./ItemRow";
import AddLine from "./AddLine";
import { useSubtreeProgress } from "./Outline";
import { useWorkspace, chipCls } from "./WorkspaceContext";

function SectionCard({ section, parentId }) {
  const { open } = useWorkspace();
  const { done, total } = useSubtreeProgress(section.id);
  return (
    <li className="rounded-lg border border-border/60 bg-background px-2.5 py-2 flex items-center gap-1">
      <button type="button" onClick={() => open(section.id)} className="flex-1 min-w-0 text-left text-sm font-medium flex items-center gap-1">
        {section.icon && <span aria-hidden="true">{section.icon}</span>}
        <span className="truncate">{section.title || "Untitled"}</span>
        {total > 0 && <span className="text-xs text-muted-foreground ml-1 tabular-nums">{done}/{total}</span>}
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto flex-shrink-0" />
      </button>
      <EntryMenu entry={{ type: "page", rec: section }} pageId={parentId} label={section.title || "section"} />
    </li>
  );
}

function Column({ title, pageId, page, entries, header }) {
  return (
    <div className="w-[17rem] flex-shrink-0 rounded-xl border border-border/50 bg-muted/10 p-2.5 space-y-2 self-start">
      <div className="flex items-center gap-1 min-w-0">{header || <p className="text-sm font-semibold truncate">{title}</p>}</div>
      <ul className="space-y-2">
        {entries.map((e) => e.type === "page"
          ? <SectionCard key={e.rec.id} section={e.rec} parentId={pageId} />
          : <ItemRow key={e.rec.id} item={e.rec} pageId={pageId} page={page} />)}
      </ul>
      <AddLine pageId={pageId} page={page} compact />
    </div>
  );
}

export default function BoardView({ page }) {
  const { index, steps, run, open } = useWorkspace();
  const entries = pageEntries(index, steps, page.id);
  const loose = entries.filter((e) => e.type === "item");
  const columns = entries.filter((e) => e.type === "page").map((e) => e.rec);

  const addColumn = async () => {
    const v = await promptText({ title: "New column", placeholder: "Column name" });
    if (v && v.trim()) run(() => createPage({ title: v.trim(), parent_id: page.id, order: orderAfter(entries), status: null }));
  };

  return (
    <div className="overflow-x-auto overscroll-x-contain -mx-4 px-4 pb-2">
      <div className="flex gap-3 min-w-min">
        {(loose.length > 0 || columns.length === 0) && (
          <Column title="On this page" pageId={page.id} page={page} entries={loose} />
        )}
        {columns.map((col) => (
          <Column key={col.id} pageId={col.id} page={col} entries={pageEntries(index, steps, col.id)}
            header={(
              <>
                <button type="button" onClick={() => open(col.id)} className="text-sm font-semibold truncate text-left hover:underline flex-1 min-w-0">
                  {col.icon && <span className="mr-1" aria-hidden="true">{col.icon}</span>}{col.title || "Untitled"}
                </button>
                <EntryMenu entry={{ type: "page", rec: col }} pageId={page.id} label={col.title || "column"} />
              </>
            )} />
        ))}
        <button type="button" onClick={addColumn} className={`${chipCls} self-start whitespace-nowrap`}>
          <Plus className="w-3.5 h-3.5" /> Column
        </button>
      </div>
    </div>
  );
}
