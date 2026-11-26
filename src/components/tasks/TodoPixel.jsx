// The To-do page in the pixel look — the "Desktop: To-do" board. A table
// of to-dos (search, Active / Done, category filter) and, on a computer,
// the task being edited in a side panel. Phones keep the table and edit in
// the usual dialog. Only rendered in the pixel look (ToDoList.jsx); every
// write goes through the page's own handlers (setTaskCompleted, deleteTask,
// TaskFormModal's save path).

import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, differenceInCalendarDays } from "date-fns";
import { base44 } from "@/api/base44Client";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import RichText from "@/components/shared/RichText";
import TaskFormModal from "@/components/tasks/TaskFormModal";
import TaskQuickActionsSheet from "@/components/tasks/TaskQuickActionsSheet";
import { taskNote } from "@/lib/taskCreate";
import { flattenCategoryTree } from "@/lib/categoryTreeUtils";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { usePixelDeskHeight } from "@/components/tasks/usePixelDeskHeight";
import "@/styles/pixel/tasks.css";

const PRIORITY = { low: "Low", medium: "Medium", high: "High" };

// "YYYY-MM-DD" read as local noon (never new Date("YYYY-MM-DD")).
const dayOf = (s) => {
  if (!s) return null;
  const str = String(s);
  const d = str.length === 10 ? new Date(`${str}T12:00:00`) : new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

function dueLabel(task) {
  const d = dayOf(task.due_date);
  if (!d) return null;
  const diff = differenceInCalendarDays(d, new Date());
  if (diff < 0 && !task.completed) return { text: "Overdue", tone: "late", title: format(d, "EEE MMM d") };
  if (diff === 0) return { text: "Today", tone: "soon" };
  if (diff === 1) return { text: "Tomorrow", tone: "soon" };
  if (diff > 1 && diff < 7) return { text: format(d, "EEE"), tone: diff < 3 ? "soon" : "" , title: format(d, "EEE MMM d") };
  return { text: format(d, "MMM d"), tone: "" };
}

function planLabel(task) {
  const d = task.scheduled_at ? new Date(task.scheduled_at) : null;
  if (!d || isNaN(d.getTime())) return "";
  if (!String(task.scheduled_at).includes("T")) return format(d, "EEE MMM d");
  return format(d, d.getMinutes() ? "EEE h:mm a" : "EEE h a");
}

function Who({ ids, alterById, formatAlter }) {
  const list = (ids || []).map((id) => alterById[id]).filter(Boolean).slice(0, 3);
  return (
    <span className="pt-who">
      {list.map((a) => (
        <span key={a.id} className="pt-sq" style={{ background: a.color || "var(--px-text-2)" }} title={formatAlter(a)} aria-label={formatAlter(a)} />
      ))}
    </span>
  );
}

function TaskRow({ task, sub = false, subTasks = [], expanded, onExpand, selected, highlight, onSelect, onToggle, onQuick, catById, alterById, formatAlter }) {
  const due = dueLabel(task);
  const doneSubs = subTasks.filter((t) => t.completed).length;
  const cats = (task.activity_category_ids || []).map((id) => catById[id]?.name).filter(Boolean);
  const subline = subTasks.length
    ? `${doneSubs} of ${subTasks.length} subtask${subTasks.length === 1 ? "" : "s"}`
    : task.goal_target ? `${task.current_progress || 0} / ${task.goal_target} ${task.goal_unit || ""}`.trim() : null;
  const note = !subline && taskNote(task);
  return (
    <div
      id={`item-${task.id}`} data-highlight-id={task.id}
      className={`pt-row${selected ? " sel" : ""}${sub ? " sub" : ""}${highlight ? " scroll-highlight-halo" : ""}`}
      onClick={() => onSelect(task)}
      onContextMenu={(e) => { e.preventDefault(); onQuick(task); }}>
      <span className="pt-c-exp">
        {!sub && subTasks.length > 0 && (
          <button type="button" className="pt-exp" aria-expanded={!!expanded}
            aria-label={expanded ? "Hide subtasks" : "Show subtasks"}
            onClick={(e) => { e.stopPropagation(); onExpand(task.id); }}>{expanded ? "v" : ">"}</button>
        )}
      </span>
      <button type="button" className={`pt-tick${task.completed ? " y" : ""}`}
        aria-label={task.completed ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
        aria-pressed={!!task.completed}
        onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}>{task.completed ? "x" : ""}</button>
      <span className="pt-c-task">
        <span className={`pt-title${task.completed ? " done" : ""}`}>
          {task.title}
          {task.is_urgent && <span className="pt-flag">urgent</span>}
          {task.pinned_to_dashboard && <span className="pt-flag pin">pinned</span>}
        </span>
        {subline && <span className="pt-subl">{subline}</span>}
        {note && <span className="pt-subl pt-clamp"><RichText content={note} /></span>}
      </span>
      <span className="pt-c-cat pt-mut" title={cats.join(", ")}>{cats.join(", ")}</span>
      <span className={`pt-c-due pt-pf ${due?.tone ? `t-${due.tone}` : ""}`} title={due?.title}>{due?.text || ""}</span>
      <span className={`pt-c-pri pt-pf p-${task.priority || ""}`}>{PRIORITY[task.priority] || ""}</span>
      <span className="pt-c-plan pt-mut">{planLabel(task)}</span>
      <span className="pt-c-who"><Who ids={task.author_alter_ids} alterById={alterById} formatAlter={formatAlter} /></span>
    </div>
  );
}

export default function TodoPixel({
  desk, tasks, tasksByParent, activityCategories, highlightId,
  expandedTasks, onToggleExpand, setExpandedTasks,
  onToggle, onDelete,
  // Phone: the dialog form the page already owns.
  onEditDialog, onNewDialog,
}) {
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const alterById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const catById = useMemo(() => Object.fromEntries(activityCategories.map((c) => [c.id, c])), [activityCategories]);
  const catOptions = useMemo(() => flattenCategoryTree(activityCategories)
    .map((c) => ({ id: c.id, label: c.name || "Untitled", color: c.color, _depth: c._depth })), [activityCategories]);

  const [view, setView] = useState("active"); // active | done
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(null);
  // What the side panel shows: { mode: "edit", id } | { mode: "new", parentId }.
  const [panel, setPanel] = useState(null);
  const [quickTask, setQuickTask] = useState(null);
  const deskRef = useRef(null);
  usePixelDeskHeight(deskRef, desk);

  const roots = tasksByParent.get("root") || [];
  const activeCount = roots.filter((t) => !t.completed).length;
  const doneCount = roots.length - activeCount;
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => roots
    .filter((t) => (view === "done" ? t.completed : !t.completed))
    .filter((t) => {
      if (!category) return true;
      const ids = t.activity_category_ids || (t.category ? [t.category] : []);
      return ids.includes(category);
    })
    .filter((t) => !q
      || (t.title || "").toLowerCase().includes(q)
      || (tasksByParent.get(t.id) || []).some((s) => (s.title || "").toLowerCase().includes(q)))
    .sort((a, b) => (view === "done"
      ? new Date(b.completed_date || 0) - new Date(a.completed_date || 0)
      : new Date(b.created_date || 0) - new Date(a.created_date || 0))),
  [roots, view, category, q, tasksByParent]);

  const editing = panel?.mode === "edit" ? tasks.find((t) => t.id === panel.id) || null : null;
  const select = (task) => {
    if (!desk) { onEditDialog(task); return; }
    setPanel({ mode: "edit", id: task.id });
    if ((tasksByParent.get(task.id) || []).length && !expandedTasks.has(task.id)) onToggleExpand(task.id);
  };
  const startNew = (parentId = null) => {
    if (!desk) { onNewDialog(parentId); return; }
    setPanel({ mode: "new", parentId });
  };
  const remove = async (id) => {
    const gone = await onDelete(id);
    if (gone && panel?.id === id) setPanel(null);
  };

  const rowProps = { onSelect: select, onToggle, onQuick: setQuickTask, catById, alterById, formatAlter };

  const panelSubs = editing && !editing.parent_task_id ? (tasksByParent.get(editing.id) || []) : [];
  const editPlan = editing ? planLabel(editing) : "";

  const main = (
    <div className="pt-panel pt-main" data-tour="tasks-list">
      <div className="pt-ttl">
        <h1 className="pt-h1">To-do</h1>
        <span className="pt-ttl-acts">
          <button type="button" className="pt-btn sm on" onClick={() => startNew(null)}>+ New task</button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="pt-btn sm" aria-label="More">...</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setExpandedTasks(new Set(roots.filter((t) => (tasksByParent.get(t.id) || []).length).map((t) => t.id)))}>Show every subtask</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setExpandedTasks(new Set())}>Hide subtasks</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate("/planner")}>Open the Planner</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate("/activities")}>Open Activities</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
      <div className="pt-tools">
        <input className="pt-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks..." aria-label="Search tasks" />
        <span className="pt-chips" role="radiogroup" aria-label="Which tasks">
          <button type="button" role="radio" aria-checked={view === "active"} className={`pt-chip${view === "active" ? " sel" : ""}`} onClick={() => setView("active")}>Active {activeCount}</button>
          <button type="button" role="radio" aria-checked={view === "done"} className={`pt-chip${view === "done" ? " sel" : ""}`} onClick={() => setView("done")}>Done {doneCount}</button>
        </span>
        <span className="pt-grow" />
        <span className="pt-mut pt-small pt-catlbl">Category</span>
        <span className="pt-catpick">
          <SearchableSelect value={category} onChange={(id) => setCategory(id || null)} options={catOptions} allowClear
            placeholder="All categories" searchPlaceholder="Search activities…" emptyMessage="No activities yet"
            renderOption={(o) => (
              <span className="flex items-center gap-2 min-w-0">
                {o._depth > 0 && <span style={{ width: o._depth * 12 }} className="flex-shrink-0 text-xs text-right opacity-60">↳</span>}
                <span className="pt-sq" style={{ background: o.color || "var(--px-text-2)" }} />
                <span className="truncate">{o.label}</span>
              </span>
            )} />
        </span>
      </div>
      <div className="pt-head pt-pf" aria-hidden>
        <span className="pt-c-exp" /><span className="pt-c-tick" />
        <span className="pt-c-task">Task</span><span className="pt-c-cat">Category</span>
        <span className="pt-c-due">Due</span><span className="pt-c-pri">Priority</span>
        <span className="pt-c-plan">On the plan</span><span className="pt-c-who">Who</span>
      </div>
      <div className="pt-rows">
        {shown.length === 0 && (
          <p className="pt-empty">
            {q || category ? "Nothing matches." : view === "done" ? "Nothing done yet." : "All caught up. No active tasks right now."}
          </p>
        )}
        {shown.map((task) => {
          const subs = tasksByParent.get(task.id) || [];
          const open = expandedTasks.has(task.id);
          return (
            <React.Fragment key={task.id}>
              <TaskRow task={task} subTasks={subs} expanded={open} onExpand={onToggleExpand}
                selected={panel?.id === task.id} highlight={highlightId === task.id} {...rowProps} />
              {open && subs.map((s) => (
                <TaskRow key={s.id} task={s} sub selected={panel?.id === s.id} highlight={highlightId === s.id} {...rowProps} />
              ))}
            </React.Fragment>
          );
        })}
      </div>
      <div className="pt-foot pt-mut">Ticking a task that has an activity logs it. Deleting one keeps its subtasks together in the trash. Right-click a task to pin it or mark it urgent.</div>
    </div>
  );

  return (
    <div ref={deskRef} className={desk ? "pt-desk" : "pt-phone"}>
      {main}
      {desk && (
        panel && (panel.mode === "new" || editing) ? (
          <TaskFormModal
            key={panel.mode === "new" ? `new-${panel.parentId || ""}` : editing.id}
            variant="panel" open
            editingTask={editing}
            parentTaskId={panel.mode === "new" ? panel.parentId : (editing?.parent_task_id || null)}
            allTasks={tasks}
            onClose={() => setPanel(null)}
            onSaved={(saved) => setPanel(saved?.id ? { mode: "edit", id: saved.id } : null)}
            footer={editing ? (
              <div className="pt-efoot">
                <span className="pt-mut pt-small pt-grow">{editPlan ? `On the plan ${editPlan}` : "Not on the plan"}</span>
                <button type="button" className="pt-btn danger" onClick={() => remove(editing.id)}>Delete</button>
              </div>
            ) : null}>
            {editing && !editing.parent_task_id && (
              <div className="pt-subs">
                <span className="pt-sect">Subtasks</span>
                {panelSubs.map((s) => (
                  <div key={s.id} className="pt-tickrow">
                    <button type="button" className={`pt-tick${s.completed ? " y" : ""}`} aria-pressed={!!s.completed}
                      aria-label={s.completed ? `Mark "${s.title}" not done` : `Mark "${s.title}" done`}
                      onClick={() => onToggle(s.id)}>{s.completed ? "x" : ""}</button>
                    <button type="button" className={`pt-sublink${s.completed ? " done" : ""}`} onClick={() => setPanel({ mode: "edit", id: s.id })}>{s.title}</button>
                  </div>
                ))}
                <button type="button" className="pt-add" onClick={() => startNew(editing.id)}>+ add a subtask</button>
              </div>
            )}
            {editing?.parent_task_id && (
              <button type="button" className="pt-add" onClick={() => setPanel({ mode: "edit", id: editing.parent_task_id })}>
                Back to {tasks.find((t) => t.id === editing.parent_task_id)?.title || "its task"}
              </button>
            )}
          </TaskFormModal>
        ) : (
          <div className="pt-panel pt-edit">
            <div className="pt-ttl"><span>Task</span></div>
            <div className="pt-edit-empty">
              <p className="pt-mut">Pick a task to see and change it, or start a new one.</p>
              <button type="button" className="pt-btn on" onClick={() => startNew(null)}>+ New task</button>
            </div>
          </div>
        )
      )}
      <TaskQuickActionsSheet task={quickTask} open={!!quickTask} onOpenChange={(o) => { if (!o) setQuickTask(null); }} />
    </div>
  );
}
