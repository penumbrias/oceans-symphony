import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import { Send, Pencil, Trash2, Reply, X, Check, User, ChevronDown, Lock, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import { adjustForContrast, getPageBackground } from "@/lib/contrast";
import { MiniToolbar } from "@/components/shared/MiniToolbar";
import RichMentionInput from "@/components/shared/RichMentionInput";
import { renderRichContent } from "@/lib/renderBulletinContent";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { extractMentionedIds } from "@/lib/mentionUtils";
import { applyWhisper, hasWhisperCommand } from "@/lib/whisperUtils";
import { parseAndStripSignposts, foldSignpostAuthors, SYSTEM_SENTINEL_ID } from "@/lib/signpostAuthors";
import { processUploadedImage, saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { isLocalMode } from "@/lib/storageMode";

// ── Shared System-Chat surface ───────────────────────────────────────────────
//
// THE single chat surface — the message stream + composer (with its formatting
// toolbar and live @mention / -signpost / /w autocomplete) used by BOTH the
// real System Chat page (src/pages/Chat.jsx) and the meeting "open dialogue"
// space (src/components/system-checkin/MeetingDialogue.jsx). It is literally the
// same code in both; only WHERE the messages are stored differs, which is
// handled by the host through the `onSend` / `onEdit` / `onDelete` callbacks.
//
// Message shape consumed/produced (a superset that both storage backends map
// onto): {
//   id, author_alter_id, author_alter_ids, content, timestamp, edited_at,
//   deleted_at, reply_to_id, mentioned_alter_ids, is_whisper, whisper_to_ids
// }
//
// The host receives a fully-resolved payload from onSend (signposts already
// stripped, whisper already parsed, mentions already extracted) so the two
// hosts never reimplement the parsing — they only persist.

export const SYSTEM_AUTHOR = { id: SYSTEM_SENTINEL_ID, name: "System", color: "#94a3b8" };

// Whisper command: "/w" or "/whisper" at the very start of a message.
export const WHISPER_RE = /^\/(?:w|whisper)\b[ \t]*/i;
const WORD_CH = /[\p{L}\p{N}_]/u;

export function authorFor(alterId, alters) {
  if (!alterId || alterId === SYSTEM_AUTHOR.id) return SYSTEM_AUTHOR;
  return alters.find((a) => a.id === alterId) || { id: alterId, name: "Unknown", color: "#94a3b8" };
}

// Read a message's authors as an array regardless of whether the record uses
// the new author_alter_ids array or the legacy single author_alter_id /
// alter_id field. Empty result = system-attributed.
export function authorsFor(msg, alters) {
  if (Array.isArray(msg.author_alter_ids) && msg.author_alter_ids.length > 0) {
    return msg.author_alter_ids.map((id) => authorFor(id, alters));
  }
  if (msg.author_alter_id) return [authorFor(msg.author_alter_id, alters)];
  if (msg.alter_id) return [authorFor(msg.alter_id, alters)];
  return [SYSTEM_AUTHOR];
}

// Peel leading "@Name" tokens off the front of `text`, returning the recipient
// alter ids and the remaining body. Longest-name-first so "@First Last" beats
// "@First". Used to parse "/w @Hex @Kyo message".
export function peelLeadingMentions(text, alters) {
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

// Brighten / darken alter colours too close to the page background so the name
// text stays legible.
export function useReadableColor(color) {
  const bg = useMemo(() => getPageBackground(), []);
  return useMemo(() => (color ? adjustForContrast(color, bg) : color), [color, bg]);
}

export function AlterAvatar({ alter, size = 28 }) {
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
        : (alter?.id == null || alter?.id === SYSTEM_AUTHOR.id)
          ? <User style={{ width: size * 0.5, height: size * 0.5 }} />
          : <span className="font-semibold">{(alter?.name || "?").slice(0, 1).toUpperCase()}</span>}
    </div>
  );
}

// Stacked avatars for multi-author messages.
export function AuthorAvatars({ authors, size = 28 }) {
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

// Render message content with @mentions highlighted.
export function renderWithMentions(content, alters) {
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
      out.push(<MentionPill key={key++} label={matched.raw} color={matched.color} />);
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

export function MessageRow({ msg, alters, allMessages = [], editing, highlighted, frontingAlterIds = [], onStartEdit, onCancelEdit, onSubmitEdit, onReply, onDelete }) {
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

  // Whisper privacy: the body is blurred until tapped. If a recipient (or the
  // author) is currently fronting, tapping just reveals it; otherwise it asks
  // first. Single-system local app, so this is a soft, visual gate.
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
          {onReply && (
            <button onClick={onReply} aria-label="Reply" title="Reply" className="p-1 text-muted-foreground hover:text-foreground">
              <Reply className="w-3.5 h-3.5" />
            </button>
          )}
          {onStartEdit && (
            <button onClick={onStartEdit} aria-label="Edit" title="Edit" className="p-1 text-muted-foreground hover:text-foreground">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} aria-label="Delete" title="Delete" className="p-1 text-muted-foreground hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
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

// Multi-select speaker picker — searchable, scrollable, top-anchored modal,
// "-system" pseudo-option on top.
export function SpeakerPicker({ selectedAuthors, open, onOpenChange, alters, selectedSet, onToggle, terms }) {
  const formatAlter = useAlterLabel();
  const chipColor = useReadableColor(selectedAuthors[0]?.color);

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
          {selectedAuthors.map((a) => (a.id === SYSTEM_AUTHOR.id ? (terms.System || "System") : formatAlter(a))).join(", ")}
        </span>
        <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
      </button>
      {open && (
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
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2" style={{ WebkitOverflowScrolling: "touch" }}>
              {/* The System speaker stays a fixed special row above the standard
                  alter tree. */}
              <SpeakerRow
                alter={{ ...SYSTEM_AUTHOR, name: terms.System || "System" }}
                selected={selectedSet.has(SYSTEM_AUTHOR.id)}
                onToggle={() => onToggle(SYSTEM_AUTHOR.id)}
                labelPrefix="—"
              />
              <AlterTreeSelect
                alters={alters}
                isSelected={(id) => selectedSet.has(id)}
                onToggle={(a) => onToggle(a.id)}
                maxHeight="48vh"
              />
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

// The composer: SpeakerPicker + RichMentionInput + formatting/image toolbar.
// Identical in chat and meeting. `onSubmit({ content, speakerIds, notifyOnReply })`
// is called with the raw typed HTML; the host's send logic does the parsing.
export function Composer({ channelLabel, alters, speakerAlters = alters, defaultAuthorId, replyTo, onCancelReply, onSubmit, terms, placeholderText }) {
  const formatAlter = useAlterLabel();
  const [speakerIds, setSpeakerIds] = useState(() => defaultAuthorId ? [defaultAuthorId] : [SYSTEM_AUTHOR.id]);
  useEffect(() => {
    if (defaultAuthorId) setSpeakerIds([defaultAuthorId]);
  }, [defaultAuthorId]);

  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [notifyOnReply, setNotifyOnReply] = useState(true);
  useEffect(() => {
    if (replyTo) setNotifyOnReply(true);
  }, [replyTo?.id]);

  const editorRef = useRef(null);
  const [showFormatting, setShowFormatting] = useState(false);
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
        const next = prev.filter((x) => x !== id);
        return next.length === 0 ? [SYSTEM_AUTHOR.id] : next;
      }
      const next = id === SYSTEM_AUTHOR.id
        ? [SYSTEM_AUTHOR.id]
        : [...prev.filter((x) => x !== SYSTEM_AUTHOR.id), id];
      return next;
    });
  };

  // The chip reflects what the message will ACTUALLY be attributed to — the
  // picker selection folded with inline +/- signposts (same rule as the bulletin
  // composer, so "+x" adds and "-x" replaces consistently across the app).
  const selectedAuthors = useMemo(() => {
    const base = speakerIds.filter((id) => id !== SYSTEM_AUTHOR.id).map((id) => ({ id }));
    const folded = foldSignpostAuthors(text, alters, { systemKeywords: [terms.system], base });
    const real = folded.filter((a) => a.id !== SYSTEM_AUTHOR.id);
    return real.length ? real.map((a) => authorFor(a.id, alters)) : [SYSTEM_AUTHOR];
  }, [speakerIds, alters, text, terms.system]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    // Compute the folded authors BEFORE clearing the text so the picker STICKS to
    // whoever the message was attributed to (whether set by the picker or by an
    // inline +/- signpost) — the next message stays with them instead of
    // snapping back to the System.
    const base = speakerIds.filter((id) => id !== SYSTEM_AUTHOR.id).map((id) => ({ id }));
    const foldedIds = foldSignpostAuthors(text, alters, { systemKeywords: [terms.system], base })
      .filter((a) => a.id !== SYSTEM_AUTHOR.id)
      .map((a) => a.id);
    const ok = await onSubmit({ content: text, speakerIds, notifyOnReply });
    if (ok !== false) {
      setText("");
      setSpeakerIds(foldedIds.length ? foldedIds : [SYSTEM_AUTHOR.id]);
    }
  };

  const replyAuthors = replyTo ? authorsFor(replyTo, alters) : [];
  const replyColor = useReadableColor(replyAuthors[0]?.color);

  const placeholder = placeholderText
    || `Message ${channelLabel || ""}…  (@ mention · ${terms.signpostReplace || "-"} signpost · /w @name [secret] to whisper)`;

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
            placeholder={placeholder}
            className="text-sm min-h-[40px] max-h-32 overflow-y-auto rounded-xl border border-input bg-background px-3 py-2 leading-relaxed"
          />
        </div>

        <Button onClick={handleSubmit} disabled={!text.trim()} className="h-10 px-3">
          <Send className="w-4 h-4" />
        </Button>
      </div>

      {/* Formatting + image/GIF toolbar. */}
      <div className="mt-1.5 rounded-lg border border-border/40 overflow-hidden">
        <div className="flex items-center gap-1 px-1.5 py-1 bg-muted/10">
          <button type="button" title="Insert image / GIF" disabled={uploadingImage}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => imageInputRef.current?.click()}
            className="h-6 px-1.5 flex items-center gap-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs font-medium flex-shrink-0 disabled:opacity-50">
            {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Image / GIF
          </button>
          <AssetButton onPick={(url) => insertHtml(`<img src="${url}" alt="" />`, "")} className="h-6 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 flex-shrink-0" title="Insert from assets" />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowFormatting((v) => !v)}
            aria-pressed={showFormatting}
            title={showFormatting ? "Hide formatting" : "Show formatting"}
            className={`ml-auto h-6 px-1.5 flex items-center gap-0.5 rounded text-xs font-medium transition-colors flex-shrink-0 ${showFormatting ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}
          >
            <span className="font-bold" style={{ lineHeight: 1 }}>A</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showFormatting ? "rotate-180" : ""}`} /> Format
          </button>
        </div>
        {showFormatting && (
          <MiniToolbar onInsert={insertHtml} onCommand={(cmd, val) => editorRef.current?.execCommand(cmd, val)} />
        )}
        <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleComposerImage} />
      </div>
    </div>
  );
}

// ── ChatSurface ──────────────────────────────────────────────────────────────
//
// The full stream + composer, parameterised over storage via callbacks. Both
// the System Chat page and the meeting dialogue render this.
//
// Props:
//   messages          – array of normalized message objects (sorted oldest→newest by the host or here)
//   alters            – all alters (for mention/signpost autocomplete + rendering)
//   speakerAlters     – alters allowed as the speaker (defaults to alters; private channels limit this)
//   defaultAuthorId   – pre-selected speaker
//   frontingAlterIds  – ids currently fronting (whisper reveal gate)
//   onSend(payload)   – async; payload = { cleanText, authorAlterIds, replyToId,
//                       mentionedIds, isWhisper, whisperRecipientIds, replyAuthorIds,
//                       notifyOnReply, replyTo }. Return false to keep the composer text.
//   onEdit(msg, { cleanText, authorAlterIds, mentionedIds })
//   onDelete(msg)
//   showReply         – enable per-message reply (chat: true, meeting: false by default)
//   emptyState        – node shown when there are no messages
//   headerSlot        – optional node rendered above the stream (chat puts the channel header here)
//   composerPlaceholder, channelLabel – composer placeholder text
//   streamClassName   – override the stream container classes (meeting uses a shorter max-height)
//   focusMessageId, onMessageFocused – deep-link scroll/highlight (chat only)
export default function ChatSurface({
  messages = [],
  alters = [],
  speakerAlters,
  defaultAuthorId,
  frontingAlterIds = [],
  onSend,
  onEdit,
  onDelete,
  showReply = true,
  emptyState,
  headerSlot,
  composerPlaceholder,
  channelLabel,
  streamClassName,
  focusMessageId,
  onMessageFocused,
}) {
  const terms = useTerms();
  const streamRef = useRef(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [highlightId, setHighlightId] = useState(null);

  const sorted = useMemo(
    () => [...messages].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
    [messages]
  );

  // Auto-scroll to bottom on new messages, unless deep-linking a message.
  useEffect(() => {
    if (focusMessageId) return;
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [sorted.length, focusMessageId]);

  // Deep-link scroll + temporary highlight.
  useEffect(() => {
    if (!focusMessageId) return;
    if (!sorted.some((m) => m.id === focusMessageId)) return;
    const el = document.querySelector(`[data-msg-id="${focusMessageId}"]`);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setHighlightId(focusMessageId);
    const t = setTimeout(() => setHighlightId(null), 2500);
    onMessageFocused?.();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMessageId, sorted.length]);

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const m of sorted) {
      const d = new Date(m.timestamp);
      const key = format(d, "yyyy-MM-dd");
      if (!groups.has(key)) groups.set(key, { key, date: d, items: [] });
      groups.get(key).items.push(m);
    }
    return [...groups.values()];
  }, [sorted]);

  // Resolve authorship by folding the picker selection (base) with any inline
  // +/- signposts — the SAME rule as the bulletin composer: "+x" ADDS x to the
  // current speakers, "-x -y" REPLACES them with x,y, no signpost keeps the
  // picker selection. Keeps the app's signposting consistent everywhere.
  const resolveAuthors = (content, pickerIds) => {
    const { cleanText } = parseAndStripSignposts(content, alters, [terms.system]);
    const base = (pickerIds || []).filter((id) => id && id !== SYSTEM_AUTHOR.id).map((id) => ({ id }));
    const folded = foldSignpostAuthors(content, alters, { systemKeywords: [terms.system], base });
    const authorAlterIds = folded.filter((a) => a.id !== SYSTEM_AUTHOR.id).map((a) => a.id);
    return { cleanText: (cleanText || "").trim(), authorAlterIds };
  };

  // Build a fully-resolved send payload and hand it to the host.
  const handleComposerSubmit = async ({ content, speakerIds, notifyOnReply }) => {
    let body = content;
    let whisperRecipientIds = [];
    let isWhisper = false;

    if (hasWhisperCommand(content)) {
      // A LEADING "/w @name …" with no brackets → whole-message whisper.
      const leadingNoBracket = WHISPER_RE.test(content) && !content.includes("[");
      if (leadingNoBracket) {
        const afterCmd = content.replace(WHISPER_RE, "");
        const { recipientIds, body: wbody } = peelLeadingMentions(afterCmd, alters);
        const { cleanText, authorAlterIds } = resolveAuthors(wbody, speakerIds);
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
        const ok = await onSend?.({
          cleanText,
          authorAlterIds,
          replyToId: replyTo?.id || null,
          replyTo,
          mentionedIds: notifyIds,
          isWhisper: true,
          whisperRecipientIds: recipientIds,
          replyAuthorIds: [],
          notifyOnReply,
        });
        if (ok !== false) setReplyTo(null);
        return ok;
      }
      const w = applyWhisper(content, alters, { rich: true, surfaceLabel: "message" });
      if (w === null) return false; // backed out of the mid-message warning
      body = w.content;
      whisperRecipientIds = w.recipientIds || [];
      isWhisper = !!w.isWhisper && whisperRecipientIds.length > 0;
    }

    const { cleanText, authorAlterIds } = resolveAuthors(body, speakerIds);
    if (!cleanText) return false;
    const mentionedIds = extractMentionedIds(cleanText, alters);
    const replyAuthorIds = replyTo && notifyOnReply
      ? (Array.isArray(replyTo.author_alter_ids) && replyTo.author_alter_ids.length > 0
          ? replyTo.author_alter_ids
          : (replyTo.author_alter_id ? [replyTo.author_alter_id] : (replyTo.alter_id ? [replyTo.alter_id] : [])))
        .filter((id) => id && !authorAlterIds.includes(id))
      : [];
    const allMentionedIds = [...new Set([...mentionedIds, ...replyAuthorIds, ...whisperRecipientIds])];
    const ok = await onSend?.({
      cleanText,
      authorAlterIds,
      replyToId: replyTo?.id || null,
      replyTo,
      mentionedIds: allMentionedIds,
      isWhisper,
      whisperRecipientIds,
      replyAuthorIds,
      notifyOnReply,
    });
    if (ok !== false) setReplyTo(null);
    return ok;
  };

  const handleSubmitEdit = async (msg, nextContent) => {
    const trimmed = (nextContent || "").trim();
    if (!trimmed || trimmed === msg.content) { setEditing(null); return; }
    const existingIds = Array.isArray(msg.author_alter_ids) && msg.author_alter_ids.length > 0
      ? msg.author_alter_ids
      : (msg.author_alter_id ? [msg.author_alter_id] : (msg.alter_id ? [msg.alter_id] : []));
    const { cleanText, authorAlterIds } = resolveAuthors(trimmed, existingIds);
    if (!cleanText) { setEditing(null); return; }
    await onEdit?.(msg, { cleanText, authorAlterIds, mentionedIds: extractMentionedIds(cleanText, alters) });
    setEditing(null);
  };

  const handleDeleteMsg = async (msg) => {
    await onDelete?.(msg);
  };

  return (
    <>
      {headerSlot}
      <div ref={streamRef} className={streamClassName || "flex-1 overflow-y-auto px-3 py-3 space-y-4"}>
        {grouped.length === 0 ? (
          emptyState || (
            <p className="text-center text-sm text-muted-foreground italic mt-12">
              No messages yet. Say something below.
            </p>
          )
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
                allMessages={messages}
                editing={editing?.id === m.id}
                highlighted={highlightId === m.id}
                frontingAlterIds={frontingAlterIds}
                onStartEdit={onEdit ? () => setEditing(m) : undefined}
                onCancelEdit={() => setEditing(null)}
                onSubmitEdit={(content) => handleSubmitEdit(m, content)}
                onReply={showReply ? () => setReplyTo(m) : undefined}
                onDelete={onDelete ? () => handleDeleteMsg(m) : undefined}
              />
            ))}
          </section>
        ))}
      </div>

      <Composer
        channelLabel={channelLabel}
        alters={alters}
        speakerAlters={speakerAlters || alters}
        defaultAuthorId={defaultAuthorId}
        replyTo={showReply ? replyTo : null}
        onCancelReply={() => setReplyTo(null)}
        onSubmit={handleComposerSubmit}
        terms={terms}
        placeholderText={composerPlaceholder}
      />
    </>
  );
}
