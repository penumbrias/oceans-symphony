// One line on a Goals page: a note, a to-do (round — it's on the To-Do
// list), a quick checkbox (square — it stays on the page), a link to
// another page, or one of the older counted kinds (shown by StepRow).
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, MoreHorizontal, ArrowRight, Link2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import RichText from "@/components/shared/RichText";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { confirm, promptText } from "@/components/shared/ConfirmDialog";
import { StepRow } from "@/components/goals/GoalCard";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { setTaskCompleted } from "@/lib/linkedCompletion";
import { stepState } from "@/lib/goals";
import { useTerms } from "@/lib/useTerms";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import {
  updateItem, deleteItem, itemToTodo, itemToSection, indentEntry, outdentEntry, nudgeEntry, moveItem,
  pageEntries, orderAfter, splitWikiLinks, findPageByTitle, movePage, deletePage, descendantIds,
} from "@/lib/goalTree";
import MovePageDialog from "./MovePageDialog";
import { useWorkspace, inputCls } from "./WorkspaceContext";

// Runs the app's writing pipeline over a note before it's saved.
export async function prepareNote(text, { alters, terms }) {
  try {
    return await prepareAuthoredText(text, { alters, terms, surfaceLabel: "goal note" });
  } catch (e) {
    if (isLogCommandError(e)) { toast.error(e.message); return null; }
    throw e;
  }
}

export async function recordNote(prepared, { alters, pageId, pageTitle }) {
  if (!prepared) return;
  await recordAuthoredText({
    ...prepared, alters, sourceType: "goal", sourceId: pageId,
    sourceLabel: `Goal: ${pageTitle || "page"}`, navigatePath: `/goals?page=${pageId}`,
  });
}

// Text with [[Page]] links turned into buttons that open the page.
export function NoteText({ body, className = "" }) {
  const { goals, alters, open } = useWorkspace();
  const t = useTerms();
  const parts = splitWikiLinks(body);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.text !== undefined) return <RichText key={i} content={p.text} alters={alters} terms={t} />;
        const target = findPageByTitle(goals, p.link);
        return target ? (
          <button key={i} type="button" onClick={(e) => { e.stopPropagation(); open(target.id); }}
            className="text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid">
            {p.link}
          </button>
        ) : (
          <span key={i} className="text-muted-foreground" title="No page has this title yet">[[{p.link}]]</span>
        );
      })}
    </span>
  );
}

function NoteEditor({ initial, onCancel, onSave, saving }) {
  const { alters } = useWorkspace();
  const [text, setText] = useState(initial || "");
  return (
    <div className="space-y-1.5 w-full">
      <MentionTextarea value={text} onChange={setText} alters={alters} signposts autoFocus
        placeholder="Write a note… [[Page title]] links a page"
        className="min-h-[70px] text-sm" />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={saving || !text.trim()} onClick={() => onSave(text)}>Save</Button>
      </div>
    </div>
  );
}

