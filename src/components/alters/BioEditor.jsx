import React, { useState, useRef, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Plus, Trash2, ChevronUp, ChevronDown, Image, AlignLeft, AlignRight,
  LayoutGrid, Minus, Type, Code2, Eye, X, Upload, Loader2, GripVertical,
  Bold, Italic, Strikethrough, Link, Heading1, Heading2, Heading3
} from "lucide-react";
import { toast } from "sonner";

// ── Unique ID generator ──
let _id = 0;
const uid = () => `b_${Date.now()}_${_id++}`;

// ── Convert blocks → HTML string (saved to description) ──
function blocksToHTML(blocks) {
  return blocks.map(block => {
    switch (block.type) {
      case "text":
        return `<div class="bio-text">${block.content || ""}</div>`;
      case "img-left":
        return `<div style="display:flex;gap:14px;align-items:flex-start;margin:8px 0;flex-wrap:wrap;">
  <img src="${block.src || ""}" alt="${block.alt || ""}" style="width:${block.size || 120}px;height:auto;border-radius:8px;flex-shrink:0;object-fit:cover;max-width:100%;" />
  <div style="flex:1;min-width:160px;">${block.text || ""}</div>
</div>`;
      case "img-right":
        return `<div style="display:flex;gap:14px;align-items:flex-start;margin:8px 0;flex-wrap:wrap;">
  <div style="flex:1;min-width:160px;">${block.text || ""}</div>
  <img src="${block.src || ""}" alt="${block.alt || ""}" style="width:${block.size || 120}px;height:auto;border-radius:8px;flex-shrink:0;object-fit:cover;max-width:100%;" />
</div>`;
      case "gallery": {
        const imgs = (block.images || []).filter(i => i.src).map(i =>
          `<img src="${i.src}" alt="${i.alt || ""}" style="flex:1;min-width:0;max-width:100%;height:${block.height || 120}px;object-fit:cover;border-radius:8px;" />`
        ).join("\n  ");
        return `<div style="display:flex;gap:8px;align-items:stretch;margin:8px 0;flex-wrap:wrap;">
  ${imgs}
</div>`;
      }
      case "divider":
        return `<hr style="border:none;border-top:1px solid hsl(var(--border));margin:12px 0;" />`;
      case "raw":
        return block.content || "";
      default:
        return "";
    }
  }).join("\n");
}

// ── Parse saved HTML back into blocks (best-effort) ──
function htmlToBlocks(html) {
  if (!html || !html.trim()) return [];
  const blocks = [];

  // Split on our known block patterns
  const lines = html.split(/\n(?=<(?:div|hr))/);
  for (const chunk of lines) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('<hr')) {
      blocks.push({ id: uid(), type: "divider" });
    } else if (trimmed.includes('display:flex') && trimmed.includes('<img') && trimmed.includes('flex:1;min-width:0')) {
      // Gallery
      const srcs = [...trimmed.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
      const alts = [...trimmed.matchAll(/alt="([^"]*)"/g)].map(m => m[1]);
      const heightMatch = trimmed.match(/height:(\d+)px;object-fit/);
      blocks.push({
        id: uid(), type: "gallery",
        images: srcs.map((src, i) => ({ src, alt: alts[i] || "" })),
        height: heightMatch ? parseInt(heightMatch[1]) : 120,
      });
    } else if (trimmed.includes('display:flex') && trimmed.includes('<img') && trimmed.includes('flex-shrink:0')) {
      // img-left or img-right
      const srcMatch = trimmed.match(/src="([^"]+)"/);
      const altMatch = trimmed.match(/alt="([^"]*)"/);
      const sizeMatch = trimmed.match(/width:(\d+)px;height:auto/);
      // Text content — grab from the div that's not the img
      const textMatch = trimmed.match(/<div style="flex:1[^"]*">([\s\S]*?)<\/div>/);
      const isRight = trimmed.indexOf('<img') > trimmed.indexOf('<div style="flex:1');
      blocks.push({
        id: uid(),
        type: isRight ? "img-right" : "img-left",
        src: srcMatch?.[1] || "",
        alt: altMatch?.[1] || "",
        size: sizeMatch ? parseInt(sizeMatch[1]) : 120,
        text: textMatch?.[1] || "",
      });
    } else if (trimmed.startsWith('<div class="bio-text">')) {
      const content = trimmed.replace(/^<div class="bio-text">/, "").replace(/<\/div>$/, "");
      blocks.push({ id: uid(), type: "text", content });
    } else {
      // Fallback: raw HTML block
      blocks.push({ id: uid(), type: "raw", content: trimmed });
    }
  }

  return blocks.length ? blocks : [{ id: uid(), type: "text", content: html }];
}

