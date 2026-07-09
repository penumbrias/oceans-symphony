import React, { forwardRef, useRef, useEffect, useCallback, useImperativeHandle, useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { effectiveAlias } from "@/lib/alterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";
import { detectCommandToken, buildCommandSuggestions, buildCatalogues } from "@/lib/logCommands";

// A true inline rich-text input (contentEditable) with @mention (always)
// and -signpost (opt-in) autocomplete. Unlike MentionTextarea — which is a
// plain <textarea> that shows raw HTML tags — this renders formatting
// live, exactly like the Plain bio editor, while keeping the mention /
// signpost machinery working off the DOM caret.
//
// The value is an HTML string (same shape the textarea produced, so the
// send/render path is unchanged). The host drives formatting through the
// imperative `insertHTML(before, after)` exposed on the ref, so the
// existing MiniToolbar keeps working untouched.

const WS = /\s/;
const WORD_CH = /[\p{L}\p{N}_]/u;

// The @/- token the caret currently sits inside, scanning the caret's text
// node. A token starts with @ or - at a word boundary and contains no
// whitespace (so hyphens mid-word like "well-being" aren't signposts).
function detectToken(text, caret) {
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (WS.test(ch)) return null;
    const prev = i > 0 ? text[i - 1] : "";
    if ((ch === "@" || ch === "-") && (i === 0 || WS.test(prev))) {
      return { type: ch === "@" ? "mention" : "signpost", start: i, query: text.slice(i + 1, caret) };
    }
    i -= 1;
  }
  return null;
}

function SuggestionRow({ alter, label, onPick }) {
  const avatar = useResolvedAvatarUrl(alter?.avatar_url);
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onPick(); }}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors text-sm"
    >
      <span className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 text-[0.625rem] font-bold text-white"
        style={{ backgroundColor: alter?.color || "#8b5cf6" }}>
        {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : (label || "?").slice(0, 1).toUpperCase()}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

