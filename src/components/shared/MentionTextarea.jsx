import React, { forwardRef, useRef, useState, useMemo, useCallback, useImperativeHandle } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";

// One reusable textarea with @mention (always) + -signpost (opt-in via
// `signposts`) autocomplete, so every surface shares the same behaviour
// instead of re-implementing it. The host owns the value (`value` /
// `onChange(stringValue)`); the underlying <textarea> ref is forwarded so a
// host can still run formatting-toolbar inserts (useTextareaInsert) on it.
//
// Cursor-aware: the "open" token is the @/- token at the CARET (not just the
// last @ in the string), so mentions work when editing mid-text too.

const WS = /\s/;

// The @/- token the caret currently sits inside. A token starts with @ or -
// at a word boundary (start, or after whitespace) and can't contain
// whitespace. Hyphens mid-word (well-being, 2024-01) are NOT signpost starts.
function detectToken(value, caret) {
  let i = caret - 1;
  while (i >= 0) {
    const ch = value[i];
    if (WS.test(ch)) return null;
    const prev = i > 0 ? value[i - 1] : "";
    if ((ch === "@" || ch === "-") && (i === 0 || WS.test(prev))) {
      return { type: ch === "@" ? "mention" : "signpost", start: i, query: value.slice(i + 1, caret) };
    }
    i -= 1;
  }
  return null;
}

function SuggestionRow({ alter, label, onSelect }) {
  const avatar = useResolvedAvatarUrl(alter?.avatar_url);
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onSelect(); }}
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

const MentionTextarea = forwardRef(function MentionTextarea(
  { value = "", onChange, alters = [], signposts = false, systemName, placeholder, className, rows, ...textareaProps },
  forwardedRef
) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const innerRef = useRef(null);
  useImperativeHandle(forwardedRef, () => innerRef.current, []);

  const [menu, setMenu] = useState(null); // { type, start, query } | null

  // Alters a group hid from mention/signpost suggestions (typing a full name
  // still resolves; they're just not suggested).
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const hidden = useMemo(() => getAlterIdsByGroupFlag(groups, alters, "hide_from_mentions"), [groups, alters]);

  const sysToken = terms.system || "system";
  const sysLabel = systemName || terms.System || "System";

  const suggestions = useMemo(() => {
    if (!menu) return [];
    const q = (menu.query || "").toLowerCase();
    return alters
      .filter((a) => !a.is_archived && !hidden.has(a.id))
      .filter((a) => !q || a.name?.toLowerCase().includes(q) || (a.alias && a.alias.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [menu, alters, hidden]);

  const showSystemRow = useMemo(() => {
    if (!menu || menu.type !== "signpost") return false;
    const q = (menu.query || "").toLowerCase();
    if (!q) return true;
    return "system".startsWith(q) || sysToken.toLowerCase().startsWith(q)
      || (typeof sysLabel === "string" && sysLabel.toLowerCase().split(/\s+/).some((t) => t.startsWith(q)));
  }, [menu, sysToken, sysLabel]);

  const recompute = useCallback((val, caret) => {
    const tok = detectToken(val, caret);
    if (!tok || (tok.type === "signpost" && !signposts)) { setMenu(null); return; }
    setMenu(tok);
  }, [signposts]);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    recompute(val, e.target.selectionStart ?? val.length);
  };

  const handleCaret = (e) => recompute(value, e.target.selectionStart ?? value.length);

  const insert = (token) => {
    const ta = innerRef.current;
    const caret = ta ? (ta.selectionStart ?? value.length) : value.length;
    const tok = detectToken(value, caret);
    if (!tok) { setMenu(null); return; }
    const prefix = tok.type === "mention" ? "@" : "-";
    const before = value.slice(0, tok.start);
    const after = value.slice(caret);
    const insertText = `${prefix}${token} `;
    onChange(before + insertText + after);
    setMenu(null);
    const newCaret = before.length + insertText.length;
    requestAnimationFrame(() => {
      ta?.focus();
      try { ta?.setSelectionRange(newCaret, newCaret); } catch { /* detached */ }
    });
  };

  const open = !!menu && (suggestions.length > 0 || (menu.type === "signpost" && showSystemRow));

  // Accept the first/best suggestion (Enter or Tab while the menu is open).
  // Returns true if something was inserted so the caller can swallow the key
  // (e.g. so Enter picks a suggestion instead of sending the message).
  const pickFirst = () => {
    if (!open) return false;
    if (suggestions[0]) { insert(suggestions[0].alias || suggestions[0].name); return true; }
    if (menu.type === "signpost" && showSystemRow) { insert(sysToken); return true; }
    return false;
  };

  return (
    <div className="relative">
      <Textarea
        {...textareaProps}
        ref={innerRef}
        value={value}
        rows={rows}
        className={className}
        placeholder={placeholder ?? `Type a note… use @ to mention an ${terms.alter}`}
        onChange={handleChange}
        onClick={handleCaret}
        onKeyUp={(e) => {
          if (e.key === "Escape") setMenu(null);
          else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) handleCaret(e);
          textareaProps.onKeyUp?.(e);
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "Escape") { e.stopPropagation(); setMenu(null); return; }
            if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
              // Menu open → Enter/Tab accepts the suggestion instead of
              // sending / inserting a newline. Don't delegate to the host
              // (its Enter handler would also fire and send the message).
              if (pickFirst()) { e.preventDefault(); return; }
            }
          }
          textareaProps.onKeyDown?.(e);
        }}
        onBlur={(e) => { setTimeout(() => setMenu(null), 120); textareaProps.onBlur?.(e); }}
      />
      {open && (
        <div className="absolute z-50 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg max-h-44 overflow-y-auto overscroll-contain"
          style={{ bottom: "calc(100% + 4px)" }}>
          {menu.type === "signpost" && (
            <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b border-border/50">Sign as author…</div>
          )}
          {menu.type === "signpost" && showSystemRow && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insert(sysToken); }}
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
              onSelect={() => insert(a.alias || a.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default MentionTextarea;
