import React, { useState, useRef, useCallback, useEffect } from "react";
import { Eye, X } from "lucide-react";
import { toast } from "sonner";
import { MiniToolbar, useTextareaInsert } from "@/components/shared/MiniToolbar";
import BlockEditor, { blocksToHTML, htmlToBlocks, ImagePickerModal } from "@/components/shared/BlockEditor";

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
    const galleryImages = images.map(img => ({ src: img.src, alt: img.alt, cropped: false }));
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      const nextImgs = extractImages(next);
      if (nextImgs.length > 0 && isBlankish(stripImages(next))) { i++; galleryImages.push(...nextImgs.map(img => ({ src: img.src, alt: img.alt, cropped: false }))); }
      else break;
    }
    if (galleryImages.length === 1) {
      const img = images[0];
      const w = img.w ? `${img.w}px` : '100%';
      const hStyle = img.h ? `height:${img.h}px;object-fit:cover;` : 'height:auto;';
      blocks.push({ id: uid(), type: "raw", content: `<img src="${img.src}" alt="${img.alt}" style="display:block;width:${w};${hStyle}border-radius:8px;margin:4px 0;" />` });
    } else {
      blocks.push({ id: uid(), type: "gallery", maxHeight: 160, images: galleryImages });
    }
  }
  flushText(pendingText);
  return blocks.length ? blocks : [{ id: uid(), type: "text", content: "" }];
}

function ImportSPModal({ onImport, onClose }) {
  const [text, setText] = useState("");
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-background border-2 border-border rounded-2xl p-5 space-y-4 max-w-lg mx-4 w-full shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Import Simply Plural Template</h3>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Paste your SP markdown template. Images, galleries, layouts, tables, and formatting all convert automatically.
        </p>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste SP template here..."
          className="w-full h-52 px-3 py-2.5 rounded-xl border border-input bg-background text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring" autoFocus />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium">Cancel</button>
          <button type="button" onClick={() => { onImport(text); onClose(); }} disabled={!text.trim()}
            className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40">Import as blocks</button>
        </div>
      </div>
    </div>
  );
}

function HTMLPreviewModal({ html, onClose }) {
  const [tab, setTab] = useState("preview");
  return (
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
            ? <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
            : <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">{html}</pre>}
        </div>
      </div>
    </div>
  );
}

export default function BioEditor({ value, onChange }) {
  const [showImport, setShowImport] = useState(false);
  const [showHTMLPreview, setShowHTMLPreview] = useState(false);
  const [currentHTML, setCurrentHTML] = useState(value || "");

  const handleChange = (html) => {
    setCurrentHTML(html);
    onChange(html);
  };

  const handleImport = useCallback((spText) => {
    // Convert SP text to blocks HTML and pass to BlockEditor via value
    // We trigger by updating value through onChange
    const blocks = convertSPToBlocks(spText);
    const html = blocksToHTML(blocks);
    handleChange(html);
    toast.success(`Imported ${blocks.length} block${blocks.length !== 1 ? "s" : ""}!`);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground font-medium">Description / Bio</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowHTMLPreview(true)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <Eye className="w-3 h-3" /> Preview
          </button>
          <button type="button" onClick={() => setShowImport(true)}
            className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">
            Import SP Template
          </button>
        </div>
      </div>
      <BlockEditor value={value} onChange={handleChange} />
      {showImport && <ImportSPModal onImport={handleImport} onClose={() => setShowImport(false)} />}
      {showHTMLPreview && <HTMLPreviewModal html={currentHTML} onClose={() => setShowHTMLPreview(false)} />}
    </div>
  );
}