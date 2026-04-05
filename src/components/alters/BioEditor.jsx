import React, { useState, useRef, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Plus, Trash2, ChevronUp, ChevronDown, Image, AlignLeft, AlignRight,
  LayoutGrid, Minus, Type, Eye, X, Upload, Loader2, GripVertical, Crop
} from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { toast } from "sonner";

// ── Unique ID generator ──
let _id = 0;
const uid = () => `b_${Date.now()}_${_id++}`;

// ── Preset swatches ──
const PRESET_COLORS = [
  "#ff4d4d", "#ff85a1", "#ff1493", "#c0392b",
  "#ff8c00", "#ffd700", "#f39c12", "#ffe066",
  "#2ecc71", "#00fa9a", "#7fff00", "#27ae60",
  "#00bfff", "#4169e1", "#9b59b6", "#c39bd3",
  "#ffffff", "#cccccc", "#888888", "#333333",
];
const PRESET_HIGHLIGHTS = [
  "#ff4d4d60", "#ff85a160", "#ffd70080", "#2ecc7160",
  "#00bfff60", "#9b59b660", "#ff8c0080", "#ffffff30",
  "#ff149370", "#7fff0060", "#4169e160", "#f39c1260",
  "#ffe066a0", "#c0392b60", "#27ae6060", "#c39bd360",
];

