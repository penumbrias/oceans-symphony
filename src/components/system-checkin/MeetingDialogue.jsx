import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Hash, Plus, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { base44, localEntities } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { saveMentions, saveAuthoredLog } from "@/lib/mentionUtils";
import ChatSurface from "@/components/chat/ChatSurface";

// ── Meeting "open dialogue" space ────────────────────────────────────────────
//
// This is THE real System Chat surface (ChatSurface — the exact same component
// the System Chat page renders), embedded in the meeting. It gets the same
// composer (formatting toolbar + live @mention / -signpost / /w autocomplete)
// and the same message rendering. Nothing here is a re-approximation.
//
// Storage is selectable (see the toggle in SystemCheckIn.jsx):
//   • "Just this meeting" (default) — history lives on SystemCheckIn.dialogue,
//     an array on the meeting record. Nothing touches System Chat.
//   • "Save to a System Chat channel" — messages go to the real
//     SystemChatMessage entity in the chosen channel, exactly as if typed on
//     the Chat page (authored logs + @mention notifications included).
//
// Stored dialogue-array entry shape (additive — old records with just
// {id,alter_id,text,timestamp} still load):
//   [{ id, alter_id (null = system), author_alter_ids, text, timestamp,
//      is_whisper, whisper_to_ids, reply_to_id, mentioned_alter_ids,
//      edited_at, deleted_at }]
//
// ChatSurface produces/consumes a `content` field; the meeting array uses
// `text`. We map between the two so old records keep working.

// Map a stored dialogue-array entry onto the ChatSurface message shape
// (content instead of text; tolerant of the legacy single-id / no-author form).
export function normalizeDialogue(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (typeof m.text === "string" || typeof m.content === "string"))
    .map((m, i) => ({
      id: m.id || `dlg-${m.timestamp || i}-${i}`,
      alter_id: m.alter_id || null,
      author_alter_id: m.author_alter_id || m.alter_id || null,
      author_alter_ids: Array.isArray(m.author_alter_ids)
        ? m.author_alter_ids
        : (m.alter_id ? [m.alter_id] : []),
      content: typeof m.content === "string" ? m.content : (m.text || ""),
      text: typeof m.text === "string" ? m.text : (m.content || ""),
      timestamp: m.timestamp || new Date().toISOString(),
      edited_at: m.edited_at || null,
      deleted_at: m.deleted_at || null,
      reply_to_id: m.reply_to_id || null,
      mentioned_alter_ids: Array.isArray(m.mentioned_alter_ids) ? m.mentioned_alter_ids : [],
      is_whisper: !!m.is_whisper,
      whisper_to_ids: Array.isArray(m.whisper_to_ids) ? m.whisper_to_ids : [],
    }));
}

// Persist the ChatSurface message shape back into the meeting's dialogue array
// (uses `text` as the canonical field for read-back in SystemCheckIn's view).
function toStored(msg) {
  return {
    id: msg.id,
    alter_id: msg.author_alter_id || (msg.author_alter_ids && msg.author_alter_ids[0]) || null,
    author_alter_id: msg.author_alter_id || (msg.author_alter_ids && msg.author_alter_ids[0]) || null,
    author_alter_ids: msg.author_alter_ids || [],
    text: msg.content || "",
    timestamp: msg.timestamp,
    edited_at: msg.edited_at || null,
    deleted_at: msg.deleted_at || null,
    reply_to_id: msg.reply_to_id || null,
    mentioned_alter_ids: msg.mentioned_alter_ids || [],
    is_whisper: !!msg.is_whisper,
    whisper_to_ids: msg.whisper_to_ids || [],
  };
}

