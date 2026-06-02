import React, { useState, useMemo, useEffect, useRef } from "react";
import { base44, localEntities } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ArrowLeft, Plus, Send, Search, Users, MessageSquare, X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { extractMentionedIds } from "@/lib/mentionUtils";

// Direct Messages — private 1:1 and group conversations between alters.
// Like the system chat, but each conversation is its own thread between a
// fixed set of participants rather than a public channel. In a single-
// system local app these aren't access-controlled (it's all the user's
// own data) — they're a private, threaded space separate from the
// channels.
//
// Entities (local):
//   DirectThread  { participant_alter_ids[], title?, created_date, last_message_at }
//   DirectMessage { thread_id, from_alter_id, content, mentioned_alter_ids[], created_date }
//
// Unread is "new since I last opened this thread", tracked per-thread in
// localStorage (ephemeral device UI state, not user data).

const LASTREAD_KEY = "symphony_dm_lastread_v1";
function loadLastRead() {
  try { return JSON.parse(localStorage.getItem(LASTREAD_KEY) || "{}"); } catch { return {}; }
}
function saveLastRead(map) {
  try { localStorage.setItem(LASTREAD_KEY, JSON.stringify(map)); } catch { /* quota */ }
}

function sortedKey(ids) {
  return [...ids].filter(Boolean).sort().join("|");
}

function Avatar({ alter, size = 32 }) {
  const url = useResolvedAvatarUrl(alter?.avatar_url);
  const label = (alter?.name || "?").slice(0, 1).toUpperCase();
  return (
    <span
      className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 font-bold text-white"
      style={{ width: size, height: size, backgroundColor: alter?.color || "#8b5cf6", fontSize: size * 0.4 }}
    >
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : label}
    </span>
  );
}

// Overlapping avatar cluster for a thread's participants.
function ParticipantAvatars({ participants, size = 32 }) {
  const shown = participants.slice(0, 3);
  return (
    <span className="flex -space-x-2 flex-shrink-0">
      {shown.map((a) => (
        <span key={a.id} className="ring-2 ring-card rounded-full">
          <Avatar alter={a} size={size} />
        </span>
      ))}
      {participants.length > 3 && (
        <span className="rounded-full ring-2 ring-card bg-muted text-muted-foreground flex items-center justify-center text-[0.625rem] font-semibold"
          style={{ width: size, height: size }}>
          +{participants.length - 3}
        </span>
      )}
    </span>
  );
}

