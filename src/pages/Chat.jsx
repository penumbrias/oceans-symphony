import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44, localEntities } from "@/api/base44Client";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import { Hash, Plus, Send, Pencil, Trash2, Reply, X, Check, MessageSquare, User, ChevronDown, ChevronUp, ChevronRight, ImagePlus, Loader2, Lock, Folder, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTerms } from "@/lib/useTerms";
import { extractMentionedIds, saveMentions, saveAuthoredLog } from "@/lib/mentionUtils";
import { parseAndStripSignposts, SYSTEM_SENTINEL_ID } from "@/lib/signpostAuthors";
import { buildChatTree, eligibleChatParents, chatCategoriesById, chatCategoryDepth, migrateLegacyChatCategories, CHAT_CATEGORY_MAX_DEPTH } from "@/lib/chatCategories";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { adjustForContrast, getPageBackground } from "@/lib/contrast";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { MiniToolbar, ColorPickerModal } from "@/components/shared/MiniToolbar";
import RichMentionInput from "@/components/shared/RichMentionInput";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { CSS } from "@dnd-kit/utilities";
import { processUploadedImage, saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { isLocalMode } from "@/lib/storageMode";
import { getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";
import { renderRichContent } from "@/lib/renderBulletinContent";
import { AssetButton } from "@/components/shared/AssetPickerModal";

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

// Whisper command: "/w" or "/whisper" at the very start of a message.
const WHISPER_RE = /^\/(?:w|whisper)\b[ \t]*/i;
const WORD_CH = /[\p{L}\p{N}_]/u;

// Peel leading "@Name" tokens off the front of `text`, returning the
// recipient alter ids and the remaining body. Longest-name-first so
// "@First Last" beats "@First". Used to parse "/w @Hex @Kyo message".
function peelLeadingMentions(text, alters) {
  const tokens = [];
  for (const a of alters) {
    if (a.name) tokens.push({ token: `@${a.name}`, id: a.id });
    if (a.alias) tokens.push({ token: `@${a.alias}`, id: a.id });
  }
  tokens.sort((x, y) => y.token.length - x.token.length);
  let rest = (text || "").replace(/^\s+/, "");
  const ids = new Set();
  let matched = true;
  while (matched) {
    matched = false;
    for (const t of tokens) {
      if (rest.startsWith(t.token)) {
        const after = rest[t.token.length];
        if (!after || !WORD_CH.test(after)) {
          ids.add(t.id);
          rest = rest.slice(t.token.length).replace(/^[\s,]+/, "");
          matched = true;
          break;
        }
      }
    }
  }
  return { recipientIds: [...ids], body: rest };
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

  const { data: channels = [], isSuccess: channelsLoaded } = useQuery({
    queryKey: ["systemChatChannels"],
    queryFn: () => localEntities.SystemChatChannel.list(),
  });
  const { data: categories = [], isSuccess: categoriesLoaded } = useQuery({
    queryKey: ["systemChatCategories"],
    queryFn: () => localEntities.SystemChatCategory.list(),
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
  // page isn't empty. CRITICAL: only seed once the query has actually
  // RESOLVED (channelsLoaded). useQuery returns [] while still
  // loading, so the old `channels.length === 0` check fired on a cold
  // cache (app restart / navigating back to Chat) BEFORE the existing
  // channels loaded — spawning a duplicate "general" every time. The
  // per-mount bootstrappedRef didn't help across mounts. Belt-and-
  // braces: also bail if any non-archived "general" already exists.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current) return;
    if (!channelsLoaded) return; // wait for the real data
    bootstrappedRef.current = true;
    const hasGeneral = channels.some(
      (c) => !c.is_archived && (c.name || "").trim().toLowerCase() === "general"
    );
    if (channels.length === 0 && !hasGeneral) {
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelsLoaded, channels.length]);

  // One-time, non-destructive migration of legacy string categories into real
  // SystemChatCategory entities so existing setups become editable trees.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current || !channelsLoaded || !categoriesLoaded) return;
    migratedRef.current = true;
    (async () => {
      const created = await migrateLegacyChatCategories(localEntities, channels, categories);
      if (created > 0) {
        qc.invalidateQueries({ queryKey: ["systemChatCategories"] });
        qc.invalidateQueries({ queryKey: ["systemChatChannels"] });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelsLoaded, categoriesLoaded]);

  const sortedChannels = useMemo(
    () => [...channels]
      .filter((c) => !c.is_archived)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.created_date || "").localeCompare(b.created_date || "")),
    [channels]
  );

  // Private (Direct Message) channels are pulled out of the category tree and
  // listed under their own "Direct Messages" heading (see DM section below).
  const privateChannels = useMemo(() => sortedChannels.filter((c) => c.is_private), [sortedChannels]);

  // The nested category tree for the sidebar: { rootNodes, uncategorized }.
  const tree = useMemo(() => buildChatTree(categories, channels), [categories, channels]);

  // Collapse / expand a category (persisted on the entity).
  const toggleCollapse = async (cat) => {
    try {
      await localEntities.SystemChatCategory.update(cat.id, { collapsed: !cat.collapsed });
      qc.invalidateQueries({ queryKey: ["systemChatCategories"] });
    } catch (err) {
      toast.error(err?.message || "Couldn't update");
    }
  };

  // Drag-to-reorder (edit mode). A drag only reorders WITHIN a sibling list
  // (categories among same-parent categories; channels among same-category
  // channels) — cross-category moves are done via the channel's edit dialog.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  const persistOrder = async (entityName, idsInOrder) => {
    await Promise.all(idsInOrder.map((id, i) => localEntities[entityName].update(id, { sort_order: i })));
  };
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const orderOf = (arr) => [...arr].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((x) => x.id);
    const activeCat = categories.find((c) => c.id === active.id);
    if (activeCat) {
      const siblings = categories.filter((c) => (c.parent_category_id || null) === (activeCat.parent_category_id || null));
      const ids = orderOf(siblings);
      const from = ids.indexOf(active.id), to = ids.indexOf(over.id);
      if (from === -1 || to === -1) return; // dropped onto a different list — ignore
      try { await persistOrder("SystemChatCategory", arrayMove(ids, from, to)); qc.invalidateQueries({ queryKey: ["systemChatCategories"] }); }
      catch (err) { toast.error(err?.message || "Couldn't reorder"); }
      return;
    }
    const activeChan = channels.find((c) => c.id === active.id);
    if (activeChan) {
      const key = activeChan.category_id || null;
      const siblings = channels.filter((c) => !c.is_archived && !c.is_private && (c.category_id || null) === key);
      const ids = orderOf(siblings);
      const from = ids.indexOf(active.id), to = ids.indexOf(over.id);
      if (from === -1 || to === -1) return;
      try { await persistOrder("SystemChatChannel", arrayMove(ids, from, to)); qc.invalidateQueries({ queryKey: ["systemChatChannels"] }); }
      catch (err) { toast.error(err?.message || "Couldn't reorder"); }
    }
  };

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
  const [editingCategory, setEditingCategory] = useState(null);
  // On desktop the rail is always shown (forced by the `lg:` classes), so this
  // state only drives the mobile drawer — start it closed there so we land in
  // the chat, with the channels a tap away on the left.
  const [showChannels, setShowChannels] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const [editMode, setEditMode] = useState(false);
  // Private channels the user has chosen to "view anyway" this session
  // (granted access even though no member is currently fronting).
  const [revealedPrivate, setRevealedPrivate] = useState(() => new Set());

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

  // ── Private-channel access gate ──────────────────────────────────────────
  // A private channel is visible (name shown, opens freely) when one of its
  // members is currently fronting, OR the user already chose "view anyway"
  // this session. Otherwise its name is censored in the sidebar and opening
  // it asks for confirmation first — a privacy safeguard for systems sharing
  // a device (e.g. keeping an adult channel out of a little's view).
  const frontSet = useMemo(() => new Set(activeFronterIds), [activeFronterIds]);
  const privateUnlocked = (c) => (c.member_alter_ids || []).some((id) => frontSet.has(id));
  const privateVisible = (c) => !c?.is_private || privateUnlocked(c) || revealedPrivate.has(c.id);
  const privateMemberNames = (c) => (c.member_alter_ids || [])
    .map((id) => { const a = alters.find((x) => x.id === id); return a ? (a.alias || a.name) : null; })
    .filter(Boolean).join(", ");
  const revealPrivate = (c) => setRevealedPrivate((prev) => new Set(prev).add(c.id));
  const openPrivate = (c) => {
    if (privateVisible(c)) {
      setSearchParams({ channel: c.id }, { replace: true });
      setShowChannels(false);
      return;
    }
    const who = privateMemberNames(c) || `specific ${terms.alters || "alters"}`;
    if (window.confirm(`This channel is private to ${who}. View anyway?`)) {
      revealPrivate(c);
      setSearchParams({ channel: c.id }, { replace: true });
      setShowChannels(false);
    }
  };

  return (
    // Fill the scroll container exactly — `.app-content-main` already
    // reserves space for the fixed bottom nav (and the safe-area) via its
    // mobile `padding-bottom`, so the chat shell just needs `h-full` to sit
    // flush in the visible area. Previously this also set its own
    // `minHeight: 100dvh - header` AND a second `paddingBottom` for the nav,
    // double-counting the reserved space — that overflow was the empty gap
    // that appeared below the channel list / composer until you scrolled.
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2 py-2 border-b border-border/50 flex items-center gap-1.5 flex-shrink-0">
        {/* Channels toggle — on the LEFT, where the sidebar slides in from. */}
        <Button variant="ghost" size="sm" onClick={() => setShowChannels((v) => !v)} className="lg:hidden flex-shrink-0 px-2" aria-label="Channels">
          <PanelLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-base font-semibold flex items-center gap-2 flex-1 min-w-0">
          <MessageSquare className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="truncate">{terms.System || "System"} Chat</span>
        </h1>
      </div>

      <div className="flex-1 min-h-0 flex relative">
        {/* Dim + close the drawer when tapping the chat behind it (mobile). */}
        {showChannels && (
          <div className="absolute inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setShowChannels(false)} aria-hidden />
        )}
        {/* Channels rail — a persistent rail on desktop, a slide-in drawer that
            OVERLAYS the chat (rather than replacing it) on mobile. */}
        <aside className={`w-64 lg:w-56 flex-shrink-0 border-r border-border/50 bg-muted/20 flex flex-col
          absolute inset-y-0 left-0 z-40 shadow-xl transition-transform duration-200
          ${showChannels ? "translate-x-0" : "-translate-x-full"}
          lg:static lg:translate-x-0 lg:z-auto lg:shadow-none`}>
          <div className="p-2 border-b border-border/40 flex items-center justify-between gap-1">
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground px-2">Channels</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                aria-label={editMode ? "Done editing" : "Edit channels"}
                title={editMode ? "Done — tap to stop editing" : "Edit: drag to reorder, tap to edit"}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${editMode ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}
              >
                {editMode ? "Done" : "Edit"}
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                aria-label="New channel or category"
                title="New channel or category"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          {editMode && (
            <p className="px-3 py-1 text-[0.625rem] text-muted-foreground bg-muted/20 border-b border-border/30">
              Drag the ⠿ handle to reorder within a group · tap a row to edit it.
            </p>
          )}
          <div className="flex-1 overflow-y-auto p-1 min-h-[6rem]">
            {(() => {
              const onOpen = (c) => { setSearchParams({ channel: c.id }, { replace: true }); setShowChannels(false); };
              const rootCatIds = tree.rootNodes.map((n) => n.category.id);
              const uncatIds = tree.uncategorized.map((c) => c.id);
              return (
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={rootCatIds} strategy={verticalListSortingStrategy}>
                    {tree.rootNodes.map((node) => (
                      <ChatCategoryNode
                        key={node.category.id}
                        node={node}
                        depth={0}
                        activeId={activeChannel?.id}
                        editMode={editMode}
                        onOpen={onOpen}
                        onEditChannel={setEditingChannel}
                        onEditCategory={setEditingCategory}
                        onToggleCollapse={toggleCollapse}
                      />
                    ))}
                  </SortableContext>
                  {tree.uncategorized.length > 0 && (
                    <SortableContext items={uncatIds} strategy={verticalListSortingStrategy}>
                      <ul className="mb-1.5">
                        {tree.uncategorized.map((c) => (
                          <li key={c.id}>
                            <ChatChannelRow channel={c} activeId={activeChannel?.id} indent={0} editMode={editMode}
                              onOpen={onOpen} onEdit={setEditingChannel} />
                          </li>
                        ))}
                      </ul>
                    </SortableContext>
                  )}
                </DndContext>
              );
            })()}
            {privateChannels.length > 0 && (
              <div className="mb-1.5 last:mb-0">
                <div className="px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Direct Messages
                </div>
                <ul>
                  {privateChannels.map((c) => {
                    const visible = privateVisible(c);
                    return (
                      <li key={c.id}>
                        <div
                          className={`w-full flex items-center gap-1 pr-1 rounded-md text-sm group ${
                            activeChannel?.id === c.id
                              ? "bg-primary/15 text-foreground"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => openPrivate(c)}
                            onContextMenu={(e) => { e.preventDefault(); if (visible) setEditingChannel(c); }}
                            className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 text-left"
                          >
                            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                            {visible ? (
                              <span className="truncate flex-1">{c.name}</span>
                            ) : (
                              <span className="truncate flex-1 italic select-none text-muted-foreground/70" style={{ filter: "blur(4px)" }} aria-label="Private channel — hidden">{c.name || "Private"}</span>
                            )}
                          </button>
                          {visible && (
                            <button
                              type="button"
                              onClick={() => setEditingChannel(c)}
                              aria-label={`Edit ${c.name}`}
                              className="p-0.5 text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {sortedChannels.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground italic">No channels yet.</p>
            )}
          </div>
        </aside>

        {/* Active channel */}
        <section className="flex flex-1 min-w-0 flex-col">
          {!activeChannel ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground italic px-6 text-center">
              Create a channel from the panel on the left to start chatting.
            </div>
          ) : (activeChannel.is_private && !privateVisible(activeChannel)) ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
              <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center">
                <Lock className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">This channel is private to {privateMemberNames(activeChannel) || `specific ${terms.alters || "alters"}`}.</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                It's hidden because none of those {terms.alters || "alters"} are currently {terms.fronting || "fronting"}.
              </p>
              <Button size="sm" onClick={() => revealPrivate(activeChannel)}>View anyway</Button>
            </div>
          ) : (
            <ChannelView
              channel={activeChannel}
              alters={alters}
              defaultAuthorId={defaultAuthorId}
              frontingAlterIds={activeFronterIds}
              focusMessageId={searchParams.get("message")}
              onMessageFocused={() => {
                // Once the requested message has been scrolled to and
                // highlighted, drop the param so a manual refresh or
                // re-open of the page doesn't keep yanking the user
                // back to the same row.
                const next = new URLSearchParams(searchParams);
                next.delete("message");
                setSearchParams(next, { replace: true });
              }}
            />
          )}
        </section>
      </div>

      {createOpen && (
        <ChannelDialog
          alters={alters}
          onClose={() => setCreateOpen(false)}
          onSaved={(record) => {
            if (record?.id) setSearchParams({ channel: record.id }, { replace: true });
            qc.invalidateQueries({ queryKey: ["systemChatChannels"] });
            qc.invalidateQueries({ queryKey: ["systemChatCategories"] });
            setCreateOpen(false);
          }}
        />
      )}
      {editingChannel && (
        <ChannelDialog
          editChannel={editingChannel}
          alters={alters}
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
      {editingCategory && (
        <ChannelDialog
          editCategory={editingCategory}
          alters={alters}
          onClose={() => setEditingCategory(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["systemChatCategories"] });
            qc.invalidateQueries({ queryKey: ["systemChatChannels"] });
            setEditingCategory(null);
          }}
          onDeleted={() => {
            qc.invalidateQueries({ queryKey: ["systemChatCategories"] });
            qc.invalidateQueries({ queryKey: ["systemChatChannels"] });
            setEditingCategory(null);
          }}
        />
      )}
    </div>
  );
}

function ChannelView({ channel, alters, defaultAuthorId, frontingAlterIds = [], focusMessageId, onMessageFocused }) {
  const qc = useQueryClient();
  const terms = useTerms();
  const streamRef = useRef(null);
  // When a mention notification deep-links us to a specific message,
  // hold onto its id for a beat so MessageRow renders a highlight
  // ring and the stream auto-scrolls into view. The ring fades back
  // out after 2.5 s.
  const [highlightId, setHighlightId] = useState(null);

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

  // Auto-scroll to bottom on new messages — but only when we're NOT
  // currently focusing a specific message via the URL deep-link.
  useEffect(() => {
    if (focusMessageId) return;
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, focusMessageId]);

  // Deep-link: scroll a specific message into view and apply a
  // temporary highlight ring. Fires whenever focusMessageId resolves
  // to a message that's in this channel's loaded list. Clears the
  // URL param after the highlight starts so re-renders don't replay.
  useEffect(() => {
    if (!focusMessageId) return;
    if (!messages.some((m) => m.id === focusMessageId)) return;
    const el = document.querySelector(`[data-msg-id="${focusMessageId}"]`);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setHighlightId(focusMessageId);
    const t = setTimeout(() => setHighlightId(null), 2500);
    onMessageFocused?.();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMessageId, messages.length]);

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

  // "/w @name message" — post a private whisper in this channel. The
  // recipients are the leading @mentions; the rest is the body. In a
  // single-system app the whisper is still visible (it's the user's own
  // data) but is clearly marked as private between those parts.
  const handleWhisper = async ({ content, speakerIds }) => {
    const afterCmd = content.replace(WHISPER_RE, "");
    const { recipientIds, body } = peelLeadingMentions(afterCmd, alters);
    const { cleanText, authorAlterIds } = resolveAuthors(body, speakerIds);
    if (recipientIds.length === 0) {
      toast.error(`Whisper needs a recipient — try "/w @name your message".`);
      return false;
    }
    if (!cleanText) {
      toast.error("Whisper needs a message after the recipient.");
      return false;
    }
    const bodyMentionIds = extractMentionedIds(cleanText, alters);
    const notifyIds = [...new Set([...recipientIds, ...bodyMentionIds])].filter((id) => !authorAlterIds.includes(id));
    const created = await localEntities.SystemChatMessage.create({
      channel_id: channel.id,
      author_alter_id: authorAlterIds[0] || null,
      author_alter_ids: authorAlterIds,
      content: cleanText,
      timestamp: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      reply_to_id: replyTo?.id || null,
      mentioned_alter_ids: notifyIds,
      is_whisper: true,
      whisper_to_ids: recipientIds,
      reactions: {},
      thread_parent_id: null,
      is_pinned: false,
    });
    qc.invalidateQueries({ queryKey: ["systemChatMessages", channel.id] });
    setReplyTo(null);
    try {
      for (const id of (authorAlterIds.length > 0 ? authorAlterIds : [null])) {
        await saveAuthoredLog({
          authorAlterId: id,
          sourceType: "chat",
          sourceId: created.id,
          sourceLabel: `#${channel.name} (whisper)`,
          navigatePath: `/chat?channel=${channel.id}&message=${created.id}`,
          previewText: cleanText,
        });
      }
      for (const id of notifyIds) {
        await base44.entities.MentionLog.create({
          mentioned_alter_id: id,
          author_alter_id: authorAlterIds[0] || null,
          log_type: "mention",
          source_type: "chat",
          source_id: created.id,
          source_label: `#${channel.name} (whisper)`,
          source_date: new Date().toISOString(),
          preview_text: cleanText.slice(0, 120),
          navigate_path: `/chat?channel=${channel.id}&message=${created.id}`,
        });
      }
    } catch { /* mention log best-effort */ }
    return true;
  };

  const handleSend = async ({ content, speakerIds, notifyOnReply }) => {
    if (WHISPER_RE.test(content)) { await handleWhisper({ content, speakerIds }); return; }
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
          navigatePath: `/chat?channel=${channel.id}&message=${created.id}`,
          previewText: cleanText,
        });
      }
      await saveMentions({
        content: cleanText,
        alters,
        sourceType: "chat",
        sourceId: created.id,
        sourceLabel: `#${channel.name}`,
        navigatePath: `/chat?channel=${channel.id}&message=${created.id}`,
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
            navigate_path: `/chat?channel=${channel.id}&message=${created.id}`,
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
    <>
      <div className="px-4 py-2 border-b border-border/40 flex items-center gap-2 flex-shrink-0">
        {isPrivate ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Hash className="w-4 h-4 text-muted-foreground" />}
        <p className="text-sm font-medium truncate">{channel.name}</p>
        {(isPrivate ? memberNames : channel.description) && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <p className="text-xs text-muted-foreground truncate">{isPrivate ? memberNames : channel.description}</p>
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
                highlighted={highlightId === m.id}
                frontingAlterIds={frontingAlterIds}
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
        speakerAlters={speakerAlters}
        defaultAuthorId={composerDefaultAuthor}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={handleSend}
        terms={terms}
      />
    </>
  );
}

function MessageRow({ msg, alters, allMessages, editing, highlighted, frontingAlterIds = [], onStartEdit, onCancelEdit, onSubmitEdit, onReply, onDelete }) {
  const formatAlter = useAlterLabel();
  const authors = authorsFor(msg, alters);
  const parent = msg.reply_to_id ? allMessages.find((x) => x.id === msg.reply_to_id) : null;
  const parentAuthors = parent ? authorsFor(parent, alters) : [];
  const [draft, setDraft] = useState(msg.content || "");
  useEffect(() => { setDraft(msg.content || ""); }, [msg.content, editing]);

  const isDeleted = !!msg.deleted_at;
  const isWhisper = !!msg.is_whisper;
  const whisperTargets = isWhisper
    ? (msg.whisper_to_ids || []).map((id) => alters.find((a) => a.id === id)).filter(Boolean)
    : [];
  const whisperNames = whisperTargets.map((a) => formatAlter(a)).join(", ");

  // Whisper privacy: the body is blurred until tapped. If a recipient (or
  // the author) is currently fronting, tapping just reveals it; otherwise
  // it asks "this is only intended for X — display?" first. Single-system
  // local app, so this is a soft, visual gate, not security.
  const [revealed, setRevealed] = useState(false);
  const frontSet = useMemo(() => new Set(frontingAlterIds || []), [frontingAlterIds]);
  const whisperForFronter = isWhisper && (
    (msg.whisper_to_ids || []).some((id) => frontSet.has(id)) ||
    (Array.isArray(msg.author_alter_ids) ? msg.author_alter_ids : [msg.author_alter_id]).some((id) => id && frontSet.has(id))
  );
  const revealWhisper = () => {
    if (whisperForFronter) { setRevealed(true); return; }
    const who = whisperNames || "the intended recipient";
    if (window.confirm(`This message is only intended for ${who}. Display anyway?`)) setRevealed(true);
  };
  const whisperHidden = isWhisper && !isDeleted && !revealed;
  const authorNames = authors.map((a) => formatAlter(a)).join(", ");
  const primaryColor = useReadableColor(authors[0]?.color);
  const parentColor = useReadableColor(parentAuthors[0]?.color);

  return (
    <div
      data-msg-id={msg.id}
      className={`group flex gap-2 px-1 py-1 rounded-md transition-colors hover:bg-muted/30 ${highlighted ? "ring-2 ring-primary bg-primary/10" : ""} ${isWhisper && !isDeleted ? "bg-muted/20 border-l-2 border-dashed border-primary/40 pl-2" : ""}`}
    >
      <AuthorAvatars authors={authors} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: primaryColor }}>{authorNames}</span>
          {isWhisper && (
            <span className="inline-flex items-center gap-1 text-[0.6875rem] text-primary/80 italic" title="Private whisper">
              <Lock className="w-3 h-3" />
              whisper{whisperNames ? <> →&nbsp;<span className="font-medium not-italic">{whisperNames}</span></> : null}
            </span>
          )}
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
        ) : whisperHidden ? (
          <button type="button" onClick={revealWhisper} className="block text-left w-full" title="Private whisper — tap to view">
            <div
              className="text-sm whitespace-pre-wrap break-words wysiwyg-content select-none pointer-events-none"
              style={{ filter: "blur(6px)", opacity: 0.75 }}
              aria-hidden
            >
              {renderRichContent(msg.content, {
                renderText: (t, k) => <React.Fragment key={k}>{renderWithMentions(t, alters)}</React.Fragment>,
              })}
            </div>
            <span className="mt-0.5 inline-flex items-center gap-1 text-[0.6875rem] text-primary/80">
              <Lock className="w-3 h-3" /> Tap to {whisperForFronter ? "reveal" : "view"}
            </span>
          </button>
        ) : (
          <div className={`text-sm whitespace-pre-wrap break-words wysiwyg-content ${isDeleted ? "italic text-muted-foreground" : ""}`}>
            {isDeleted
              ? "[message deleted]"
              : renderRichContent(msg.content, {
                  renderText: (t, k) => <React.Fragment key={k}>{renderWithMentions(t, alters)}</React.Fragment>,
                })}
          </div>
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

function Composer({ channel, alters, speakerAlters = alters, defaultAuthorId, replyTo, onCancelReply, onSend, terms }) {
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

  // The composer is a true inline rich-text editor (RichMentionInput):
  // formatting renders live (like the Plain bio editor) while @mention /
  // -signpost / /w autocomplete keeps working off the DOM caret.
  const editorRef = useRef(null);

  // Formatting toolbar + image/GIF upload insert HTML at the caret via the
  // editor's imperative handle. @mention/-signpost typing is unaffected.
  const insertHtml = useCallback((before, after = "") => editorRef.current?.insertHTML(before, after), []);
  const imageInputRef = useRef(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const handleComposerImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("That doesn't look like an image."); return; }
    setUploadingImage(true);
    try {
      const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, 800, 0.85);
      if (isGif && sizeKB > 3000) toast.warning(`Large GIF (${(sizeKB / 1024).toFixed(1)}MB) — grows your storage & backups.`);
      let url = dataUrl;
      if (isLocalMode()) {
        const id = `chatimg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(id, dataUrl);
        url = createLocalImageUrl(id);
      }
      insertHtml(`<img src="${url}" alt="" />`, "");
      toast.success(isGif ? "GIF added!" : "Image added!");
    } catch (err) {
      toast.error(err?.message || "Couldn't add that image.");
    } finally {
      setUploadingImage(false);
    }
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
          alters={speakerAlters}
          selectedSet={selectedSet}
          onToggle={toggleSpeaker}
          search={pickerSearch}
          onSearchChange={setPickerSearch}
          terms={terms}
        />
        <div className="flex-1">
          <RichMentionInput
            ref={editorRef}
            value={text}
            onChange={setText}
            alters={alters}
            signposts
            systemName={terms.System}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={`Message #${channel.name}…  (@ mention · - signpost · /w @name to whisper)`}
            className="text-sm min-h-[40px] max-h-32 overflow-y-auto rounded-xl border border-input bg-background px-3 py-2 leading-relaxed"
          />
        </div>

        <Button onClick={handleSubmit} disabled={!text.trim()} className="h-10 px-3">
          <Send className="w-4 h-4" />
        </Button>
      </div>

      {/* Formatting + image/GIF toolbar — always available, fills the space
          under the entry box. Inserts HTML around the textarea selection;
          @mention/-signpost typing above is unaffected. */}
      <div className="mt-1.5 rounded-lg border border-border/40 overflow-hidden">
        <div className="flex items-center gap-1 px-1.5 py-1 bg-muted/10">
          <button type="button" title="Insert image / GIF" disabled={uploadingImage}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => imageInputRef.current?.click()}
            className="h-6 px-1.5 flex items-center gap-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs font-medium flex-shrink-0 disabled:opacity-50">
            {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Image / GIF
          </button>
          <AssetButton onPick={(url) => insertHtml(`<img src="${url}" alt="" />`, "")} className="h-6 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 flex-shrink-0" title="Insert from assets" />
          <span className="text-[0.625rem] text-muted-foreground/70 ml-1 truncate">Select text, then tap a style</span>
        </div>
        <MiniToolbar onInsert={insertHtml} onCommand={(cmd, val) => editorRef.current?.execCommand(cmd, val)} />
        <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleComposerImage} />
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
  const chipColor = useReadableColor(selectedAuthors[0]?.color);

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
        // Top-anchored modal — keeps the list above the on-screen keyboard
        // (the old version floated at a fixed offset and hid behind it).
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-start justify-center p-4 pt-[10vh]" onClick={() => onOpenChange(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-sm max-h-[75vh] flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Choose speaker(s)</span>
              <button type="button" onClick={() => onOpenChange(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-2.5 border-b border-border/50">
              <input
                autoFocus
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={`Search ${terms.alters || "alters"}…`}
                className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
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
            <div className="px-4 py-2.5 border-t border-border/50 flex justify-end">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-sm font-medium text-primary hover:underline"
              >
                Done
              </button>
            </div>
          </div>
        </div>
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

// One channel row in the sidebar tree. In edit mode it becomes draggable
// (dnd-kit) and a tap edits it instead of opening it.
function ChatChannelRow({ channel, activeId, indent = 0, editMode, onOpen, onEdit }) {
  const isActive = activeId === channel.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: channel.id, disabled: !editMode });
  const style = editMode ? { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : undefined } : undefined;
  return (
    <div
      ref={editMode ? setNodeRef : undefined}
      style={style}
      className={`w-full flex items-center gap-1 pr-1 rounded-md text-sm group ${isActive ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"} ${editMode ? "border border-dashed border-primary/30 my-0.5 bg-muted/10" : ""}`}
    >
      {editMode && (
        <span {...attributes} {...listeners} className="pl-1 text-muted-foreground cursor-grab active:cursor-grabbing touch-none" aria-label="Drag to reorder" style={{ marginLeft: indent * 12 }}>
          <GripVertical className="w-3.5 h-3.5" />
        </span>
      )}
      <button type="button" onClick={() => (editMode ? onEdit(channel) : onOpen(channel))} onContextMenu={(e) => { e.preventDefault(); onEdit(channel); }}
        className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 text-left" style={editMode ? undefined : { paddingLeft: indent * 12 + 8 }}>
        <Hash className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate flex-1">{channel.name}</span>
        {editMode && <Pencil className="w-3 h-3 flex-shrink-0 opacity-60" />}
      </button>
      {!editMode && (
        <button type="button" onClick={() => onEdit(channel)} aria-label={`Edit ${channel.name}`} className="p-0.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100">
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// A category node: collapsible header (its colour) + nested subcategories +
// channels, indented by depth. In edit mode the header is draggable (to
// reorder among its siblings) and a tap edits the category.
function ChatCategoryNode({ node, depth, activeId, editMode, onOpen, onEditChannel, onEditCategory, onToggleCollapse }) {
  const cat = node.category;
  const collapsed = !!cat.collapsed;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id, disabled: !editMode });
  const style = editMode ? { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : undefined } : undefined;
  const subIds = node.subNodes.map((s) => s.category.id);
  const chanIds = node.channels.map((c) => c.id);
  return (
    <div className="mb-0.5" ref={editMode ? setNodeRef : undefined} style={style}>
      <div className={`flex items-center gap-0.5 group rounded-md hover:bg-muted/40 ${editMode ? "border border-dashed border-primary/30 my-0.5" : ""}`} style={{ paddingLeft: depth * 12 }}>
        {editMode && (
          <span {...attributes} {...listeners} className="pl-1 text-muted-foreground cursor-grab active:cursor-grabbing touch-none" aria-label="Drag to reorder">
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}
        <button type="button" onClick={() => onToggleCollapse(cat)} className="p-1 text-muted-foreground hover:text-foreground flex-shrink-0" aria-label={collapsed ? "Expand category" : "Collapse category"}>
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={() => editMode && onEditCategory(cat)}
          className="flex-1 min-w-0 text-[0.625rem] font-semibold uppercase tracking-wider truncate py-1 text-left" style={{ color: cat.color || "hsl(var(--muted-foreground))" }}>
          {cat.name}{editMode ? " ✎" : ""}
        </button>
        {!editMode && (
          <button type="button" onClick={() => onEditCategory(cat)} aria-label={`Edit ${cat.name} category`} className="p-0.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100">
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>
      {!collapsed && (
        <div>
          <SortableContext items={subIds} strategy={verticalListSortingStrategy}>
            {node.subNodes.map((sub) => (
              <ChatCategoryNode key={sub.category.id} node={sub} depth={depth + 1} activeId={activeId} editMode={editMode}
                onOpen={onOpen} onEditChannel={onEditChannel} onEditCategory={onEditCategory} onToggleCollapse={onToggleCollapse} />
            ))}
          </SortableContext>
          <SortableContext items={chanIds} strategy={verticalListSortingStrategy}>
            <ul>
              {node.channels.map((ch) => (
                <li key={ch.id}>
                  <ChatChannelRow channel={ch} activeId={activeId} indent={depth + 1} editMode={editMode}
                    onOpen={onOpen} onEdit={onEditChannel} />
                </li>
              ))}
            </ul>
          </SortableContext>
        </div>
      )}
    </div>
  );
}

function ChannelDialog({ editChannel = null, editCategory = null, alters = [], onClose, onSaved, onDeleted }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();

  const isEdit = !!(editChannel || editCategory);
  // In create mode a toggle picks channel vs category; in edit mode it's fixed.
  const [isCategory, setIsCategory] = useState(!!editCategory);
  const [busy, setBusy] = useState(false);

  // Channel fields
  const [name, setName] = useState(editChannel?.name || "");
  const [description, setDescription] = useState(editChannel?.description || "");
  const [categoryId, setCategoryId] = useState(editChannel?.category_id || "");
  const [isPrivate, setIsPrivate] = useState(!!editChannel?.is_private);
  const [memberIds, setMemberIds] = useState(editChannel?.member_alter_ids || []);
  const [memberSearch, setMemberSearch] = useState("");

  // Category fields
  const [catName, setCatName] = useState(editCategory?.name || "");
  const [catColor, setCatColor] = useState(editCategory?.color || "");
  const [parentId, setParentId] = useState(editCategory?.parent_category_id || "");
  const [pickedChannelIds, setPickedChannelIds] = useState([]);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const { data: categories = [] } = useQuery({ queryKey: ["systemChatCategories"], queryFn: () => localEntities.SystemChatCategory.list() });
  const { data: allChannels = [] } = useQuery({ queryKey: ["systemChatChannels"], queryFn: () => localEntities.SystemChatChannel.list() });

  // Initialise "channels in this category" when editing a category.
  useEffect(() => {
    if (editCategory) setPickedChannelIds(allChannels.filter((c) => c.category_id === editCategory.id && !c.is_private).map((c) => c.id));
  }, [editCategory, allChannels]);

  const byId = useMemo(() => chatCategoriesById(categories), [categories]);
  const parentOptions = useMemo(() => eligibleChatParents(categories, editCategory?.id || null), [categories, editCategory]);
  const catOptions = useMemo(
    () => categories.map((c) => ({ id: c.id, name: c.name, depth: chatCategoryDepth(c.id, byId) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, byId]
  );
  const assignableChannels = useMemo(() => allChannels.filter((c) => !c.is_archived && !c.is_private), [allChannels]);

  const memberOptions = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return alters
      .filter((a) => !a.is_archived)
      .filter((a) => !q || a.name?.toLowerCase().includes(q) || (a.alias && a.alias.toLowerCase().includes(q)));
  }, [alters, memberSearch]);
  const toggleMember = (id) => setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const togglePicked = (id) => setPickedChannelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const saveChannel = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (isPrivate && memberIds.length === 0) {
      toast.error(`Pick at least one ${terms.alter} for a private channel.`);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: trimmed,
        description: description.trim() || null,
        category_id: categoryId || null,
        is_private: isPrivate,
        member_alter_ids: isPrivate ? memberIds : [],
      };
      if (editChannel) {
        await localEntities.SystemChatChannel.update(editChannel.id, payload);
        onSaved?.();
      } else {
        const record = await localEntities.SystemChatChannel.create({
          ...payload,
          sort_order: Date.now(),
          is_archived: false,
          created_date: new Date().toISOString(),
        });
        onSaved?.(record);
      }
    } catch (err) {
      toast.error(err?.message || "Couldn't save the channel");
    } finally {
      setBusy(false);
    }
  };

  const saveCategory = async () => {
    const trimmed = catName.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const payload = { name: trimmed, color: catColor || null, parent_category_id: parentId || null };
      let catId;
      if (editCategory) {
        await localEntities.SystemChatCategory.update(editCategory.id, payload);
        catId = editCategory.id;
      } else {
        // New categories sort to the TOP of the list.
        const created = await localEntities.SystemChatCategory.create({
          ...payload,
          sort_order: -Date.now(),
          collapsed: false,
          created_date: new Date().toISOString(),
        });
        catId = created.id;
      }
      // Reconcile channel membership: assign picked channels to this category,
      // and clear any that were in it but got unpicked.
      const wasIn = new Set(allChannels.filter((c) => c.category_id === catId).map((c) => c.id));
      const picked = new Set(pickedChannelIds);
      for (const id of picked) if (!wasIn.has(id)) { try { await localEntities.SystemChatChannel.update(id, { category_id: catId }); } catch {} }
      for (const id of wasIn) if (!picked.has(id)) { try { await localEntities.SystemChatChannel.update(id, { category_id: null }); } catch {} }
      qc.invalidateQueries({ queryKey: ["systemChatCategories"] });
      qc.invalidateQueries({ queryKey: ["systemChatChannels"] });
      onSaved?.();
    } catch (err) {
      toast.error(err?.message || "Couldn't save the category");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      if (editChannel) {
        if (!window.confirm(`Delete #${editChannel.name} and every message in it? This cannot be undone.`)) { setBusy(false); return; }
        const msgs = await localEntities.SystemChatMessage.filter({ channel_id: editChannel.id });
        for (const m of msgs) { try { await localEntities.SystemChatMessage.delete(m.id); } catch {} }
        await localEntities.SystemChatChannel.delete(editChannel.id);
      } else if (editCategory) {
        if (!window.confirm(`Delete the "${editCategory.name}" category? Its channels and sub-categories move up a level — no channels or messages are deleted.`)) { setBusy(false); return; }
        const up = editCategory.parent_category_id || null;
        for (const ch of allChannels.filter((c) => c.category_id === editCategory.id)) { try { await localEntities.SystemChatChannel.update(ch.id, { category_id: up }); } catch {} }
        for (const sub of categories.filter((c) => c.parent_category_id === editCategory.id)) { try { await localEntities.SystemChatCategory.update(sub.id, { parent_category_id: up }); } catch {} }
        await localEntities.SystemChatCategory.delete(editCategory.id);
      }
      onDeleted?.();
    } catch (err) {
      toast.error(err?.message || "Couldn't delete");
    } finally {
      setBusy(false);
    }
  };

  const canSave = isCategory ? !!catName.trim() : !!name.trim();
  const title = isEdit
    ? (editCategory ? `Edit category` : `Edit #${editChannel?.name}`)
    : (isCategory ? "New category" : "New channel");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* New category toggle — only when creating something new. */}
          {!isEdit && (
            <button
              type="button"
              onClick={() => setIsCategory((v) => !v)}
              className="w-full flex items-center gap-2.5 rounded-lg border border-border/50 p-2.5 text-left"
            >
              <span className={`flex-shrink-0 w-9 h-5 rounded-full transition-colors relative ${isCategory ? "bg-primary" : "bg-muted-foreground/30"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${isCategory ? "left-[1.125rem]" : "left-0.5"}`} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  {isCategory ? <Folder className="w-3.5 h-3.5 text-muted-foreground" /> : <Hash className="w-3.5 h-3.5 text-muted-foreground" />}
                  {isCategory ? "New category" : "New channel"}
                </span>
                <span className="block text-[0.6875rem] text-muted-foreground leading-snug mt-0.5">
                  {isCategory
                    ? "A category groups channels in the sidebar; it can nest under another category and hold sub-categories."
                    : "Toggle on to make a category instead — a colour-coded group that holds channels."}
                </span>
              </span>
            </button>
          )}

          {isCategory ? (
            <>
              <div>
                <label className="text-xs font-medium block mb-1">Category name</label>
                <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Daily life, Therapy, Inside jokes…" autoFocus maxLength={40} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Label colour <span className="text-muted-foreground">(optional)</span></label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowColorPicker(true)}
                    className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-background text-sm hover:bg-muted/40"
                  >
                    <span className="w-5 h-5 rounded-full border border-border/60" style={{ backgroundColor: catColor || "transparent", backgroundImage: catColor ? undefined : "repeating-conic-gradient(hsl(var(--muted)) 0% 25%, transparent 0% 50%)", backgroundSize: "8px 8px" }} />
                    {catColor ? "Change colour" : "Choose colour"}
                  </button>
                  {catColor && <button type="button" onClick={() => setCatColor("")} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Nest under <span className="text-muted-foreground">(optional)</span></label>
                <select value={parentId} onChange={(e) => setParentId(e.target.value)}
                  className="w-full h-9 text-sm rounded-md border border-border bg-background px-2">
                  <option value="">Top level</option>
                  {parentOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="text-[0.6875rem] text-muted-foreground mt-1">Categories nest up to {CHAT_CATEGORY_MAX_DEPTH} deep.</p>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Channels in this category</label>
                <div className="max-h-40 overflow-y-auto overscroll-contain rounded-md border border-border/40">
                  {assignableChannels.map((c) => (
                    <button key={c.id} type="button" onClick={() => togglePicked(c.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors ${pickedChannelIds.includes(c.id) ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                      <Hash className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${pickedChannelIds.includes(c.id) ? "bg-primary border-primary" : "border-border"}`}>
                        {pickedChannelIds.includes(c.id) && <Check className="w-3 h-3 text-white" />}
                      </span>
                    </button>
                  ))}
                  {assignableChannels.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground text-center">No channels yet.</p>}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium block mb-1">Name</label>
                <Input value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))}
                  placeholder="general" autoFocus maxLength={32} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Description <span className="text-muted-foreground">(optional)</span></label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="what this channel is for" maxLength={120} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Category <span className="text-muted-foreground">(optional)</span></label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full h-9 text-sm rounded-md border border-border bg-background px-2">
                  <option value="">No category</option>
                  {catOptions.map((c) => (
                    <option key={c.id} value={c.id}>{`${"— ".repeat(Math.max(0, c.depth - 1))}${c.name}`}</option>
                  ))}
                </select>
              </div>

              {/* Private channel */}
              <div className="rounded-lg border border-border/50 p-2.5 space-y-2">
                <button type="button" onClick={() => setIsPrivate((v) => !v)} className="w-full flex items-start gap-2.5 text-left">
                  <span className={`mt-0.5 flex-shrink-0 w-9 h-5 rounded-full transition-colors relative ${isPrivate ? "bg-primary" : "bg-muted-foreground/30"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${isPrivate ? "left-[1.125rem]" : "left-0.5"}`} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-muted-foreground" /> Private channel
                    </span>
                    <span className="block text-[0.6875rem] text-muted-foreground leading-snug mt-0.5">
                      Limit it to specific {terms.alters}. It shows under Direct Messages with a lock; only the chosen {terms.alters} can be picked as the speaker.
                    </span>
                  </span>
                </button>
                {isPrivate && (
                  <div className="space-y-1.5">
                    <Input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder={`Search ${terms.alters}…`} className="h-8 text-xs" />
                    <div className="max-h-44 overflow-y-auto overscroll-contain rounded-md border border-border/40">
                      {memberOptions.map((a) => (
                        <button key={a.id} type="button" onClick={() => toggleMember(a.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors ${memberIds.includes(a.id) ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                          <AlterAvatar alter={a} size={22} />
                          <span className="flex-1 truncate">{formatAlter(a)}</span>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${memberIds.includes(a.id) ? "bg-primary border-primary" : "border-border"}`}>
                            {memberIds.includes(a.id) && <Check className="w-3 h-3 text-white" />}
                          </span>
                        </button>
                      ))}
                      {memberOptions.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground text-center">No matches.</p>}
                    </div>
                    {memberIds.length > 0 && <p className="text-[0.6875rem] text-muted-foreground">{memberIds.length} member{memberIds.length === 1 ? "" : "s"} selected.</p>}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex items-center gap-2 pt-1">
            {isEdit && (
              <Button variant="ghost" onClick={handleDelete} disabled={busy} className="text-destructive hover:text-destructive mr-auto">
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={isCategory ? saveCategory : saveChannel} disabled={!canSave || busy}>
              {isEdit ? "Save" : "Create"}
            </Button>
          </div>
        </div>
        {showColorPicker && (
          <ColorPickerModal
            mode="fg"
            onApply={(hex) => setCatColor(hex)}
            onClose={() => setShowColorPicker(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
