// The "+ add" row at the end of a page or section. Pick what kind of line
// it is (the last pick is remembered), type, Enter. Shortcuts while typing:
// "# " starts a section, "[] " a checkbox, "() " a to-do.
import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { flattenCategoryTree } from "@/lib/categoryTreeUtils";
import { useTerms } from "@/lib/useTerms";
import { addItem, addTodoItem, createPage, pageEntries, orderAfter, flattenPages } from "@/lib/goalTree";
import { prepareNote, recordNote } from "./ItemRow";
import { useWorkspace, inputCls } from "./WorkspaceContext";

const KINDS = [
  { id: "todo", label: "To-do" },
  { id: "check", label: "Checkbox" },
  { id: "text", label: "Note" },
  { id: "section", label: "Section" },
  { id: "link", label: "Link" },
  { id: "activity_count", label: "Tracker" },
];
const LAST_KIND_KEY = "symphony_goals_last_line_kind";
const readKind = () => { try { return localStorage.getItem(LAST_KIND_KEY) || "todo"; } catch { return "todo"; } };
const writeKind = (k) => { try { localStorage.setItem(LAST_KIND_KEY, k); } catch { /* fine */ } };

const indentOption = (o) => (
  <span className="flex items-center gap-2 min-w-0">
    {o._depth > 0 && <span style={{ width: o._depth * 12 }} className="flex-shrink-0 text-muted-foreground text-xs text-right">↳</span>}
    {o.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: o.color }} />}
    <span className="truncate text-sm">{o.label}</span>
  </span>
);

