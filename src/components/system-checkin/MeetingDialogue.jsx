import React, { useMemo, useRef, useState, useEffect } from "react";
import { format } from "date-fns";
import { User, Send, Pencil, Trash2, Check, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import { renderRichContent } from "@/lib/renderBulletinContent";

// ── Meeting "open dialogue" space ────────────────────────────────────────────
//
// A meeting-scoped chat that REUSES the system chat's message-render +
// speaker-attribution patterns (renderRichContent, an alter-coloured author
// row with avatar + name + time) but is NOT saved into the real system chat
// channels. The whole history lives ON the meeting record under
// `SystemCheckIn.dialogue`:
//   [{ id, alter_id (null = system), text, timestamp }]
// so the back-and-forth between alters persists with that meeting and nothing
// leaks into the global SystemChatMessage entity.
//
// The composer is speaker-attributed: the speaker is chosen with the standard
// searchable AlterSearchSelect (NEVER a bare <select>); sending appends a new
// entry to the array via onChange.

const SYSTEM_AUTHOR = { id: null, name: "System", color: "#94a3b8" };

export function normalizeDialogue(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m.text === "string")
    .map((m, i) => ({
      id: m.id || `dlg-${m.timestamp || i}-${i}`,
      alter_id: m.alter_id || null,
      text: m.text,
      timestamp: m.timestamp || new Date().toISOString(),
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
      ) : alter?.id == null ? (
        <User style={{ width: size * 0.5, height: size * 0.5 }} />
      ) : (
        <span className="font-semibold">{(alter?.name || "?").slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}

function DialogueRow({ msg, alter, terms, onStartEdit, editing, onSubmitEdit, onCancelEdit, onDelete }) {
  const formatAlter = useAlterLabel();
  const [draft, setDraft] = useState(msg.text);
  useEffect(() => { setDraft(msg.text); }, [msg.text, editing]);
  const author = alter || SYSTEM_AUTHOR;
  const name = alter ? formatAlter(alter) : (terms.System || "System");

  return (
    <div className="group flex gap-2 px-1 py-1 rounded-md hover:bg-muted/30 transition-colors">
      <AlterAvatar alter={author} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: author.color || undefined }}>{name}</span>
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

export default function MeetingDialogue({ dialogue = [], onChange, alters = [], defaultSpeakerId = null }) {
  const terms = useTerms();
  const list = useMemo(() => normalizeDialogue(dialogue), [dialogue]);
  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  const [speakerId, setSpeakerId] = useState(defaultSpeakerId);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const streamRef = useRef(null);

  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    const entry = {
      id: `dlg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      alter_id: speakerId || null,
      text: body,
      timestamp: new Date().toISOString(),
    };
    onChange([...list, entry]);
    setText("");
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
            A private space for {terms.alters} to talk things through. Nothing here is saved to {terms.System} Chat.
          </p>
        ) : (
          list.map((m) => (
            <DialogueRow
              key={m.id}
              msg={m}
              alter={m.alter_id ? altersById[m.alter_id] : null}
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

      <div className="border-t border-border/50 p-2 space-y-2 bg-background">
        <div className="flex items-end gap-2">
          <div className="w-36 flex-shrink-0">
            <AlterSearchSelect
              alters={alters}
              value={speakerId}
              onChange={setSpeakerId}
              terms={terms}
              placeholder={terms.System || "System"}
              noneLabel={terms.System || "System"}
              showNone
              buttonClassName="py-1.5"
            />
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder={`Speak as ${speakerId ? (altersById[speakerId]?.name || terms.alter) : (terms.System || "System")}…`}
            rows={1}
            className="text-sm resize-none min-h-[40px] max-h-32 flex-1"
          />
          <Button type="button" onClick={send} disabled={!text.trim()} className="h-10 px-3 flex-shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
