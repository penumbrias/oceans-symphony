// The house's Write room, System chat (plan step 6.1): board 14-ChatPhone
// drawn by the house itself on /chat. House mode only: the frames draw it
// (houseWriteRoom); the old page is gated off (HouseRoomGate) and stays
// exactly as it was with the new house off.
//
//   Phone   (board 14) the channels as boxed file tabs on the message panel,
//           the stream, and the composer (speaker chip · the grammar hint ·
//           field · Send) sitting right above the frame's bottom bar. # in
//           the header opens the channel list; ⋯ holds new / arrange / edit.
//   Studio  (board 14 has no computer; the house's language) Channels on the
//           left, the channel's panel in the middle, Info: this channel on
//           the right, the status line under all three.
//
// The stream and composer are the one chat surface (ChannelView →
// ChatSurface), drawn in board 14's look and restyled by write.css: the
// same ~commands, signposts, @mentions, whispers, edit, reply and delete.
// Nothing here writes a record by itself: messages through chatEntry.js
// (inside ChannelView), channels and categories through ChannelDialog and
// ChatChannelTree (chatEntry.js), the first-visit channel through
// createDefaultChannel.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Hash, Lock } from "lucide-react";
import { base44, localEntities } from "@/api/base44Client";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button } from "@/house/kit/Button";
import { Panel, PageTabs } from "@/house/kit/Panel";
import { Sheet } from "@/house/kit/Sheet";
import { EmptyBlock, LoadingBlock } from "@/house/kit/States";
import { showToast } from "@/house/kit/Toast";
import { useRoomTools } from "@/house/frame/roomTools";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { an } from "@/lib/articles";
import { buildChatTree, migrateLegacyChatCategories } from "@/lib/chatCategories";
import { createDefaultChannel, toggleChatCategoryCollapsed } from "@/lib/chatEntry";
import { getCommandSign, getWhisperWord } from "@/lib/commandTerms";
import ChannelView from "@/components/chat/ChannelView";
import { ChatChannelTree, ChannelDialog } from "@/pages/Chat";
import {
  frontIds, defaultSpeaker, privateVisible, channelOrder, pickChannel, channelRows, memberWords,
} from "@/house/write/writeModel";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/write/write.css";

