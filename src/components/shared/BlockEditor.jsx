import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Plus, Trash2, ChevronUp, ChevronDown, Image, AlignLeft, AlignRight,
  LayoutGrid, Minus, Type, Eye, X, Upload, Loader2, GripVertical, Crop
} from "lucide-react";
import { toast } from "sonner";
import { MiniToolbar, useTextareaInsert } from "@/components/shared/MiniToolbar";


let _id = 0;
const uid = () => `b_${Date.now()}_${_id++}`;

// Hook: resolves a local-image:// src to a displayable data URL
function useResolvedSrc(src) {
  const [resolved, setResolved] = useState(null);
  useEffect(() => {
    if (!src) { setResolved(null); return; }
    if (!src.startsWith("local-image://")) { setResolved(src); return; }
    import("@/lib/imageUrlResolver").then(({ resolveImageUrl }) => {
      resolveImageUrl(src).then(r => setResolved(r || null)).catch(() => setResolved(null));
    });
  }, [src]);
  return resolved || src || "";
}

// Strips src from img tags in rendered HTML — replaced with data-img-id for size reduction.
// The rendered HTML is only a fallback; SimplePreview resolves images at render time.
function stripImgSrcs(html) {
  return html.replace(/<img\s+src="([^"]*)"([^>]*)>/g, (match, src, rest) => {
    // Extract local image ID if present
    const localMatch = src.match(/^local-image:\/\/(.+)$/);
    const imgId = localMatch ? localMatch[1] : "";
    return `<img data-img-id="${imgId}"${rest}>`;
  });
}

export function blocksToHTML(blocks) {
  const inner = blocks.map(block => {
    switch (block.type) {
      case "text":
        return `<div class="bio-text">${block.content || ""}</div>`;
      case "img-left":
        return `<div style="display:flex;gap:14px;align-items:flex-start;margin:8px 0;flex-wrap:wrap;">
  <img src="${block.src || ""}" alt="${block.alt || ""}" style="width:${block.size || 120}px;${block.cropped ? `height:${block.size || 120}px;object-fit:cover;` : "height:auto;"}border-radius:8px;flex-shrink:0;max-width:100%;" />
  <div style="flex:1;min-width:160px;">${block.text || ""}</div>
</div>`;
      case "img-solo": {
        const align = block.align || "left";
        const marginStyle = align === "center" ? "margin-left:auto;margin-right:auto;" : align === "right" ? "margin-left:auto;margin-right:0;" : "margin-left:0;margin-right:auto;";
        return `<div style="margin:8px 0;">
  <img src="${block.src || ""}" alt="${block.alt || ""}" style="display:block;width:${block.size || 240}px;${block.cropped ? `height:${block.size || 240}px;object-fit:cover;` : "height:auto;"}border-radius:8px;max-width:100%;${marginStyle}" />
</div>`;
      }
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

  // Strip src attributes from rendered HTML — saves significant space
  const strippedInner = stripImgSrcs(inner);

  // Store blocks JSON in a script tag (no URI encoding bloat)
  const blocksJson = JSON.stringify(blocks);
  return `<div data-blocks-v2="1" style="width:100%;display:block;">${strippedInner}</div><script type="application/json" data-blocks-json="1">${blocksJson}</script>`;
}

export function htmlToBlocks(html) {
  if (!html || !html.trim()) return [];

  // New format: JSON stored in a <script data-blocks-json> tag (no URI encoding)
  const scriptMatch = html.match(/<script[^>]+data-blocks-json[^>]*>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    try {
      const blocks = JSON.parse(scriptMatch[1]);
      if (Array.isArray(blocks) && blocks.length) {
        return blocks.map(b => ({ ...b, id: uid() }));
      }
    } catch {}
  }

  // Legacy format: URI-encoded JSON in data-blocks attribute
  const attrMatch = html.match(/data-blocks="([^"]*)"/);
  if (attrMatch) {
    try {
      const blocks = JSON.parse(decodeURIComponent(attrMatch[1]));
      if (Array.isArray(blocks) && blocks.length) {
        // Re-extract local-image: or data: srcs from rendered img tags (for __local_img__ placeholders)
        const imgSrcs = [...html.matchAll(/<img src="((?:data:|local-image:\/\/)[^"]+)"/g)].map(m => m[1]);
        let imgIdx = 0;
        const restore = (src) => src === "__local_img__" ? (imgSrcs[imgIdx++] || "") : src;
        return blocks.map(b => {
          const id = uid();
          if (b.type === "img-left" || b.type === "img-right" || b.type === "img-solo") {
            return { ...b, id, src: restore(b.src) };
          }
          if (b.type === "gallery") {
            return { ...b, id, images: (b.images || []).map(i => ({ ...i, src: restore(i.src) })) };
          }
          return { ...b, id };
        });
      }
    } catch {}
  }
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
      blocks.push({ id: uid(), type: "gallery", maxHeight: maxHMatch ? parseInt(maxHMatch[1]) : 160, images: imgMatches.map(m => ({ src: m[1], alt: m[2], cropped: m[3].includes('object-fit:cover') })) });
    } else if (trimmed.includes('display:flex') && trimmed.includes('min-width:160px')) {
      const srcMatch = trimmed.match(/img src="([^"]*)"/);
      const altMatch = trimmed.match(/img src="[^"]*" alt="([^"]*)"/);
      const sizeMatch = trimmed.match(/width:(\d+)px/);
      const textMatch = trimmed.match(/<div style="flex:1[^"]*">([\s\S]*?)<\/div>/);
      const isRight = trimmed.indexOf('<img') > trimmed.indexOf('min-width:160px');
      blocks.push({ id: uid(), type: isRight ? "img-right" : "img-left", src: srcMatch?.[1] || "", alt: altMatch?.[1] || "", size: sizeMatch ? parseInt(sizeMatch[1]) : 120, cropped: trimmed.includes('object-fit:cover'), text: textMatch?.[1] || "" });
    } else if (trimmed.startsWith('<div style="margin:8px 0;text-align:')) {
      const alignMatch = trimmed.match(/text-align:(\w+)/);
      const srcMatch = trimmed.match(/img src="([^"]*)"/);
      const altMatch = trimmed.match(/img src="[^"]*" alt="([^"]*)"/);
      const sizeMatch = trimmed.match(/width:(\d+)px/);
      blocks.push({ id: uid(), type: "img-solo", src: srcMatch?.[1] || "", alt: altMatch?.[1] || "", size: sizeMatch ? parseInt(sizeMatch[1]) : 240, align: alignMatch?.[1] || "left", cropped: trimmed.includes('object-fit:cover') });
    } else if (trimmed.startsWith('<div class="bio-text">')) {
      const content = trimmed.replace(/^<div class="bio-text">/, "").replace(/<\/div>$/, "");
      blocks.push({ id: uid(), type: "text", content });
    } else {
      blocks.push({ id: uid(), type: "raw", content: trimmed });
    }
  }
  return blocks.length ? blocks : [{ id: uid(), type: "text", content: html }];
}