export default function DirectMessages() {
  const qc = useQueryClient();
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeThreadId, setActiveThreadId] = useState(searchParams.get("thread") || null);
  const [composing, setComposing] = useState(false);
  const [lastRead, setLastRead] = useState(loadLastRead);

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: threads = [] } = useQuery({ queryKey: ["directThreads"], queryFn: () => localEntities.DirectThread.list() });

  const activeAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const altersById = useMemo(() => {
    const m = {}; alters.forEach((a) => { m[a.id] = a; }); return m;
  }, [alters]);

  const participantsOf = (thread) =>
    (thread?.participant_alter_ids || []).map((id) => altersById[id]).filter(Boolean);

  const threadTitle = (thread) => {
    if (thread?.title) return thread.title;
    const names = participantsOf(thread).map((a) => formatAlter(a));
    return names.length ? names.join(", ") : `(empty conversation)`;
  };

  const sortedThreads = useMemo(() => {
    return [...threads].sort((a, b) => {
      const ta = new Date(a.last_message_at || a.created_date || 0).getTime();
      const tb = new Date(b.last_message_at || b.created_date || 0).getTime();
      return tb - ta;
    });
  }, [threads]);

  const activeThread = threads.find((th) => th.id === activeThreadId) || null;

  // Mark active thread read whenever it's open / gains messages.
  const markRead = (threadId) => {
    if (!threadId) return;
    setLastRead((prev) => {
      const next = { ...prev, [threadId]: new Date().toISOString() };
      saveLastRead(next);
      return next;
    });
  };

  const openThread = (threadId) => {
    setActiveThreadId(threadId);
    setSearchParams(threadId ? { thread: threadId } : {}, { replace: true });
    markRead(threadId);
  };
  const backToList = () => {
    setActiveThreadId(null);
    setSearchParams({}, { replace: true });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={activeThread ? "h-full min-h-0 flex flex-col" : "space-y-4"}>
      {!activeThread ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-xl font-semibold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" /> Direct Messages
            </h1>
            <Button size="sm" onClick={() => setComposing(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> New
            </Button>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Private threads between {t.alters}. Separate from the public {t.system} chat channels.
          </p>

          {sortedThreads.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              No conversations yet. Tap <strong>New</strong> to start one.
            </div>
          ) : (
            <div className="space-y-1.5">
              {sortedThreads.map((th) => {
                const parts = participantsOf(th);
                const lr = lastRead[th.id];
                const unread = th.last_message_at && (!lr || new Date(th.last_message_at) > new Date(lr));
                return (
                  <button
                    key={th.id}
                    onClick={() => openThread(th.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors text-left"
                  >
                    <ParticipantAvatars participants={parts} size={34} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{threadTitle(th)}</span>
                        {parts.length > 2 && <Users className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                      </div>
                      {th.last_message_at && (
                        <span className="text-[0.6875rem] text-muted-foreground">
                          {format(new Date(th.last_message_at), "MMM d, h:mm a")}
                        </span>
                      )}
                    </div>
                    {unread && <span className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" aria-label="unread" />}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <ThreadView
          thread={activeThread}
          participants={participantsOf(activeThread)}
          alters={activeAlters}
          onBack={backToList}
          onAfterSend={() => markRead(activeThread.id)}
          terms={t}
          formatAlter={formatAlter}
          altersById={altersById}
        />
      )}

      {composing && (
        <NewConversationModal
          alters={activeAlters}
          existingThreads={threads}
          onClose={() => setComposing(false)}
          onCreated={(id) => { setComposing(false); openThread(id); }}
          terms={t}
          formatAlter={formatAlter}
        />
      )}
    </motion.div>
  );
}

function ThreadView({ thread, participants, alters, onBack, onAfterSend, terms, formatAlter, altersById }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [senderId, setSenderId] = useState(thread.participant_alter_ids?.[0] || null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const taRef = useRef(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["directMessages", thread.id],
    queryFn: () => localEntities.DirectMessage.filter({ thread_id: thread.id }),
  });

  const sorted = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0)),
    [messages]
  );

  // Default the sender to the current primary fronter when they're a
  // participant, otherwise the first participant.
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  useEffect(() => {
    const ids = thread.participant_alter_ids || [];
    const primary = activeSessions.find((s) => s.is_primary)?.alter_id
      || activeSessions[0]?.alter_id || activeSessions[0]?.primary_alter_id;
    if (primary && ids.includes(primary)) setSenderId(primary);
    else if (!ids.includes(senderId)) setSenderId(ids[0] || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id, activeSessions]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [sorted.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    if (!senderId) { toast.error("Pick who's sending first."); return; }
    setSending(true);
    try {
      const now = new Date().toISOString();
      await localEntities.DirectMessage.create({
        thread_id: thread.id,
        from_alter_id: senderId,
        content: body,
        mentioned_alter_ids: extractMentionedIds(body, alters),
        created_date: now,
      });
      await localEntities.DirectThread.update(thread.id, { last_message_at: now });
      setText("");
      qc.invalidateQueries({ queryKey: ["directMessages", thread.id] });
      qc.invalidateQueries({ queryKey: ["directThreads"] });
      onAfterSend?.();
    } catch (e) {
      toast.error(e?.message || "Couldn't send that message.");
    } finally {
      setSending(false);
    }
  };

  const title = thread.title || participants.map((a) => formatAlter(a)).join(", ");

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border/40">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <ParticipantAvatars participants={participants} size={28} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-muted-foreground" /> {title}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground">{participants.length} {participants.length === 1 ? terms.alter : terms.alters}</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain py-3 space-y-3">
        {sorted.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            No messages yet. Say something below.
          </p>
        ) : (
          sorted.map((m) => {
            const from = altersById[m.from_alter_id];
            return (
              <div key={m.id} className="flex gap-2">
                <Avatar alter={from} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold" style={{ color: from?.color || undefined }}>
                      {from ? formatAlter(from) : "Unknown"}
                    </span>
                    <span className="text-[0.6875rem] text-muted-foreground">
                      {m.created_date ? format(new Date(m.created_date), "MMM d, h:mm a") : ""}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sender picker + composer */}
      <div className="pt-2 border-t border-border/40 space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <span className="text-[0.6875rem] text-muted-foreground flex-shrink-0">Sending as:</span>
          {participants.map((a) => (
            <button
              key={a.id}
              onClick={() => setSenderId(a.id)}
              className={`flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full border text-xs flex-shrink-0 transition-colors ${senderId === a.id ? "border-primary bg-primary/10 text-primary font-medium" : "border-border/50 text-muted-foreground hover:text-foreground"}`}
            >
              <Avatar alter={a} size={18} /> {formatAlter(a)}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <MentionTextarea
              ref={taRef}
              value={text}
              onChange={setText}
              alters={alters}
              rows={1}
              placeholder="Message…  (@ to mention)"
              className="resize-none text-sm min-h-[40px] max-h-32"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
          </div>
          <Button onClick={send} disabled={sending || !text.trim()} className="h-10 px-3">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function NewConversationModal({ alters, existingThreads, onClose, onCreated, terms, formatAlter }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alters.filter((a) =>
      !q || a.name?.toLowerCase().includes(q) || (a.alias && a.alias.toLowerCase().includes(q))
    );
  }, [alters, search]);

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const start = async () => {
    if (selected.length === 0) { toast.error(`Pick at least one ${terms.alter}.`); return; }
    setBusy(true);
    try {
      // Reuse an existing thread with the exact same participant set.
      const key = sortedKey(selected);
      const existing = existingThreads.find((th) => sortedKey(th.participant_alter_ids || []) === key);
      if (existing) { onCreated(existing.id); return; }
      const now = new Date().toISOString();
      const created = await localEntities.DirectThread.create({
        participant_alter_ids: selected,
        title: title.trim() || "",
        created_date: now,
        last_message_at: now,
      });
      qc.invalidateQueries({ queryKey: ["directThreads"] });
      onCreated(created.id);
    } catch (e) {
      toast.error(e?.message || "Couldn't start that conversation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border/50 max-h-[85dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b border-border/40">
          <h2 className="font-display text-base font-semibold">New conversation</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 space-y-2.5 overflow-y-auto">
          {selected.length > 1 && (
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Group name (optional)" className="text-sm h-9" />
          )}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${terms.alters}…`} className="text-sm h-9 pl-8" autoFocus />
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto overscroll-contain">
            {filtered.map((a) => (
              <button
                key={a.id}
                onClick={() => toggle(a.id)}
                className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${selected.includes(a.id) ? "bg-primary/10" : "hover:bg-muted/40"}`}
              >
                <Avatar alter={a} size={28} />
                <span className="flex-1 text-sm truncate">{formatAlter(a)}</span>
                <span className={`w-4 h-4 rounded border flex items-center justify-center ${selected.includes(a.id) ? "bg-primary border-primary" : "border-border"}`}>
                  {selected.includes(a.id) && <span className="text-white text-[0.625rem]">✓</span>}
                </span>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No matches.</p>}
          </div>
        </div>
        <div className="p-3 border-t border-border/40 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={start} disabled={busy || selected.length === 0} className="gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Start{selected.length ? ` (${selected.length})` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