export default function HouseChat({ size = "full", tokens }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const phone = size === "phone";
  const [params, setParams] = useSearchParams();

  // ── Records ──
  const { data: channels = [], isSuccess: channelsLoaded, isLoading } = useQuery({
    queryKey: ["systemChatChannels"], queryFn: () => localEntities.SystemChatChannel.list(),
  });
  const { data: categories = [], isSuccess: categoriesLoaded } = useQuery({
    queryKey: ["systemChatCategories"], queryFn: () => localEntities.SystemChatCategory.list(),
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: activeFront = [] } = useQuery({
    queryKey: ["activeFront"], queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const fronting = useMemo(() => frontIds(activeFront), [activeFront]);
  const frontSet = useMemo(() => new Set(fronting), [fronting]);
  const speakerId = useMemo(() => defaultSpeaker(activeFront, alters), [activeFront, alters]);

  // The first visit gets one channel, the old page's rule: only once the
  // list has really loaded, never when any "general" already exists.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !channelsLoaded) return;
    seeded.current = true;
    const hasGeneral = channels.some((c) => !c.is_archived && (c.name || "").trim().toLowerCase() === "general");
    if (channels.length === 0 && !hasGeneral) {
      createDefaultChannel(`Where ${t.alters} talk to each other.`)
        .then(() => qc.invalidateQueries({ queryKey: ["systemChatChannels"] }))
        .catch((e) => showToast({ tone: "failed", message: e?.message || "Couldn't make the first channel" }));
    }
  }, [channelsLoaded, channels.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Older string categories become real ones once (adds, never removes).
  const migrated = useRef(false);
  useEffect(() => {
    if (migrated.current || !channelsLoaded || !categoriesLoaded) return;
    migrated.current = true;
    migrateLegacyChatCategories(localEntities, channels, categories).then((n) => {
      if (n > 0) { qc.invalidateQueries({ queryKey: ["systemChatCategories"] }); qc.invalidateQueries({ queryKey: ["systemChatChannels"] }); }
    }).catch(() => { /* the old page retries next visit */ });
  }, [channelsLoaded, categoriesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const tree = useMemo(() => buildChatTree(categories, channels), [categories, channels]);
  const ordered = useMemo(() => channelOrder(tree, channels), [tree, channels]);
  const rows = useMemo(() => channelRows(tree), [tree]);
  const privates = useMemo(() => ordered.filter((c) => c.is_private), [ordered]);

  // ── The channel on screen (?channel=, ?message=) ──
  const urlChannel = params.get("channel");
  const active = pickChannel(ordered, urlChannel);
  useEffect(() => {
    if (active && active.id !== urlChannel) {
      setParams((prev) => { const n = new URLSearchParams(prev); n.set("channel", active.id); return n; }, { replace: true });
    }
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (c) => {
    setListOpen(false);
    setParams({ channel: c.id }, { replace: true });
  };
  const focusMessage = params.get("message");
  const messageFocused = () => setParams((prev) => { const n = new URLSearchParams(prev); n.delete("message"); return n; }, { replace: true });

  // Private channels: open freely while a member is in front, or after
  // "View anyway" this visit. A hidden one never shows its name or members.
  const [revealed, setRevealed] = useState(() => new Set());
  const visible = (c) => privateVisible(c, frontSet, revealed);
  const label = (a) => formatAlter(a);
  const who = (c) => memberWords(c, altersById, label, ", ") || `some ${t.alters}`;
  const nameOf = (c) => (c.is_private ? (visible(c) ? memberWords(c, altersById, label) || c.name : "Private") : `#${c.name}`);
  const activeHidden = !!active && !visible(active);

  // ── Sheets ──
  const [listOpen, setListOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editChannel, setEditChannel] = useState(null);
  const [editCategory, setEditCategory] = useState(null);
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["systemChatChannels"] });
    qc.invalidateQueries({ queryKey: ["systemChatCategories"] });
  };
  const toggleCollapse = async (cat) => {
    try { await toggleChatCategoryCollapsed(cat); qc.invalidateQueries({ queryKey: ["systemChatCategories"] }); }
    catch (e) { showToast({ tone: "failed", message: e?.message || "Couldn't fold that", detail: "Nothing changed." }); }
  };

  // How many messages, for Info and the status line (the stream's own query).
  const { data: activeMessages = [] } = useQuery({
    queryKey: ["systemChatMessages", active?.id],
    queryFn: () => localEntities.SystemChatMessage.filter({ channel_id: active.id }),
    enabled: !!active?.id,
  });
  const messageCount = activeMessages.filter((m) => !m.deleted_at && !m.thread_parent_id).length;
  const categoryName = active?.category_id ? categories.find((c) => c.id === active.category_id)?.name : null;
  const speaker = altersById[speakerId];

  // ── Pieces ──
  const channelList = (
    <div className="hw-c-list" data-tour="chat-channels">
      <ul className="hw-tree" aria-label="Channels">
        {rows.map((r) => (r.kind === "category" ? (
          <li key={`cat-${r.id}`} className="hw-tree-row hw-c-cat" style={{ paddingLeft: `${r.depth * 0.75}rem` }}>
            <Button rank="quiet" className="hw-tree-pick" aria-expanded={r.open} onClick={() => toggleCollapse(r.category)}>
              {r.open ? <ChevronDown className="hw-ico" aria-hidden="true" /> : <ChevronRight className="hw-ico" aria-hidden="true" />}
              <span className="hw-tree-name">{r.category.name}</span>
            </Button>
          </li>
        ) : (
          <li key={r.id} className="hw-tree-row" data-selected={active?.id === r.id || undefined} style={{ paddingLeft: `${r.depth * 0.75}rem` }}>
            <Button rank="quiet" className="hw-tree-pick" aria-pressed={active?.id === r.id} onClick={() => open(r.channel)}>
              <span className="hw-tree-name">{`# ${r.channel.name}`}</span>
            </Button>
          </li>
        )))}
      </ul>
      {privates.length ? (
        <>
          <p className="hw-c-head house-label">Private</p>
          <ul className="hw-tree" aria-label="Private channels">
            {privates.map((c) => (
              <li key={c.id} className="hw-tree-row" data-selected={active?.id === c.id || undefined}>
                <Button rank="quiet" className="hw-tree-pick" aria-pressed={active?.id === c.id} onClick={() => open(c)}>
                  <Lock className="hw-ico" aria-hidden="true" />
                  <span className="hw-tree-name" data-hidden={!visible(c) || undefined}>{nameOf(c)}</span>
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {!ordered.length ? <p className="hw-muted hw-small">No channels yet.</p> : null}
    </div>
  );

  const gate = active && activeHidden ? (
    <div className="hw-c-gate">
      <EmptyBlock icon={Lock} title={`This channel is private to ${who(active)}.`}
        body={`It's hidden because none of those ${t.alters} are ${t.fronting} right now.`}
        action={{ label: "View anyway", onClick: () => setRevealed((s) => new Set(s).add(active.id)) }} />
    </div>
  ) : null;

  const stream = !active ? (
    <div className="hw-c-gate">
      <EmptyBlock icon={Hash} title="No channels yet" body={`Make a channel and ${t.alters} can talk to each other here.`}
        action={{ label: "New channel", onClick: () => setCreateOpen(true) }} />
    </div>
  ) : gate || (
    <div className="hw-c-view" data-tour="chat-composer">
      <ChannelView key={active.id} channel={active} alters={alters} defaultAuthorId={speakerId} frontingAlterIds={fronting}
        focusMessageId={focusMessage} onMessageFocused={messageFocused} look="pixel" />
    </div>
  );

  const sheets = (
    <>
      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Channels" size="half"
        footer={<Button rank="secondary" onClick={() => { setListOpen(false); setCreateOpen(true); }}>New channel</Button>}>
        {channelList}
      </Sheet>
      <Sheet open={arrangeOpen} onClose={() => setArrangeOpen(false)} title="Arrange channels" size="full"
        footer={<Button rank="primary" onClick={() => setArrangeOpen(false)}>Done</Button>}>
        <p className="hw-p hw-muted">Drag to reorder within a category. Pencil edits a channel or category, or moves it.</p>
        <div className="hw-old">
          <ChatChannelTree tree={tree} categories={categories} channels={channels} activeId={active?.id} editMode
            onOpen={(c) => { setArrangeOpen(false); open(c); }}
            onEditChannel={(c) => setEditChannel(c)} onEditCategory={(c) => setEditCategory(c)} onToggleCollapse={toggleCollapse} />
        </div>
        {privates.length ? (
          <>
            <p className="hw-c-head house-label">Private</p>
            <ul className="hw-tree">
              {privates.map((c) => (
                <li key={c.id} className="hw-tree-row">
                  <span className="hw-tree-name" data-hidden={!visible(c) || undefined}>{nameOf(c)}</span>
                  <Button rank="quiet" disabledReason={visible(c) ? undefined : "Open it (View anyway) to edit it"} onClick={() => setEditChannel(c)}>Edit</Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Sheet>
      {createOpen ? (
        <ChannelDialog alters={alters} onClose={() => setCreateOpen(false)}
          onSaved={(record) => { refreshAll(); setCreateOpen(false); if (record?.id) open(record); }} />
      ) : null}
      {editChannel ? (
        <ChannelDialog editChannel={editChannel} alters={alters} onClose={() => setEditChannel(null)}
          onSaved={() => { refreshAll(); setEditChannel(null); }}
          onDeleted={() => {
            refreshAll(); qc.invalidateQueries({ queryKey: ["systemChatMessages"] });
            if (active?.id === editChannel.id) setParams({}, { replace: true });
            setEditChannel(null);
          }} />
      ) : null}
      {editCategory ? (
        <ChannelDialog editCategory={editCategory} alters={alters} onClose={() => setEditCategory(null)}
          onSaved={() => { refreshAll(); setEditCategory(null); }} onDeleted={() => { refreshAll(); setEditCategory(null); }} />
      ) : null}
    </>
  );

  // ── Phone: # in the header, new / arrange / edit in ⋯ ──
  const menuItems = useMemo(() => [
    { id: "new", label: "New channel or category…", onSelect: () => setCreateOpen(true) },
    { id: "arrange", label: "Arrange channels…", onSelect: () => setArrangeOpen(true) },
    ...(active && !activeHidden ? [{ id: "edit", label: `Edit ${active.is_private ? "this channel" : `#${active.name}`}…`, onSelect: () => setEditChannel(active) }] : []),
  ], [active?.id, active?.name, activeHidden]); // eslint-disable-line react-hooks/exhaustive-deps
  const tools = useMemo(() => (phone ? {
    info: { label: "#", ariaLabel: "Channels", pressed: listOpen, tour: "chat-channels", onSelect: () => setListOpen((o) => !o) },
    items: menuItems,
  } : null), [phone, listOpen, menuItems]);
  useRoomTools(phone ? tools : null);

  if (isLoading) {
    return <HouseScope tokens={tokens} className={`hw hw-c hw--${phone ? "phone" : "studio"}`} data-house-size={size}><LoadingBlock label="Loading chat" /></HouseScope>;
  }

  if (phone) {
    const tabs = ordered.map((c) => ({
      id: c.id,
      icon: c.is_private && !visible(c) ? Lock : undefined,
      label: c.is_private ? nameOf(c) : `# ${c.name}`,
    }));
    return (
      <HouseScope tokens={tokens} className="hw hw-c hw-c--phone" data-house-size="phone" data-write-room="chat">
        {tabs.length ? (
          <div className="hw-c-tabs">
            <PageTabs label="Channels" tabs={tabs} value={active?.id}
              onChange={(id) => { const c = ordered.find((x) => x.id === id); if (c) open(c); }} />
          </div>
        ) : null}
        <section className="hw-c-main" aria-label={active ? nameOf(active) : "System chat"}>{stream}</section>
        {sheets}
      </HouseScope>
    );
  }

  const sign = t.commandSign || getCommandSign();
  return (
    <HouseScope tokens={tokens} className="hw hw-c hw-c--studio" data-house-size={size} data-write-room="chat">
      <aside className="hw-left" aria-label="Channels">
        <Panel className="hw-side" headingLevel={2} title="Channels"
          tools={<>
            <Button rank="quiet" onClick={() => setArrangeOpen(true)}>Arrange</Button>
            <Button rank="quiet" onClick={() => setCreateOpen(true)}>+ new</Button>
          </>}>
          <div className="hw-side-body">{channelList}</div>
        </Panel>
      </aside>
      <section className="hw-c-main" aria-label={active ? nameOf(active) : "System chat"}>{stream}</section>
      <aside className="hw-right" aria-label="Info">
        <Panel className="hw-info" headingLevel={2} title="Info: this channel">
          <div className="hw-info-body" data-tour="chat-channel-info">
            {active && !activeHidden ? (
              <>
                <dl className="hw-facts">
                  <div className="hw-fact"><dt>Channel</dt><dd>{active.is_private ? nameOf(active) : `#${active.name}`}</dd></div>
                  <div className="hw-fact"><dt>Who can see it</dt><dd>{active.is_private ? `Only ${who(active)}` : `Every ${t.alter}`}</dd></div>
                  {categoryName ? <div className="hw-fact"><dt>Category</dt><dd>{categoryName}</dd></div> : null}
                  <div className="hw-fact"><dt>Messages</dt><dd>{messageCount}</dd></div>
                </dl>
                {active.description ? <p className="hw-p">{active.description}</p> : null}
                <div className="hw-actions">
                  <Button rank="secondary" onClick={() => setEditChannel(active)}>Edit channel</Button>
                </div>
              </>
            ) : <p className="hw-muted">{active ? "Private: open it with View anyway to see more." : "No channel yet."}</p>}
          </div>
        </Panel>
        <Panel className="hw-did" headingLevel={2} title="Writing here">
          <ul className="hw-effects hw-c-help">
            <li><b>@name</b><span>{`mentions ${an(t.alter)}: they're told`}</span></li>
            <li><b>{`${t.signpostReplace || "-"}name`}</b><span>signs the message as them</span></li>
            <li><b>{`${sign}command`}</b><span>logs something as you send</span></li>
            <li><b>{`/${getWhisperWord()} @name`}</b><span>whispers: only they see it</span></li>
          </ul>
        </Panel>
      </aside>
      <div className="hw-foot">
        <div className="hw-status house-label" role="status">
          {active && !activeHidden ? <span>{nameOf(active)}</span> : null}
          {active && !activeHidden ? <span>{`${messageCount} message${messageCount === 1 ? "" : "s"}`}</span> : null}
          {speaker ? <span>{`Speaking as ${label(speaker)}`}</span> : null}
          <span className="hw-flex" />
          <span>{`${ordered.length} channel${ordered.length === 1 ? "" : "s"}`}</span>
        </div>
      </div>
      {sheets}
    </HouseScope>
  );
}

