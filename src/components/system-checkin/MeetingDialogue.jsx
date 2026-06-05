import React, { useMemo, useRef, useState, useEffect } from "react";
import { format } from "date-fns";
import { User, Send, Pencil, Trash2, Check, X, MessageSquare, ChevronDown, Lock, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import RichMentionInput from "@/components/shared/RichMentionInput";
import { renderRichContent } from "@/lib/renderBulletinContent";
import { parseAndStripSignposts, SYSTEM_SENTINEL_ID } from "@/lib/signpostAuthors";
import { applyWhisper, hasWhisperCommand } from "@/lib/whisperUtils";
import { extractMentionedIds } from "@/lib/mentionUtils";

// ── Meeting "open dialogue" space ────────────────────────────────────────────
//
// A meeting-scoped chat that REUSES the System Chat machinery wholesale — the
// same signpost parser (parseAndStripSignposts), the same whisper engine
// (applyWhisper / WHISPER_RE / peelLeadingMentions), the same rich renderer
// (renderRichContent, so formatting + @mentions + whisper bars + ||spoilers||
// all work identically), and the same inline rich composer (RichMentionInput
// with `signposts` on). The ONLY difference from System Chat is storage: the
// whole history lives on the meeting record under `SystemCheckIn.dialogue`
// instead of the global SystemChatMessage entity. Nothing leaks into chat.
//
// Stored entry shape (additive — old records with just {id,alter_id,text,
// timestamp} still load):
//   [{ id, alter_id (null = system), author_alter_ids, text, timestamp,
//      is_whisper, whisper_to_ids }]
//
// Speaker attribution mirrors the chat composer: pick the speaker(s) with the
// searchable speaker picker; inline `-name` / `-system` signposts in the typed
// body OVERRIDE the picker, exactly as in chat. Signposting an alter also adds
// them to the meeting's "notice who's near" participants via onAddParticipants.

const SYSTEM_AUTHOR = { id: SYSTEM_SENTINEL_ID, name: "System", color: "#94a3b8" };

function authorFor(alterId, alters) {
  if (!alterId || alterId === SYSTEM_AUTHOR.id) return SYSTEM_AUTHOR;
  return alters.find((a) => a.id === alterId) || { id: alterId, name: "Unknown", color: "#94a3b8" };
}

// Authors of a stored entry, tolerant of the new array / legacy single-id /
// no-author (system) shapes — same logic the chat MessageRow uses.
function authorsFor(msg, alters) {
  if (Array.isArray(msg.author_alter_ids) && msg.author_alter_ids.length > 0) {
    return msg.author_alter_ids.map((id) => authorFor(id, alters));
  }
  if (msg.alter_id) return [authorFor(msg.alter_id, alters)];
  return [SYSTEM_AUTHOR];
}

export function normalizeDialogue(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m.text === "string")
    .map((m, i) => ({
      id: m.id || `dlg-${m.timestamp || i}-${i}`,
      alter_id: m.alter_id || null,
      author_alter_ids: Array.isArray(m.author_alter_ids)
        ? m.author_alter_ids
        : (m.alter_id ? [m.alter_id] : []),
      text: m.text,
      timestamp: m.timestamp || new Date().toISOString(),
      is_whisper: !!m.is_whisper,
      whisper_to_ids: Array.isArray(m.whisper_to_ids) ? m.whisper_to_ids : [],
    }));
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
      {url && !err ? (
        <img src={url} alt={alter?.name || ""} className="w-full h-full object-cover" onError={() => setErr(true)} />
      ) : (alter?.id == null || alter?.id === SYSTEM_AUTHOR.id) ? (
        <User style={{ width: size * 0.5, height: size * 0.5 }} />
      ) : (
        <span className="font-semibold">{(alter?.name || "?").slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}

// Stacked avatars for multi-author (co-signposted) messages — same as chat.
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

function DialogueRow({ msg, alters, terms, editing, onStartEdit, onSubmitEdit, onCancelEdit, onDelete }) {
  const formatAlter = useAlterLabel();
  const authors = authorsFor(msg, alters);
  const authorNames = authors.map((a) => (a.id === SYSTEM_AUTHOR.id ? (terms.System || "System") : formatAlter(a))).join(", ");
  const [draft, setDraft] = useState(msg.text);
  useEffect(() => { setDraft(msg.text); }, [msg.text, editing]);

  // Whisper reveal — same tap-to-reveal gate as chat (soft, single-system).
  const isWhisper = !!msg.is_whisper;
  const whisperTargets = isWhisper
    ? (msg.whisper_to_ids || []).map((id) => alters.find((a) => a.id === id)).filter(Boolean)
    : [];
  const whisperNames = whisperTargets.map((a) => formatAlter(a)).join(", ");

  return (
    <div className={`group flex gap-2 px-1 py-1 rounded-md hover:bg-muted/30 transition-colors ${isWhisper ? "bg-muted/20 border-l-2 border-dashed border-primary/40 pl-2" : ""}`}>
      <AuthorAvatars authors={authors} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: authors[0]?.color || undefined }}>{authorNames}</span>
          {isWhisper && (
            <span className="inline-flex items-center gap-1 text-[0.6875rem] text-primary/80 italic" title="Private whisper">
              <Lock className="w-3 h-3" />
              whisper{whisperNames ? <> →&nbsp;<span className="font-medium not-italic">{whisperNames}</span></> : null}
            </span>
          )}
          <span className="text-[0.6875rem] text-muted-foreground">{format(new Date(msg.timestamp), "h:mm a")}</span>
        </div>
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
          <div className="text-sm whitespace-pre-wrap break-words wysiwyg-content">
            {renderRichContent(msg.text, { terms })}
          </div>
        )}
      </div>
      {!editing && (
        <div className="flex items-start gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={onStartEdit} aria-label="Edit" title="Edit" className="p-1 text-muted-foreground hover:text-foreground">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onDelete} aria-label="Delete" title="Delete" className="p-1 text-muted-foreground hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// Speaker picker — same multi-select pattern as the chat Composer's
// SpeakerPicker (searchable, scrollable, "-system" pseudo-option on top).
function SpeakerPicker({ selectedAuthors, alters, selectedSet, onToggle, terms }) {
  const formatAlter = useAlterLabel();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const sortedAlters = useMemo(
    () => [...alters]
      .filter((a) => !a.is_archived)
      .filter((a) => !search || (a.name || "").toLowerCase().includes(search.toLowerCase()) || (a.alias && a.alias.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [alters, search]
  );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-1.5 py-1 rounded-md border border-border/50 bg-muted/20 hover:bg-muted/40 max-w-[10rem]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <AuthorAvatars authors={selectedAuthors} size={22} />
        <span className="text-[0.6875rem] truncate" style={{ color: selectedAuthors[0]?.color || undefined }}>
          {selectedAuthors.map((a) => (a.id === SYSTEM_AUTHOR.id ? (terms.System || "System") : formatAlter(a))).join(", ")}
        </span>
        <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-start justify-center p-4 pt-[10vh]" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-sm max-h-[75vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Choose speaker(s)</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-4 py-2.5 border-b border-border/50 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${terms.alters || "alters"}…`}
                className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground pl-6"
              />
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
              <SpeakerRow alter={SYSTEM_AUTHOR} label={terms.System || "System"} selected={selectedSet.has(SYSTEM_AUTHOR.id)} onToggle={() => onToggle(SYSTEM_AUTHOR.id)} labelPrefix="—" />
              {sortedAlters.map((a) => (
                <SpeakerRow key={a.id} alter={a} label={formatAlter(a)} selected={selectedSet.has(a.id)} onToggle={() => onToggle(a.id)} />
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-border/50 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-primary hover:underline">Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SpeakerRow({ alter, label, selected, onToggle, labelPrefix = "" }) {
  return (
    <button type="button" onClick={onToggle} className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 ${selected ? "bg-primary/5" : ""}`}>
      <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: selected ? (alter.color || "#94a3b8") : "transparent", borderColor: selected ? (alter.color || "#94a3b8") : "hsl(var(--border))" }}>
        {selected && <Check className="w-3 h-3 text-white" />}
      </div>
      <AlterAvatar alter={alter} size={20} />
      <span className={`flex-1 truncate ${selected ? "text-foreground font-medium" : "text-muted-foreground"}`}>{labelPrefix}{label}</span>
    </button>
  );
}

export default function MeetingDialogue({ dialogue = [], onChange, alters = [], defaultSpeakerId = null, onAddParticipants }) {
  const terms = useTerms();
  const list = useMemo(() => normalizeDialogue(dialogue), [dialogue]);

  const [speakerIds, setSpeakerIds] = useState(() => defaultSpeakerId ? [defaultSpeakerId] : [SYSTEM_AUTHOR.id]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const streamRef = useRef(null);
  const editorRef = useRef(null);

  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length]);

  const selectedSet = useMemo(() => new Set(speakerIds), [speakerIds]);
  const toggleSpeaker = (id) => {
    setSpeakerIds((prev) => {
      const has = prev.includes(id);
      if (has) {
        const next = prev.filter((x) => x !== id);
        return next.length === 0 ? [SYSTEM_AUTHOR.id] : next;
      }
      return id === SYSTEM_AUTHOR.id
        ? [SYSTEM_AUTHOR.id]
        : [...prev.filter((x) => x !== SYSTEM_AUTHOR.id), id];
    });
  };

  // Inline signposts override the picker (exactly as chat's resolveAuthors).
  const resolveAuthors = (content) => {
    const { authors: signposted, cleanText } = parseAndStripSignposts(content, alters, [terms.system]);
    if (signposted.length === 0) {
      return { cleanText: (content || "").trim(), authorAlterIds: speakerIds.filter((id) => id && id !== SYSTEM_AUTHOR.id) };
    }
    const ids = signposted.filter((a) => a.id !== SYSTEM_AUTHOR.id).map((a) => a.id);
    return { cleanText: cleanText.trim(), authorAlterIds: ids };
  };

  // Speaker chip reflects what the message will ACTUALLY be attributed to
  // (signposts override the picker) — same as the chat composer chip.
  const selectedAuthors = useMemo(() => {
    const { authors: signposted } = parseAndStripSignposts(text, alters, [terms.system]);
    if (signposted.length > 0) {
      const sysOnly = signposted.every((a) => a.id === SYSTEM_AUTHOR.id);
      if (sysOnly) return [SYSTEM_AUTHOR];
      return signposted.filter((a) => a.id !== SYSTEM_AUTHOR.id).map((a) => authorFor(a.id, alters));
    }
    if (speakerIds.length === 0 || (speakerIds.length === 1 && speakerIds[0] === SYSTEM_AUTHOR.id)) return [SYSTEM_AUTHOR];
    return speakerIds.filter((id) => id !== SYSTEM_AUTHOR.id).map((id) => authorFor(id, alters));
  }, [speakerIds, alters, text, terms.system]);

  const append = (entry) => onChange([...list, entry]);

  const send = () => {
    const raw = text.trim();
    if (!raw) return;

    let body = raw;
    let whisperRecipientIds = [];
    let isWhisper = false;

    // Whisper handling — the SAME engine as chat (applyWhisper). It detects
    // leading-vs-mid "/w", warns on a mid-message no-bracket whisper, and
    // returns the transformed rich content + recipient ids. A "/w" with no
    // recipient is left as literal text (isWhisper false).
    if (hasWhisperCommand(raw)) {
      const w = applyWhisper(raw, alters, { rich: true, surfaceLabel: "message" });
      if (w === null) return; // backed out of the mid-message warning
      body = w.content;
      whisperRecipientIds = w.recipientIds || [];
      isWhisper = !!w.isWhisper && whisperRecipientIds.length > 0;
    }

    const { cleanText, authorAlterIds } = resolveAuthors(body);
    if (!cleanText) return;

    const entry = {
      id: `dlg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      alter_id: authorAlterIds[0] || null,
      author_alter_ids: authorAlterIds,
      text: cleanText,
      timestamp: new Date().toISOString(),
      is_whisper: isWhisper,
      whisper_to_ids: whisperRecipientIds,
    };
    append(entry);
    setText("");

    // Signposting an alter (or @mentioning, or whispering to them) pulls them
    // into "notice who's near" — they took part in the dialogue.
    const mentionedIds = extractMentionedIds(cleanText, alters);
    const touchedIds = [...new Set([...authorAlterIds, ...whisperRecipientIds, ...mentionedIds])].filter(Boolean);
    if (touchedIds.length > 0) onAddParticipants?.(touchedIds);
  };

  const submitEdit = (id, nextText) => {
    const body = (nextText || "").trim();
    if (!body) { setEditingId(null); return; }
    onChange(list.map((m) => (m.id === id ? { ...m, text: body } : m)));
    setEditingId(null);
  };
  const remove = (id) => {
    if (!window.confirm("Delete this message from the dialogue?")) return;
    onChange(list.filter((m) => m.id !== id));
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        <p className="text-sm font-medium">Open dialogue</p>
        <span className="text-[0.6875rem] text-muted-foreground">· stays with this meeting</span>
      </div>

      <div ref={streamRef} className="max-h-72 overflow-y-auto overscroll-contain px-2 py-2 space-y-1">
        {list.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground italic py-6">
            A private space for {terms.alters} to talk things through — with @ mentions, - signposts and /w @name whispers, just like {terms.System} Chat. Nothing here is saved to {terms.System} Chat.
          </p>
        ) : (
          list.map((m) => (
            <DialogueRow
              key={m.id}
              msg={m}
              alters={alters}
              terms={terms}
              editing={editingId === m.id}
              onStartEdit={() => setEditingId(m.id)}
              onCancelEdit={() => setEditingId(null)}
              onSubmitEdit={(next) => submitEdit(m.id, next)}
              onDelete={() => remove(m.id)}
            />
          ))
        )}
      </div>

      <div className="border-t border-border/50 p-2 bg-background">
        <div className="flex items-end gap-2">
          <SpeakerPicker
            selectedAuthors={selectedAuthors}
            alters={alters}
            selectedSet={selectedSet}
            onToggle={toggleSpeaker}
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
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={`Speak…  (@ mention · - signpost · /w @name [secret] to whisper)`}
              className="text-sm min-h-[40px] max-h-32 overflow-y-auto rounded-xl border border-input bg-background px-3 py-2 leading-relaxed"
            />
          </div>
          <Button type="button" onClick={send} disabled={!text.trim()} className="h-10 px-3 flex-shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
