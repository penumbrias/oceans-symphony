import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44, localEntities } from "@/api/base44Client";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import { Hash, Plus, Send, Pencil, Trash2, Reply, X, Check, MessageSquare, ChevronLeft, User, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTerms } from "@/lib/useTerms";
import { extractMentionedIds, saveMentions, saveAuthoredLog } from "@/lib/mentionUtils";
import { parseAndStripSignposts, SYSTEM_SENTINEL_ID } from "@/lib/signpostAuthors";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { adjustForContrast, getPageBackground } from "@/lib/contrast";
import { useAlterLabel } from "@/lib/useAlterLabel";

// Brighten / darken alter colours that are too close to the page
// background so the name text stays legible. Memoise the page bg
// resolution so each render doesn't re-read CSS variables.
function useReadableColor(color) {
  const bg = useMemo(() => getPageBackground(), []);
  return useMemo(() => (color ? adjustForContrast(color, bg) : color), [color, bg]);
}

// System Chat — Discord-style multi-channel chat for the system.
//
// Per CLAUDE.md: chat content is NOT included in therapy reports.
// Only aggregate counts per alter may be opted into in a future
// builder option.
//
// Entities (auto-created via the localEntities Proxy):
//   SystemChatChannel { name, description, color, created_date,
//                       sort_order, is_archived }
//   SystemChatMessage { channel_id, author_alter_id, content,
//                       timestamp, edited_at, deleted_at,
//                       reply_to_id, mentioned_alter_ids,
//                       reactions (Phase 2), thread_parent_id
//                       (Phase 2), is_pinned (Phase 2) }
//
// Phase 1 ships channels CRUD, send / edit / delete own messages,
// reply-quote inline, @mentions wired into the existing mention
// log, day grouping, alter signpost on each message. Reactions,
// threads, pinned messages, and the therapy-report aggregate are
// follow-ups; the schema already reserves the fields so they can
// land additively.

const SYSTEM_AUTHOR = { id: SYSTEM_SENTINEL_ID, name: "System", color: "#94a3b8" };

function authorFor(alterId, alters) {
  if (!alterId || alterId === SYSTEM_AUTHOR.id) return SYSTEM_AUTHOR;
  return alters.find((a) => a.id === alterId) || { id: alterId, name: "Unknown", color: "#94a3b8" };
}

// Read a message's authors as an array regardless of whether the
// record uses the new author_alter_ids array or the legacy single
// author_alter_id field. Empty result = message is system-attributed.
function authorsFor(msg, alters) {
  if (Array.isArray(msg.author_alter_ids) && msg.author_alter_ids.length > 0) {
    return msg.author_alter_ids.map((id) => authorFor(id, alters));
  }
  if (msg.author_alter_id) return [authorFor(msg.author_alter_id, alters)];
  return [SYSTEM_AUTHOR];
}

function AlterAvatar({ alter, size = 28 }) {
  const url = useResolvedAvatarUrl(alter?.avatar_url);
  const [err, setErr] = useState(false);
  const px = `${size}px`;
  return (
    <div
      className="rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30 text-white"
      style={{ width: px, height: px, backgroundColor: alter?.color || "hsl(var(--muted))", fontSize: Math.max(10, Math.floor(size * 0.4)) }}
      title={alter?.name}
    >
      {url && !err
        ? <img src={url} alt={alter?.name || ""} className="w-full h-full object-cover" onError={() => setErr(true)} />
        : alter?.id === SYSTEM_AUTHOR.id
          ? <User style={{ width: size * 0.5, height: size * 0.5 }} />
          : <span className="font-semibold">{(alter?.name || "?").slice(0, 1).toUpperCase()}</span>}
    </div>
  );
}

// Stacked avatars for multi-author messages. Slight overlap so the
// row stays compact when alters co-speak.
function AuthorAvatars({ authors, size = 28 }) {
  if (!authors || authors.length === 0) return <AlterAvatar alter={SYSTEM_AUTHOR} size={size} />;
  if (authors.length === 1) return <AlterAvatar alter={authors[0]} size={size} />;
  const overlap = Math.round(size * 0.35);
  return (
    <div className="flex flex-shrink-0" style={{ width: size + (authors.length - 1) * (size - overlap), height: size }}>
      {authors.map((a, i) => (
        <div key={a.id || i} style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: authors.length - i }}>
          <AlterAvatar alter={a} size={size} />
        </div>
      ))}
    </div>
  );
}

function dayHeader(d) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
}

