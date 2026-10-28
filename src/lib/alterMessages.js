// Messages left for an alter are written one way (v0.303.0). Two kinds,
// both AlterMessage rows:
//   • inbox (private) messages — `to_alter_id`, from someone, can be read,
//     pinned and edited;
//   • board messages — `alter_id`, posted on their board.
// The Inbox and Board feed widgets and the classic Messages and Board tabs
// all write through here, so every one speaks the full grammar (~commands,
// signposts, @mentions, /w whispers), notifies the alter through
// notifyAlter (whisper secrets never reach a preview), and deletes go to
// the trash.

import { base44 } from "@/api/base44Client";
import { prepareAuthoredText, recordAuthoredText } from "@/lib/authoredText";
import { notifyAlter, MENTION_LOGS_KEY } from "@/lib/mentionNotices";

export const inboxKey = (alterId) => ["privateMessages", alterId];
export const boardMessagesKey = (alterId) => ["alterMessages", alterId];

export const inboxPath = (alterId, messageId) =>
  `/alter/${alterId}?tab=private-messages${messageId ? `&messageId=${messageId}` : ""}`;
export const boardPath = (alterId) => `/alter/${alterId}?tab=messages`;

export function refreshInbox(queryClient, alterId) {
  queryClient?.invalidateQueries({ queryKey: inboxKey(alterId) });
  queryClient?.invalidateQueries({ queryKey: ["allPrivateMessages"] });
}

export function refreshBoard(queryClient, alterId) {
  queryClient?.invalidateQueries({ queryKey: boardMessagesKey(alterId) });
  queryClient?.invalidateQueries({ queryKey: MENTION_LOGS_KEY });
}

// Inbox messages render as plain text, so ~commands become "icon label"
// tokens rather than HTML chips. `fromAlterId` signs it; a "-name"
// signpost overrides that, "+name" co-signs.
const prepareInbox = (text, { alters, terms, fromAlterId }) =>
  prepareAuthoredText(String(text || "").trim(), {
    alters, terms, surfaceLabel: "private message", baseAuthorIds: fromAlterId ? [fromAlterId] : [], chips: false,
  });

// Each returns null when the person backs out of the whisper warning, and
// throws on a broken ~command (isLogCommandError) so the caller keeps the
// draft.
export async function sendInboxMessage({ toAlterId, fromAlterId, text, pinned = false, alters = [], terms = {} }) {
  const prepared = await prepareInbox(text, { alters, terms, fromAlterId });
  if (prepared === null) return null;
  const authorId = prepared.authorIds[0] || fromAlterId || null;
  const msg = await base44.entities.AlterMessage.create({
    from_alter_id: authorId,
    to_alter_id: toAlterId,
    content: prepared.content,
    author_alter_ids: prepared.authorIds,
    is_read: false,
    pinned: !!pinned,
  });
  const navigatePath = inboxPath(toAlterId, msg.id);
  const from = alters.find((a) => a.id === authorId);
  try {
    await notifyAlter({
      recipientId: toAlterId, authorId, sourceType: "message", sourceId: msg.id,
      sourceLabel: `Message from ${from?.name || "Unknown"}`, text: prepared.content, isWhisper: prepared.isWhisper, navigatePath,
    });
  } catch { /* best-effort: the message itself is saved */ }
  await recordAuthoredText({ ...prepared, alters, sourceType: "message", sourceId: msg.id, sourceLabel: "Private message", navigatePath });
  return msg;
}

export async function editInboxMessage({ message, text, alters = [], terms = {} }) {
  const prepared = await prepareInbox(text, { alters, terms, fromAlterId: message.from_alter_id });
  if (prepared === null) return null;
  const authorId = prepared.authorIds[0] || message.from_alter_id;
  const out = await base44.entities.AlterMessage.update(message.id, {
    content: prepared.content,
    author_alter_ids: prepared.authorIds,
    ...(authorId ? { from_alter_id: authorId } : {}),
    edited_date: new Date().toISOString(),
  });
  await recordAuthoredText({ ...prepared, alters, sourceType: "message", sourceId: message.id, sourceLabel: "Private message", navigatePath: inboxPath(message.to_alter_id, message.id) });
  return out;
}

export const setInboxMessagePinned = (id, pinned) => base44.entities.AlterMessage.update(id, { pinned: !!pinned });
export const setInboxMessageRead = (id, read = true) => base44.entities.AlterMessage.update(id, { is_read: !!read });

export async function postBoardMessage({ alterId, text, alters = [], terms = {} }) {
  const prepared = await prepareAuthoredText(String(text || "").trim(), { alters, terms, surfaceLabel: "board message" });
  if (prepared === null) return null;
  const authorId = prepared.authorIds[0] || null;
  const msg = await base44.entities.AlterMessage.create({
    alter_id: alterId,
    content: prepared.content,
    author_alter_ids: prepared.authorIds,
    ...(authorId ? { author_alter_id: authorId } : {}),
  });
  const navigatePath = boardPath(alterId);
  try {
    await notifyAlter({
      recipientId: alterId, authorId, sourceType: "message", sourceId: msg.id,
      sourceLabel: "Board message", text: prepared.content, isWhisper: prepared.isWhisper, navigatePath,
    });
  } catch { /* best-effort */ }
  await recordAuthoredText({ ...prepared, alters, sourceType: "message", sourceId: msg.id, sourceLabel: "Board message", navigatePath });
  return msg;
}

// Into the trash (restorable from Recent changes for the recovery window).
export const deleteAlterMessage = (id) => base44.entities.AlterMessage.delete(id);
