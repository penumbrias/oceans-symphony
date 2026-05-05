import React, { useRef, useEffect, useCallback } from "react";
import {
  Bold, Italic, Underline, Strikethrough,
  Heading2, Heading3, List, ListOrdered, Quote, Minus,
} from "lucide-react";

const TOOLS = [
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

export default function WysiwygEditor({ value = "", onChange, placeholder = "Write here..." }) {
  const editorRef = useRef(null);
  const lastHtml = useRef(value);

  // Mount: set initial content
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = value || "";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when value changes externally (e.g. mode switch resets content)
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

  const execCmd = (cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    emit();
  };

  const handleKeyDown = (e) => {
    // Ctrl/Cmd + B/I/U shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b") { e.preventDefault(); execCmd("bold"); }
      if (e.key === "i") { e.preventDefault(); execCmd("italic"); }
      if (e.key === "u") { e.preventDefault(); execCmd("underline"); }
    }
  };

  return (
    <div className="rounded-xl border border-input bg-background overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border/50 bg-muted/20">
        {TOOLS.map((tool, i) => {
          if (tool.type === "sep") {
            return <div key={i} className="w-px h-4 bg-border/60 mx-0.5 flex-shrink-0" />;
          }
          const Icon = tool.icon;
          return (
            <button
              key={i}
              type="button"
              title={tool.title}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus in editor
                execCmd(tool.cmd, tool.val ?? null);
              }}
              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}
      </div>

      {/* Editable content area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        className="wysiwyg-content min-h-[200px] px-3 py-2.5 text-sm focus:outline-none prose prose-sm dark:prose-invert max-w-none leading-relaxed"
      />
    </div>
  );
}
