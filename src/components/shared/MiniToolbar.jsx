import React, { useState, useRef, useCallback, useEffect } from "react";
import { HexColorPicker } from "react-colorful";
import {
  X, ChevronDown, HelpCircle, Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote, Minus,
  CornerDownLeft, AlignLeft, AlignCenter, AlignRight, Link2, Puzzle, Pencil, Sparkles, EyeOff, Eraser,
} from "lucide-react";
import InternalLinkPicker from "@/components/shared/InternalLinkPicker";

export const PRESET_COLORS = [
  "#ff4d4d","#ff85a1","#ff1493","#c0392b",
  "#ff8c00","#ffd700","#f39c12","#ffe066",
  "#2ecc71","#00fa9a","#7fff00","#27ae60",
  "#00bfff","#4169e1","#9b59b6","#c39bd3",
  "#ffffff","#cccccc","#888888","#333333",
];
export const PRESET_HIGHLIGHTS = [
  "#ff4d4d60","#ff85a160","#ffd70080","#2ecc7160",
  "#00bfff60","#9b59b660","#ff8c0080","#ffffff30",
  "#ff149370","#7fff0060","#4169e160","#f39c1260",
  "#ffe066a0","#c0392b60","#27ae6060","#c39bd360",
];

export const FONTS = [
  { label: "Default", value: "inherit" },
  // Sans-serif
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Poppins", value: "Poppins, sans-serif" },
  { label: "Nunito", value: "Nunito, sans-serif" },
  { label: "Raleway", value: "Raleway, sans-serif" },
  // Serif
  { label: "Playfair", value: "Playfair Display, serif" },
  { label: "Lora", value: "Lora, serif" },
  { label: "Merriweather", value: "Merriweather, serif" },
  // Monospace
  { label: "Fira Code", value: "Fira Code, monospace" },
  { label: "Space Mono", value: "Space Mono, monospace" },
  // Handwriting
  { label: "Caveat", value: "Caveat, cursive" },
  { label: "Dancing Script", value: "Dancing Script, cursive" },
  { label: "Pacifico", value: "Pacifico, cursive" },
  { label: "Satisfy", value: "Satisfy, cursive" },
  // Display/Decorative
  { label: "Righteous", value: "Righteous, cursive" },
  { label: "Lobster", value: "Lobster, cursive" },
  { label: "Bungee", value: "Bungee, display" },
  { label: "Orbitron", value: "Orbitron, sans-serif" },
  { label: "Press Start 2P", value: "'Press Start 2P', cursive" },
  { label: "VT323", value: "VT323, monospace" },
  // Cultural/Diverse
  { label: "Noto Sans", value: "Noto Sans, sans-serif" },
  { label: "Noto Serif", value: "Noto Serif, serif" },
  { label: "Sawarabi Mincho", value: "Sawarabi Mincho, serif" },
  { label: "Nanum Gothic", value: "Nanum Gothic, sans-serif" },
  { label: "Amiri", value: "Amiri, serif" },
  { label: "Tajawal", value: "Tajawal, sans-serif" },
];

// Editor fonts are bundled locally — no Google Fonts CDN
import '@/lib/editorFonts.js';