export function ImagePickerModal({ initial = {}, onConfirm, onClose, title = "Insert Image" }) {
  const [src, setSrc] = useState(initial.src || "");
  const [alt, setAlt] = useState(initial.alt || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const resolvedSrc = useResolvedSrc(src);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const compressImage = (f, maxWidth = 800, quality = 0.8) => new Promise((resolve, reject) => {
        const img = new window.Image();
        const url = URL.createObjectURL(f);
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
      const { isLocalMode } = await import("@/lib/storageMode");
      if (isLocalMode()) {
        const { saveLocalImage, createLocalImageUrl } = await import("@/lib/localImageStorage");
        const imageId = `block-img-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        setSrc(createLocalImageUrl(imageId));
      } else {
        setSrc(dataUrl);
      }
      toast.success("Image ready!");
    } catch (err) {
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
            <img src={resolvedSrc || src} alt={alt} className="max-h-32 max-w-full object-contain rounded" onError={e => e.target.style.display = "none"} />
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
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4 pb-[80px] sm:pb-4" onClick={onClose}>
      <div className="bg-background border-2 border-border rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border/50 flex-shrink-0">
          <p className="text-sm font-semibold">Add a block</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
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

function TextBlock({ block, onChange, onInsertLink }) {
  const taRef = useRef(null);
  const insert = useTextareaInsert(taRef, block.content || "", v => onChange({ ...block, content: v }));
  return (
    <div>
      <textarea ref={taRef} value={block.content || ""} onChange={e => onChange({ ...block, content: e.target.value })}
        placeholder="Write something…"
        className="w-full min-h-[100px] px-3 py-2.5 text-sm bg-transparent focus:outline-none resize-y font-mono leading-relaxed"
        spellCheck={false} />
      <MiniToolbar onInsert={insert} onInsertLink={onInsertLink} />
    </div>
  );
}

function ImgTextBlock({ block, onChange, onInsertLink }) {
  const [imgModal, setImgModal] = useState(false);
  const taRef = useRef(null);
  const insert = useTextareaInsert(taRef, block.text || "", v => onChange({ ...block, text: v }));
  const isLeft = block.type === "img-left";
  const resolvedSrc = useResolvedSrc(block.src);
  const imgSlot = (
    <div className="flex flex-col gap-2 p-3 flex-shrink-0" style={{ width: 164 }}>
      <button type="button" onClick={() => setImgModal(true)}
        className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors overflow-hidden bg-muted/20 flex items-center justify-center" style={{ minHeight: 80 }}>
        {block.src ? (
          <img src={resolvedSrc} alt={block.alt || ""} style={block.cropped ? { width: "100%", height: block.size || 120, objectFit: "cover" } : { width: "100%", height: "auto" }} onError={e => e.target.style.display = "none"} />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground py-4"><Image className="w-5 h-5" /><span className="text-xs">Add image</span></div>
        )}
      </button>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Width: {block.size || 120}px</span>
        <input type="range" min={60} max={280} step={10} value={block.size || 120} onChange={e => onChange({ ...block, size: parseInt(e.target.value) })} className="w-full h-1 accent-primary" />
      </div>
      <button type="button" onClick={() => onChange({ ...block, cropped: !block.cropped })}
        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors ${block.cropped ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
        <Crop className="w-3 h-3" />{block.cropped ? "Cropped" : "Natural size"}
      </button>
    </div>
  );
  const textSlot = (
    <div className="flex-1 min-w-0 border-l border-border/30">
      <textarea ref={taRef} value={block.text || ""} onChange={e => onChange({ ...block, text: e.target.value })}
        placeholder="Text beside the image…"
        className="w-full min-h-[100px] px-3 py-2.5 text-sm bg-transparent focus:outline-none resize-y font-mono leading-relaxed"
        spellCheck={false} />
      <MiniToolbar onInsert={insert} onInsertLink={onInsertLink} />
    </div>
  );
  return (
    <>
      <div className={`flex ${isLeft ? "" : "flex-row-reverse"} min-h-[100px]`}>{imgSlot}{textSlot}</div>
      {imgModal && <ImagePickerModal initial={{ src: block.src, alt: block.alt }} title={isLeft ? "Image (left)" : "Image (right)"}
        onConfirm={({ src, alt }) => onChange({ ...block, src, alt })} onClose={() => setImgModal(false)} />}
    </>
  );
}

function ImgSoloBlock({ block, onChange }) {
  const [imgModal, setImgModal] = useState(false);
  const resolvedSrc = useResolvedSrc(block.src);
  return (
    <>
      <div className="p-3 space-y-3">
        <div
          className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors overflow-hidden bg-muted/20"
          style={{
            minHeight: 80,
            display: "flex",
            justifyContent: (block.align || "left") === "center" ? "center" : (block.align || "left") === "right" ? "flex-end" : "flex-start"
          }}>
          <button type="button" onClick={() => setImgModal(true)} className="contents">
            {block.src ? (
              <img src={resolvedSrc} alt={block.alt || ""}
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
        </div>
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
              <button key={a} type="button" onClick={() => onChange({ ...block, align: a })}
                className={`text-xs px-2 py-1 rounded-lg border transition-colors capitalize ${(block.align || "left") === a ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>
      {imgModal && <ImagePickerModal initial={{ src: block.src, alt: block.alt }} title="Image"
        onConfirm={({ src, alt }) => onChange({ ...block, src, alt })} onClose={() => setImgModal(false)} />}
    </>
  );
}

// Small component so each gallery image can independently resolve its src
function GalleryImageThumb({ img, index, maxHeight, onEdit, onToggleCrop, onRemove, canRemove }) {
  const resolvedSrc = useResolvedSrc(img.src);
  return (
    <div className="flex flex-col gap-1 flex-shrink-0">
      <button type="button" onClick={onEdit}
        className="rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors overflow-hidden bg-muted/20 flex items-center justify-center"
        style={img.src ? (img.cropped ? { width: maxHeight, height: maxHeight } : { maxWidth: 200, minWidth: 40 }) : { width: 72, height: 72 }}>
        {img.src ? (
          <img src={resolvedSrc} alt={img.alt || ""} style={img.cropped ? { width: maxHeight, height: maxHeight, objectFit: "cover" } : { maxHeight, width: "auto", height: "auto", maxWidth: 200 }} onError={e => e.target.style.display = "none"} />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground p-3"><Image className="w-4 h-4" /><span className="text-xs">{index + 1}</span></div>
        )}
      </button>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onToggleCrop}
          className={`flex-1 flex items-center justify-center gap-1 text-xs py-0.5 rounded-md border transition-colors ${img.cropped ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/30"}`}>
          <Crop className="w-2.5 h-2.5" />{img.cropped ? "Crop" : "Natural"}
        </button>
        {canRemove && (
          <button type="button" onClick={onRemove} className="w-5 h-5 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

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
        <input type="range" min={40} max={320} step={10} value={maxHeight} onChange={e => onChange({ ...block, maxHeight: parseInt(e.target.value) })} className="flex-1 h-1 accent-primary" />
      </div>
      <div className="flex flex-wrap gap-2">
        {images.map((img, i) => (
          <GalleryImageThumb key={i} img={img} index={i} maxHeight={maxHeight}
            onEdit={() => setActiveIdx(i)}
            onToggleCrop={() => updateImage(i, { cropped: !img.cropped })}
            onRemove={() => removeImage(i)}
            canRemove={images.length > 1} />
        ))}
        {images.length < 6 && (
          <button type="button" onClick={addImage} className="rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors bg-muted/10 flex items-center justify-center text-muted-foreground hover:text-primary flex-shrink-0" style={{ width: 48, height: 72 }}>
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

function DividerBlock() {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 h-px bg-border/60" />
      <Minus className="w-3 h-3 text-muted-foreground/40" />
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

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

const blockLabel = (type) => ({ text: "Text", "img-left": "Image · Text", "img-solo": "Image", "img-right": "Text · Image", gallery: "Gallery", divider: "Divider", raw: "Raw HTML" }[type] || type);

const BLOCK_DEFAULTS = {
  text: { content: "" },
  "img-left": { src: "", alt: "", size: 120, cropped: false, text: "" },
  "img-solo": { src: "", alt: "", size: 240, cropped: false, align: "left" },
  "img-right": { src: "", alt: "", size: 120, cropped: false, text: "" },
  gallery: { images: [{ src: "", alt: "", cropped: false }, { src: "", alt: "", cropped: false }], maxHeight: 160 },
  divider: {},
};

export default function BlockEditor({ value, onChange }) {
  const [blocks, setBlocks] = useState(() => {
    const parsed = htmlToBlocks(value || "");
    return parsed.length ? parsed : [{ id: uid(), type: "text", content: "" }];
  });
  const [showAddMenu, setShowAddMenu] = useState(false);
  const internalChangeRef = useRef(false);

  // Sync from external value changes (e.g. undo, discard, link insert from parent)
  useEffect(() => {
    if (internalChangeRef.current) { internalChangeRef.current = false; return; }
    const parsed = htmlToBlocks(value || "");
    setBlocks(parsed.length ? parsed : [{ id: uid(), type: "text", content: "" }]);
  }, [value]);

  useEffect(() => {
    internalChangeRef.current = true;
    onChange(blocksToHTML(blocks));
  }, [blocks]);

  const updateBlock = useCallback((id, patch) => setBlocks(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b)), []);
  const deleteBlock = useCallback((id) => setBlocks(bs => { const next = bs.filter(b => b.id !== id); return next.length ? next : [{ id: uid(), type: "text", content: "" }]; }), []);
  const moveBlock = useCallback((id, dir) => setBlocks(bs => {
    const idx = bs.findIndex(b => b.id === id); if (idx < 0) return bs;
    const next = [...bs]; const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return bs;
    [next[idx], next[swap]] = [next[swap], next[idx]]; return next;
  }), []);
  const addBlock = useCallback((type) => {
    setBlocks(bs => [...bs, { id: uid(), type, ...BLOCK_DEFAULTS[type] }]);
  }, []);

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {blocks.map((block, i) => (
          <BlockShell key={block.id} index={i} total={blocks.length} label={blockLabel(block.type)}
            onMoveUp={() => moveBlock(block.id, -1)} onMoveDown={() => moveBlock(block.id, 1)} onDelete={() => deleteBlock(block.id)}>
            {block.type === "text" && <TextBlock block={block} onChange={b => updateBlock(block.id, b)} />}
            {block.type === "img-solo" && <ImgSoloBlock block={block} onChange={b => updateBlock(block.id, b)} />}
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
    </div>
  );
}