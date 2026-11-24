// THE bulletin board write path (house step 0.6, "plumbing out of the walls").
//
// Every Bulletin and BulletinComment the app writes for the person goes
// through here: posting (BulletinComposer, with or without a poll), editing
// (BulletinEditModal), pins and dashboard pins (BulletinCard,
// BulletinActionMenu, TaskBulletinCard, the Polls page), reactions, legacy
// inline poll votes, "mark mentions read" (MentionAlertBanner), a task
// post's done mark, delete, and comments (BulletinCommentThread: post, edit,
// react, delete). The to-do companion post is made by taskCreate.js, which
// calls createBulletin here.
//
// The composers still do the grammar (signposts, whispers, ~commands) and
// pick the authors; they hand over the finished text and author ids. The
// notices (MentionLog) are written here, best-effort, after the record.
//
// Privacy (CLAUDE.md "Whispers ... stay private"): a whisper post or comment
// notifies ONLY its recipients, and every MentionLog row it writes — the
// recipients' notices and the authors' "authored" trail — carries
// WHISPER_PREVIEW, never the hidden text. (Before this file the authored
// trail stored the first 120 characters of the post, whisper span and all;
// screens masked it on display, but the text sat in the row.)
//
// Record shapes are exactly what the pages wrote before this file existed;
// scripts/test-bulletin-entry.mjs pins them.

import { base44 } from "@/api/base44Client";
import { saveMentions, saveAuthoredLog } from "@/lib/mentionUtils";
import { WHISPER_PREVIEW } from "@/lib/whisperRedact";

const B = () => base44.entities.Bulletin;
const BC = () => base44.entities.BulletinComment;

export const bulletinPath = (id) => `/bulletin/${id}`;

async function whisperNotices({ recipientIds, authorId, sourceType, sourceId, sourceLabel, navigatePath }) {
  for (const rid of recipientIds || []) {
    try {
      await base44.entities.MentionLog.create({
        mentioned_alter_id: rid,
        author_alter_id: authorId || null,
        log_type: "mention",
        source_type: sourceType,
        source_id: sourceId,
        source_label: sourceLabel,
        source_date: new Date().toISOString(),
        preview_text: WHISPER_PREVIEW,
        navigate_path: navigatePath,
      });
    } catch { /* notification best-effort */ }
  }
}

// ── Bulletins ──────────────────────────────────────────────────────────

export async function createBulletin(fields) {
  return B().create(fields);
}

// Posts a bulletin from the composer. `record` is the bulletin's fields
// (authors, content, flags); `poll` ({ question, options }) attaches a new
// linked Poll, which pins the post. Then the notices: public @mentions
// (not for a whisper), each whisper recipient, each author's trail.
export async function postBulletin({ record, poll = null, alters = [], authorIds = [], mentionAuthorId = null, isWhisper = false, whisperRecipientIds = [] }) {
  const data = { ...record };
  if (poll && poll.question?.trim()) {
    const { createPoll, defaultTallyMode } = await import("@/lib/pollEntry");
    const filled = (poll.options || []).filter((o) => o.trim());
    const tally = defaultTallyMode();
    const createdPoll = await createPoll({
      question: poll.question.trim(),
      options: filled,
      tallyMode: tally,
      // A system board's poll pins itself to the dashboard; a group
      // board's stays on that board.
      pinnedToDashboard: !data.group_id,
      // A tally poll has no per-person accounting.
      createdByAlterId: tally ? null : mentionAuthorId,
    });
    data.poll_id = createdPoll.id;
    data.is_pinned = true;
    // An inline copy in the legacy shape, as a label fallback for older
    // readers; the Poll record holds the votes.
    data.poll = { question: poll.question.trim(), options: filled.map((label) => ({ label, votes: [] })) };
  }
  const bulletin = await B().create(data);
  if (data.poll_id) {
    try { await base44.entities.Poll.update(data.poll_id, { bulletin_id: bulletin.id }); }
    catch { /* non-fatal — the bulletin already references the poll */ }
  }
  const nav = bulletinPath(bulletin.id);
  try {
    if (!isWhisper) {
      await saveMentions({
        content: data.content, alters, sourceType: "bulletin", sourceId: bulletin.id,
        sourceLabel: "Bulletin Board", navigatePath: nav, authorAlterId: mentionAuthorId,
      });
    }
    await whisperNotices({ recipientIds: whisperRecipientIds, authorId: mentionAuthorId, sourceType: "bulletin", sourceId: bulletin.id, sourceLabel: "Bulletin Board (whisper)", navigatePath: nav });
    for (const authorId of authorIds) {
      await saveAuthoredLog({
        authorAlterId: authorId, sourceType: "bulletin", sourceId: bulletin.id,
        sourceLabel: "Bulletin Board", navigatePath: nav,
        previewText: isWhisper ? WHISPER_PREVIEW : data.content,
      });
    }
  } catch { /* notices are best-effort; the post is saved */ }
  return bulletin;
}

// An edit from BulletinEditModal: the text and who signed it. The caller
// runs prepareAuthoredText first and recordAuthoredText after.
export async function editBulletin(id, { content, authorIds = [], isRich }) {
  return B().update(id, {
    content,
    author_alter_ids: authorIds,
    author_alter_id: authorIds[0] || null,
    is_rich: isRich,
  });
}

export async function setBulletinPinned(id, pinned) {
  return B().update(id, { is_pinned: !!pinned });
}