export default function Chat() {
  const terms = useTerms();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: channels = [] } = useQuery({
    queryKey: ["systemChatChannels"],
    queryFn: () => localEntities.SystemChatChannel.list(),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: activeFront = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });

  // Auto-create a default #general channel on first visit so the
  // page isn't empty. Idempotent: only fires when both channels
  // and unlocked store are empty.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current) return;
    if (channels.length === 0) {
      bootstrappedRef.current = true;
      (async () => {
        try {
          await localEntities.SystemChatChannel.create({
            name: "general",
            description: `Where ${terms.alters || "alters"} talk to each other.`,
            sort_order: 0,
            is_archived: false,
            created_date: new Date().toISOString(),
          });
          qc.invalidateQueries({ queryKey: ["systemChatChannels"] });
        } catch (err) {
          toast.error(err?.message || "Couldn't create the default channel");
        }
      })();
    } else {
      bootstrappedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.length]);

  const sortedChannels = useMemo(
    () => [...channels]
      .filter((c) => !c.is_archived)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.created_date || "").localeCompare(b.created_date || "")),
    [channels]
  );

  const urlChannelId = searchParams.get("channel");
  const activeChannel = useMemo(() => {
    if (urlChannelId) {
      const match = sortedChannels.find((c) => c.id === urlChannelId);
      if (match) return match;
    }
    return sortedChannels[0] || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedChannels, urlChannelId]);

  useEffect(() => {
    if (activeChannel && activeChannel.id !== urlChannelId) {
      setSearchParams({ channel: activeChannel.id }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel?.id]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [showChannels, setShowChannels] = useState(true);

  // Default author for the composer: primary fronter, else first
  // active fronter, else first alter. User can pick another (or
  // -system) from the composer's signpost dropdown.
  const activeFronterIds = useMemo(() => {
    const ids = new Set();
    for (const s of activeFront) {
      if (s.alter_id) ids.add(s.alter_id);
      else if (s.primary_alter_id) ids.add(s.primary_alter_id);
      for (const id of s.co_fronter_ids || []) ids.add(id);
    }
    return [...ids];
  }, [activeFront]);
  const defaultAuthorId = useMemo(() => {
    const primary = activeFront.find((s) => s.is_primary && s.alter_id)?.alter_id
      || activeFront.find((s) => s.primary_alter_id)?.primary_alter_id;
    return primary || activeFronterIds[0] || alters[0]?.id || null;
  }, [activeFront, activeFronterIds, alters]);

  return (
    <div
      className="flex flex-col h-full min-h-[80vh]"
      style={{ paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
        <h1 className="text-lg font-semibold flex items-center gap-2 flex-1 min-w-0">
          <MessageSquare className="w-5 h-5 text-primary flex-shrink-0" />
          <span className="truncate">{terms.System || "System"} Chat</span>
        </h1>
        <Button variant="ghost" size="sm" onClick={() => setShowChannels((v) => !v)} className="lg:hidden">
          <Hash className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Channels rail */}
        <aside className={`${showChannels ? "flex" : "hidden"} lg:flex w-56 flex-shrink-0 border-r border-border/50 bg-muted/20 flex-col`}>
          <div className="p-2 border-b border-border/40 flex items-center justify-between">
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground px-2">Channels</p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              aria-label="New channel"
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto p-1 min-h-[6rem]">
            {sortedChannels.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => { setSearchParams({ channel: c.id }, { replace: true }); setShowChannels(false); }}
                  onContextMenu={(e) => { e.preventDefault(); setEditingChannel(c); }}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm group ${
                    activeChannel?.id === c.id
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <Hash className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate flex-1 text-left">{c.name}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setEditingChannel(c); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setEditingChannel(c); } }}
                    aria-label={`Edit ${c.name}`}
                    className="p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="w-3 h-3" />
                  </span>
                </button>
              </li>
            ))}
            {sortedChannels.length === 0 && (
              <li className="px-2 py-3 text-xs text-muted-foreground italic">No channels yet.</li>
            )}
          </ul>
        </aside>

        {/* Active channel */}
        <section className={`${showChannels ? "hidden" : "flex"} lg:flex flex-1 min-w-0 flex-col`}>
          {activeChannel ? (
            <ChannelView
              channel={activeChannel}
              alters={alters}
              defaultAuthorId={defaultAuthorId}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground italic px-6 text-center">
              Create a channel from the panel on the left to start chatting.
            </div>
          )}
        </section>
      </div>

      {createOpen && (
        <ChannelDialog
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={(record) => {
            setSearchParams({ channel: record.id }, { replace: true });
            qc.invalidateQueries({ queryKey: ["systemChatChannels"] });
            setCreateOpen(false);
          }}
        />
      )}
      {editingChannel && (
        <ChannelDialog
          mode="edit"
          channel={editingChannel}
          onClose={() => setEditingChannel(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["systemChatChannels"] });
            setEditingChannel(null);
          }}
          onDeleted={() => {
            qc.invalidateQueries({ queryKey: ["systemChatChannels"] });
            qc.invalidateQueries({ queryKey: ["systemChatMessages"] });
            if (activeChannel?.id === editingChannel.id) {
              setSearchParams({}, { replace: true });
            }
            setEditingChannel(null);
          }}
        />
      )}
    </div>
  );
}

