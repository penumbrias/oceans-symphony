import React, { useRef, useEffect, useCallback, useState } from "react";
import {
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote, Minus,
  AlignLeft, AlignCenter, AlignRight, Link, ChevronDown, X,
} from "lucide-react";
import { ColorPickerModal, PRESET_COLORS, PRESET_HIGHLIGHTS, FONTS } from "@/components/shared/MiniToolbar";

const BASIC_TOOLS = [
  { icon: Bold,          cmd: "bold",                title: "Bold (Ctrl+B)" },
  { icon: Italic,        cmd: "italic",              title: "Italic (Ctrl+I)" },
  { icon: Underline,     cmd: "underline",           title: "Underline (Ctrl+U)" },
  { icon: Strikethrough, cmd: "strikeThrough",       title: "Strikethrough" },
  { type: "sep" },
  { icon: Heading1,      cmd: "formatBlock", val: "h1", title: "Heading 1" },
  { icon: Heading2,      cmd: "formatBlock", val: "h2", title: "Heading 2" },
  { icon: Heading3,      cmd: "formatBlock", val: "h3", title: "Heading 3" },
  { type: "sep" },
  { icon: List,          cmd: "insertUnorderedList", title: "Bullet list" },
  { icon: ListOrdered,   cmd: "insertOrderedList",   title: "Numbered list" },
  { icon: Quote,         cmd: "formatBlock", val: "blockquote", title: "Block quote" },
  { icon: Minus,         cmd: "insertHorizontalRule", title: "Divider" },
];

const ALIGN_TOOLS = [
  { icon: AlignLeft,   cmd: "justifyLeft",   title: "Align left" },
  { icon: AlignCenter, cmd: "justifyCenter", title: "Center" },
  { icon: AlignRight,  cmd: "justifyRight",  title: "Align right" },
];