// The action menu's two pins: "is_pinned" (board) and "dashboard_pinned".
export async function toggleBulletinFlag(bulletin, field) {
  if (field !== "is_pinned" && field !== "dashboard_pinned") throw new Error(`Not a bulletin flag: ${field}`);
  return B().update(bulletin.id, { [field]: !bulletin[field] });
}

// A to-do's board card writes its done mark into its text.
export async function setTaskBulletinContent(id, content) {
  return B().update(id, { content });
}

// The Polls page unlinks a deleted poll from its post.
export async function unlinkBulletinPoll(id) {
  return B().update(id, { poll_id: null });
}

// The emoji map after `voterId` toggles `emoji` (pure).
export function toggledReactions(reactions, emoji, voterId) {
  const base = reactions || {};
  const existing = base[emoji] || [];
  const next = existing.includes(voterId) ? existing.filter((id) => id !== voterId) : [...existing, voterId];
  return { ...base, [emoji]: next };
}

// Reads the freshest reactions first, so two quick taps don't undo each
// other from a stale copy. `onReactions` runs just before the write (for
// an optimistic screen update). Returns the new map.
export async function reactToBulletin(id, emoji, voterId, cached = {}, { onReactions } = {}) {
  let base = cached;
  try { const fresh = await B().get(id); if (fresh) base = fresh.reactions || {}; } catch { /* cached */ }
  const reactions = toggledReactions(base, emoji, voterId);
  onReactions?.(reactions);
  await B().update(id, { reactions });
  return reactions;
}

// The legacy inline poll (posts from before the Poll record existed):
// one vote per voter, moved to the picked option. Pure.
export function votedInlinePoll(source, optionIndex, voterId) {
  const poll = { ...source };
  poll.options = poll.options.map((opt) => ({ ...opt, votes: (opt.votes || []).filter((id) => id !== voterId) }));
  poll.options[optionIndex] = { ...poll.options[optionIndex], votes: [...(poll.options[optionIndex].votes || []), voterId] };
  return poll;
}

export async function voteInlineBulletinPoll(id, optionIndex, voterId, cachedPoll, { onPoll } = {}) {
  let source = cachedPoll;
  try { const fresh = await B().get(id); if (fresh?.poll) source = fresh.poll; } catch { /* cached */ }
  if (!source) return null;
  const poll = votedInlinePoll(source, optionIndex, voterId);
  onPoll?.(poll);
  await B().update(id, { poll });
  const { markPollVotedToday } = await import("@/lib/dailyTaskSystem");
  markPollVotedToday();
  return poll;
}

// Adds `alterId` to each post's read list.
export async function markBulletinsRead(bulletins, alterId) {
  for (const b of bulletins || []) {
    const already = b.read_by_alter_ids || [];
    if (!already.includes(alterId)) await B().update(b.id, { read_by_alter_ids: [...already, alterId] });
  }
}

// To the trash (restorable). Its comments and poll are left as they are.
export async function trashBulletin(id) {
  if (!id) return;
  await B().delete(id);
}

// ── Comments ───────────────────────────────────────────────────────────

const commentLabel = (sourceType) => `${sourceType === "reply" ? "Reply" : "Comment"} on bulletin`;
export const commentPath = (bulletinId, commentId) => `/bulletin/${bulletinId}?commentId=${commentId}`;

// Posts a comment or reply, bumps the bulletin's activity time, then the
// notices (same whisper rule as posts).
export async function postBulletinComment({ bulletinId, parentCommentId = null, authorIds = [], content, isRich, isWhisper = false, whisperRecipientIds = [], alters = [] }) {
  const comment = await BC().create({
    bulletin_id: bulletinId,
    parent_comment_id: parentCommentId || null,
    author_alter_id: authorIds[0] || null,
    author_alter_ids: authorIds,
    content,
    is_rich: isRich,
    reactions: {},
  });
  await B().update(bulletinId, { last_activity_at: new Date().toISOString() });
  const sourceType = parentCommentId ? "reply" : "comment";
  const nav = commentPath(bulletinId, comment.id);
  try {
    for (const authorId of authorIds) {
      await saveAuthoredLog({
        authorAlterId: authorId, sourceType, sourceId: comment.id,
        sourceLabel: commentLabel(sourceType), navigatePath: nav,
        previewText: isWhisper ? WHISPER_PREVIEW : content,
      });
    }
    if (!isWhisper) {
      await saveMentions({
        content, alters, sourceType, sourceId: comment.id,
        sourceLabel: commentLabel(sourceType), navigatePath: nav, authorAlterId: authorIds[0] || null,
      });
    }
    await whisperNotices({
      recipientIds: whisperRecipientIds, authorId: authorIds[0] || null, sourceType, sourceId: comment.id,
      sourceLabel: `${sourceType === "reply" ? "Reply" : "Comment"} (whisper)`, navigatePath: nav,
    });
  } catch { /* notices are best-effort; the comment is saved */ }
  return comment;
}

export async function editBulletinComment(id, { content, authorIds = [], isRich }) {
  return BC().update(id, {
    content,
    author_alter_id: authorIds[0] || null,
    author_alter_ids: authorIds,
    is_rich: isRich,
    edited_date: new Date().toISOString(),
  });
}

export async function reactToBulletinComment(id, emoji, voterId, cached = {}) {
  let base = cached;
  try { const fresh = await BC().get(id); if (fresh) base = fresh.reactions || {}; } catch { /* cached */ }
  const reactions = toggledReactions(base, emoji, voterId);
  await BC().update(id, { reactions });
  return reactions;
}

export async function trashBulletinComment(id) {
  if (!id) return;
  await BC().delete(id);
}