function ChannelView({ channel, alters, defaultAuthorId }) {
  const qc = useQueryClient();
  const terms = useTerms();
  const streamRef = useRef(null);

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

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const m of messages) {
      const d = new Date(m.timestamp);
      const key = format(d, "yyyy-MM-dd");
      if (!groups.has(key)) groups.set(key, { key, date: d, items: [] });
      groups.get(key).items.push(m);
    }
    return [...groups.values()];
  }, [messages]);

  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);

  // Resolves the final speaker set + cleaned text for a send/edit.
  // Inline `-system` / `-aliasname` signposts in the typed body
  // OVERRIDE the picker selection — signposting is the more explicit
  // gesture, matches how it works in bulletins / journals. The
  // signpost tokens are stripped from the stored content. The picker
  // is the default for messages without signposts.
  const resolveAuthors = (content, pickerIds) => {
    const { authors: signposted, cleanText } = parseAndStripSignposts(content, alters, [terms.system]);
    if (signposted.length === 0) {
      return { cleanText: (content || "").trim(), authorAlterIds: pickerIds.filter((id) => id && id !== SYSTEM_AUTHOR.id) };
    }
    const ids = signposted
      .filter((a) => a.id !== SYSTEM_AUTHOR.id)
      .map((a) => a.id);
    return { cleanText: cleanText.trim(), authorAlterIds: ids };
  };

  const handleSend = async ({ content, speakerIds, notifyOnReply }) => {
    const { cleanText, authorAlterIds } = resolveAuthors(content, speakerIds);
    if (!cleanText) return;
    const mentionedIds = extractMentionedIds(cleanText, alters);
    // When replying with the "@ ON" toggle, treat every alter the
    // reply targets as a mention so they get a notification (the
    // signposted reply preview makes it obvious who's being
    // pinged). Discord-style behaviour. Skip when the toggle is
    // off, or when there's no reply, or when the same alter is
    // also the message author (don't notify yourself).
    const replyAuthorIds = replyTo && notifyOnReply
      ? (Array.isArray(replyTo.author_alter_ids) && replyTo.author_alter_ids.length > 0
          ? replyTo.author_alter_ids
          : (replyTo.author_alter_id ? [replyTo.author_alter_id] : []))
        .filter((id) => id && !authorAlterIds.includes(id))
      : [];
    const allMentionedIds = [...new Set([...mentionedIds, ...replyAuthorIds])];
    const created = await localEntities.SystemChatMessage.create({
      channel_id: channel.id,
      author_alter_id: authorAlterIds[0] || null,
      author_alter_ids: authorAlterIds,
      content: cleanText,
      timestamp: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      reply_to_id: replyTo?.id || null,
      mentioned_alter_ids: allMentionedIds,
      reactions: {},
      thread_parent_id: null,
      is_pinned: false,
    });
    qc.invalidateQueries({ queryKey: ["systemChatMessages", channel.id] });
    setReplyTo(null);
    try {
      // Log an authored row for each speaker so all of them show up
      // in the per-alter mention log; "system" co-speakers have no
      // alter id and just skip the log.
      for (const id of (authorAlterIds.length > 0 ? authorAlterIds : [null])) {
        await saveAuthoredLog({
          authorAlterId: id,
          sourceType: "chat",
          sourceId: created.id,
          sourceLabel: `#${channel.name}`,
          navigatePath: `/chat?channel=${channel.id}`,
          previewText: cleanText,
        });
      }
      await saveMentions({
        content: cleanText,
        alters,
        sourceType: "chat",
        sourceId: created.id,
        sourceLabel: `#${channel.name}`,
        navigatePath: `/chat?channel=${channel.id}`,
        authorAlterId: authorAlterIds[0] || null,
      });
      // Reply-notify rows: when "@ ON" was set on the reply chip,
      // log a mention for each replied-to alter that wasn't
      // already @mentioned in the body, so they show up in
      // notifications even if the author didn't type @name.
      for (const id of replyAuthorIds) {
        if (mentionedIds.includes(id)) continue;
        try {
          await base44.entities.MentionLog.create({
            mentioned_alter_id: id,
            author_alter_id: authorAlterIds[0] || null,
            log_type: "mention",
            source_type: "chat",
            source_id: created.id,
            source_label: `#${channel.name}`,
            source_date: new Date().toISOString(),
            preview_text: cleanText.slice(0, 120),
            navigate_path: `/chat?channel=${channel.id}`,
          });
        } catch { /* non-fatal */ }
      }
    } catch { /* mention log is best-effort; don't block send */ }
  };

  const handleEdit = async (msg, nextContent) => {
    const trimmed = (nextContent || "").trim();
    if (!trimmed || trimmed === msg.content) { setEditing(null); return; }
    // On edit, keep the existing author set unless the user typed new
    // signposts in the edited body. resolveAuthors with the existing
    // ids as the "picker" baseline gives that behaviour for free.
    const existingIds = Array.isArray(msg.author_alter_ids) && msg.author_alter_ids.length > 0
      ? msg.author_alter_ids
      : (msg.author_alter_id ? [msg.author_alter_id] : []);
    const { cleanText, authorAlterIds } = resolveAuthors(trimmed, existingIds);
    if (!cleanText) { setEditing(null); return; }
    await localEntities.SystemChatMessage.update(msg.id, {
      content: cleanText,
      author_alter_id: authorAlterIds[0] || null,
      author_alter_ids: authorAlterIds,
      edited_at: new Date().toISOString(),
      mentioned_alter_ids: extractMentionedIds(cleanText, alters),
    });
    qc.invalidateQueries({ queryKey: ["systemChatMessages", channel.id] });
    setEditing(null);
  };

  // Soft-delete so reply-quotes still resolve to a placeholder
  // ("[message deleted]") instead of breaking the layout.
  const handleDelete = async (msg) => {
    if (!window.confirm("Delete this message?")) return;
    await localEntities.SystemChatMessage.update(msg.id, {
      content: "",
      deleted_at: new Date().toISOString(),
    });
    qc.invalidateQueries({ queryKey: ["systemChatMessages", channel.id] });
  };

  return (
    <>
      <div className="px-4 py-2 border-b border-border/40 flex items-center gap-2 flex-shrink-0">
        <Hash className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-medium truncate">{channel.name}</p>
        {channel.description && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <p className="text-xs text-muted-foreground truncate">{channel.description}</p>
          </>
        )}
      </div>

      <div ref={streamRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {grouped.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground italic mt-12">
            No messages yet. Say something below.
          </p>
        ) : grouped.map((g) => (
          <section key={g.key} className="space-y-1">
            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 h-px bg-border/40" />
              <span className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{dayHeader(g.date)}</span>
              <div className="flex-1 h-px bg-border/40" />
            </div>
            {g.items.map((m) => (
              <MessageRow
                key={m.id}
                msg={m}
                alters={alters}
                allMessages={rawMessages}
                editing={editing?.id === m.id}
                onStartEdit={() => setEditing(m)}
                onCancelEdit={() => setEditing(null)}
                onSubmitEdit={(content) => handleEdit(m, content)}
                onReply={() => setReplyTo(m)}
                onDelete={() => handleDelete(m)}
              />
            ))}
          </section>
        ))}
      </div>

      <Composer
        channel={channel}
        alters={alters}
        defaultAuthorId={defaultAuthorId}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={handleSend}
        terms={terms}
      />
    </>
  );
}

