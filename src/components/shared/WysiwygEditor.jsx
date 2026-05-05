import React, { useRef, useEffect, useCallback, useState } from "react";
import {
  Bold, Italic, Underline, Strikethrough,
  Heading2, Heading3, List, ListOrdered, Quote, Minus,
  AlignLeft, AlignCenter, AlignRight, Link, ChevronDown,
} from "lucide-react";
import { ColorPickerModal, PRESET_COLORS, PRESET_HIGHLIGHTS } from "@/components/shared/MiniToolbar";

const BASIC_TOOLS = [
  { icon: Bold,          cmd: "bold",                title: "Bold (Ctrl+B)" },
  { icon: Italic,        cmd: "italic",              title: "Italic (Ctrl+I)" },
  { icon: Underline,     cmd: "underline",           title: "Underline (Ctrl+U)" },
  { icon: Strikethrough, cmd: "strikeThrough",       title: "Strikethrough" },
  { type: "sep" },
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

  // Mount: set initial content
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = value || "";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when value changes externally
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

  // Insert HTML at cursor (for color/font/effects)
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
          {/* More toggle */}
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowMore(v => !v)}
            className={`h-6 px-1.5 flex items-center gap-0.5 rounded text-xs font-medium transition-colors flex-shrink-0 ${showMore ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}>
            <ChevronDown className={`w-3 h-3 transition-transform ${showMore ? "rotate-180" : ""}`} /> More
          </button>
        </div>

        {/* Extended row */}
        {showMore && (
          <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-t border-border/20 bg-muted/5">
            {[
              ["xs", "0.7em"], ["sm", "0.85em"], ["lg", "1.3em"], ["xl", "1.8em"],
            ].map(([label, size]) => (
              <button key={label} type="button" title={`Font size ${label}`}
                onMouseDown={(e) => { e.preventDefault(); insertHTML(`<span style="font-size:${size};">`, "</span>"); }}
                className="h-6 px-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0">
                {label}
              </button>
            ))}
            {sep}
            {[
              ["✨", "rainbow", "background:linear-gradient(90deg,#ff6ec7,#ffe680,#6effc8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;"],
              ["🌊", "ocean", "background:linear-gradient(90deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;"],
              ["🔥", "fire", "background:linear-gradient(90deg,#ff4d00,#ff9900,#ffee00);-webkit-background-clip:text;-webkit-text-fill-color:transparent;"],
            ].map(([emoji, title, style]) => (
              <button key={title} type="button" title={`${title} gradient text`}
                onMouseDown={(e) => { e.preventDefault(); insertHTML(`<span style="${style}">`, "</span>"); }}
                className="h-6 px-1 rounded text-xs hover:bg-muted/60 transition-colors flex-shrink-0">
                {emoji}
              </button>
            ))}
            {sep}
            {[
              ["X²", "<sup>", "</sup>", "Superscript"],
              ["X₂", "<sub>", "</sub>", "Subscript"],
              ["blur", `<span style="filter:blur(3px);">`, "</span>", "Blur"],
            ].map(([label, before, after, title]) => (
              <button key={title} type="button" title={title}
                onMouseDown={(e) => { e.preventDefault(); insertHTML(before, after); }}
                className="h-6 px-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0">
                {label}
              </button>
            ))}
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
