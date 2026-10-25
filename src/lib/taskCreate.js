// THE task-creation path (consolidation Phase 3, logic half), and the one
// to-do delete (v0.279.14).
//
// QuickTaskComposer and TaskFormModal each built Tasks with their own field
// handling, and the composer bolted a companion Bulletin on afterwards.
// Both now create through here, so the field semantics and the
// companion-post behaviour are single-sourced. The two surfaces stay
// distinct on purpose — an inline quick-add row and a full form are
// different jobs — but they no longer disagree about what a Task is.
//
// companionBulletin: the bulletin-board rows post a `[task:<id>] title`
// bulletin signed by the current fronters, so the board shows the task as
// a card. Any caller can opt in; nothing else changes shape.

import { base44 } from "@/api/base44Client";
import { withTrashBatch } from "@/lib/localDb";

// A to-do's note. `description` is the one field written; planner-made
// to-dos from older builds stored it as `notes`, so read both.
export function taskNote(task) {
  return task?.description || task?.notes || "";
}

export async function createTask(fields, { companionBulletin = false, authorAlterIds = [] } = {}) {
  const title = (fields.title || "").trim();
  const task = await base44.entities.Task.create({
    completed: false,
    ...fields,
    title,
  });

  if (companionBulletin) {
    let authors = authorAlterIds;
    if (authors.length === 0) {
      try {
        const active = await base44.entities.FrontingSession.filter({ is_active: true });
        authors = active.map((s) => s.alter_id || s.primary_alter_id).filter(Boolean);
      } catch { /* unsigned is fine */ }
    }
    await base44.entities.Bulletin.create({
      content: `[task:${task.id}] ${title}`,
      author_alter_ids: authors,
      author_alter_id: authors[0] || null,
      reactions: {},
      read_by_alter_ids: authors,
    });
  }

  return task;
}

// Deleting a to-do takes its subtasks (at every depth) and its board card
// into the trash in ONE batch, so restoring it brings the whole list back.
// Only the parent used to go: the subtasks kept pointing at it and had no
// other screen to show on. Linked plans keep their task_id — they're the
// person's own records, and a restore reconnects them.
export async function deleteTask(taskId) {
  if (!taskId) return;
  await withTrashBatch(async () => {
    const all = (await base44.entities.Task.list()) || [];
    const byParent = new Map();
    for (const t of all) {
      if (!t?.parent_task_id) continue;
      if (!byParent.has(t.parent_task_id)) byParent.set(t.parent_task_id, []);
      byParent.get(t.parent_task_id).push(t.id);
    }
    const ids = [];
    const seen = new Set([taskId]);
    const queue = [taskId];
    while (queue.length) {
      for (const child of byParent.get(queue.shift()) || []) {
        if (seen.has(child)) continue; // a loop in the data never spins
        seen.add(child);
        ids.push(child);
        queue.push(child);
      }
    }
    // The parent first, so the person sees the delete they asked for even
    // if something after it fails; anything left stays visible, never lost.
    await base44.entities.Task.delete(taskId);
    for (const id of ids) {
      try { await base44.entities.Task.delete(id); } catch { /* stays visible */ }
    }
    let cards = [];
    try { cards = (await base44.entities.Bulletin.list()) || []; } catch { cards = []; }
    const marks = [taskId, ...ids].flatMap((id) => [`[task:${id}]`, `[task:${id}:done]`]);
    for (const b of cards) {
      const content = String(b?.content || "");
      if (!marks.some((m) => content.startsWith(m))) continue;
      try { await base44.entities.Bulletin.delete(b.id); } catch { /* stays visible */ }
    }
  });
}
