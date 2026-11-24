// THE system chat write path (house step 0.6, "plumbing out of the walls").
//
// Every SystemChatMessage, SystemChatChannel and SystemChatCategory the app
// writes for the person goes through here: the Chat page's channel and
// category editor, a channel's send / edit / delete (ChannelView, which the
// Chat page and the channel widget both host) and a meeting dialogue saved
// to a channel (MeetingDialogue). Two lib helpers already own their own
// jobs and stay where they are: chatCleanup.js (removing "[message deleted]"
// placeholders for good) and chatCategories.js (the one-time legacy
// category migration). Importers (OpenPlural, Simply Plural) build rows from
// a foreign shape and stay in their importers.
//
// Privacy (CLAUDE.md "Whispers and private channels stay private"): a
// whisper's MentionLog rows — the authored trail and each recipient's
// notice — always carry WHISPER_PREVIEW, never the secret text. The message
// itself keeps its text, because its own screen shows it to the people it
// was whispered to.
//
// Record shapes are exactly what the pages wrote before this file existed;
// scripts/test-chat-entry.mjs pins them.

import { base44, localEntities } from "@/api/base44Client";
import { withTrashBatch } from "@/lib/localDb";
import { saveMentions, saveAuthoredLog, extractMentionedIds } from "@/lib/mentionUtils";
import { WHISPER_PREVIEW } from "@/lib/whisperRedact";

const Msg = () => localEntities.SystemChatMessage;
const Chan = () => localEntities.SystemChatChannel;
const Cat = () => localEntities.SystemChatCategory;

export const chatMessagePath = (channelId, messageId) => `/chat?channel=${channelId}&message=${messageId}`;

// ── Messages ───────────────────────────────────────────────────────────

// Sends one message. The composer (ChatSurface) has already parsed
// signposts, whispers and mentions; this writes the message and then its
// MentionLog rows (best-effort: a failed notice never fails the send).
//   channel: { id, name }
//   replyAuthorIds: replied-to people to notify ("@ ON" on the reply chip)
export async function sendChatMessage({
  channel, alters = [], cleanText, authorAlterIds = [], replyToId = null,
  mentionedIds = [], isWhisper = false, whisperRecipientIds = [], replyAuthorIds = [],
}) {
  const mentioned = mentionedIds || [];
  const created = await Msg().create({
    channel_id: channel.id,
    author_alter_id: authorAlterIds[0] || null,
    author_alter_ids: authorAlterIds,
    content: cleanText,
    timestamp: new Date().toISOString(),
    edited_at: null,
    deleted_at: null,
    reply_to_id: replyToId || null,
    mentioned_alter_ids: mentioned,
    is_whisper: !!isWhisper,
    whisper_to_ids: isWhisper ? (whisperRecipientIds || []) : [],
    reactions: {},
    thread_parent_id: null,
    is_pinned: false,
  });
  await recordChatNotices({ channel, created, alters, cleanText, authorAlterIds, mentionedIds: mentioned, isWhisper, replyAuthorIds });
  return created;
}

async function recordChatNotices({ channel, created, alters, cleanText, authorAlterIds, mentionedIds, isWhisper, replyAuthorIds }) {
  const label = isWhisper ? `#${channel.name} (whisper)` : `#${channel.name}`;
  const navigatePath = chatMessagePath(channel.id, created.id);
  const mentionRow = (id, preview) => base44.entities.MentionLog.create({
    mentioned_alter_id: id,
    author_alter_id: authorAlterIds[0] || null,
    log_type: "mention",
    source_type: "chat",
    source_id: created.id,
    source_label: label,
    source_date: new Date().toISOString(),
    preview_text: preview,
    navigate_path: navigatePath,
  });
  try {
    // An authored row for each speaker, so all of them show in the
    // per-alter mention log; "system" co-speakers have no alter id.
    for (const id of (authorAlterIds.length > 0 ? authorAlterIds : [null])) {
      await saveAuthoredLog({
        authorAlterId: id,
        sourceType: "chat",
        sourceId: created.id,
        sourceLabel: label,
        navigatePath,
        previewText: isWhisper ? WHISPER_PREVIEW : cleanText,
      });
    }
    if (isWhisper) {
      for (const id of mentionedIds) await mentionRow(id, WHISPER_PREVIEW);
    } else {
      await saveMentions({
        content: cleanText,
        alters,
        sourceType: "chat",
        sourceId: created.id,
        sourceLabel: label,
        navigatePath,
        authorAlterId: authorAlterIds[0] || null,
      });
      // Replied-to people not already @mentioned in the body.
      const bodyMentionIds = extractMentionedIds(cleanText, alters);
      for (const id of (replyAuthorIds || [])) {
        if (bodyMentionIds.includes(id)) continue;
        try { await mentionRow(id, cleanText.slice(0, 120)); } catch { /* non-fatal */ }
      }
    }
  } catch { /* mention log is best-effort; don't block send */ }
}

