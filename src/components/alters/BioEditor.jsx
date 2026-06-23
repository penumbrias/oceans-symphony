import React, { useState, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Eye, X, Type, LayoutGrid, Undo2, RotateCcw, Code, HelpCircle, FileDown } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { MiniToolbar, useTextareaInsert } from "@/components/shared/MiniToolbar";
import BlockEditor, { blocksToHTML, htmlToBlocks } from "@/components/shared/BlockEditor";
import SimplePreview from "@/components/shared/SimplePreview";
import WysiwygEditor from "@/components/shared/WysiwygEditor";


let _id = 0;
const uid = () => `b_${Date.now()}_${_id++}`;

function spInlineToHTML(text) {
  let h = text;
  h = h.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  h = h.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  h = h.replace(/`([^`]+)`/g, '<code style="background:hsl(var(--muted));padding:1px 4px;border-radius:3px;">$1</code>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:hsl(var(--primary));text-decoration:underline;">$1</a>');
  return h;
}

function spBlockToHTML(text) {
  let h = text;
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/^---+$/gm, '<hr />');
  h = h.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid hsl(var(--primary));margin:4px 0;padding:4px 12px;color:hsl(var(--muted-foreground));">$1</blockquote>');
  h = h.replace(/^    (.+)$/gm, '<pre style="overflow-x:auto;white-space:nowrap;background:hsl(var(--muted));padding:8px 12px;border-radius:6px;font-size:0.85em;">$1</pre>');
  h = spInlineToHTML(h);
  h = h.replace(/(^[-*] .+$(\n[-*] .+$)*)/gm, match => {
    const items = match.split('\n').map(line => `<li>${line.replace(/^[-*] /, '')}</li>`).join('');
    return `<ul style="padding-left:1.5em;margin:4px 0;">${items}</ul>`;
  });
  h = h.replace(/(^\d+\. .+$(\n\d+\. .+$)*)/gm, match => {
    const items = match.split('\n').map(line => `<li>${line.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol style="padding-left:1.5em;margin:4px 0;">${items}</ol>`;
  });
  h = h.replace(/\n/g, '<br />');
  return h;
}

function convertSPToBlocks(rawText) {
  const blocks = [];
  const lines = rawText.split('\n');
  const IMG_RE = /!\[([^\]]*)\]\(([^)#)]+)(?:#(\d+)x(\d+))?\)/g;
  const extractImages = (line) => {
    const imgs = []; let m; IMG_RE.lastIndex = 0;
    while ((m = IMG_RE.exec(line)) !== null)
      imgs.push({ index: m.index, end: m.index + m[0].length, alt: m[1], src: m[2], w: m[3] ? parseInt(m[3]) : null, h: m[4] ? parseInt(m[4]) : null });
    return imgs;
  };
  const stripImages = (line) => line.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
  const isBlankish = (line) => /^[\s\u3000\u00a0\u200b-\u200f\u202f\u2060\ufeff\u115f\u1160\u3164]*$/.test(line);
  const flushText = (textLines) => {
    const joined = textLines.join('\n').trim();
    if (joined && !isBlankish(joined))
      blocks.push({ id: uid(), type: "text", content: spBlockToHTML(joined) });
  };
  let pendingText = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const images = extractImages(line);
    if (images.length === 0) { pendingText.push(line); continue; }
    const textPart = stripImages(line);
    const hasText = textPart.length > 0 && !isBlankish(textPart);
    if (images.length === 1 && hasText) {
      flushText(pendingText); pendingText = [];
      const img = images[0];
      const beforeText = stripImages(line.slice(0, img.index));
      const afterText = stripImages(line.slice(img.end));
      const isRight = beforeText.length > 0 && !isBlankish(beforeText);
      blocks.push({ id: uid(), type: isRight ? "img-right" : "img-left", src: img.src, alt: img.alt, size: img.w || 120, cropped: false, text: spInlineToHTML(isRight ? beforeText : afterText) });
      continue;
    }
    flushText(pendingText); pendingText = [];

    // Collect the non-image prose from this multi-image line so it
    // doesn't get silently dropped. The previous behaviour was to
    // build a gallery from the images and discard everything else on
    // the same line — which is why a bio with `![A](url) **Rinn**
    // Frequent fronter...` came back as a 3-image gallery and no
    // text at all. Preserve the surrounding text as a separate
    // block emitted after the gallery (perfect inline layout fidelity
    // isn't possible once we collapse into a gallery, but the
    // CONTENT survives, which is what matters).
    const galleryTextSegments = [];
    const ownText = stripImages(line);
    if (ownText.length > 0 && !isBlankish(ownText)) galleryTextSegments.push(ownText);

    const galleryImages = images.map(img => ({ src: img.src, alt: img.alt, cropped: false }));
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      const nextImgs = extractImages(next);
      if (nextImgs.length > 0 && isBlankish(stripImages(next))) {
        i++;
        galleryImages.push(...nextImgs.map(img => ({ src: img.src, alt: img.alt, cropped: false })));
      } else break;
    }
    if (galleryImages.length === 1) {
      const img = images[0];
      const w = img.w ? `${img.w}px` : '100%';
      const hStyle = img.h ? `height:${img.h}px;object-fit:cover;` : 'height:auto;';
      blocks.push({ id: uid(), type: "raw", content: `<img src="${img.src}" alt="${img.alt}" style="display:block;width:${w};${hStyle}border-radius:8px;margin:4px 0;" />` });
    } else {
      blocks.push({ id: uid(), type: "gallery", maxHeight: 160, images: galleryImages });
    }
    if (galleryTextSegments.length > 0) {
      blocks.push({ id: uid(), type: "text", content: spBlockToHTML(galleryTextSegments.join("\n")) });
    }
  }
  flushText(pendingText);
  return blocks.length ? blocks : [{ id: uid(), type: "text", content: "" }];
}