// ── Channel storage target picker ────────────────────────────────────────────
// Lets the user choose where dialogue is stored: this meeting only, or an
// existing/new System Chat channel.
function StorageTargetPicker({ value, channelId, onChange, terms }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: channels = [] } = useQuery({
    queryKey: ["systemChatChannels"],
    queryFn: () => localEntities.SystemChatChannel.list(),
  });
  const visibleChannels = useMemo(
    () => channels
      .filter((c) => !c.is_archived)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.name || "").localeCompare(b.name || "")),
    [channels]
  );

  const selectedChannel = channels.find((c) => c.id === channelId) || null;
  const summary = value === "channel"
    ? (selectedChannel ? `Saving to #${selectedChannel.name}` : "Pick a channel…")
    : "Just this meeting";

  const createChannel = async () => {
    const clean = newName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!clean) { toast.error("Give the channel a name."); return; }
    try {
      const record = await localEntities.SystemChatChannel.create({
        name: clean,
        description: null,
        category_id: null,
        is_private: false,
        member_alter_ids: [],
        sort_order: Date.now(),
        is_archived: false,
        created_date: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ["systemChatChannels"] });
      onChange({ mode: "channel", channelId: record.id });
      setCreating(false);
      setNewName("");
      setOpen(false);
      toast.success(`Created #${clean} — dialogue will save there.`);
    } catch (err) {
      toast.error(err?.message || "Couldn't create the channel");
    }
  };

  return (
    <div className="rounded-lg border border-border/40 bg-background/60 p-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="text-xs text-muted-foreground">
          Where this is saved:{" "}
          <span className="font-medium text-foreground">{summary}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {/* Meeting-only */}
          <button
            type="button"
            onClick={() => { onChange({ mode: "meeting", channelId: null }); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${value === "meeting" ? "bg-primary/10" : "hover:bg-muted/40"}`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="flex-1">
              <span className="font-medium">Just this meeting</span>
              <span className="block text-[0.6875rem] text-muted-foreground">Stays with this meeting. Nothing is saved to {terms.System} Chat.</span>
            </span>
            {value === "meeting" && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
          </button>

          {/* Existing channels */}
          <div className="px-2 pt-1 text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Save to a {terms.System} Chat channel
          </div>
          <div className="max-h-40 overflow-y-auto overscroll-contain rounded-md border border-border/30">
            {visibleChannels.length === 0 && (
              <p className="px-2 py-2 text-[0.6875rem] text-muted-foreground italic">No channels yet — create one below.</p>
            )}
            {visibleChannels.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange({ mode: "channel", channelId: c.id }); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors ${value === "channel" && channelId === c.id ? "bg-primary/10" : "hover:bg-muted/40"}`}
              >
                <Hash className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 truncate">{c.name}</span>
                {value === "channel" && channelId === c.id && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
              </button>
            ))}
          </div>

          {/* Create new */}
          {creating ? (
            <div className="flex items-center gap-1.5 px-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createChannel(); } }}
                placeholder="new-channel-name"
                className="flex-1 h-8 text-sm rounded-md border border-border bg-background px-2 outline-none"
              />
              <Button type="button" size="sm" onClick={createChannel} className="h-8">Create</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(""); }} className="h-8">Cancel</Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm text-primary hover:bg-primary/5"
            >
              <Plus className="w-3.5 h-3.5 flex-shrink-0" />
              New channel…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MeetingDialogue({
  dialogue = [],
  onChange,
  alters = [],
  defaultSpeakerId = null,
  onAddParticipants,
  // Storage controls (lifted to SystemCheckIn so the meeting record persists them):
  storageMode = "meeting",       // "meeting" | "channel"
  storageChannelId = null,
  onStorageChange,               // ({ mode, channelId }) => void
}) {
  const terms = useTerms();
  const qc = useQueryClient();

  const meetingMessages = useMemo(() => normalizeDialogue(dialogue), [dialogue]);

  const { data: channels = [] } = useQuery({
    queryKey: ["systemChatChannels"],
    queryFn: () => localEntities.SystemChatChannel.list(),
  });

  // When saving to a channel, the live message list is that channel's real
  // SystemChatMessage rows.
  const { data: channelRows = [] } = useQuery({
    queryKey: ["systemChatMessages", storageChannelId],
    queryFn: () => localEntities.SystemChatMessage.filter({ channel_id: storageChannelId }),
    enabled: storageMode === "channel" && !!storageChannelId,
  });
  const channelMessages = useMemo(
    () => [...channelRows]
      .filter((m) => !m.thread_parent_id)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
    [channelRows]
  );

  const usingChannel = storageMode === "channel" && !!storageChannelId;
  const channel = usingChannel ? channels.find((c) => c.id === storageChannelId) : null;
  const messages = usingChannel ? channelMessages : meetingMessages;

  // ── Send / edit / delete ───────────────────────────────────────────────────
  // ChatSurface hands back a fully-resolved payload (signposts/whispers/mentions
  // already parsed). We persist it to whichever backend is selected.

  const pullInParticipants = (payload) => {
    const touched = [...new Set([
      ...(payload.authorAlterIds || []),
      ...(payload.whisperRecipientIds || []),
      ...(payload.mentionedIds || []),
    ])].filter(Boolean);
    if (touched.length > 0) onAddParticipants?.(touched);
  };

  const handleSendMeeting = async (payload) => {
    const entry = {
      id: `dlg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      content: payload.cleanText,
      author_alter_id: payload.authorAlterIds[0] || null,
      author_alter_ids: payload.authorAlterIds,
      timestamp: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      reply_to_id: payload.replyToId || null,
      mentioned_alter_ids: payload.mentionedIds || [],
      is_whisper: !!payload.isWhisper,
      whisper_to_ids: payload.isWhisper ? (payload.whisperRecipientIds || []) : [],
    };
    onChange([...meetingMessages.map(toStored), toStored(entry)]);
    pullInParticipants(payload);
  };

  const handleSendChannel = async (payload) => {
    const label = payload.isWhisper ? `#${channel?.name} (whisper)` : `#${channel?.name}`;
    const created = await localEntities.SystemChatMessage.create({
      channel_id: storageChannelId,
      author_alter_id: payload.authorAlterIds[0] || null,
      author_alter_ids: payload.authorAlterIds,
      content: payload.cleanText,
      timestamp: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      reply_to_id: payload.replyToId || null,
      mentioned_alter_ids: payload.mentionedIds || [],
      is_whisper: !!payload.isWhisper,
      whisper_to_ids: payload.isWhisper ? (payload.whisperRecipientIds || []) : [],
      reactions: {},
      thread_parent_id: null,
      is_pinned: false,
    });
    qc.invalidateQueries({ queryKey: ["systemChatMessages", storageChannelId] });
    try {
      for (const id of (payload.authorAlterIds.length > 0 ? payload.authorAlterIds : [null])) {
        await saveAuthoredLog({
          authorAlterId: id,
          sourceType: "chat",
          sourceId: created.id,
          sourceLabel: label,
          navigatePath: `/chat?channel=${storageChannelId}&message=${created.id}`,
          previewText: payload.cleanText,
        });
      }
      if (payload.isWhisper) {
        for (const id of (payload.mentionedIds || [])) {
          await base44.entities.MentionLog.create({
            mentioned_alter_id: id,
            author_alter_id: payload.authorAlterIds[0] || null,
            log_type: "mention",
            source_type: "chat",
            source_id: created.id,
            source_label: label,
            source_date: new Date().toISOString(),
            preview_text: payload.cleanText.slice(0, 120),
            navigate_path: `/chat?channel=${storageChannelId}&message=${created.id}`,
          });
        }
      } else {
        await saveMentions({
          content: payload.cleanText,
          alters,
          sourceType: "chat",
          sourceId: created.id,
          sourceLabel: label,
          navigatePath: `/chat?channel=${storageChannelId}&message=${created.id}`,
          authorAlterId: payload.authorAlterIds[0] || null,
        });
      }
    } catch { /* mention log best-effort */ }
    pullInParticipants(payload);
  };

  const handleEditMeeting = async (msg, { cleanText, authorAlterIds, mentionedIds }) => {
    onChange(meetingMessages.map((m) => (m.id === msg.id
      ? toStored({ ...m, content: cleanText, author_alter_id: authorAlterIds[0] || null, author_alter_ids: authorAlterIds, mentioned_alter_ids: mentionedIds, edited_at: new Date().toISOString() })
      : toStored(m))));
  };

  const handleEditChannel = async (msg, { cleanText, authorAlterIds, mentionedIds }) => {
    await localEntities.SystemChatMessage.update(msg.id, {
      content: cleanText,
      author_alter_id: authorAlterIds[0] || null,
      author_alter_ids: authorAlterIds,
      edited_at: new Date().toISOString(),
      mentioned_alter_ids: mentionedIds,
    });
    qc.invalidateQueries({ queryKey: ["systemChatMessages", storageChannelId] });
  };

  const handleDeleteMeeting = async (msg) => {
    if (!window.confirm("Delete this message from the dialogue?")) return;
    // Soft-delete so reply quotes still resolve, mirroring System Chat.
    onChange(meetingMessages.map((m) => (m.id === msg.id
      ? toStored({ ...m, content: "", deleted_at: new Date().toISOString() })
      : toStored(m))));
  };

  const handleDeleteChannel = async (msg) => {
    if (!window.confirm("Delete this message?")) return;
    await localEntities.SystemChatMessage.update(msg.id, {
      content: "",
      deleted_at: new Date().toISOString(),
    });
    qc.invalidateQueries({ queryKey: ["systemChatMessages", storageChannelId] });
  };

  const channelMissing = usingChannel && !channel;

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        <p className="text-sm font-medium">Open dialogue</p>
        <span className="text-[0.6875rem] text-muted-foreground">
          · {usingChannel ? `saving to #${channel?.name || "…"}` : "stays with this meeting"}
        </span>
      </div>

      {onStorageChange && (
        <div className="px-2 pt-2">
          <StorageTargetPicker
            value={storageMode}
            channelId={storageChannelId}
            onChange={onStorageChange}
            terms={terms}
          />
        </div>
      )}

      {channelMissing ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground italic">
          That channel no longer exists — pick another above, or switch back to "Just this meeting".
        </p>
      ) : (
        <ChatSurface
          messages={messages}
          alters={alters}
          defaultAuthorId={defaultSpeakerId}
          onSend={usingChannel ? handleSendChannel : handleSendMeeting}
          onEdit={usingChannel ? handleEditChannel : handleEditMeeting}
          onDelete={usingChannel ? handleDeleteChannel : handleDeleteMeeting}
          showReply={usingChannel}
          channelLabel={usingChannel ? `#${channel?.name}` : ""}
          composerPlaceholder={`Speak…  (@ mention · - signpost · /w @name [secret] to whisper)`}
          streamClassName="max-h-72 overflow-y-auto overscroll-contain px-2 py-2 space-y-4"
          emptyState={(
            <p className="text-center text-xs text-muted-foreground italic py-6">
              A private space for {terms.alters} to talk things through — with @ mentions, - signposts and /w @name whispers, just like {terms.System} Chat.
              {usingChannel
                ? ` These save to #${channel?.name}.`
                : ` Nothing here is saved to ${terms.System} Chat.`}
            </p>
          )}
        />
      )}
    </div>
  );
}
