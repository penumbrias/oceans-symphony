// Chat cleanup helpers.
//
// Deleting a chat message is a SOFT delete (the row stays with `deleted_at`
// set and empty content) so reply quotes keep resolving to "[message deleted]".
// Those placeholders pile up — especially after a messy JSON import — so this
// module lets the user remove them for good, one at a time, per channel, or
// everywhere. Removal goes through the normal entity delete (skipping the
// trash: these are already deleted), so it records the usual deletion
// tombstones and propagates to other synced devices.

import { localEntities } from "@/api/base44Client";

export async function listDeletedChatMessages(channelId = null) {
  const rows = channelId
    ? await localEntities.SystemChatMessage.filter({ channel_id: channelId })
    : await localEntities.SystemChatMessage.list();
  return (rows || []).filter((m) => !!m?.deleted_at);
}

// Permanently remove deleted-message placeholders. Returns how many were removed.
// Replies that quoted a removed message lose only the quote preview; their own
// text is untouched.
export async function purgeDeletedChatMessages(channelId = null) {
  const dead = await listDeletedChatMessages(channelId);
  if (dead.length === 0) return 0;
  // Already deleted once (they show as "[message deleted]"), so these skip
  // the trash.
  return localEntities.SystemChatMessage.bulkDelete(dead.map((m) => m.id), { forever: true });
}

export async function purgeChatMessage(id) {
  if (!id) return 0;
  return localEntities.SystemChatMessage.bulkDelete([id], { forever: true });
}