function ImportSPModal({ onImport, onClose }) {
  const [text, setText] = useState("");
  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-background border-2 border-border rounded-2xl p-5 space-y-4 max-w-lg mx-4 w-full shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Import Template</h3>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Paste a template or SP markdown. Raw HTML templates are imported directly; markdown is converted to blocks automatically.
        </p>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste template here..."
          className="w-full h-52 px-3 py-2.5 rounded-xl border border-input bg-background text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring" autoFocus />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium">Cancel</button>
          <button type="button" onClick={() => { onImport(text); onClose(); }} disabled={!text.trim()}
            className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40">Import</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function HTMLPreviewModal({ html, onClose }) {
  const [tab, setTab] = useState("preview");
  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-background border-2 border-border rounded-2xl w-full max-w-2xl mx-4 shadow-2xl flex flex-col" style={{ maxHeight: "80vh" }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
          <div className="flex gap-1">
            {["preview", "html"].map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${tab === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "preview" ? "Preview" : "Raw HTML"}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "preview"
            ? <div className="wysiwyg-content text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
            : <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">{html}</pre>}
        </div>
      </div>
    </div>,
    document.body
  );
}

const MAX_HISTORY = 50;

export default function BioEditor({ value, onChange }) {
  const originalValue = useRef(value || "");
  const hasBlocks = value?.includes('data-blocks=');
  const [editorMode, setEditorMode] = useState(hasBlocks ? "simple" : "plain"); // "plain" = wysiwyg, "raw" = html textarea
  const [showModeHelp, setShowModeHelp] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showHTMLPreview, setShowHTMLPreview] = useState(false);
  const [currentHTML, setCurrentHTML] = useState(value || "");
  const historyRef = useRef({ stack: [value || ""], index: 0 });
  const taRef = useRef(null);
  const insert = useTextareaInsert(taRef, currentHTML, (v) => handleChange(v));

  const previewBlocks = useMemo(() => htmlToBlocks(currentHTML), [currentHTML]);

  const handleChange = useCallback((html) => {
    const h = historyRef.current;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(html);
    if (h.stack.length > MAX_HISTORY) h.stack.shift();
    else h.index++;
    setCurrentHTML(html);
    onChange(html);
  }, [onChange]);

  const handleUndo = () => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index--;
    const prev = h.stack[h.index];
    setCurrentHTML(prev);
    onChange(prev);
    toast.info("Undone");
  };

  const handleDiscard = () => {
    const orig = originalValue.current;
    historyRef.current = { stack: [orig], index: 0 };
    setCurrentHTML(orig);
    onChange(orig);
    toast.info("Changes discarded");
  };

  const handleImport = useCallback((text) => {
    if (text.trim().startsWith('<')) {
      const blocks = [{ id: uid(), type: "text", content: text.trim() }];
      handleChange(blocksToHTML(blocks));
      toast.success("Template imported!");
    } else {
      const blocks = convertSPToBlocks(text);
      handleChange(blocksToHTML(blocks));
      toast.success(`Imported ${blocks.length} block${blocks.length !== 1 ? "s" : ""}!`);
    }
  }, [handleChange]);

  const handleBlockChange = useCallback((id, patch) => {
    // IMPORTANT: operate on the SAME previewBlocks array that SimplePreview
    // was rendered from. htmlToBlocks() assigns a fresh random id on every
    // call, so re-parsing currentHTML here would produce blocks whose ids
    // no longer match the `id` captured when the field was clicked — the
    // .map/.filter would then match nothing and the edit would be silently
    // dropped (the "I type into a template field but it doesn't save" bug).
    if (patch.__remove) {
      const blocks = previewBlocks.filter(b => b.id !== id);
      handleChange(blocksToHTML(blocks.length ? blocks : []));
    } else {
      const updated = previewBlocks.map(b => b.id === id ? { ...b, ...patch } : b);
      handleChange(blocksToHTML(updated));
    }
  }, [previewBlocks, handleChange]);

  const canUndo = historyRef.current.index > 0;
  const hasChanges = currentHTML !== originalValue.current;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground font-medium">Description / Bio</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleUndo} disabled={!canUndo}
            title="Undo"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors disabled:opacity-30">
            <Undo2 className="w-3 h-3" />
          </button>
          <button type="button" onClick={handleDiscard} disabled={!hasChanges}
            title="Discard all changes"
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors disabled:opacity-30">
            <RotateCcw className="w-3 h-3" />
          </button>
          <button type="button" onClick={() => setShowHTMLPreview(true)}
            title="Preview"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <Eye className="w-3 h-3" />
          </button>
          <button type="button" onClick={() => setShowImport(true)}
            title="Import a bio template"
            className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
            <FileDown className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-muted/40 p-1 rounded-lg w-fit">
        <button type="button" onClick={() => setEditorMode("plain")} title="Plain editor" aria-label="Plain editor"
          className={`flex items-center justify-center px-2.5 py-1.5 rounded-md transition-all ${editorMode === "plain" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Type className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => setEditorMode("simple")} title="Simple (formatted) editor" aria-label="Simple editor"
          className={`flex items-center justify-center px-2.5 py-1.5 rounded-md transition-all ${editorMode === "simple" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => setEditorMode("blocks")} title="Blocks editor" aria-label="Blocks editor"
          className={`flex items-center justify-center px-2.5 py-1.5 rounded-md transition-all ${editorMode === "blocks" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <LayoutGrid className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => setEditorMode("raw")} title="Raw HTML" aria-label="Raw HTML editor"
          className={`flex items-center justify-center px-2.5 py-1.5 rounded-md transition-all ${editorMode === "raw" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Code className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setShowModeHelp((v) => !v)}
          aria-label="What do these editing modes do?"
          aria-expanded={showModeHelp}
          className={`flex items-center justify-center w-7 px-1 rounded-md transition-colors ${showModeHelp ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Inline help for the editing modes. Plain inline panel (no
          overlay) so it can't trap input. */}
      {showModeHelp && (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1.5 max-w-prose">
          <p><span className="font-semibold text-foreground inline-flex items-center gap-1"><Type className="w-3 h-3" /> Plain</span> — best for general use. A simple write-and-format box for typing your bio with light formatting.</p>
          <p><span className="font-semibold text-foreground inline-flex items-center gap-1"><Eye className="w-3 h-3" /> Simple</span> — only lets you edit the parts wrapped in <code className="px-1 rounded bg-muted text-[0.625rem]">&lt;span data-edit="true"&gt;</code> (add that wrap easily with the pencil button in the toolbar). Good for filling in imported templates without disturbing their layout.</p>
          <p><span className="font-semibold text-foreground inline-flex items-center gap-1"><LayoutGrid className="w-3 h-3" /> Blocks</span> — for complex editing: add, reorder and arrange blocks. Templates can be pasted into a text block or brought in with the "Import template" button.</p>
          <p><span className="font-semibold text-foreground inline-flex items-center gap-1"><Code className="w-3 h-3" /> Raw</span> — like Blocks but raw HTML. Best for those with some coding knowledge who want full freedom.</p>
          <p className="text-[0.6875rem] text-muted-foreground/80 pt-0.5">Your bio is the same underneath — these are just different ways to edit it. Switch anytime.</p>
        </div>
      )}

      {editorMode === "plain" ? (
        <WysiwygEditor value={currentHTML} onChange={handleChange} placeholder="Write a bio..." />
      ) : editorMode === "raw" ? (
        <div className="rounded-xl border border-input bg-background">
          <textarea ref={taRef} value={currentHTML} onChange={e => handleChange(e.target.value)}
            placeholder="Write a bio..."
            className="w-full min-h-[200px] px-3 py-2.5 text-sm bg-transparent focus:outline-none resize-y font-mono leading-relaxed rounded-t-xl"
            spellCheck={false} />
          <MiniToolbar onInsert={insert} templateField />
        </div>
      ) : editorMode === "simple" ? (
        <SimplePreview
          blocks={previewBlocks}
          onBlockChange={handleBlockChange}
        />
      ) : (
        <BlockEditor value={currentHTML} onChange={handleChange} />
      )}

      {showImport && <ImportSPModal onImport={handleImport} onClose={() => setShowImport(false)} />}
      {showHTMLPreview && <HTMLPreviewModal html={currentHTML} onClose={() => setShowHTMLPreview(false)} />}
    </div>
  );
}