// The ⋯ menu shared by lines and sections.
export function EntryMenu({ entry, pageId, label }) {
  const ws = useWorkspace();
  const { index, steps, run, open } = ws;
  const [moving, setMoving] = useState(false);
  const isPage = entry.type === "page";
  const rec = entry.rec;
  const kind = rec.kind || "check";

  const remove = async () => {
    if (isPage) {
      const inside = descendantIds(index, rec.id).length;
      const ok = await confirm({
        title: `Delete "${rec.title || "this section"}"?`,
        body: `It goes to the trash${inside ? ` with the ${inside === 1 ? "section" : `${inside} sections`} inside it` : ""}, its lines and the to-dos made on it. You can put it all back from the trash.`,
        confirmLabel: "Delete", destructive: true,
      });
      if (ok) run(() => deletePage(index, steps, rec.id), "Moved to the trash");
      return;
    }
    run(() => deleteItem(rec), "Moved to the trash");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`More for ${label}`} className="p-1 rounded text-muted-foreground hover:text-foreground flex-shrink-0">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isPage && <DropdownMenuItem onSelect={() => open(rec.id)}>Open as its own page</DropdownMenuItem>}
          {isPage && (
            <DropdownMenuItem onSelect={async () => {
              const v = await promptText({ title: "Rename", defaultValue: rec.title || "" });
              if (v && v.trim()) run(() => base44.entities.Goal.update(rec.id, { title: v.trim() }));
            }}>Rename</DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => run(() => nudgeEntry(index, steps, pageId, entry, -1))}>Move up</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => nudgeEntry(index, steps, pageId, entry, 1))}>Move down</DropdownMenuItem>
          {pageId && (
            <DropdownMenuItem onSelect={() => run(async () => {
              if (!(await indentEntry(index, steps, pageId, entry))) toast("There's no section just above to move it into.");
            })}>Indent into the section above</DropdownMenuItem>
          )}
          {pageId && (
            <DropdownMenuItem onSelect={() => run(async () => {
              if (!(await outdentEntry(index, steps, pageId, entry))) toast("It's already as far out as it can go.");
            })}>Outdent</DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setMoving(true)}>Move to…</DropdownMenuItem>
          {!isPage && (kind === "check" || kind === "text") && (
            <DropdownMenuItem onSelect={() => run(() => itemToTodo(rec), "Added to the To-Do list")}>Make it a to-do</DropdownMenuItem>
          )}
          {!isPage && (kind === "check" || kind === "text") && (
            <DropdownMenuItem onSelect={() => run(() => itemToSection(rec))}>Make it a section</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onSelect={remove}>
            {!isPage && kind === "todo" && rec.ref_id ? "Take off the page (keep the to-do)" : "Delete"}
          </DropdownMenuItem>
          {!isPage && kind === "todo" && rec.ref_id && (
            <DropdownMenuItem className="text-destructive" onSelect={async () => {
              const ok = await confirm({
                title: "Delete this to-do everywhere?",
                body: "It leaves this page and the To-Do list and goes to the trash, where you can put it back.",
                confirmLabel: "Delete", destructive: true,
              });
              if (ok) run(() => deleteItem(rec, { withTask: true }), "Moved to the trash");
            }}>Delete the to-do too</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {moving && (
        <MovePageDialog open title={isPage ? `Move "${rec.title || "section"}" to…` : "Move this line to…"}
          movingPageId={isPage ? rec.id : null} allowTop={isPage}
          currentId={isPage ? (index.parent.get(rec.id) || null) : rec.goal_id}
          onClose={() => setMoving(false)}
          onPick={(target) => {
            setMoving(false);
            run(async () => {
              const entries = target ? pageEntries(index, steps, target) : [];
              const order = target ? orderAfter(entries) : null;
              if (isPage) await movePage(index, rec.id, target, order);
              else await moveItem(rec, target, order);
            }, "Moved");
          }} />
      )}
    </>
  );
}

export default function ItemRow({ item, pageId, page }) {
  const ws = useWorkspace();
  const { ctx, busy, run, goals, alters, open } = ws;
  const t = useTerms();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title || "");
  const kind = item.kind || "check";
  const entry = { type: "item", rec: item };

  const saveTitle = () => {
    setEditing(false);
    const v = title.trim();
    if (!v || v === item.title) { setTitle(item.title || ""); return; }
    run(async () => {
      await updateItem(item.id, { title: v });
      if (kind === "todo" && item.ref_id) await base44.entities.Task.update(item.ref_id, { title: v }).catch(() => {});
    });
  };

  const titleField = (done) => editing ? (
    <input className={`${inputCls} py-1`} value={title} autoFocus aria-label="Line"
      onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setTitle(item.title || ""); setEditing(false); } }} />
  ) : (
    <button type="button" onClick={() => { setTitle(item.title || ""); setEditing(true); }}
      className={`text-left text-sm min-w-0 break-words ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
      {item.title || "Untitled"}
    </button>
  );

  if (kind === "text") {
    return (
      <li className="flex items-start gap-2 group" data-highlight-id={item.id}>
        {editing ? (
          <NoteEditor initial={item.body} saving={busy} onCancel={() => setEditing(false)}
            onSave={(text) => run(async () => {
              const prepared = await prepareNote(text.trim(), { alters, terms: t });
              if (!prepared) return;
              await updateItem(item.id, { body: prepared.content, author_alter_ids: prepared.authorIds || [] });
              await recordNote(prepared, { alters, pageId, pageTitle: page?.title });
              setEditing(false);
            })} />
        ) : (
          <>
            <button type="button" onClick={() => setEditing(true)} className="flex-1 min-w-0 text-left text-sm text-foreground/90 whitespace-pre-wrap break-words">
              <NoteText body={item.body} />
            </button>
            <EntryMenu entry={entry} pageId={pageId} label="this note" />
          </>
        )}
      </li>
    );
  }

  if (kind === "link") {
    const target = goals.find((g) => g.id === item.target_goal_id);
    return (
      <li className="flex items-center gap-2" data-highlight-id={item.id}>
        <Link2 className="w-4 h-4 text-primary flex-shrink-0" />
        <button type="button" disabled={!target} onClick={() => target && open(target.id)}
          className="flex-1 min-w-0 text-left text-sm flex items-center gap-1 flex-wrap">
          {item.label && <span className="text-muted-foreground">{item.label}</span>}
          {item.label && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
          <span className={target ? "text-primary" : "text-muted-foreground line-through"}>
            {target ? `${target.icon ? `${target.icon} ` : ""}${target.title || "Untitled"}` : "A page that was deleted"}
          </span>
        </button>
        <EntryMenu entry={entry} pageId={pageId} label="this link" />
      </li>
    );
  }

  if (kind === "check" || kind === "todo") {
    const state = stepState(item, ctx);
    const round = kind === "todo" && !state.missing;
    const toggle = () => run(async () => {
      if (round) await setTaskCompleted(state.linked.id, !state.linked.completed);
      else await updateItem(item.id, { done_at: state.done ? null : new Date().toISOString() });
    });
    return (
      <li className="flex items-start gap-2" data-highlight-id={item.id}>
        <button type="button" role="checkbox" aria-checked={state.done} aria-label={item.title || "Line"} disabled={busy}
          onClick={toggle}
          className={`mt-0.5 w-5 h-5 border flex items-center justify-center flex-shrink-0 disabled:opacity-60 ${round ? "rounded-full" : "rounded"} ${
            state.done ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-primary"}`}>
          {state.done && <Check className="w-3 h-3" />}
        </button>
        <div className="flex-1 min-w-0">
          {titleField(state.done)}
          {kind === "todo" && state.missing && <p className="text-xs text-muted-foreground">Its to-do was deleted; this stays as a checkbox.</p>}
          {round && state.linked?.due_date && (
            <button type="button" className="block text-xs text-muted-foreground hover:text-foreground"
              onClick={() => navigate(`/todo?highlight=${state.linked.id}`)}>
              Due {new Date(`${state.linked.due_date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </button>
          )}
        </div>
        <EntryMenu entry={entry} pageId={pageId} label={item.title || "this line"} />
      </li>
    );
  }

  // Counted and older kinds (activity × times, weekly minutes, plans,
  // daily tasks, groups of to-dos) keep their existing row.
  const state = stepState(item, ctx);
  return (
    <li className="flex items-start gap-1" data-highlight-id={item.id}>
      <ul className="flex-1 min-w-0"><StepRow step={item} state={state} steps={[item]} goal={page} ctx={ctx} busy={busy} run={run} /></ul>
      <EntryMenu entry={entry} pageId={pageId} label={item.title || "this line"} />
    </li>
  );
}
