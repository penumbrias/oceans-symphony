// THE task-creation path (consolidation Phase 3, logic half).
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