export default function AddLine({ pageId, page, compact = false, kinds = null }) {
  const ws = useWorkspace();
  const { index, steps, run, busy, alters, ctx } = ws;
  const t = useTerms();
  const [openForm, setOpenForm] = useState(!compact);
  const [kind, setKindState] = useState(readKind);
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState(null);
  const [categoryId, setCategoryId] = useState(null);
  const [count, setCount] = useState("3");
  const [period, setPeriod] = useState("week");
  const setKind = (k) => { setKindState(k); writeKind(k); };
  const shownKinds = kinds ? KINDS.filter((k) => kinds.includes(k.id)) : KINDS;

  const pageOptions = useMemo(() => flattenPages(index).filter((r) => r.page.id !== pageId)
    .map((r) => ({ id: r.page.id, label: `${r.page.icon ? `${r.page.icon} ` : ""}${r.page.title || "Untitled"}`, _depth: r.depth })), [index, pageId]);
  const categoryOptions = useMemo(
    () => flattenCategoryTree(ctx.categories || []).map((c) => ({ id: c.id, label: c.name, color: c.color, _depth: c._depth })),
    [ctx.categories],
  );

  const save = () => run(async () => {
    const order = orderAfter(pageEntries(index, steps, pageId));
    let k = kind;
    let v = text.trim();
    // Typed shortcuts.
    if (k !== "text" && k !== "link" && k !== "activity_count") {
      if (v.startsWith("# ")) { k = "section"; v = v.slice(2).trim(); }
      else if (v.startsWith("[] ")) { k = "check"; v = v.slice(3).trim(); }
      else if (v.startsWith("() ")) { k = "todo"; v = v.slice(3).trim(); }
    }
    if (k === "link") {
      if (!target) return;
      await addItem(pageId, { kind: "link", target_goal_id: target, label: label.trim(), title: "" }, order);
      setTarget(null); setLabel("");
      return;
    }
    if (k === "activity_count") {
      if (!categoryId) return;
      const cat = (ctx.categories || []).find((c) => c.id === categoryId);
      await addItem(pageId, {
        kind: "activity_count", title: cat?.name || "Activity", category_id: categoryId,
        target_count: Math.max(1, Math.round(Number(count) || 0)), count_period: period === "week" ? "week" : "total",
      }, order);
      setCategoryId(null);
      return;
    }
    if (!v) return;
    if (k === "section") await createPage({ title: v, parent_id: pageId, order, status: null });
    else if (k === "todo") await addTodoItem(pageId, v, order);
    else if (k === "check") await addItem(pageId, { kind: "check", title: v }, order);
    else if (k === "text") {
      const prepared = await prepareNote(v, { alters, terms: t });
      if (!prepared) return;
      const step = await addItem(pageId, { kind: "text", title: "", body: prepared.content, author_alter_ids: prepared.authorIds || [] }, order);
      await recordNote(prepared, { alters, pageId: step.goal_id, pageTitle: page?.title });
    }
    setText("");
  });

  if (!openForm) {
    return (
      <button type="button" onClick={() => setOpenForm(true)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-1">
        <Plus className="w-3.5 h-3.5" /> Add
      </button>
    );
  }

  const tab = (k) => (
    <button key={k.id} type="button" role="tab" aria-selected={kind === k.id} onClick={() => setKind(k.id)}
      className={`text-xs px-2 py-0.5 rounded-full ${kind === k.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
      {k.label}
    </button>
  );

  return (
    <div className="space-y-1.5 pt-1">
      <div role="tablist" aria-label="Kind of line" className="flex flex-wrap gap-1">{shownKinds.map(tab)}</div>
      {kind === "text" && (
        <div className="space-y-1.5">
          <MentionTextarea toolbar value={text} onChange={setText} alters={alters} signposts
            placeholder="Write a note… [[Page title]] links a page" className="min-h-[60px] text-sm" />
          <div className="flex justify-end gap-2">
            {compact && <Button size="sm" variant="ghost" onClick={() => setOpenForm(false)}>Close</Button>}
            <Button size="sm" disabled={busy || !text.trim()} onClick={save}>Add note</Button>
          </div>
        </div>
      )}
      {(kind === "todo" || kind === "check" || kind === "section") && (
        <div className="flex gap-2">
          <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} aria-label="New line"
            placeholder={kind === "section" ? "New section…" : kind === "todo" ? "New to-do (goes on your To-Do list)…" : "New checkbox (stays on this page)…"}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape" && compact) setOpenForm(false); }} />
          <Button size="sm" variant="outline" disabled={busy || !text.trim()} onClick={save} aria-label="Add"><Plus className="w-4 h-4" /></Button>
        </div>
      )}
      {kind === "link" && (
        <div className="space-y-1.5">
          <SearchableSelect value={target} onChange={(id) => setTarget(id || null)} options={pageOptions}
            placeholder="Link to which page?" searchPlaceholder="Search pages…" renderOption={indentOption} />
          <div className="flex gap-2">
            <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} aria-label="How they connect"
              placeholder="How they connect (optional): needs, inspired by…" onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
            <Button size="sm" variant="outline" disabled={busy || !target} onClick={save} aria-label="Add link"><Plus className="w-4 h-4" /></Button>
          </div>
        </div>
      )}
      {kind === "activity_count" && (
        <div className="space-y-1.5">
          <SearchableSelect value={categoryId} onChange={(id) => setCategoryId(id || null)} options={categoryOptions}
            placeholder="Which activity?" searchPlaceholder="Search activities…" renderOption={indentOption} />
          <div className="flex flex-wrap gap-2 items-center">
            <input className={`${inputCls} w-20`} type="number" min={1} inputMode="numeric" value={count}
              onChange={(e) => setCount(e.target.value)} aria-label="How many times" />
            <span className="text-xs text-muted-foreground">times</span>
            <div role="radiogroup" aria-label="Counted" className="flex gap-1">
              {[["week", "each week"], ["total", "in total"]].map(([id, l]) => (
                <button key={id} type="button" role="radio" aria-checked={period === id} onClick={() => setPeriod(id)}
                  className={`text-xs px-2 py-0.5 rounded-full border ${period === id ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" disabled={busy || !categoryId} onClick={save} aria-label="Add tracker"><Plus className="w-4 h-4" /></Button>
          </div>
        </div>
      )}
      {compact && kind !== "text" && (
        <button type="button" onClick={() => setOpenForm(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      )}
    </div>
  );
}