export async function editChatMessage(id, { cleanText, authorAlterIds = [], mentionedIds }) {
  return Msg().update(id, {
    content: cleanText,
    author_alter_id: authorAlterIds[0] || null,
    author_alter_ids: authorAlterIds,
    edited_at: new Date().toISOString(),
    mentioned_alter_ids: mentionedIds,
  });
}

// "Delete" leaves a "[message deleted]" placeholder so reply quotes still
// resolve. The text it replaces is kept in Recent changes by the entity
// layer; removing the placeholder for good is chatCleanup.js's job.
export async function deleteChatMessage(id) {
  return Msg().update(id, { content: "", deleted_at: new Date().toISOString() });
}

// ── Channels ───────────────────────────────────────────────────────────

// The fields a new channel starts with; callers add their own.
export function newChannelFields(fields, { sortOrder = Date.now() } = {}) {
  return { ...fields, sort_order: sortOrder, is_archived: false, created_date: new Date().toISOString() };
}

export async function createChatChannel(fields) {
  return Chan().create(fields);
}

export async function updateChatChannel(id, patch) {
  return Chan().update(id, patch);
}

// The first channel a new system gets.
export async function createDefaultChannel(description) {
  return createChatChannel({ name: "general", description, ...newChannelFields({}, { sortOrder: 0 }) });
}

// A channel and every message in it go to the trash in ONE batch, so a
// restore brings them back together.
export async function deleteChatChannel(channelId) {
  await withTrashBatch(async () => {
    const msgs = await Msg().filter({ channel_id: channelId });
    for (const m of msgs) { try { await Msg().delete(m.id); } catch { /* stays visible */ } }
    await Chan().delete(channelId);
  });
}

// Drag-to-reorder within one sibling list: sort_order becomes the position.
export async function reorderChatChannels(idsInOrder) {
  await Promise.all((idsInOrder || []).map((id, i) => updateChatChannel(id, { sort_order: i })));
}

// ── Categories ─────────────────────────────────────────────────────────

export async function createChatCategory(fields) {
  // New categories sort to the TOP of the list.
  return Cat().create({ ...fields, sort_order: -Date.now(), collapsed: false, created_date: new Date().toISOString() });
}

export async function updateChatCategory(id, patch) {
  return Cat().update(id, patch);
}

export async function toggleChatCategoryCollapsed(cat) {
  return updateChatCategory(cat.id, { collapsed: !cat.collapsed });
}

// Make exactly `pickedIds` the channels in category `catId`: picked ones
// join, ones that were in it and got unpicked go uncategorised.
export async function setCategoryChannels(catId, allChannels, pickedIds) {
  const wasIn = new Set((allChannels || []).filter((c) => c.category_id === catId).map((c) => c.id));
  const picked = new Set(pickedIds || []);
  for (const id of picked) if (!wasIn.has(id)) { try { await updateChatChannel(id, { category_id: catId }); } catch { /* keep going */ } }
  for (const id of wasIn) if (!picked.has(id)) { try { await updateChatChannel(id, { category_id: null }); } catch { /* keep going */ } }
}

export async function reorderChatCategories(idsInOrder) {
  await Promise.all((idsInOrder || []).map((id, i) => updateChatCategory(id, { sort_order: i })));
}

// Deleting a category never deletes a channel or message: its channels and
// sub-categories move up a level, then the category goes to the trash.
export async function deleteChatCategory(category, { channels = [], categories = [] } = {}) {
  const up = category.parent_category_id || null;
  for (const ch of channels.filter((c) => c.category_id === category.id)) { try { await updateChatChannel(ch.id, { category_id: up }); } catch { /* keep going */ } }
  for (const sub of categories.filter((c) => c.parent_category_id === category.id)) { try { await updateChatCategory(sub.id, { parent_category_id: up }); } catch { /* keep going */ } }
  await Cat().delete(category.id);
}
