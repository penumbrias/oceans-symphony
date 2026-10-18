// ChannelView — one system-chat channel: per-channel message query +
// send/edit/delete with mention/authored-log side effects, rendered
// through the presentational ChatSurface. Extracted from Chat.jsx so the
// chat page AND the home-screen channel widget host the SAME component
// (the reuse rule: scope it, don't fork it).

import React, { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Lock, Eraser } from "lucide-react";
import { toast } from "sonner";
import { base44, localEntities } from "@/api/base44Client";
import ChatSurface from "@/components/chat/ChatSurface";
import { useTerms } from "@/lib/useTerms";
import { confirm } from "@/components/shared/ConfirmDialog";
import { saveMentions, saveAuthoredLog, extractMentionedIds } from "@/lib/mentionUtils";
import { purgeChatMessage, purgeDeletedChatMessages } from "@/lib/chatCleanup";

export default function ChannelView({ channel, alters, defaultAuthorId, frontingAlterIds = [], focusMessageId, onMessageFocused }) {
  const qc = useQueryClient();
  const terms = useTerms();

  const { data: rawMessages = [] } = useQuery({
    queryKey: ["systemChatMessages", channel.id],
    queryFn: () => localEntities.SystemChatMessage.filter({ channel_id: channel.id }),
  });

  const messages = useMemo(
    () => [...rawMessages]
      // Drop thread replies from the main stream — they live under
      // the parent thread (Phase 2). For now thread_parent_id is
      // always null, so this is a no-op pre-Phase-2.
      .filter((m) => !m.thread_parent_id)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
    [rawMessages]
  );

  // Persist a new message to the SystemChatMessage entity + mention/authored
  // logs. ChatSurface has already parsed signposts / whispers / mentions; this
  // host only writes. Returns nothing (defaults to "clear composer").
  const handleSend = async ({ cleanText, authorAlterIds, replyToId, mentionedIds, isWhisper, whisperRecipientIds, replyAuthorIds }) => {
    const created = await localEntities.SystemChatMessage.create({
      channel_id: channel.id,
      author_alter_id: authorAlterIds[0] || null,
      author_alter_ids: authorAlterIds,
      content: cleanText,
      timestamp: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      reply_to_id: replyToId || null,
      mentioned_alter_ids: mentionedIds,
      is_whisper: !!isWhisper,
      whisper_to_ids: isWhisper ? (whisperRecipientIds || []) : [],
      reactions: {},
      thread_parent_id: null,
      is_pinned: false,
    });
    qc.invalidateQueries({ queryKey: ["systemChatMessages", channel.id] });
    const label = isWhisper ? `#${channel.name} (whisper)` : `#${channel.name}`;
    try {
      // Log an authored row for each speaker so all of them show up in the
      // per-alter mention log; "system" co-speakers have no alter id and skip.
      for (const id of (authorAlterIds.length > 0 ? authorAlterIds : [null])) {
        await saveAuthoredLog({
          authorAlterId: id,
          sourceType: "chat",
          sourceId: created.id,
          sourceLabel: label,
          navigatePath: `/chat?channel=${channel.id}&message=${created.id}`,
          previewText: cleanText,
        });
      }
      if (isWhisper) {
        for (const id of mentionedIds) {
          await base44.entities.MentionLog.create({
            mentioned_alter_id: id,
            author_alter_id: authorAlterIds[0] || null,
            log_type: "mention",
            source_type: "chat",
            source_id: created.id,
            source_label: label,
            source_date: new Date().toISOString(),
            preview_text: cleanText.slice(0, 120),
            navigate_path: `/chat?channel=${channel.id}&message=${created.id}`,
          });
        }
      } else {
        await saveMentions({
          content: cleanText,
          alters,
          sourceType: "chat",
          sourceId: created.id,
          sourceLabel: label,
          navigatePath: `/chat?channel=${channel.id}&message=${created.id}`,
          authorAlterId: authorAlterIds[0] || null,
        });
        // Reply-notify rows: when "@ ON" was set on the reply chip, log a
        // mention for each replied-to alter not already @mentioned in the body.
        const bodyMentionIds = extractMentionedIds(cleanText, alters);
        for (const id of (replyAuthorIds || [])) {
          if (bodyMentionIds.includes(id)) continue;
          try {
            await base44.entities.MentionLog.create({
              mentioned_alter_id: id,
              author_alter_id: authorAlterIds[0] || null,
              log_type: "mention",
              source_type: "chat",
              source_id: created.id,
              source_label: label,
              source_date: new Date().toISOString(),
              preview_text: cleanText.slice(0, 120),
              navigate_path: `/chat?channel=${channel.id}&message=${created.id}`,
            });
          } catch { /* non-fatal */ }
        }
      }
    } catch { /* mention log is best-effort; don't block send */ }
  };

  const handleEdit = async (msg, { cleanText, authorAlterIds, mentionedIds }) => {
    await localEntities.SystemChatMessage.update(msg.id, {
      content: cleanText,
      author_alter_id: authorAlterIds[0] || null,
      author_alter_ids: authorAlterIds,
      edited_at: new Date().toISOString(),
      mentioned_alter_ids: mentionedIds,
    });
    qc.invalidateQueries({ queryKey: ["systemChatMessages", channel.id] });
  };

  // Soft-delete so reply-quotes still resolve to a placeholder
  // ("[message deleted]") instead of breaking the layout.
  const handleDelete = async (msg) => {
    if (!(await confirm("Delete this message?"))) return;
    await localEntities.SystemChatMessage.update(msg.id, {
      content: "",
      deleted_at: new Date().toISOString(),
    });
    qc.invalidateQueries({ queryKey: ["systemChatMessages", channel.id] });
  };

  // Permanently remove a "[message deleted]" placeholder (or all of them in
  // this channel). Normal messages are never touched.
  const deletedCount = useMemo(() => rawMessages.filter((m) => m.deleted_at).length, [rawMessages]);
  const handlePurgeOne = async (msg) => {
    if (!(await confirm("Remove this deleted-message placeholder for good?"))) return;
    await purgeChatMessage(msg.id);
    qc.invalidateQueries({ queryKey: ["systemChatMessages", channel.id] });
    qc.invalidateQueries({ queryKey: ["deletedChatMessages"] });
  };
  const handlePurgeAll = async () => {
    if (!(await confirm(`Permanently remove ${deletedCount} deleted message${deletedCount === 1 ? "" : "s"} from #${channel.name}? Normal messages are not touched.`))) return;
    const n = await purgeDeletedChatMessages(channel.id);
    qc.invalidateQueries({ queryKey: ["systemChatMessages", channel.id] });
    qc.invalidateQueries({ queryKey: ["deletedChatMessages"] });
    toast.success(`Removed ${n} deleted message${n === 1 ? "" : "s"}.`);
  };

  // Private channel: limit who can be picked as the speaker to its members
  // (the "access limited to specific alters" part), and default the speaker
  // to a member. Mentions still autocomplete across everyone.
  const isPrivate = !!(channel.is_private && channel.member_alter_ids?.length);
  const memberSet = useMemo(() => new Set(channel.member_alter_ids || []), [channel.member_alter_ids]);
  const speakerAlters = useMemo(
    () => (isPrivate ? alters.filter((a) => memberSet.has(a.id)) : alters),
    [isPrivate, alters, memberSet]
  );
  const composerDefaultAuthor = isPrivate
    ? (memberSet.has(defaultAuthorId) ? defaultAuthorId : (speakerAlters[0]?.id || null))
    : defaultAuthorId;
  const memberNames = isPrivate
    ? speakerAlters.map((a) => a.alias || a.name).join(", ")
    : "";

  return (
    <ChatSurface
      messages={messages}
      alters={alters}
      speakerAlters={speakerAlters}
      defaultAuthorId={composerDefaultAuthor}
      frontingAlterIds={frontingAlterIds}
      onSend={handleSend}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onPurge={handlePurgeOne}
      channelLabel={`#${channel.name}`}
      focusMessageId={focusMessageId}
      onMessageFocused={onMessageFocused}
      headerSlot={(
        <div className="px-4 py-2 border-b border-border/40 flex items-center gap-2 flex-shrink-0">
          {isPrivate ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Hash className="w-4 h-4 text-muted-foreground" />}
          <p className="text-sm font-medium truncate">{channel.name}</p>
          {(isPrivate ? memberNames : channel.description) && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <p className="text-xs text-muted-foreground truncate">{isPrivate ? memberNames : channel.description}</p>
            </>
          )}
          {deletedCount > 0 && (
            <button
              type="button"
              onClick={handlePurgeAll}
              className="ml-auto relative flex-shrink-0 h-8 w-8 inline-flex items-center justify-center text-muted-foreground hover:text-red-500 rounded-md border border-border/50"
              title={`Clean up ${deletedCount} deleted message${deletedCount === 1 ? "" : "s"} in this channel`}
              aria-label={`Clean up ${deletedCount} deleted messages`}
            >
              <Eraser className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[0.5625rem] leading-4 text-center tabular-nums">{deletedCount}</span>
            </button>
          )}
        </div>
      )}
    />
  );
}