function MessageRow({ msg, alters, allMessages, editing, onStartEdit, onCancelEdit, onSubmitEdit, onReply, onDelete }) {
  const formatAlter = useAlterLabel();
  const authors = authorsFor(msg, alters);
  const parent = msg.reply_to_id ? allMessages.find((x) => x.id === msg.reply_to_id) : null;
  const parentAuthors = parent ? authorsFor(parent, alters) : [];
  const [draft, setDraft] = useState(msg.content || "");
  useEffect(() => { setDraft(msg.content || ""); }, [msg.content, editing]);

  const isDeleted = !!msg.deleted_at;
  const authorNames = authors.map((a) => formatAlter(a)).join(", ");
  const primaryColor = useReadableColor(authors[0]?.color);
  const parentColor = useReadableColor(parentAuthors[0]?.color);

  return (
    <div className="group flex gap-2 px-1 py-1 rounded-md hover:bg-muted/30">
      <AuthorAvatars authors={authors} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: primaryColor }}>{authorNames}</span>
          <span className="text-[0.6875rem] text-muted-foreground">{format(new Date(msg.timestamp), "h:mm a")}</span>
          {msg.edited_at && !isDeleted && (
            <span className="text-[0.6875rem] text-muted-foreground/70 italic">edited</span>
          )}
        </div>

        {parent && (
          <div className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground mb-1 pl-2 border-l-2 border-border/60 max-w-full truncate">
            <Reply className="w-3 h-3 flex-shrink-0" />
            <span className="font-medium truncate" style={{ color: parentColor }}>
              {parentAuthors.map((a) => formatAlter(a)).join(", ") || "Unknown"}
            </span>
            <span className="truncate">{parent.deleted_at ? "[deleted]" : (parent.content || "").slice(0, 80)}</span>
          </div>
        )}

        {editing ? (
          <div className="flex flex-col gap-1 mt-0.5">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmitEdit(draft); }
                if (e.key === "Escape") onCancelEdit();
              }}
              autoFocus
              rows={2}
              className="text-sm resize-none"
            />
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={onCancelEdit} className="h-7"><X className="w-3.5 h-3.5" /></Button>
              <Button size="sm" onClick={() => onSubmitEdit(draft)} className="h-7"><Check className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ) : (
          <p className={`text-sm whitespace-pre-wrap break-words ${isDeleted ? "italic text-muted-foreground" : ""}`}>
            {isDeleted ? "[message deleted]" : renderWithMentions(msg.content, alters)}
          </p>
        )}
      </div>

      {!editing && !isDeleted && (
        <div className="flex items-start gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onReply} aria-label="Reply" title="Reply" className="p-1 text-muted-foreground hover:text-foreground">
            <Reply className="w-3.5 h-3.5" />
          </button>
          <button onClick={onStartEdit} aria-label="Edit" title="Edit" className="p-1 text-muted-foreground hover:text-foreground">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} aria-label="Delete" title="Delete" className="p-1 text-muted-foreground hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// Render message content with @mentions highlighted. Simple split
// approach: look for "@<name>" / "@<alias>" tokens and replace with
// pill spans. Names with spaces are matched via a sorted-longest-
// first pass so "@first last" beats "@first".
function renderWithMentions(content, alters) {
  if (!content) return null;
  const names = [];
  for (const a of alters) {
    if (a.name) names.push({ raw: `@${a.name}`, color: a.color, id: a.id });
    if (a.alias) names.push({ raw: `@${a.alias}`, color: a.color, id: a.id });
  }
  names.sort((a, b) => b.raw.length - a.raw.length);
  const out = [];
  let i = 0;
  let key = 0;
  while (i < content.length) {
    let matched = null;
    if (content[i] === "@") {
      for (const n of names) {
        if (content.startsWith(n.raw, i)) { matched = n; break; }
      }
    }
    if (matched) {
      out.push(
        <MentionPill key={key++} label={matched.raw} color={matched.color} />
      );
      i += matched.raw.length;
      continue;
    }
    let next = content.indexOf("@", i + 1);
    if (next === -1) next = content.length;
    out.push(<React.Fragment key={key++}>{content.slice(i, next)}</React.Fragment>);
    i = next;
  }
  return out;
}

function MentionPill({ label, color }) {
  const fg = useReadableColor(color);
  return (
    <span
      className="inline px-1 rounded text-xs font-semibold"
      style={{ backgroundColor: `${color || "#9333ea"}33`, color: fg || undefined }}
    >
      {label}
    </span>
  );
}

function Composer({ channel, alters, defaultAuthorId, replyTo, onCancelReply, onSend, terms }) {
  const formatAlter = useAlterLabel();
  // Picker state: a set of speaker ids. SYSTEM_SENTINEL_ID means
  // "the system itself" is checked; otherwise entries are alter ids.
  // Empty set is treated as "-system" on send (no specific speakers).
  const [speakerIds, setSpeakerIds] = useState(() => defaultAuthorId ? [defaultAuthorId] : [SYSTEM_AUTHOR.id]);
  useEffect(() => {
    if (defaultAuthorId) setSpeakerIds([defaultAuthorId]);
  }, [defaultAuthorId]);

  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  // Reply-notify toggle (Discord's "@ ON / OFF" on the reply chip).
  // Defaults to ON each time a new reply target is selected so the
  // common case — replying TO someone wanting them to see it —
  // doesn't require an extra tap.
  const [notifyOnReply, setNotifyOnReply] = useState(true);
  useEffect(() => {
    if (replyTo) setNotifyOnReply(true);
  }, [replyTo?.id]);

  // Inline-autocomplete state, ported from BulletinComposer.
  const textareaRef = useRef(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [showSignpostMenu, setShowSignpostMenu] = useState(false);
  const [signpostQuery, setSignpostQuery] = useState("");

  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);

    // @ mention detection — open menu when a "@" starts a token at
    // the end of the typed string (no space follows the @ yet).
    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1 && !val.slice(lastAt + 1).includes(" ")) {
      setShowMentions(true);
      setMentionQuery(val.slice(lastAt + 1));
      setShowSignpostMenu(false);
      return;
    }
    setShowMentions(false);

    // - signpost detection — same logic, just for "-author" tokens.
    const lastDash = val.lastIndexOf("-");
    if (lastDash !== -1 && !val.slice(lastDash + 1).includes(" ")) {
      setShowSignpostMenu(true);
      setSignpostQuery(val.slice(lastDash + 1));
    } else if (!val.endsWith("-")) {
      setShowSignpostMenu(false);
    }
  };

  const filteredMentions = useMemo(
    () => alters
      .filter((a) => !a.is_archived)
      .filter((a) =>
        a.name?.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        (a.alias && a.alias.toLowerCase().includes(mentionQuery.toLowerCase()))
      )
      .slice(0, 8),
    [alters, mentionQuery]
  );
  const filteredSignposts = useMemo(
    () => alters
      .filter((a) => !a.is_archived)
      .filter((a) =>
        a.name?.toLowerCase().includes(signpostQuery.toLowerCase()) ||
        (a.alias && a.alias.toLowerCase().includes(signpostQuery.toLowerCase()))
      )
      .slice(0, 8),
    [alters, signpostQuery]
  );
  const systemSignpostMatches = useMemo(() => {
    const q = (signpostQuery || "").toLowerCase();
    if (!q) return true;
    return "system".startsWith(q) || (terms.system || "").toLowerCase().startsWith(q);
  }, [signpostQuery, terms.system]);

  const insertMention = (alter) => {
    const lastAt = text.lastIndexOf("@");
    const before = lastAt !== -1 ? text.slice(0, lastAt) : text;
    setText(before + `@${alter.alias || alter.name} `);
    setShowMentions(false);
    setMentionQuery("");
    textareaRef.current?.focus();
  };

  const insertSignpost = (alter) => {
    const lastDash = text.lastIndexOf("-");
    const before = lastDash !== -1 ? text.slice(0, lastDash) : text;
    const token = alter?.isSystem || alter?.id === SYSTEM_AUTHOR.id
      ? (terms.system || "system")
      : (alter.alias || alter.name);
    setText(before + `-${token} `);
    setShowSignpostMenu(false);
    setSignpostQuery("");
    textareaRef.current?.focus();
  };

  const selectedSet = useMemo(() => new Set(speakerIds), [speakerIds]);
  const toggleSpeaker = (id) => {
    setSpeakerIds((prev) => {
      const has = prev.includes(id);
      if (has) {
        // Don't allow an empty selection — fall back to -system so
        // there's always at least one resolvable speaker.
        const next = prev.filter((x) => x !== id);
        return next.length === 0 ? [SYSTEM_AUTHOR.id] : next;
      }
      // Picking an alter implicitly unchecks -system (mixing the
      // two has no useful semantic — system is the "no specific
      // alter" sentinel).
      const next = id === SYSTEM_AUTHOR.id
        ? [SYSTEM_AUTHOR.id]
        : [...prev.filter((x) => x !== SYSTEM_AUTHOR.id), id];
      return next;
    });
  };

  // Render the picker's compact button: stacked avatars + names.
  // If the typed text contains inline signposts (-system / -aliasname),
  // those override what the picker is showing — so the chip always
  // reflects what the message will *actually* be attributed to when
  // sent, not just what's checked in the picker. Falls back to the
  // picker selection (or -system) when no signposts are present.
  const selectedAuthors = useMemo(() => {
    const { authors: signposted } = parseAndStripSignposts(text, alters, [terms.system]);
    if (signposted.length > 0) {
      const sysOnly = signposted.every((a) => a.id === SYSTEM_AUTHOR.id);
      if (sysOnly) return [SYSTEM_AUTHOR];
      return signposted.filter((a) => a.id !== SYSTEM_AUTHOR.id).map((a) => authorFor(a.id, alters));
    }
    if (speakerIds.length === 0 || (speakerIds.length === 1 && speakerIds[0] === SYSTEM_AUTHOR.id)) {
      return [SYSTEM_AUTHOR];
    }
    return speakerIds
      .filter((id) => id !== SYSTEM_AUTHOR.id)
      .map((id) => authorFor(id, alters));
  }, [speakerIds, alters, text, terms.system]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    await onSend({ content: text, speakerIds, notifyOnReply });
    setText("");
  };

  const replyAuthors = replyTo ? authorsFor(replyTo, alters) : [];
  const replyColor = useReadableColor(replyAuthors[0]?.color);
  const speakerChipColor = useReadableColor(selectedAuthors[0]?.color);

  return (
    <div className="border-t border-border/50 p-2 flex-shrink-0 bg-background">
      {replyTo && (
        <div className="flex items-center gap-2 px-2 py-1 mb-1 text-xs bg-muted/40 rounded-md">
          <Reply className="w-3 h-3" />
          <span className="text-muted-foreground">Replying to</span>
          <span className="font-medium truncate" style={{ color: replyColor }}>
            {replyAuthors.map((a) => formatAlter(a)).join(", ")}
          </span>
          <span className="text-muted-foreground truncate flex-1">{(replyTo.content || "").slice(0, 60)}</span>
          <button
            type="button"
            onClick={() => setNotifyOnReply((v) => !v)}
            aria-pressed={notifyOnReply}
            title={notifyOnReply
              ? `Reply will mention ${replyAuthors.map((a) => formatAlter(a)).join(", ")} — tap to mute`
              : "Reply won't notify anyone — tap to enable mention"}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[0.625rem] font-semibold uppercase tracking-wide transition-colors ${
              notifyOnReply
                ? "bg-primary/15 text-primary hover:bg-primary/25"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
            }`}
          >
            @ {notifyOnReply ? "on" : "off"}
          </button>
          <button onClick={onCancelReply} aria-label="Cancel reply" className="p-0.5 text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <SpeakerPicker
          selectedAuthors={selectedAuthors}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          alters={alters}
          selectedSet={selectedSet}
          onToggle={toggleSpeaker}
          search={pickerSearch}
          onSearchChange={setPickerSearch}
          terms={terms}
        />
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowMentions(false);
                setShowSignpostMenu(false);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                if (showMentions || showSignpostMenu) {
                  // Let the autocomplete swallow Enter when a menu is
                  // open — pressing Enter with the menu visible should
                  // pick the first option rather than send.
                  e.preventDefault();
                  if (showMentions && filteredMentions[0]) insertMention(filteredMentions[0]);
                  else if (showSignpostMenu && systemSignpostMatches && !filteredSignposts[0]) insertSignpost({ id: SYSTEM_AUTHOR.id, isSystem: true });
                  else if (showSignpostMenu && filteredSignposts[0]) insertSignpost(filteredSignposts[0]);
                  return;
                }
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={`Message #${channel.name}…  (type @ to mention, - to signpost)`}
            rows={1}
            className="resize-none text-sm min-h-[40px] max-h-32"
          />

          {showMentions && filteredMentions.length > 0 && (
            <div className="absolute z-50 left-0 right-0 bottom-full mb-1 bg-popover border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
              <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b border-border/50">Mention…</div>
              {filteredMentions.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => insertMention(a)}
                  className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 text-left text-sm"
                >
                  <AlterAvatar alter={a} size={22} />
                  <span>{formatAlter(a)}</span>
                </button>
              ))}
            </div>
          )}

          {showSignpostMenu && (filteredSignposts.length > 0 || systemSignpostMatches) && (
            <div className="absolute z-50 left-0 right-0 bottom-full mb-1 bg-popover border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
              <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b border-border/50">Sign as author…</div>
              {systemSignpostMatches && (
                <button
                  type="button"
                  key={SYSTEM_AUTHOR.id}
                  onClick={() => insertSignpost({ id: SYSTEM_AUTHOR.id, isSystem: true })}
                  className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 text-left text-sm"
                >
                  <AlterAvatar alter={SYSTEM_AUTHOR} size={22} />
                  <span>—{terms.system || "system"}</span>
                  <span className="text-muted-foreground text-xs ml-1">(no specific {terms.alter || "alter"})</span>
                </button>
              )}
              {filteredSignposts.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => insertSignpost(a)}
                  className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 text-left text-sm"
                >
                  <AlterAvatar alter={a} size={22} />
                  <span>{formatAlter(a)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Button onClick={handleSubmit} disabled={!text.trim()} className="h-10 px-3">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Multi-select speaker picker styled to match the Journals "Filter by
// alter" popover: small trigger button (stacked avatars + names),
// popover with search, checkbox rows, Done button. "-system" sits at
// the top.
function SpeakerPicker({ selectedAuthors, open, onOpenChange, alters, selectedSet, onToggle, search, onSearchChange, terms }) {
  const formatAlter = useAlterLabel();
  const triggerRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240 });
  const chipColor = useReadableColor(selectedAuthors[0]?.color);

  useEffect(() => {
    if (!open) return;
    const t = triggerRef.current;
    if (!t) return;
    const rect = t.getBoundingClientRect();
    const width = Math.max(240, Math.min(320, window.innerWidth - 24));
    const top = Math.max(8, rect.top - 360); // popover above the composer
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
    setPos({ top, left, width });
  }, [open]);

  const sortedAlters = useMemo(
    () => [...alters]
      .filter((a) => !a.is_archived)
      .filter((a) => !search || (a.name || "").toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [alters, search]
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex items-center gap-1.5 px-1.5 py-1 rounded-md border border-border/50 bg-muted/20 hover:bg-muted/40 max-w-[10rem]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <AuthorAvatars authors={selectedAuthors} size={22} />
        <span className="text-[0.6875rem] truncate" style={{ color: chipColor }}>
          {selectedAuthors.map((a) => formatAlter(a)).join(", ")}
        </span>
        <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => onOpenChange(false)} />
          <div
            className="z-[61] bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, maxHeight: "70vh", display: "flex", flexDirection: "column" }}
          >
            <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between gap-2">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Choose speaker(s)
              </span>
            </div>
            <div className="px-3 py-2 border-b border-border/50">
              <input
                autoFocus
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={`Search ${terms.alters || "alters"}…`}
                className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: "50vh" }}>
              {/* -system pseudo-option always at top */}
              <SpeakerRow
                alter={SYSTEM_AUTHOR}
                selected={selectedSet.has(SYSTEM_AUTHOR.id)}
                onToggle={() => onToggle(SYSTEM_AUTHOR.id)}
                labelPrefix="—"
              />
              {sortedAlters.map((a) => (
                <SpeakerRow
                  key={a.id}
                  alter={a}
                  selected={selectedSet.has(a.id)}
                  onToggle={() => onToggle(a.id)}
                />
              ))}
            </div>
            <div className="px-3 py-2 border-t border-border/50 flex justify-end">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function SpeakerRow({ alter, selected, onToggle, labelPrefix = "" }) {
  const formatAlter = useAlterLabel();
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 ${selected ? "bg-primary/5" : ""}`}
    >
      <div
        className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: selected ? (alter.color || "#94a3b8") : "transparent",
          borderColor: selected ? (alter.color || "#94a3b8") : "hsl(var(--border))",
        }}
      >
        {selected && <Check className="w-3 h-3 text-white" />}
      </div>
      <AlterAvatar alter={alter} size={20} />
      <span className={`flex-1 truncate ${selected ? "text-foreground font-medium" : "text-muted-foreground"}`}>
        {labelPrefix}{alter.id === SYSTEM_AUTHOR.id ? alter.name : formatAlter(alter)}
      </span>
    </button>
  );
}

function ChannelDialog({ mode, channel, onClose, onSaved, onDeleted }) {
  const [name, setName] = useState(channel?.name || "");
  const [description, setDescription] = useState(channel?.description || "");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      if (mode === "create") {
        const record = await localEntities.SystemChatChannel.create({
          name: trimmed,
          description: description.trim() || null,
          sort_order: Date.now(),
          is_archived: false,
          created_date: new Date().toISOString(),
        });
        onSaved?.(record);
      } else {
        await localEntities.SystemChatChannel.update(channel.id, {
          name: trimmed,
          description: description.trim() || null,
        });
        onSaved?.();
      }
    } catch (err) {
      toast.error(err?.message || "Couldn't save the channel");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!channel) return;
    if (!window.confirm(`Delete #${channel.name} and every message in it? This cannot be undone.`)) return;
    setBusy(true);
    try {
      // Hard delete: nuke every message in the channel, then the
      // channel itself. The user explicitly confirmed.
      const msgs = await localEntities.SystemChatMessage.filter({ channel_id: channel.id });
      for (const m of msgs) {
        try { await localEntities.SystemChatMessage.delete(m.id); } catch { /* non-fatal */ }
      }
      await localEntities.SystemChatChannel.delete(channel.id);
      onDeleted?.();
    } catch (err) {
      toast.error(err?.message || "Couldn't delete the channel");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New channel" : `Edit #${channel?.name}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))}
              placeholder="general"
              autoFocus
              maxLength={32}
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Description <span className="text-muted-foreground">(optional)</span></label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="what this channel is for"
              maxLength={120}
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            {mode === "edit" && (
              <Button variant="ghost" onClick={handleDelete} disabled={busy} className="text-destructive hover:text-destructive mr-auto">
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name.trim() || busy}>
              {mode === "create" ? "Create" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