export function ColorPickerModal({ mode, onApply, onClose }) {
  const isFg = mode === "fg";
  const [hex, setHex] = useState(isFg ? "#ff4d4d" : "#ffd70080");
  const presets = isFg ? PRESET_COLORS : PRESET_HIGHLIGHTS;
  const pickerColor = hex.length === 9 ? hex.slice(0, 7) : hex;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
      <div className="bg-background border-2 border-border rounded-xl p-5 space-y-4 max-w-xs mx-4 w-full shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{isFg ? "Text color" : "Highlight color"}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        {isFg && <HexColorPicker color={pickerColor} onChange={setHex} style={{ width: "100%" }} />}
        <div className="grid grid-cols-10 gap-1">
          {presets.map(c => (
            <button key={c} type="button" onClick={() => setHex(c)}
              className={`w-6 h-6 rounded-md border-2 hover:scale-110 transition-transform ${hex === c ? "border-primary" : "border-border/30"}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input type="text" value={hex} onChange={e => setHex(e.target.value)}
            className="flex-1 h-9 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
          <div className="w-9 h-9 rounded-lg border-2 border-border" style={{ backgroundColor: hex }} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium">Cancel</button>
          <button type="button" onClick={() => { onApply(hex); onClose(); }} className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Apply</button>
        </div>
      </div>
    </div>
  );
}

export function useTextareaInsert(ref, value, onChange) {
  return useCallback((before, after = "") => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      const cursor = start + before.length + selected.length + after.length;
      ta.setSelectionRange(
        selected ? start + before.length : cursor,
        selected ? start + before.length + selected.length : cursor
      );
    });
  }, [ref, value, onChange]);
}

// The basics (bold/italic/underline/strike/link/colour) are self-explanatory
// icons, so the "?" legend only needs to explain the "More" and "Fun" tiers.
// `icons` renders the ACTUAL toolbar lucide glyphs so the guide matches the
// buttons; `glyph` is used for the text/emoji buttons (which already match).
const MORE_HELP = [
  { icons: [Heading1, Heading2, Heading3], d: "Headings (largest → smallest)" },
  { icons: [List, ListOrdered], d: "Bullet list / numbered list" },
  { icons: [Quote], d: "Block quote" },
  { icons: [CornerDownLeft], d: "Line break" },
  { icons: [Minus], d: "Divider line" },
  { icons: [AlignLeft, AlignCenter, AlignRight], d: "Align left / center / right" },
  { glyph: "xs sm lg xl", d: "Text size" },
  { glyph: "X² X₂", d: "Superscript / subscript" },
  { glyph: "</>", d: "Inline code" },
  { icons: [EyeOff], d: "Censor bar — hides text behind a bar until tapped" },
  { icons: [Eraser], d: "Clear formatting — strip styles from the selection, or stop typing styled" },
  { icons: [Puzzle], d: "Link to a page inside the app" },
  { icons: [Pencil], d: "Mark text as a fill-in field (bio templates)" },
];
const FUN_HELP = [
  { glyph: "✨ 🌊 🔥 🌿", d: "Gradient text — rainbow / ocean / fire / nature" },
  { glyph: "🔲 💠 🟣 🌑", d: "Boxes — dark / glass / purple / dark-radial" },
  { glyph: "⚡ 💥 🌀 〰", d: "Effects — float / glow / spin / wave" },
  { glyph: "👻 📦 blur rot", d: "Effects — faded / boxed / blur / rotate" },
  { glyph: "Aa", d: "Pick a font for the selected text" },
];

function HelpRow({ icons, glyph, d }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="flex-shrink-0 min-w-[3.5rem] flex items-center gap-1 text-xs font-semibold text-foreground">
        {icons ? icons.map((Ic, i) => <Ic key={i} className="w-3.5 h-3.5" />) : glyph}
      </span>
      <span className="text-xs text-muted-foreground">{d}</span>
    </div>
  );
}

function HelpPopup({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4" onClick={onClose}>
      <div className="bg-background border-2 border-border rounded-2xl w-full max-w-sm shadow-2xl flex flex-col" style={{ maxHeight: "80vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 flex-shrink-0">
          <h3 className="font-semibold text-sm">Formatting tools</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto p-4">
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 mb-3 text-xs">
            <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-foreground/90 leading-relaxed">
              <strong>Select your text first</strong>, then tap a style. This is how colours, fonts, sizes, and especially the <strong>Fun</strong> effects (gradients, boxes, glow…) apply — they wrap whatever you've highlighted. The eraser clears styles back to plain text.
            </p>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Bold / italic / underline / strikethrough (and headings/lists in More) toggle: tap once and keep typing styled, tap again to stop. The extras:</p>
          <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground mb-1">More</p>
          <div className="divide-y divide-border/30">{MORE_HELP.map((r, i) => <HelpRow key={i} {...r} />)}</div>
          <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground mt-3 mb-1">Fun</p>
          <div className="divide-y divide-border/30">{FUN_HELP.map((r, i) => <HelpRow key={i} {...r} />)}</div>
        </div>
      </div>
    </div>
  );
}

// Normalise whatever the user types into a usable href: keep an existing
// scheme, turn a bare "example.com" into "https://example.com", and treat a
// bare email as a mailto:. The display renderer sanitises hrefs again, so
// this only needs to make the common cases work.
function normalizeUrl(raw) {
  let u = (raw || "").trim();
  if (!u) return "";
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return `mailto:${u}`;
  return `https://${u.replace(/^\/+/, "")}`;
}
function escapeHtmlText(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Small URL prompt for the "Web link" button. A plain <a href="https://">
// placeholder (the old behaviour) rendered a dead link to "https://" — there
// was no way to type the actual address in the textarea composer, so rich-text
// links never worked (only markdown [text](url) did). This collects the real
// URL and the caller inserts a proper anchor.
function LinkPromptModal({ onApply, onClose }) {
  const [url, setUrl] = useState("");
  const submit = () => { if (url.trim()) onApply(url); };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4" onClick={onClose}>
      <div className="bg-background border-2 border-border rounded-xl p-5 space-y-3 max-w-xs w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Add a web link</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <input
          type="url" inputMode="url" autoFocus value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="example.com or https://…"
          className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-[0.6875rem] text-muted-foreground leading-snug">Tip: select text first to use it as the link label — otherwise the address itself is shown.</p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium">Cancel</button>
          <button type="button" onClick={submit} disabled={!url.trim()} className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Add link</button>
        </div>
      </div>
    </div>
  );
}

export function MiniToolbar({ onInsert, onInsertLink, onCommand, templateField = false }) {
  const [colorModal, setColorModal] = useState(null);
  // "More" reveals the structural tools; "Fun" (nested inside More) reveals
  // the decorative effects. ALWAYS starts collapsed on mount — every page that
  // shows a toolbar opens with it tidy, regardless of past use.
  const [showMore, setShowMore] = useState(false);
  const [showFun, setShowFun] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [fontPickerPos, setFontPickerPos] = useState(null);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Which toggle commands are active for the current selection, so the
  // matching toolbar buttons light up (bold on → Bold button highlighted).
  // Only meaningful on a live contentEditable host (onCommand present); the
  // textarea fallback can't report state. Updated on every selectionchange.
  const [activeCmds, setActiveCmds] = useState({});
  const savedSelection = useRef(null);
  const fontBtnRef = useRef(null);

  const toggleMore = () => setShowMore((v) => !v);

  // Re-read which toggle commands are active for the current caret/selection.
  // Called on selectionchange (caret moves), keyup (typing — some WebViews
  // don't fire selectionchange mid-type), and right AFTER a toolbar command
  // runs (a button toggle doesn't move the selection, so nothing else would
  // refresh the highlight — this is what made the state lag/invert).
  const syncActiveCmds = useCallback(() => {
    if (!onCommand) return;
    const STATE_CMDS = ["bold", "italic", "underline", "strikeThrough", "insertUnorderedList", "insertOrderedList"];
    const next = {};
    for (const c of STATE_CMDS) {
      try { next[c] = document.queryCommandState(c); } catch { /* unsupported */ }
    }
    setActiveCmds(next);
  }, [onCommand]);

  useEffect(() => {
    if (!onCommand) return;
    document.addEventListener("selectionchange", syncActiveCmds);
    document.addEventListener("keyup", syncActiveCmds);
    syncActiveCmds();
    return () => {
      document.removeEventListener("selectionchange", syncActiveCmds);
      document.removeEventListener("keyup", syncActiveCmds);
    };
  }, [onCommand, syncActiveCmds]);

  // Remember the current selection before opening a modal/popover (colour,
  // font, internal link) that steals focus, so the inserted markup wraps the
  // text the user had selected. Handles BOTH a <textarea>/<input> host (Raw
  // bio mode) and a contentEditable host (the Plain bio editor + system chat).
  const saveSel = () => {
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) {
      savedSelection.current = { kind: "input", el, start: el.selectionStart, end: el.selectionEnd };
      return;
    }
    const sel = window.getSelection();
    if (el && el.isContentEditable && sel && sel.rangeCount > 0) {
      savedSelection.current = { kind: "range", el, range: sel.getRangeAt(0).cloneRange() };
    } else {
      savedSelection.current = null;
    }
  };
  const restoreSel = () => {
    const s = savedSelection.current;
    if (!s) return;
    try {
      if (s.kind === "input") { s.el.focus(); s.el.setSelectionRange(s.start, s.end); }
      else if (s.kind === "range") {
        s.el.focus();
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(s.range);
      }
    } catch { /* node detached / unfocusable */ }
  };

  // Open the font menu as a FIXED-positioned popover anchored above the
  // button, so it escapes the chat composer's overflow clipping.
  const openFontPicker = () => {
    if (showFontPicker) { setShowFontPicker(false); return; }
    saveSel();
    const r = fontBtnRef.current?.getBoundingClientRect();
    if (r) {
      const WIDTH = 192;
      setFontPickerPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)),
        bottom: Math.max(8, window.innerHeight - r.top + 4),
      });
    }
    setShowFontPicker(true);
  };

  const openColorModal = (mode) => {
    saveSel();
    setColorModal(mode);
  };

  const applyColor = (color) => {
    restoreSel();
    // On a live editor (contentEditable host passes onCommand) apply via
    // execCommand so the SELECTION IS PRESERVED — that's what lets you stack
    // colour + font + highlight on the same text. insertHTML collapses the
    // selection after wrapping, so the textarea fallback can still only apply
    // one wrap per selection.
    if (onCommand) {
      // foreColor = text colour; backColor = highlight (Chromium/Android use
      // backColor, not hiliteColor). styleWithCSS (set in the editor) makes
      // both emit <span style>.
      onCommand(colorModal === "fg" ? "foreColor" : "backColor", color);
    } else if (colorModal === "fg") {
      onInsert(`<span style="color:${color};">`, `</span>`);
    } else {
      onInsert(`<span style="background:${color};border-radius:3px;padding:0 2px;">`, `</span>`);
    }
    savedSelection.current = null;
  };

  const applyFont = (fontValue) => {
    restoreSel();
    if (onCommand) onCommand("fontName", fontValue);
    else onInsert(`<span style="font-family:${fontValue};">`, `</span>`);
    setShowFontPicker(false);
    savedSelection.current = null;
  };

  const openInternalLink = () => {
    saveSel();
    setShowLinkPicker(true);
  };

  const openWebLink = () => {
    saveSel();
    setShowLinkPrompt(true);
  };

  // Insert a real anchor for the typed URL. Wraps the selection as the link
  // label when there is one; otherwise the address itself becomes the label.
  // Works on both hosts: execCommand on a contentEditable editor (preserves the
  // selection), tag-wrapping on a textarea.
  const applyLink = (rawUrl) => {
    const url = normalizeUrl(rawUrl);
    if (!url) { setShowLinkPrompt(false); savedSelection.current = null; return; }
    const safeUrl = url.replace(/"/g, "%22");
    restoreSel();
    const s = savedSelection.current;
    const hasSel = !!s && ((s.kind === "input" && s.start !== s.end) || (s.kind === "range" && s.range && !s.range.collapsed));
    if (onCommand) {
      if (hasSel) onCommand("createLink", url);
      else onCommand("insertHTML", `<a href="${safeUrl}">${escapeHtmlText(url)}</a>`);
    } else if (hasSel) {
      onInsert(`<a href="${safeUrl}">`, `</a>`);
    } else {
      onInsert(`<a href="${safeUrl}">${escapeHtmlText(url)}`, `</a>`);
    }
    savedSelection.current = null;
    setShowLinkPrompt(false);
  };

  // Icon button (intuitive lucide glyph) and small text button (xs/sm/…).
  const iconBtn = (Icon, before, after, title) => (
    <button key={title} type="button" title={title} aria-label={title}
      onMouseDown={e => e.preventDefault()}
      onClick={() => onInsert(before, after)}
      className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0">
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
  // Formatting button that TOGGLES on a contentEditable host (execCommand,
  // so pressing Bold then typing keeps typing bold until pressed again),
  // and falls back to wrapping the selection in tags on a textarea host
  // (which can't toggle). `onCommand` is only passed by rich (contentEditable)
  // hosts like the system chat composer.
  const fmtIconBtn = (Icon, cmd, val, before, after, title) => {
    const active = !!(onCommand && activeCmds[cmd]);
    return (
      <button key={title} type="button" title={title} aria-label={title} aria-pressed={active}
        onMouseDown={e => e.preventDefault()}
        onClick={() => {
          if (onCommand) { onCommand(cmd, val); requestAnimationFrame(syncActiveCmds); }
          else onInsert(before, after);
        }}
        className={`h-7 w-7 flex items-center justify-center rounded transition-colors flex-shrink-0 ${active ? "text-primary bg-primary/15" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}>
        <Icon className="w-3.5 h-3.5" />
      </button>
    );
  };
  const txtBtn = (label, before, after, title) => (
    <button key={title} type="button" title={title}
      onMouseDown={e => e.preventDefault()}
      onClick={() => onInsert(before, after)}
      className="h-7 px-1.5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs font-medium flex-shrink-0">
      {label}
    </button>
  );
  const emojiBtn = (emoji, before, after, title) => (
    <button key={title} type="button" title={title}
      onMouseDown={e => e.preventDefault()}
      onClick={() => onInsert(before, after)}
      className="h-7 px-1 flex items-center justify-center rounded hover:bg-muted/60 transition-colors text-xs flex-shrink-0">
      {emoji}
    </button>
  );

  const sep = <div className="w-px h-4 bg-border/40 mx-0.5 flex-shrink-0" />;

  return (
    <>
      {/* ── Basic row (always visible) ── */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-t border-border/30 bg-muted/10 flex-wrap">
        {fmtIconBtn(Bold, "bold", null, "<strong>", "</strong>", "Bold")}
        {fmtIconBtn(Italic, "italic", null, "<em>", "</em>", "Italic")}
        {fmtIconBtn(Underline, "underline", null, "<u>", "</u>", "Underline")}
        {fmtIconBtn(Strikethrough, "strikeThrough", null, "<s>", "</s>", "Strikethrough")}
        {sep}
        {/* Web link — opens a prompt for the real URL (the old button inserted
            a dead "https://" placeholder that couldn't be filled in). */}
        <button type="button" title="Web link" aria-label="Web link"
          onMouseDown={e => e.preventDefault()} onClick={openWebLink}
          className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0">
          <Link2 className="w-3.5 h-3.5" />
        </button>
        {/* Text color */}
        <button type="button" title="Text color" onMouseDown={e => e.preventDefault()} onClick={() => openColorModal("fg")}
          className="w-7 h-7 flex flex-col items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors gap-0 flex-shrink-0">
          <span className="text-xs font-bold" style={{ lineHeight: 1 }}>A</span>
          <span className="w-4 h-0.5 rounded-full" style={{ background: "linear-gradient(90deg,#ff4d4d,#ffd700,#2ecc71,#00bfff,#9b59b6)" }} />
        </button>
        {/* Highlight */}
        <button type="button" title="Highlight color" onMouseDown={e => e.preventDefault()} onClick={() => openColorModal("hl")}
          className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0">
          <span className="text-xs font-bold px-0.5 rounded" style={{ background: "linear-gradient(90deg,#ff4d4d60,#ffd70060,#2ecc7160)", lineHeight: 1.6 }}>A</span>
        </button>
        {/* More toggle */}
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={toggleMore}
          className={`h-7 px-1.5 flex items-center gap-0.5 rounded text-xs font-medium transition-colors flex-shrink-0 ml-auto ${showMore ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}>
          <ChevronDown className={`w-3 h-3 transition-transform ${showMore ? "rotate-180" : ""}`} /> More
        </button>
      </div>

      {/* ── More section (structural tools) ── */}
      {showMore && (
        <div className="px-1.5 py-1 border-t border-border/20 bg-muted/5 space-y-1">
          <div className="flex items-center gap-0.5 flex-wrap">
            {fmtIconBtn(Heading1, "formatBlock", "h1", "<h1>", "</h1>", "Heading 1")}
            {fmtIconBtn(Heading2, "formatBlock", "h2", "<h2>", "</h2>", "Heading 2")}
            {fmtIconBtn(Heading3, "formatBlock", "h3", "<h3>", "</h3>", "Heading 3")}
            {sep}
            {fmtIconBtn(List, "insertUnorderedList", null, "<ul><li>", "</li></ul>", "Bullet list")}
            {fmtIconBtn(ListOrdered, "insertOrderedList", null, "<ol><li>", "</li></ol>", "Numbered list")}
            {fmtIconBtn(Quote, "formatBlock", "blockquote", '<blockquote style="border-left:3px solid hsl(var(--primary));margin:4px 0;padding:4px 12px;color:hsl(var(--muted-foreground));">', "</blockquote>", "Block quote")}
            {sep}
            {iconBtn(CornerDownLeft, "<br />", "", "Line break")}
            {fmtIconBtn(Minus, "insertHorizontalRule", null, '<hr style="border:none;border-top:1px solid hsl(var(--border));margin:12px 0;" />', "", "Divider")}
            {sep}
            {fmtIconBtn(AlignLeft, "justifyLeft", null, '<div style="text-align:left;">', "</div>", "Align left")}
            {fmtIconBtn(AlignCenter, "justifyCenter", null, '<div style="text-align:center;">', "</div>", "Align center")}
            {fmtIconBtn(AlignRight, "justifyRight", null, '<div style="text-align:right;">', "</div>", "Align right")}
          </div>
          <div className="flex items-center gap-0.5 flex-wrap">
            {txtBtn("xs", '<span style="font-size:0.7em;">', "</span>", "Extra small")}
            {txtBtn("sm", '<span style="font-size:0.85em;">', "</span>", "Small")}
            {txtBtn("lg", '<span style="font-size:1.3em;">', "</span>", "Large")}
            {txtBtn("xl", '<span style="font-size:1.8em;font-weight:bold;">', "</span>", "Extra large")}
            {sep}
            {txtBtn("X²", "<sup>", "</sup>", "Superscript")}
            {txtBtn("X₂", "<sub>", "</sub>", "Subscript")}
            {txtBtn("</>", '<code style="background:hsl(var(--muted));padding:1px 6px;border-radius:4px;font-family:monospace;font-size:0.9em;">', "</code>", "Inline code")}
            {sep}
            {/* Censor bar — wraps selection in ||…|| (hidden until tapped) */}
            {iconBtn(EyeOff, "||", "||", "Censor bar — hide until tapped")}
            {/* Clear formatting — only meaningful on a live editor (contentEditable
                host passes onCommand). Strips styling from the selection AND
                turns off any active bold/italic/etc. so you can keep typing
                plain. */}
            {onCommand && (
              <button type="button" title="Clear formatting — back to plain text"
                onMouseDown={e => e.preventDefault()}
                onClick={() => onCommand("removeFormat")}
                className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0">
                <Eraser className="w-3.5 h-3.5" />
              </button>
            )}
            {/* Internal link (opens picker) */}
            <button type="button" title="Link to a page in the app" onMouseDown={e => e.preventDefault()} onClick={openInternalLink}
              className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0">
              <Puzzle className="w-3.5 h-3.5" />
            </button>
            {/* Make-editable (bio template field) — only useful where a
                Simple-mode editor exists, so hidden unless the host opts in. */}
            {templateField && iconBtn(Pencil, '<span data-edit="true">', "</span>", "Make editable in Simple mode (template field)")}
            {sep}
            {/* Fun toggle */}
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowFun(v => !v)}
              className={`h-7 px-1.5 flex items-center gap-0.5 rounded text-xs font-medium transition-colors flex-shrink-0 ${showFun ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}>
              <Sparkles className="w-3 h-3" /> Fun
            </button>
            {/* Help — explains the More + Fun tools */}
            <button type="button" title="What do these buttons do?" onMouseDown={e => e.preventDefault()} onClick={() => setShowHelp(true)}
              className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0 ml-auto">
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

          {/* ── Fun section (decorative effects, nested in More) ── */}
          {showFun && (
            <div className="flex items-center gap-0.5 flex-wrap pt-1 border-t border-border/20">
              {emojiBtn("✨", '<span style="background:linear-gradient(90deg,#ff6ec7,#ffe680,#6effc8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">', "</span>", "Rainbow gradient text")}
              {emojiBtn("🌊", '<span style="background:linear-gradient(90deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">', "</span>", "Ocean gradient text")}
              {emojiBtn("🔥", '<span style="background:linear-gradient(90deg,#ff4d00,#ff9900,#ffee00);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">', "</span>", "Fire gradient text")}
              {emojiBtn("🌿", '<span style="background:linear-gradient(90deg,#00c853,#64dd17,#b2ff59);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">', "</span>", "Nature gradient text")}
              {sep}
              {emojiBtn("🔲", '<div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:12px;">', "</div>", "Dark box")}
              {emojiBtn("💠", '<div style="border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:12px;background:rgba(255,255,255,0.05);backdrop-filter:blur(10px);">', "</div>", "Glass box")}
              {emojiBtn("🟣", '<div style="background:linear-gradient(135deg,#1a0a2e,#2d1b4e);border-radius:12px;padding:16px;border:1px solid rgba(147,51,234,0.3);">', "</div>", "Purple dark box")}
              {emojiBtn("🌑", '<div style="background:radial-gradient(ellipse at top,#1a0533,#000);border-radius:16px;padding:20px;">', "</div>", "Dark radial box")}
              {sep}
              {emojiBtn("⚡", '<span style="animation:float 3s ease-in-out infinite;display:inline-block;">', "</span>", "Float animation")}
              {emojiBtn("💥", '<span style="text-shadow:0 0 10px currentColor;">', "</span>", "Glow")}
              {emojiBtn("🌀", '<span style="display:inline-block;animation:spin 3s linear infinite;">', "</span>", "Spin")}
              {emojiBtn("〰", '<span style="display:inline-block;animation:wave 1s ease-in-out infinite alternate;transform-origin:bottom;">', "</span>", "Wave")}
              {emojiBtn("👻", '<span style="opacity:0.6;">', "</span>", "Faded/ghost")}
              {emojiBtn("📦", '<span style="border:1px solid currentColor;border-radius:4px;padding:1px 6px;">', "</span>", "Boxed text")}
              {txtBtn("blur", '<span style="filter:blur(3px);">', "</span>", "Blur")}
              {txtBtn("rot", '<span style="display:inline-block;transform:rotate(-5deg);">', "</span>", "Slight rotation")}
              {sep}
              {/* Font picker */}
              <button ref={fontBtnRef} type="button" onMouseDown={e => e.preventDefault()} onClick={openFontPicker}
                className="h-7 px-1.5 flex items-center gap-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0">
                Aa <ChevronDown className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Fixed-positioned font menu + click-away backdrop (escapes overflow). */}
      {showFontPicker && fontPickerPos && (
        <>
          <div className="fixed inset-0 z-[199]" onMouseDown={() => setShowFontPicker(false)} />
          <div
            className="fixed w-48 bg-background border-2 border-border rounded-xl shadow-2xl overflow-hidden z-[200]"
            style={{ left: fontPickerPos.left, bottom: fontPickerPos.bottom }}
          >
            <div className="max-h-64 overflow-y-auto p-1 space-y-0.5">
              {FONTS.map(f => (
                <button key={f.value} type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => applyFont(f.value)}
                  className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                  style={{ fontFamily: f.value }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {showHelp && <HelpPopup onClose={() => setShowHelp(false)} />}
      {showLinkPrompt && (
        <LinkPromptModal
          onApply={applyLink}
          onClose={() => { savedSelection.current = null; setShowLinkPrompt(false); }}
        />
      )}
      {colorModal && <ColorPickerModal mode={colorModal} onApply={applyColor} onClose={() => setColorModal(null)} />}
      {showLinkPicker && (
        <InternalLinkPicker
          onSelect={(html) => {
            restoreSel();
            onInsert(html, "");
            savedSelection.current = null;
            setShowLinkPicker(false);
          }}
          onClose={() => { savedSelection.current = null; setShowLinkPicker(false); }}
        />
      )}
    </>
  );
}