// ── Simple inline text toolbar for text/side-text fields ──
function MiniToolbar({ onInsert }) {
  const btn = (label, before, after, title) => (
    <button type="button" title={title}
      onClick={() => onInsert(before, after)}
      className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs font-bold"
    >{label}</button>
  );
  return (
    <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border/30 bg-muted/10">
      {btn("B", "<strong>", "</strong>", "Bold")}
      {btn("I", "<em>", "</em>", "Italic")}
      {btn("S̶", "<s>", "</s>", "Strikethrough")}
      {btn("H1", "<h1>", "</h1>", "Heading 1")}
      {btn("H2", "<h2>", "</h2>", "Heading 2")}
      {btn("H3", "<h3>", "</h3>", "Heading 3")}
      {btn("🔗", '<a href="https://">', "</a>", "Link")}
    </div>
  );
}

function useTextareaInsert(ref, value, onChange) {
  const insert = useCallback((before, after = "") => {
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
  return insert;
}

// ── Image picker sub-modal ──
function ImagePickerModal({ initial = {}, onConfirm, onClose, title = "Insert Image" }) {
  const [src, setSrc] = useState(initial.src || "");
  const [alt, setAlt] = useState(initial.alt || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setSrc(file_url);
      toast.success("Image uploaded!");
    } catch {
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-background border-2 border-border rounded-2xl p-5 space-y-4 max-w-sm mx-4 w-full shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Upload or URL */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium">Image</label>
          <div className="flex gap-2">
            <input
              value={src}
              onChange={e => setSrc(e.target.value)}
              placeholder="Paste URL or upload →"
              className="flex-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors flex-shrink-0">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
          </div>
        </div>

        {/* Preview */}
        {src && (
          <div className="rounded-xl border border-border/40 overflow-hidden bg-muted/20 flex items-center justify-center" style={{ minHeight: 80 }}>
            <img src={src} alt={alt} className="max-h-32 max-w-full object-contain rounded" onError={e => e.target.style.display = "none"} />
          </div>
        )}

        {/* Alt text */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Alt text <span className="opacity-50">(optional)</span></label>
          <input
            value={alt}
            onChange={e => setAlt(e.target.value)}
            placeholder="Description of image"
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80">
            Cancel
          </button>
          <button type="button" onClick={() => { onConfirm({ src, alt }); onClose(); }} disabled={!src.trim()}
            className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add block picker ──
function AddBlockMenu({ onAdd, onClose }) {
  const options = [
    { type: "text", icon: <Type className="w-4 h-4" />, label: "Text", desc: "Paragraph with formatting" },
    { type: "img-left", icon: <AlignLeft className="w-4 h-4" />, label: "Image · Text", desc: "Image left, text right" },
    { type: "img-right", icon: <AlignRight className="w-4 h-4" />, label: "Text · Image", desc: "Text left, image right" },
    { type: "gallery", icon: <LayoutGrid className="w-4 h-4" />, label: "Gallery", desc: "2–4 images in a row" },
    { type: "divider", icon: <Minus className="w-4 h-4" />, label: "Divider", desc: "Horizontal rule" },
  ];
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
      onClick={onClose}>
      <div className="bg-background border-2 border-border rounded-t-2xl sm:rounded-2xl p-4 w-full max-w-sm mx-0 sm:mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Add a block</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="space-y-1">
          {options.map(opt => (
            <button key={opt.type} type="button"
              onClick={() => { onAdd(opt.type); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-colors text-left group">
              <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors flex-shrink-0">
                {opt.icon}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Block wrapper (move up/down, delete) ──
function BlockShell({ index, total, onMoveUp, onMoveDown, onDelete, label, children }) {
  return (
    <div className="group relative rounded-xl border border-border/40 bg-background overflow-hidden hover:border-border transition-colors">
      {/* Block header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20 border-b border-border/30">
        <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
          <GripVertical className="w-3 h-3 opacity-40" />
          {label}
        </span>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={onMoveUp} disabled={index === 0}
            className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-25 hover:bg-muted/60 transition-colors">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={index === total - 1}
            className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-25 hover:bg-muted/60 transition-colors">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onDelete}
            className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Text block ──
function TextBlock({ block, onChange }) {
  const taRef = useRef(null);
  const insert = useTextareaInsert(taRef, block.content || "", v => onChange({ ...block, content: v }));
  return (
    <div>
      <MiniToolbar onInsert={insert} />
      <textarea
        ref={taRef}
        value={block.content || ""}
        onChange={e => onChange({ ...block, content: e.target.value })}
        placeholder="Write something… bold with <strong>text</strong>, headings with <h2>Title</h2>"
        className="w-full min-h-[100px] px-3 py-2.5 text-sm bg-transparent focus:outline-none resize-y font-mono leading-relaxed"
        spellCheck={false}
      />
    </div>
  );
}

// ── Image + Text block (left or right) ──
function ImgTextBlock({ block, onChange }) {
  const [imgModal, setImgModal] = useState(false);
  const taRef = useRef(null);
  const insert = useTextareaInsert(taRef, block.text || "", v => onChange({ ...block, text: v }));
  const isLeft = block.type === "img-left";
  const sizes = [80, 120, 160, 200, 260];

  const imgSlot = (
    <div className="flex flex-col gap-2 p-3 flex-shrink-0" style={{ width: 160 }}>
      <button type="button" onClick={() => setImgModal(true)}
        className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors overflow-hidden bg-muted/20 flex items-center justify-center"
        style={{ height: block.size || 120 }}>
        {block.src ? (
          <img src={block.src} alt={block.alt || ""} className="w-full h-full object-cover rounded-xl" onError={e => e.target.style.display="none"} />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <Image className="w-5 h-5" />
            <span className="text-xs">Add image</span>
          </div>
        )}
      </button>
      {/* Size slider */}
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Size: {block.size || 120}px</span>
        <input type="range" min={60} max={280} step={10}
          value={block.size || 120}
          onChange={e => onChange({ ...block, size: parseInt(e.target.value) })}
          className="w-full h-1 accent-primary" />
      </div>
    </div>
  );

  const textSlot = (
    <div className="flex-1 min-w-0 border-l border-border/30">
      <MiniToolbar onInsert={insert} />
      <textarea
        ref={taRef}
        value={block.text || ""}
        onChange={e => onChange({ ...block, text: e.target.value })}
        placeholder="Text that appears beside the image…"
        className="w-full min-h-[100px] px-3 py-2.5 text-sm bg-transparent focus:outline-none resize-y font-mono leading-relaxed"
        spellCheck={false}
      />
    </div>
  );

  return (
    <>
      <div className={`flex ${isLeft ? "" : "flex-row-reverse"} min-h-[120px]`}>
        {imgSlot}
        {textSlot}
      </div>
      {imgModal && (
        <ImagePickerModal
          initial={{ src: block.src, alt: block.alt }}
          title={isLeft ? "Image (left side)" : "Image (right side)"}
          onConfirm={({ src, alt }) => onChange({ ...block, src, alt })}
          onClose={() => setImgModal(false)}
        />
      )}
    </>
  );
}

// ── Gallery block ──
function GalleryBlock({ block, onChange }) {
  const [activeIdx, setActiveIdx] = useState(null);
  const images = block.images || [{ src: "", alt: "" }, { src: "", alt: "" }];

  const updateImage = (i, patch) => {
    const next = images.map((img, idx) => idx === i ? { ...img, ...patch } : img);
    onChange({ ...block, images: next });
  };

  const addImage = () => {
    if (images.length >= 4) return;
    onChange({ ...block, images: [...images, { src: "", alt: "" }] });
  };

  const removeImage = (i) => {
    if (images.length <= 2) return;
    onChange({ ...block, images: images.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="p-3 space-y-3">
      {/* Height control */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground flex-shrink-0">Row height: {block.height || 120}px</span>
        <input type="range" min={60} max={240} step={10}
          value={block.height || 120}
          onChange={e => onChange({ ...block, height: parseInt(e.target.value) })}
          className="flex-1 h-1 accent-primary" />
      </div>

      {/* Image slots */}
      <div className="flex gap-2">
        {images.map((img, i) => (
          <div key={i} className="relative flex-1 min-w-0 group/img">
            <button type="button" onClick={() => setActiveIdx(i)}
              className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors overflow-hidden bg-muted/20 flex items-center justify-center"
              style={{ height: block.height || 120 }}>
              {img.src ? (
                <img src={img.src} alt={img.alt || ""} className="w-full h-full object-cover rounded-xl" onError={e => e.target.style.display="none"} />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <Image className="w-4 h-4" />
                  <span className="text-xs">{i + 1}</span>
                </div>
              )}
            </button>
            {images.length > 2 && (
              <button type="button" onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {images.length < 4 && (
          <button type="button" onClick={addImage}
            className="flex-shrink-0 w-10 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors bg-muted/10 flex items-center justify-center text-muted-foreground hover:text-primary"
            style={{ height: block.height || 120 }}>
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {activeIdx !== null && (
        <ImagePickerModal
          initial={images[activeIdx]}
          title={`Gallery image ${activeIdx + 1}`}
          onConfirm={({ src, alt }) => { updateImage(activeIdx, { src, alt }); setActiveIdx(null); }}
          onClose={() => setActiveIdx(null)}
        />
      )}
    </div>
  );
}

// ── Divider block ──
function DividerBlock() {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 h-px bg-border/60" />
      <Minus className="w-3 h-3 text-muted-foreground/40" />
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

// ── Raw HTML block (from SP import fallback) ──
function RawBlock({ block, onChange }) {
  return (
    <div>
      <div className="px-3 py-1 bg-amber-500/10 border-b border-amber-500/20">
        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Raw HTML — imported from SP template</span>
      </div>
      <textarea
        value={block.content || ""}
        onChange={e => onChange({ ...block, content: e.target.value })}
        className="w-full min-h-[80px] px-3 py-2.5 text-xs font-mono bg-transparent focus:outline-none resize-y leading-relaxed text-muted-foreground"
        spellCheck={false}
      />
    </div>
  );
}

// ── SP Markdown → blocks converter ──
function convertSPToBlocks(text) {
  // First convert to HTML using our converter, then wrap as a raw block
  // For well-structured SP templates, we attempt to split into sensible blocks

  const blocks = [];
  const sections = text.split(/\n{2,}/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    // Detect image-only lines (gallery)
    const imgOnlyLine = /^(!\[[^\]]*\]\([^)]+\)\s*)+$/.test(trimmed);
    if (imgOnlyLine) {
      const matches = [...trimmed.matchAll(/!\[([^\]]*)\]\(([^)#)]+)(?:#\d+x\d+)?\)/g)];
      if (matches.length >= 2) {
        blocks.push({
          id: uid(), type: "gallery", height: 120,
          images: matches.map(m => ({ src: m[2], alt: m[1] }))
        });
        continue;
      }
    }

    // Detect inline image + text (img-left pattern)
    const inlineImg = trimmed.match(/^!\[([^\]]*)\]\(([^)#)]+)(?:#(\d+)x(\d+))?\)\s+(.+)$/s);
    if (inlineImg) {
      blocks.push({
        id: uid(), type: "img-left",
        src: inlineImg[2], alt: inlineImg[1],
        size: inlineImg[3] ? parseInt(inlineImg[3]) : 120,
        text: convertSPInlineToHTML(inlineImg[5]),
      });
      continue;
    }

    // Detect text + inline image (img-right pattern)
    const inlineImgRight = trimmed.match(/^(.+?)\s+!\[([^\]]*)\]\(([^)#)]+)(?:#(\d+)x(\d+))?\)$/s);
    if (inlineImgRight) {
      blocks.push({
        id: uid(), type: "img-right",
        src: inlineImgRight[3], alt: inlineImgRight[2],
        size: inlineImgRight[4] ? parseInt(inlineImgRight[4]) : 120,
        text: convertSPInlineToHTML(inlineImgRight[1]),
      });
      continue;
    }

    // Everything else → text block with inline HTML conversion
    blocks.push({
      id: uid(), type: "text",
      content: convertSPSectionToHTML(trimmed),
    });
  }

  return blocks.length ? blocks : [{ id: uid(), type: "text", content: "" }];
}

function convertSPInlineToHTML(text) {
  let h = text;
  h = h.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  h = h.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:hsl(var(--primary));text-decoration:underline;">$1</a>');
  return h;
}

function convertSPSectionToHTML(text) {
  let h = text;
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/^---+$/gm, '<hr />');
  h = h.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid hsl(var(--primary));margin:4px 0;padding:4px 12px;color:hsl(var(--muted-foreground));">$1</blockquote>');
  h = h.replace(/^    (.+)$/gm, '<pre style="overflow-x:auto;white-space:nowrap;background:hsl(var(--muted));padding:8px 12px;border-radius:6px;font-size:0.85em;">$1</pre>');
  h = h.replace(/^\|(.+)\|\s*\n\|[-| :]+\|\s*\n((?:\|.+\|\s*\n?)*)/gm, (match, header, body) => {
    const headers = header.split('|').map(hh => hh.trim()).filter(Boolean);
    const headerHTML = headers.map(hh => `<th style="padding:6px 12px;border:1px solid hsl(var(--border));background:hsl(var(--muted));font-weight:600;">${hh}</th>`).join('');
    const rows = body.trim().split('\n').map(row => {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      return '<tr>' + cells.map(c => `<td style="padding:6px 12px;border:1px solid hsl(var(--border));">${c}</td>`).join('') + '</tr>';
    }).join('');
    return `<table style="border-collapse:collapse;width:100%;margin:8px 0;"><thead><tr>${headerHTML}</tr></thead><tbody>${rows}</tbody></table>`;
  });
  h = h.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  h = h.replace(/_([^_]+)_/g, '<em>$1</em>');
  h = h.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  h = h.replace(/__([^_]+)__/g, '<u>$1</u>');
  h = h.replace(/`([^`]+)`/g, '<code style="background:hsl(var(--muted));padding:1px 4px;border-radius:3px;font-size:0.9em;">$1</code>');
  h = h.replace(/(^[-*] .+$(\n[-*] .+$)*)/gm, (match) => {
    const items = match.split('\n').map(line => `<li>${line.replace(/^[-*] /, '')}</li>`).join('');
    return `<ul style="padding-left:1.5em;margin:4px 0;">${items}</ul>`;
  });
  h = h.replace(/(^\d+\. .+$(\n\d+\. .+$)*)/gm, (match) => {
    const items = match.split('\n').map(line => `<li>${line.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol style="padding-left:1.5em;margin:4px 0;">${items}</ol>`;
  });
  h = h.replace(/!\[([^\]]*)\]\(([^)#)]+)(?:#(\d+)x(\d+))?\)/g, (match, alt, src, w, hh) => {
    const width = w ? `${w}px` : 'auto';
    const height = hh ? `${hh}px` : 'auto';
    return `<img src="${src}" alt="${alt}" style="display:inline-block;vertical-align:middle;width:${width};height:${height};max-width:100%;border-radius:4px;margin:2px 4px;" />`;
  });
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:hsl(var(--primary));text-decoration:underline;">$1</a>');
  h = h.replace(/\n/g, '<br />');
  return h;
}

// ── Import SP modal ──
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
          Paste your SP markdown template. Images, layouts, tables, and formatting will be converted into blocks automatically.
        </p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste SP template here..."
          className="w-full h-52 px-3 py-2.5 rounded-xl border border-input bg-background text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium">Cancel</button>
          <button type="button" onClick={() => { onImport(text); onClose(); }} disabled={!text.trim()}
            className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40">
            Import as blocks
          </button>
        </div>
      </div>
    </div>
  );
}

// ── HTML preview modal ──
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
          {tab === "preview" ? (
            <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">{html}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main BioEditor export ──
export default function BioEditor({ value, onChange }) {
  const [blocks, setBlocks] = useState(() => {
    const parsed = htmlToBlocks(value || "");
    return parsed.length ? parsed : [{ id: uid(), type: "text", content: "" }];
  });
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showHTMLPreview, setShowHTMLPreview] = useState(false);

  // Sync blocks → parent HTML value
  useEffect(() => {
    onChange(blocksToHTML(blocks));
  }, [blocks]);

  const updateBlock = useCallback((id, patch) => {
    setBlocks(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b));
  }, []);

  const deleteBlock = useCallback((id) => {
    setBlocks(bs => {
      const next = bs.filter(b => b.id !== id);
      return next.length ? next : [{ id: uid(), type: "text", content: "" }];
    });
  }, []);

  const moveBlock = useCallback((id, dir) => {
    setBlocks(bs => {
      const idx = bs.findIndex(b => b.id === id);
      if (idx < 0) return bs;
      const next = [...bs];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return bs;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }, []);

  const addBlock = useCallback((type) => {
    const defaults = {
      text: { content: "" },
      "img-left": { src: "", alt: "", size: 120, text: "" },
      "img-right": { src: "", alt: "", size: 120, text: "" },
      gallery: { images: [{ src: "", alt: "" }, { src: "", alt: "" }], height: 120 },
      divider: {},
      raw: { content: "" },
    };
    setBlocks(bs => [...bs, { id: uid(), type, ...defaults[type] }]);
  }, []);

  const handleImport = useCallback((spText) => {
    const newBlocks = convertSPToBlocks(spText);
    setBlocks(bs => [...bs, ...newBlocks]);
    toast.success(`Imported ${newBlocks.length} block${newBlocks.length !== 1 ? "s" : ""}!`);
  }, []);

  const blockLabel = (type) => ({
    text: "Text",
    "img-left": "Image · Text",
    "img-right": "Text · Image",
    gallery: "Gallery",
    divider: "Divider",
    raw: "Raw HTML",
  }[type] || type);

  const currentHTML = blocksToHTML(blocks);

  return (
    <div className="space-y-2">
      {/* Label row */}
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

      {/* Block list */}
      <div className="space-y-2">
        {blocks.map((block, i) => (
          <BlockShell key={block.id} index={i} total={blocks.length}
            label={blockLabel(block.type)}
            onMoveUp={() => moveBlock(block.id, -1)}
            onMoveDown={() => moveBlock(block.id, 1)}
            onDelete={() => deleteBlock(block.id)}
          >
            {block.type === "text" && <TextBlock block={block} onChange={b => updateBlock(block.id, b)} />}
            {(block.type === "img-left" || block.type === "img-right") && (
              <ImgTextBlock block={block} onChange={b => updateBlock(block.id, b)} />
            )}
            {block.type === "gallery" && <GalleryBlock block={block} onChange={b => updateBlock(block.id, b)} />}
            {block.type === "divider" && <DividerBlock />}
            {block.type === "raw" && <RawBlock block={block} onChange={b => updateBlock(block.id, b)} />}
          </BlockShell>
        ))}
      </div>

      {/* Add block button */}
      <button type="button" onClick={() => setShowAddMenu(true)}
        className="w-full py-2 rounded-xl border-2 border-dashed border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 text-muted-foreground hover:text-primary text-sm font-medium">
        <Plus className="w-4 h-4" /> Add block
      </button>

      {/* Modals */}
      {showAddMenu && <AddBlockMenu onAdd={addBlock} onClose={() => setShowAddMenu(false)} />}
      {showImport && <ImportSPModal onImport={handleImport} onClose={() => setShowImport(false)} />}
      {showHTMLPreview && <HTMLPreviewModal html={currentHTML} onClose={() => setShowHTMLPreview(false)} />}
    </div>
  );
}