export default function WysiwygEditor({ value = "", onChange, placeholder = "Write here..." }) {
  const editorRef = useRef(null);
  const lastHtml = useRef(value);
  const savedRangeRef = useRef(null);
  const [colorModal, setColorModal] = useState(null); // "fg" | "hl" | null
  const [showMore, setShowMore] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = value || "";
    }
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
    onChange(html);
  }, [onChange]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const range = savedRangeRef.current;
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const execCmd = (cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    emit();
  };

  const insertHTML = useCallback((before, after = "") => {
    editorRef.current?.focus();
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      document.execCommand("insertHTML", false, before + after);
    } else {
      const range = sel.getRangeAt(0);
      const selectedText = range.toString();
      document.execCommand("insertHTML", false, before + selectedText + after);
    }
    emit();
  }, [emit]);

  const openColorModal = (mode) => {
    saveSelection();
    setColorModal(mode);
  };

  const applyColor = (color) => {
    if (colorModal === "fg") {
      insertHTML(`<span style="color:${color};">`, "</span>");
    } else {
      insertHTML(`<span style="background:${color};border-radius:3px;padding:0 2px;">`, "</span>");
    }
  };

  const applyFont = (fontValue) => {
    insertHTML(`<span style="font-family:${fontValue};">`, "</span>");
    setShowFontPicker(false);
  };

  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b") { e.preventDefault(); execCmd("bold"); }
      if (e.key === "i") { e.preventDefault(); execCmd("italic"); }
      if (e.key === "u") { e.preventDefault(); execCmd("underline"); }
    }
  };

  const sep = <div className="w-px h-4 bg-border/60 mx-0.5 flex-shrink-0" />;

  const toolBtn = (Icon, cmd, val, title) => (
    <button key={title} type="button" title={title}
      onMouseDown={(e) => { e.preventDefault(); execCmd(cmd, val ?? null); }}
      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0">
      <Icon className="w-3.5 h-3.5" />
    </button>
  );

  const ihBtn = (label, before, after, title) => (
    <button key={title} type="button" title={title}
      onMouseDown={(e) => { e.preventDefault(); insertHTML(before, after); }}
      className="h-6 px-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0">
      {label}
    </button>
  );

  return (
    <div className="rounded-xl border border-input bg-background overflow-hidden">
      {/* Editable content area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onKeyDown={handleKeyDown}
        onBlur={saveSelection}
        data-placeholder={placeholder}
        className="wysiwyg-content min-h-[200px] px-3 py-2.5 text-sm focus:outline-none prose prose-sm dark:prose-invert max-w-none leading-relaxed"
      />

      {/* Bottom toolbar */}
      <div className="border-t border-border/50 bg-muted/20">
        {/* Basic row */}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
          {BASIC_TOOLS.map((tool, i) => {
            if (tool.type === "sep") return <div key={i} className="w-px h-4 bg-border/60 mx-0.5 flex-shrink-0" />;
            return toolBtn(tool.icon, tool.cmd, tool.val, tool.title);
          })}
          {sep}
          {ALIGN_TOOLS.map(t => toolBtn(t.icon, t.cmd, null, t.title))}
          {sep}
          {/* Link */}
          <button type="button" title="Insert link"
            onMouseDown={(e) => { e.preventDefault(); const url = prompt("URL:"); if (url) execCmd("createLink", url); }}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0">
            <Link className="w-3.5 h-3.5" />
          </button>
          {sep}
          {/* Text color */}
          <button type="button" title="Text color" onMouseDown={(e) => { e.preventDefault(); openColorModal("fg"); }}
            className="w-7 h-7 flex flex-col items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0 gap-0">
            <span className="text-xs font-bold" style={{ lineHeight: 1 }}>A</span>
            <span className="w-4 h-0.5 rounded-full" style={{ background: "linear-gradient(90deg,#ff4d4d,#ffd700,#2ecc71,#00bfff,#9b59b6)" }} />
          </button>
          {/* Highlight */}
          <button type="button" title="Highlight color" onMouseDown={(e) => { e.preventDefault(); openColorModal("hl"); }}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0">
            <span className="text-xs font-bold px-0.5 rounded" style={{ background: "linear-gradient(90deg,#ff4d4d60,#ffd70060,#2ecc7160)", lineHeight: 1.6 }}>A</span>
          </button>
          {sep}
          {/* Clear formatting */}
          <button type="button" title="Clear formatting"
            onMouseDown={(e) => { e.preventDefault(); execCmd("removeFormat"); }}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
          {sep}
          {/* More toggle */}
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowMore(v => !v)}
            className={`h-6 px-1.5 flex items-center gap-0.5 rounded text-xs font-medium transition-colors flex-shrink-0 ${showMore ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}>
            <ChevronDown className={`w-3 h-3 transition-transform ${showMore ? "rotate-180" : ""}`} /> More
          </button>
        </div>

        {/* Extended row */}
        {showMore && (
          <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-t border-border/20 bg-muted/5">
            {/* Font size */}
            {[["xs","0.7em"],["sm","0.85em"],["lg","1.3em"],["xl","1.8em;font-weight:bold;"]].map(([label, size]) => (
              <button key={label} type="button" title={`Font size ${label}`}
                onMouseDown={(e) => { e.preventDefault(); insertHTML(`<span style="font-size:${size}">`, "</span>"); }}
                className="h-6 px-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0">
                {label}
              </button>
            ))}
            {sep}
            {/* Gradients */}
            {[
              ["✨", "background:linear-gradient(90deg,#ff6ec7,#ffe680,#6effc8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;", "Rainbow"],
              ["🌊", "background:linear-gradient(90deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;", "Ocean"],
              ["🔥", "background:linear-gradient(90deg,#ff4d00,#ff9900,#ffee00);-webkit-background-clip:text;-webkit-text-fill-color:transparent;", "Fire"],
              ["🌿", "background:linear-gradient(90deg,#00c853,#64dd17,#b2ff59);-webkit-background-clip:text;-webkit-text-fill-color:transparent;", "Nature"],
            ].map(([emoji, style, title]) => (
              <button key={title} type="button" title={`${title} gradient text`}
                onMouseDown={(e) => { e.preventDefault(); insertHTML(`<span style="${style}">`, "</span>"); }}
                className="h-6 px-1 rounded text-xs hover:bg-muted/60 transition-colors flex-shrink-0">
                {emoji}
              </button>
            ))}
            {sep}
            {/* Super / sub / code / blur / rot */}
            {ihBtn("X²", "<sup>", "</sup>", "Superscript")}
            {ihBtn("X₂", "<sub>", "</sub>", "Subscript")}
            {ihBtn("</>", '<code style="background:hsl(var(--muted));padding:1px 6px;border-radius:4px;font-family:monospace;font-size:0.9em;">', "</code>", "Inline code")}
            {ihBtn("blur", '<span style="filter:blur(3px);">', "</span>", "Blur")}
            {ihBtn("rot", '<span style="display:inline-block;transform:rotate(-5deg);">', "</span>", "Slight rotation")}
            {sep}
            {/* Styled boxes */}
            {ihBtn("🔲", '<div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:12px;">', "</div>", "Dark box")}
            {ihBtn("💠", '<div style="border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:12px;background:rgba(255,255,255,0.05);backdrop-filter:blur(10px);">', "</div>", "Glass box")}
            {ihBtn("🟣", '<div style="background:linear-gradient(135deg,#1a0a2e,#2d1b4e);border-radius:12px;padding:16px;border:1px solid rgba(147,51,234,0.3);">', "</div>", "Purple dark box")}
            {ihBtn("🌑", '<div style="background:radial-gradient(ellipse at top,#1a0533,#000);border-radius:16px;padding:20px;">', "</div>", "Dark radial box")}
            {sep}
            {/* Animation / effects */}
            {ihBtn("⚡", '<span style="animation:float 3s ease-in-out infinite;display:inline-block;">', "</span>", "Float animation")}
            {ihBtn("💥", '<span style="text-shadow:0 0 10px currentColor;">', "</span>", "Glow")}
            {ihBtn("🌀", '<span style="display:inline-block;animation:spin 3s linear infinite;">', "</span>", "Spin")}
            {ihBtn("〰", '<span style="display:inline-block;animation:wave 1s ease-in-out infinite alternate;transform-origin:bottom;">', "</span>", "Wave")}
            {ihBtn("👻", '<span style="opacity:0.6;">', "</span>", "Faded/ghost")}
            {ihBtn("📦", '<span style="border:1px solid currentColor;border-radius:4px;padding:1px 6px;">', "</span>", "Boxed text")}
            {sep}
            {/* Font family picker */}
            <div className="relative flex-shrink-0">
              <button type="button" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { saveSelection(); setShowFontPicker(f => !f); }}
                className={`h-6 px-1.5 flex items-center gap-0.5 rounded text-xs transition-colors ${showFontPicker ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}>
                Aa <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {showFontPicker && (
                <div className="absolute bottom-full left-0 mb-1 w-48 bg-background border-2 border-border rounded-xl shadow-2xl overflow-hidden z-[70]">
                  <div className="max-h-64 overflow-y-auto p-1 space-y-0.5">
                    {FONTS.map(f => (
                      <button key={f.value} type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyFont(f.value)}
                        className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                        style={{ fontFamily: f.value }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {colorModal && (
        <ColorPickerModal
          mode={colorModal}
          onApply={applyColor}
          onClose={() => setColorModal(null)}
        />
      )}
    </div>
  );
}