const RichMentionInput = forwardRef(function RichMentionInput(
  { value = "", onChange, alters = [], signposts = false, commands = true, systemName, placeholder, className = "", onKeyDown },
  forwardedRef
) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const editorRef = useRef(null);
  const lastHtml = useRef(value);
  const [menu, setMenu] = useState(null); // { type, query } | { type:"command", segments } | null

  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const hidden = useMemo(() => getAlterIdsByGroupFlag(groups, alters, "hide_from_mentions"), [groups, alters]);

  // Catalogues for ~command autocomplete (own namespaced keys, deduped across
  // instances by react-query).
  const { data: cmdSymptoms = [] } = useQuery({ queryKey: ["logcmd", "symptoms"], queryFn: () => base44.entities.Symptom.list(), enabled: commands });
  const { data: cmdContacts = [] } = useQuery({ queryKey: ["logcmd", "contacts"], queryFn: () => base44.entities.Contact.list(), enabled: commands });
  const { data: cmdActivityCats = [] } = useQuery({ queryKey: ["logcmd", "activityCategories"], queryFn: () => base44.entities.ActivityCategory.list(), enabled: commands });
  const { data: cmdCustomEmotions = [] } = useQuery({ queryKey: ["logcmd", "customEmotions"], queryFn: () => base44.entities.CustomEmotion.list(), enabled: commands });
  const catalogues = useMemo(
    () => buildCatalogues({ symptoms: cmdSymptoms, contacts: cmdContacts, activityCategories: cmdActivityCats, customEmotions: cmdCustomEmotions }),
    [cmdSymptoms, cmdContacts, cmdActivityCats, cmdCustomEmotions]
  );

  const sysToken = terms.system || "system";
  const sysLabel = systemName || terms.System || "System";

  // ── value <-> innerHTML sync (don't reset DOM while the user types) ──
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (editorRef.current && value !== lastHtml.current) {
      editorRef.current.innerHTML = value || "";
      lastHtml.current = value;
    }
  }, [value]);

  const emit = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? "";
    lastHtml.current = html;
    onChange?.(html);
  }, [onChange]);

  // Imperative API used by the host's formatting toolbar / image inserts.
  const insertHTML = useCallback((before, after = "") => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      document.execCommand("insertHTML", false, `${before}${after}`);
    } else {
      const selectedText = sel.getRangeAt(0).toString();
      document.execCommand("insertHTML", false, `${before}${selectedText}${after}`);
    }
    emit();
  }, [emit]);

  // Toggle-style formatting (bold/italic/headings/lists/align…). Unlike
  // insertHTML this flips the browser's typing state, so pressing Bold and
  // then typing keeps typing bold until pressed again — the behaviour the
  // Plain bio editor has.
  const execCommand = useCallback((cmd, val = null) => {
    editorRef.current?.focus();
    // Emit CSS spans (<span style="color:…">) instead of legacy <font> tags so
    // colour/font survive the content sanitiser and stack on the same text.
    try { document.execCommand("styleWithCSS", false, true); } catch { /* unsupported */ }
    try { document.execCommand(cmd, false, val); } catch { /* unsupported */ }
    emit();
  }, [emit]);

  useImperativeHandle(forwardedRef, () => ({
    insertHTML,
    execCommand,
    focus: () => editorRef.current?.focus(),
    el: editorRef.current,
  }), [insertHTML, execCommand]);

  // ── mention / signpost detection off the live DOM caret ──
  const currentToken = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    return detectToken(node.textContent || "", sel.anchorOffset);
  };

  const recompute = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) { setMenu(null); return; }
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) { setMenu(null); return; }
    const text = node.textContent || "";
    const caret = sel.anchorOffset;
    if (commands) {
      const cmd = detectCommandToken(text, caret);
      if (cmd) { setMenu({ type: "command", segments: cmd.segments }); return; }
    }
    const tok = detectToken(text, caret);
    if (!tok || (tok.type === "signpost" && !signposts)) { setMenu(null); return; }
    setMenu({ type: tok.type, query: tok.query });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signposts, commands]);

  const commandMenu = useMemo(() => {
    if (!menu || menu.type !== "command") return null;
    return buildCommandSuggestions({ segments: menu.segments, catalogues });
  }, [menu, catalogues]);

  const handleInput = () => { emit(); recompute(); };

  const suggestions = useMemo(() => {
    if (!menu) return [];
    const q = (menu.query || "").toLowerCase();
    return alters
      .filter((a) => !a.is_archived && !hidden.has(a.id))
      .filter((a) => !q || a.name?.toLowerCase().includes(q) || (a.alias && a.alias.toLowerCase().includes(q)) || (a.use_emoji_as_alias && a.emoji && a.emoji.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [menu, alters, hidden]);

  // Token to insert when picking a suggestion. Mentions use the emoji-as-alias
  // when set (@😀 resolves via mentionUtils); signposts insert the text
  // alias/name (the `-` parser matches words, not emoji — bare emoji are the
  // emoji signpost path instead).
  const tokenFor = (a, type) => (type === "mention" ? (effectiveAlias(a) || a.name) : (a.alias || a.name));

  const showSystemRow = useMemo(() => {
    if (!menu || menu.type !== "signpost") return false;
    const q = (menu.query || "").toLowerCase();
    if (!q) return true;
    return "system".startsWith(q) || sysToken.toLowerCase().startsWith(q)
      || (typeof sysLabel === "string" && sysLabel.toLowerCase().split(/\s+/).some((t) => t.startsWith(q)));
  }, [menu, sysToken, sysLabel]);

  const open = !!menu && (
    menu.type === "command"
      ? !!(commandMenu && (commandMenu.items.length || commandMenu.canFinish))
      : (suggestions.length > 0 || (menu.type === "signpost" && showSystemRow))
  );

  // Replace the ~command token at the caret with the staged insert, in-place.
  const pickCommand = (item) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { setMenu(null); return; }
    const node = sel.anchorNode;
    const offset = sel.anchorOffset;
    if (!node || node.nodeType !== Node.TEXT_NODE) { setMenu(null); return; }
    const text = node.textContent || "";
    const cmd = detectCommandToken(text, offset);
    if (!cmd) { setMenu(null); return; }
    const body = [...cmd.segments.slice(0, -1), item.insert].join(":");
    const insertText = "~" + body + (item.terminal ? "" : ":");
    const before = text.slice(0, cmd.start);
    const after = text.slice(offset);
    node.textContent = before + insertText + after;
    const caretPos = Math.min(before.length + insertText.length, (node.textContent || "").length);
    try {
      const range = document.createRange();
      range.setStart(node, caretPos);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch { /* detached node */ }
    emit();
    if (item.terminal) setMenu(null); else recompute();
  };

  // Header chevron — "log it / finish": drop a trailing ":" and end with a space.
  const finishCommand = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { setMenu(null); return; }
    const node = sel.anchorNode;
    const offset = sel.anchorOffset;
    if (!node || node.nodeType !== Node.TEXT_NODE) { setMenu(null); return; }
    const text = node.textContent || "";
    const cmd = detectCommandToken(text, offset);
    if (!cmd) { setMenu(null); return; }
    const insertText = "~" + cmd.body.replace(/:$/, "") + " ";
    const before = text.slice(0, cmd.start);
    const after = text.slice(offset);
    node.textContent = before + insertText + after;
    const caretPos = Math.min(before.length + insertText.length, (node.textContent || "").length);
    try {
      const range = document.createRange();
      range.setStart(node, caretPos);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch { /* detached node */ }
    emit();
    setMenu(null);
  };

  // Replace the @/- token at the caret with the chosen name, in-place in
  // the caret's text node, then drop the caret right after it.
  const pick = (name, prefix) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { setMenu(null); return; }
    const node = sel.anchorNode;
    const offset = sel.anchorOffset;
    if (!node || node.nodeType !== Node.TEXT_NODE) { setMenu(null); return; }
    const text = node.textContent || "";
    const tok = detectToken(text, offset);
    if (!tok) { setMenu(null); return; }
    const insertText = `${prefix}${name} `;
    const before = text.slice(0, tok.start);
    const after = text.slice(offset);
    node.textContent = before + insertText + after;
    const caretPos = Math.min(before.length + insertText.length, (node.textContent || "").length);
    try {
      const range = document.createRange();
      range.setStart(node, caretPos);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch { /* detached node */ }
    setMenu(null);
    emit();
  };

  const pickFirst = () => {
    if (!open) return false;
    if (menu.type === "command") {
      if (commandMenu?.items?.[0]) { pickCommand(commandMenu.items[0]); return true; }
      if (commandMenu?.canFinish) { finishCommand(); return true; }
      return false;
    }
    if (suggestions[0]) { pick(tokenFor(suggestions[0], menu.type), menu.type === "mention" ? "@" : "-"); return true; }
    if (menu.type === "signpost" && showSystemRow) { pick(sysToken, "-"); return true; }
    return false;
  };

  const handleKeyDown = (e) => {
    if (open) {
      if (e.key === "Escape") { e.stopPropagation(); setMenu(null); return; }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        if (pickFirst()) { e.preventDefault(); return; }
      }
    }
    // Formatting shortcuts (parity with the Plain editor).
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); document.execCommand("bold"); emit(); return; }
      if (k === "i") { e.preventDefault(); document.execCommand("italic"); emit(); return; }
      if (k === "u") { e.preventDefault(); document.execCommand("underline"); emit(); return; }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder ?? `Type a message… use @ to mention an ${terms.alter}`}
        onInput={handleInput}
        onKeyUp={(e) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) recompute(); }}
        onClick={recompute}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setMenu(null), 150)}
        className={`wysiwyg-content focus:outline-none ${className}`}
      />
      {open && (
        <div className="absolute z-50 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg max-h-44 overflow-y-auto overscroll-contain"
          style={{ bottom: "calc(100% + 4px)" }}>
          {menu.type === "command" ? (
            <>
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border/50">
                <span className="text-xs text-muted-foreground font-medium">{commandMenu.icon} {commandMenu.header}</span>
                {commandMenu.canFinish && (
                  <button
                    type="button"
                    title="Log it — finish the command"
                    onMouseDown={(e) => { e.preventDefault(); finishCommand(); }}
                    className="flex items-center justify-center w-6 h-6 -mr-1 rounded-md text-primary hover:bg-primary/15 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
              {commandMenu.items.map((it, idx) => (
                <button
                  key={idx}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pickCommand(it); }}
                  className="w-full flex items-center px-3 py-1.5 text-left hover:bg-muted/50 transition-colors text-sm"
                >
                  <span className="truncate">{it.insert}</span>
                </button>
              ))}
            </>
          ) : (
          <>
          {menu.type === "signpost" && (
            <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b border-border/50">Sign as author…</div>
          )}
          {menu.type === "signpost" && showSystemRow && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(sysToken, "-"); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors text-sm"
            >
              <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center flex-shrink-0 text-[0.625rem] font-bold">✶</span>
              <span className="truncate">{sysLabel} <span className="text-muted-foreground">(whole {terms.system || "system"})</span></span>
            </button>
          )}
          {suggestions.map((a) => (
            <SuggestionRow
              key={a.id}
              alter={a}
              label={formatAlter ? formatAlter(a) : (a.alias || a.name)}
              onPick={() => pick(tokenFor(a, menu.type), menu.type === "mention" ? "@" : "-")}
            />
          ))}
          </>
          )}
        </div>
      )}
    </div>
  );
});

export default RichMentionInput;