// ── Color picker modal (matches rest of app style) ──
function ColorPickerModal({ mode, initialColor, onApply, onClose }) {
  const isFg = mode === "fg";
  const [hex, setHex] = useState(initialColor || (isFg ? "#ff4d4d" : "#ffd70080"));
  const presets = isFg ? PRESET_COLORS : PRESET_HIGHLIGHTS;

  // For highlight mode, HexColorPicker only does 6-char hex,
  // so we show swatches prominently and let hex input handle alpha
  const pickerColor = hex.length === 9 ? hex.slice(0, 7) : hex;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
      <div className="bg-background border-2 border-border rounded-xl p-5 space-y-4 max-w-xs mx-4 w-full shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{isFg ? "Text color" : "Highlight color"}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wheel — only for fg (highlight uses alpha which HexColorPicker can't do) */}
        {isFg && (
          <HexColorPicker color={pickerColor} onChange={setHex} style={{ width: "100%" }} />
        )}

        {/* Preset swatches */}
        <div className="grid grid-cols-10 gap-1">
          {presets.map(c => (
            <button key={c} type="button"
              onClick={() => setHex(c)}
              className={`w-6 h-6 rounded-md border-2 hover:scale-110 transition-transform flex-shrink-0 ${hex === c ? "border-primary" : "border-border/30"}`}
              style={{ backgroundColor: c }}
              title={c} />
          ))}
        </div>

        {/* Hex input + preview */}
        <div className="flex gap-2 items-center">
          <input type="text" value={hex} onChange={e => setHex(e.target.value)}
            placeholder={isFg ? "#ff0000" : "#ff000080"}
            className="flex-1 h-9 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
          <div className="w-9 h-9 rounded-lg border-2 border-border flex-shrink-0" style={{ backgroundColor: hex }} />
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80">
            Cancel
          </button>
          <button type="button" onClick={() => { onApply(hex); onClose(); }}
            className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MiniToolbar with color modal ──
function MiniToolbar({ onInsert }) {
  // Store pending selection range so modal doesn't lose it
  const [colorModal, setColorModal] = useState(null); // "fg" | "hl" | null
  const savedSelection = useRef(null);

  const btn = (label, before, after, title) => (
    <button type="button" title={title}
      onMouseDown={e => e.preventDefault()} // keep textarea focus
      onClick={() => onInsert(before, after)}
      className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs font-bold">
      {label}
    </button>
  );

  const openColorModal = (mode, taRef) => {
    // Save selection before modal steals focus
    const ta = document.activeElement;
    if (ta && (ta.tagName === "TEXTAREA" || ta.tagName === "INPUT")) {
      savedSelection.current = { el: ta, start: ta.selectionStart, end: ta.selectionEnd };
    }
    setColorModal(mode);
  };

  const applyColor = (color) => {
    const s = savedSelection.current;
    if (s) {
      // Restore selection then insert
      s.el.focus();
      s.el.setSelectionRange(s.start, s.end);
    }
    if (colorModal === "fg") onInsert(`<span style="color:${color};">`, `</span>`);
    else onInsert(`<span style="background:${color};border-radius:3px;padding:0 2px;">`, `</span>`);
    savedSelection.current = null;
  };

  return (
    <>
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border/30 bg-muted/10 flex-wrap">
        {btn("B", "<strong>", "</strong>", "Bold")}
        {btn("I", "<em>", "</em>", "Italic")}
        {btn("S̶", "<s>", "</s>", "Strikethrough")}
        {btn("U", "<u>", "</u>", "Underline")}

        <div className="w-px h-4 bg-border/40 mx-0.5 flex-shrink-0" />

        {btn("H1", "<h1>", "</h1>", "Heading 1")}
        {btn("H2", "<h2>", "</h2>", "Heading 2")}
        {btn("H3", "<h3>", "</h3>", "Heading 3")}

        <div className="w-px h-4 bg-border/40 mx-0.5 flex-shrink-0" />

        {btn("🔗", '<a href="https://">', "</a>", "Link")}

        <div className="w-px h-4 bg-border/40 mx-0.5 flex-shrink-0" />

        {/* Text color */}
        <button type="button" title="Text color"
          onMouseDown={e => e.preventDefault()}
          onClick={() => openColorModal("fg")}
          className="w-6 h-6 flex flex-col items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors gap-0">
          <span className="text-xs font-bold" style={{ lineHeight: 1 }}>A</span>
          <span className="w-4 h-0.5 rounded-full" style={{ background: "linear-gradient(90deg,#ff4d4d,#ffd700,#2ecc71,#00bfff,#9b59b6)" }} />
        </button>

        {/* Highlight */}
        <button type="button" title="Highlight color"
          onMouseDown={e => e.preventDefault()}
          onClick={() => openColorModal("fg")}
          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
          <span className="text-xs font-bold px-0.5 rounded" style={{ background: "linear-gradient(90deg,#ff4d4d60,#ffd70060,#2ecc7160)", lineHeight: 1.6 }}>A</span>
        </button>
      </div>

      {colorModal && (
        <ColorPickerModal
          mode={colorModal}
          onApply={applyColor}
          onClose={() => setColorModal(null)}
        />
      )}
    </>
  );
}

function useTextareaInsert(ref, value, onChange) {
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

// ── Convert blocks → HTML ──
function blocksToHTML(blocks) {
  return blocks.map(block => {
    switch (block.type) {
      case "text":
        return `<div class="bio-text">${block.content || ""}</div>`;
      case "img-left":
        return `<div style="display:flex;gap:14px;align-items:flex-start;margin:8px 0;flex-wrap:wrap;">
  <img src="${block.src || ""}" alt="${block.alt || ""}" style="width:${block.size || 120}px;${block.cropped ? `height:${block.size || 120}px;object-fit:cover;` : "height:auto;"}border-radius:8px;flex-shrink:0;max-width:100%;" />
  <div style="flex:1;min-width:160px;">${block.text || ""}</div>
</div>`;
case "img-solo":
  return `<div style="margin:8px 0;text-align:${block.align || "left"};">
  <img src="${block.src || ""}" alt="${block.alt || ""}" style="width:${block.size || 240}px;${block.cropped ? `height:${block.size || 240}px;object-fit:cover;` : "height:auto;"}border-radius:8px;max-width:100%;" />
</div>`;
      case "img-right":
        return `<div style="display:flex;gap:14px;align-items:flex-start;margin:8px 0;flex-wrap:wrap;">
  <div style="flex:1;min-width:160px;">${block.text || ""}</div>
  <img src="${block.src || ""}" alt="${block.alt || ""}" style="width:${block.size || 120}px;${block.cropped ? `height:${block.size || 120}px;object-fit:cover;` : "height:auto;"}border-radius:8px;flex-shrink:0;max-width:100%;" />
</div>`;
      case "gallery": {
        const imgs = (block.images || []).filter(i => i.src).map(i => {
          const maxH = block.maxHeight || 160;
          if (i.cropped) return `<img src="${i.src}" alt="${i.alt || ""}" style="height:${maxH}px;width:${maxH}px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`;
          return `<img src="${i.src}" alt="${i.alt || ""}" style="max-height:${maxH}px;width:auto;height:auto;border-radius:8px;flex-shrink:0;" />`;
        }).join("\n  ");
        return `<div style="display:flex;gap:8px;align-items:flex-start;margin:8px 0;flex-wrap:wrap;">\n  ${imgs}\n</div>`;
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

// ── Parse HTML → blocks ──
function htmlToBlocks(html) {
  if (!html || !html.trim()) return [];
  const blocks = [];
  const lines = html.split(/\n(?=<(?:div|hr))/);
  for (const chunk of lines) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('<hr')) {
      blocks.push({ id: uid(), type: "divider" });
    } else if (trimmed.includes('display:flex') && trimmed.includes('<img') && trimmed.includes('flex-shrink:0') && !trimmed.includes('min-width:160px')) {
      const imgMatches = [...trimmed.matchAll(/<img src="([^"]*)" alt="([^"]*)" style="([^"]*)"/g)];
      const maxHMatch = trimmed.match(/max-height:(\d+)px/) || trimmed.match(/height:(\d+)px/);
      blocks.push({
        id: uid(), type: "gallery",
        maxHeight: maxHMatch ? parseInt(maxHMatch[1]) : 160,
        images: imgMatches.map(m => ({ src: m[1], alt: m[2], cropped: m[3].includes('object-fit:cover') })),
      });
    } else if (trimmed.includes('display:flex') && trimmed.includes('min-width:160px')) {
      const srcMatch = trimmed.match(/img src="([^"]*)"/);
      const altMatch = trimmed.match(/img src="[^"]*" alt="([^"]*)"/);
      const sizeMatch = trimmed.match(/width:(\d+)px/);
      const textMatch = trimmed.match(/<div style="flex:1[^"]*">([\s\S]*?)<\/div>/);
      const isRight = trimmed.indexOf('<img') > trimmed.indexOf('min-width:160px');
      blocks.push({
        id: uid(), type: isRight ? "img-right" : "img-left",
        src: srcMatch?.[1] || "", alt: altMatch?.[1] || "",
        size: sizeMatch ? parseInt(sizeMatch[1]) : 120,
        cropped: trimmed.includes('object-fit:cover'),
        text: textMatch?.[1] || "",
      });
    } else if (trimmed.startsWith('<div class="bio-text">')) {
      const content = trimmed.replace(/^<div class="bio-text">/, "").replace(/<\/div>$/, "");
      blocks.push({ id: uid(), type: "text", content });
    } else {
      blocks.push({ id: uid(), type: "raw", content: trimmed });
    }
  }
  return blocks.length ? blocks : [{ id: uid(), type: "text", content: html }];
}

// ── SP inline → HTML ──
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

// ── SP block → HTML ──
function spBlockToHTML(text) {
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

// ── SP → blocks parser ──
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

// ── Image picker modal ──
function ImagePickerModal({ initial = {}, onConfirm, onClose, title = "Insert Image" }) {
  const [src, setSrc] = useState(initial.src || "");
  const [alt, setAlt] = useState(initial.alt || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const handleUpload = async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  setUploading(true);
  try {
    let localMode = false;
    try { const { isLocalMode } = await import("@/lib/storageMode"); localMode = !!isLocalMode(); } catch {}
    if (localMode) {
      const compressImage = (file, maxWidth = 800, quality = 0.8) => new Promise((resolve, reject) => {
        const img = new window.Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = url;
      });
      const dataUrl = await compressImage(file);
      setSrc(dataUrl);
      toast.success("Image ready!");
    } else {
      toast.error("Image upload requires cloud mode. Paste a URL instead.");
    }
  } catch (err) {
    console.error("Image upload error:", err);
    toast.error("Failed to process image");
  } finally { setUploading(false); e.target.value = ""; }
};
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-background border-2 border-border rounded-2xl p-5 space-y-4 max-w-sm mx-4 w-full shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium">Image</label>
          <div className="flex gap-2">
            <input value={src} onChange={e => setSrc(e.target.value)} placeholder="Paste URL or upload →"
              className="flex-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors flex-shrink-0">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
          </div>
        </div>
        {src && (
          <div className="rounded-xl border border-border/40 bg-muted/20 flex items-center justify-center overflow-hidden" style={{ minHeight: 80 }}>
            <img src={src} alt={alt} className="max-h-32 max-w-full object-contain rounded" onError={e => e.target.style.display = "none"} />
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Alt text <span className="opacity-50">(optional)</span></label>
          <input value={alt} onChange={e => setAlt(e.target.value)} placeholder="Description of image"
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80">Cancel</button>
          <button type="button" onClick={() => { onConfirm({ src, alt }); onClose(); }} disabled={!src.trim()}
            className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40">Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ── Add block menu ──
function AddBlockMenu({ onAdd, onClose }) {
  const options = [
    { type: "img-solo", icon: <Image className="w-4 h-4" />, label: "Image", desc: "Standalone image, no text" },
    { type: "text", icon: <Type className="w-4 h-4" />, label: "Text", desc: "Paragraph with formatting & colors" },
    { type: "img-left", icon: <AlignLeft className="w-4 h-4" />, label: "Image · Text", desc: "Image left, text right" },
    { type: "img-right", icon: <AlignRight className="w-4 h-4" />, label: "Text · Image", desc: "Text left, image right" },
    { type: "gallery", icon: <LayoutGrid className="w-4 h-4" />, label: "Gallery", desc: "Multiple images in a row" },
    { type: "divider", icon: <Minus className="w-4 h-4" />, label: "Divider", desc: "Horizontal rule" },
  ];
  return (
<div 
  className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4 pb-[80px] sm:pb-4" 
  onClick={onClose}
>
  <div 
    className="bg-background border-2 border-border rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-full overflow-hidden" 
    onClick={e => e.stopPropagation()}
  >
    {/* Header */}
    <div className="flex items-center justify-between p-4 border-b border-border/50 flex-shrink-0">
      <p className="text-sm font-semibold">Add a block</p>
      <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
    </div>

    {/* Scrollable Area: The 'min-h-0' is a flexbox trick to allow internal scrolling */}
    <div className="p-2 space-y-1 overflow-y-auto min-h-0">
      {options.map(opt => (
        <button key={opt.type} type="button" onClick={() => { onAdd(opt.type); onClose(); }}
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

// ── Block shell ──
function BlockShell({ index, total, onMoveUp, onMoveDown, onDelete, label, children }) {
  return (
    <div className="group relative rounded-xl border border-border/40 bg-background overflow-hidden hover:border-border transition-colors">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20 border-b border-border/30">
        <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
          <GripVertical className="w-3 h-3 opacity-40" />{label}
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
      <textarea ref={taRef} value={block.content || ""}
        onChange={e => onChange({ ...block, content: e.target.value })}
        placeholder="Write something… select text then use toolbar for colors, bold, headings…"
        className="w-full min-h-[100px] px-3 py-2.5 text-sm bg-transparent focus:outline-none resize-y font-mono leading-relaxed"
        spellCheck={false} />
    </div>
  );
}

// ── Image+Text block ──
function ImgTextBlock({ block, onChange }) {
  const [imgModal, setImgModal] = useState(false);
  const taRef = useRef(null);
  const insert = useTextareaInsert(taRef, block.text || "", v => onChange({ ...block, text: v }));
  const isLeft = block.type === "img-left";
  const imgSlot = (
    <div className="flex flex-col gap-2 p-3 flex-shrink-0" style={{ width: 164 }}>
      <button type="button" onClick={() => setImgModal(true)}
        className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors overflow-hidden bg-muted/20 flex items-center justify-center"
        style={{ minHeight: 80 }}>
        {block.src ? (
          <img src={block.src} alt={block.alt || ""}
            style={block.cropped ? { width: "100%", height: block.size || 120, objectFit: "cover" } : { width: "100%", height: "auto" }}
            onError={e => e.target.style.display = "none"} />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground py-4">
            <Image className="w-5 h-5" /><span className="text-xs">Add image</span>
          </div>
        )}
      </button>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Width: {block.size || 120}px</span>
        <input type="range" min={60} max={280} step={10} value={block.size || 120}
          onChange={e => onChange({ ...block, size: parseInt(e.target.value) })}
          className="w-full h-1 accent-primary" />
      </div>
      <button type="button" onClick={() => onChange({ ...block, cropped: !block.cropped })}
        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors ${block.cropped ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
        <Crop className="w-3 h-3" />{block.cropped ? "Cropped" : "Natural size"}
      </button>
    </div>
  );
  const textSlot = (
    <div className="flex-1 min-w-0 border-l border-border/30">
      <MiniToolbar onInsert={insert} />
      <textarea ref={taRef} value={block.text || ""}
        onChange={e => onChange({ ...block, text: e.target.value })}
        placeholder="Text beside the image…"
        className="w-full min-h-[100px] px-3 py-2.5 text-sm bg-transparent focus:outline-none resize-y font-mono leading-relaxed"
        spellCheck={false} />
    </div>
  );
  return (
    <>
      <div className={`flex ${isLeft ? "" : "flex-row-reverse"} min-h-[100px]`}>{imgSlot}{textSlot}</div>
      {imgModal && <ImagePickerModal initial={{ src: block.src, alt: block.alt }}
        title={isLeft ? "Image (left)" : "Image (right)"}
        onConfirm={({ src, alt }) => onChange({ ...block, src, alt })}
        onClose={() => setImgModal(false)} />}
    </>
  );
}

// ── Gallery block ──
function GalleryBlock({ block, onChange }) {
  const [activeIdx, setActiveIdx] = useState(null);
  const images = block.images || [{ src: "", alt: "", cropped: false }, { src: "", alt: "", cropped: false }];
  const maxHeight = block.maxHeight || 160;
  const updateImage = (i, patch) => onChange({ ...block, images: images.map((img, idx) => idx === i ? { ...img, ...patch } : img) });
  const addImage = () => { if (images.length >= 6) return; onChange({ ...block, images: [...images, { src: "", alt: "", cropped: false }] }); };
  const removeImage = (i) => { if (images.length <= 1) return; onChange({ ...block, images: images.filter((_, idx) => idx !== i) }); };
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground flex-shrink-0">Max height: {maxHeight}px</span>
        <input type="range" min={40} max={320} step={10} value={maxHeight}
          onChange={e => onChange({ ...block, maxHeight: parseInt(e.target.value) })}
          className="flex-1 h-1 accent-primary" />
      </div>
      <div className="flex flex-wrap gap-2">
        {images.map((img, i) => (
          <div key={i} className="flex flex-col gap-1 flex-shrink-0">
            <button type="button" onClick={() => setActiveIdx(i)}
              className="rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors overflow-hidden bg-muted/20 flex items-center justify-center"
              style={img.src ? (img.cropped ? { width: maxHeight, height: maxHeight } : { maxWidth: 200, minWidth: 40 }) : { width: 72, height: 72 }}>
              {img.src ? (
                <img src={img.src} alt={img.alt || ""}
                  style={img.cropped ? { width: maxHeight, height: maxHeight, objectFit: "cover" } : { maxHeight, width: "auto", height: "auto", maxWidth: 200 }}
                  onError={e => e.target.style.display = "none"} />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground p-3">
                  <Image className="w-4 h-4" /><span className="text-xs">{i + 1}</span>
                </div>
              )}
            </button>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => updateImage(i, { cropped: !img.cropped })}
                className={`flex-1 flex items-center justify-center gap-1 text-xs py-0.5 rounded-md border transition-colors ${img.cropped ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/30"}`}>
                <Crop className="w-2.5 h-2.5" />{img.cropped ? "Crop" : "Natural"}
              </button>
              {images.length > 1 && (
                <button type="button" onClick={() => removeImage(i)}
                  className="w-5 h-5 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ))}
        {images.length < 6 && (
          <button type="button" onClick={addImage}
            className="rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors bg-muted/10 flex items-center justify-center text-muted-foreground hover:text-primary flex-shrink-0"
            style={{ width: 48, height: 72 }}>
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
      {activeIdx !== null && (
        <ImagePickerModal initial={images[activeIdx]} title={`Gallery image ${activeIdx + 1}`}
          onConfirm={({ src, alt }) => { updateImage(activeIdx, { src, alt }); setActiveIdx(null); }}
          onClose={() => setActiveIdx(null)} />
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

function ImgSoloBlock({ block, onChange }) {
  const [imgModal, setImgModal] = useState(false);
  return (
    <>
      <div className="p-3 space-y-3">
        <button type="button" onClick={() => setImgModal(true)}
          className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors overflow-hidden bg-muted/20 flex items-center justify-center"
          style={{ minHeight: 80 }}>
          {block.src ? (
            <img src={block.src} alt={block.alt || ""}
              style={block.cropped
                ? { width: "100%", maxWidth: block.size || 240, height: block.size || 240, objectFit: "cover" }
                : { maxWidth: "100%", height: "auto", maxHeight: 240 }}
              onError={e => e.target.style.display = "none"} />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground py-6">
              <Image className="w-5 h-5" /><span className="text-xs">Add image</span>
            </div>
          )}
        </button>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex-1 space-y-1 min-w-[120px]">
            <span className="text-xs text-muted-foreground">Width: {block.size || 240}px</span>
            <input type="range" min={60} max={600} step={10} value={block.size || 240}
              onChange={e => onChange({ ...block, size: parseInt(e.target.value) })}
              className="w-full h-1 accent-primary" />
          </div>
          <button type="button" onClick={() => onChange({ ...block, cropped: !block.cropped })}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors flex-shrink-0 ${block.cropped ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
            <Crop className="w-3 h-3" />{block.cropped ? "Cropped" : "Natural"}
          </button>
          <div className="flex gap-1 flex-shrink-0">
            {["left", "center", "right"].map(a => (
              <button key={a} type="button"
                onClick={() => onChange({ ...block, align: a })}
                className={`text-xs px-2 py-1 rounded-lg border transition-colors capitalize ${(block.align || "left") === a ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>
      {imgModal && <ImagePickerModal initial={{ src: block.src, alt: block.alt }}
        title="Image"
        onConfirm={({ src, alt }) => onChange({ ...block, src, alt })}
        onClose={() => setImgModal(false)} />}
    </>
  );
}

// ── Raw HTML block ──
function RawBlock({ block, onChange }) {
  return (
    <div>
      <div className="px-3 py-1 bg-amber-500/10 border-b border-amber-500/20">
        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Raw HTML</span>
      </div>
      <textarea value={block.content || ""} onChange={e => onChange({ ...block, content: e.target.value })}
        className="w-full min-h-[60px] px-3 py-2.5 text-xs font-mono bg-transparent focus:outline-none resize-y leading-relaxed text-muted-foreground"
        spellCheck={false} />
    </div>
  );
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
          Paste your SP markdown template. Images, galleries, layouts, tables, and formatting all convert automatically.
        </p>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste SP template here..."
          className="w-full h-52 px-3 py-2.5 rounded-xl border border-input bg-background text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium">Cancel</button>
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
          {tab === "preview"
            ? <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
            : <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">{html}</pre>}
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

  useEffect(() => { onChange(blocksToHTML(blocks)); }, [blocks]);

  const updateBlock = useCallback((id, patch) => setBlocks(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b)), []);
  const deleteBlock = useCallback((id) => setBlocks(bs => { const next = bs.filter(b => b.id !== id); return next.length ? next : [{ id: uid(), type: "text", content: "" }]; }), []);
  const moveBlock = useCallback((id, dir) => setBlocks(bs => {
    const idx = bs.findIndex(b => b.id === id); if (idx < 0) return bs;
    const next = [...bs]; const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return bs;
    [next[idx], next[swap]] = [next[swap], next[idx]]; return next;
  }), []);
  const addBlock = useCallback((type) => {
    const defaults = { text: { content: "" }, "img-left": { src: "", alt: "", size: 120, cropped: false, text: "" }, "img-solo": { src: "", alt: "", size: 240, cropped: false, align: "left" }, "img-right": { src: "", alt: "", size: 120, cropped: false, text: "" }, gallery: { images: [{ src: "", alt: "", cropped: false }, { src: "", alt: "", cropped: false }], maxHeight: 160 }, divider: {} };
    setBlocks(bs => [...bs, { id: uid(), type, ...defaults[type] }]);
  }, []);
  const handleImport = useCallback((spText) => {
    const newBlocks = convertSPToBlocks(spText);
    setBlocks(bs => [...bs, ...newBlocks]);
    toast.success(`Imported ${newBlocks.length} block${newBlocks.length !== 1 ? "s" : ""}!`);
  }, []);

  const blockLabel = (type) => ({ text: "Text", "img-left": "Image · Text", "img-solo": "Image", "img-right": "Text · Image", gallery: "Gallery", divider: "Divider", raw: "Raw HTML" }[type] || type);
  const currentHTML = blocksToHTML(blocks);

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
      <div className="space-y-2">
        {blocks.map((block, i) => (
          <BlockShell key={block.id} index={i} total={blocks.length} label={blockLabel(block.type)}
            onMoveUp={() => moveBlock(block.id, -1)} onMoveDown={() => moveBlock(block.id, 1)} onDelete={() => deleteBlock(block.id)}>
            {block.type === "text" && <TextBlock block={block} onChange={b => updateBlock(block.id, b)} />}
            {(block.type === "img-left" || block.type === "img-right") && <ImgTextBlock block={block} onChange={b => updateBlock(block.id, b)} />}
            {block.type === "gallery" && <GalleryBlock block={block} onChange={b => updateBlock(block.id, b)} />}
            {block.type === "divider" && <DividerBlock />}
            {block.type === "raw" && <RawBlock block={block} onChange={b => updateBlock(block.id, b)} />}
          </BlockShell>
        ))}
      </div>
      <button type="button" onClick={() => setShowAddMenu(true)}
        className="w-full py-2 rounded-xl border-2 border-dashed border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 text-muted-foreground hover:text-primary text-sm font-medium">
        <Plus className="w-4 h-4" /> Add block
      </button>
      {showAddMenu && <AddBlockMenu onAdd={addBlock} onClose={() => setShowAddMenu(false)} />}
      {showImport && <ImportSPModal onImport={handleImport} onClose={() => setShowImport(false)} />}
      {showHTMLPreview && <HTMLPreviewModal html={currentHTML} onClose={() => setShowHTMLPreview(false)} />}
    </div>
  );
}