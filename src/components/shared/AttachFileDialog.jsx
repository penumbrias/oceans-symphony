import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, Loader2, Film, Music, File as FileIcon, Sparkles } from "lucide-react";
import { classifyFile, formatBytes, SAVE_SUBFOLDERS, MAX_FILE_BYTES } from "@/lib/assetFiles";

// Shown between "the person picked a file" and "it lands in the message".
//
//  • Images: keep the ORIGINAL (shows its pixel size + file size) or compress.
//    The compress options are real — each one is actually encoded here so the
//    size shown is the size you get, not a guess.
//  • Video / audio / other files: always the original file, untouched.
//  • Optional: also save a copy to the device (Downloads/Oceans Symphony/files/…).
//
// onConfirm({ kind, blob, file, saveCopy }) — `blob` is the original File or the
// compressed result; the caller stores it.

const SAVE_COPY_KEY = "symphony_attach_save_copy_v1";

// Largest first. A preset is only offered when it's smaller than the image
// already is (never upscales) and actually saves space.
const PRESETS = [
  { id: "large",  label: "Large",  maxDim: 2048, quality: 0.85 },
  { id: "medium", label: "Medium", maxDim: 1280, quality: 0.8 },
  { id: "small",  label: "Small",  maxDim: 800,  quality: 0.75 },
  { id: "tiny",   label: "Tiny",   maxDim: 480,  quality: 0.7 },
];

async function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file); } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode_failed"));
      i.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight, _img: img, close() {} };
  } finally {
    // The <img> keeps its decoded data; the URL is only needed during load.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function drawable(bitmap) { return bitmap._img || bitmap; }

function encode(bitmap, preset, mime) {
  const scale = Math.min(1, preset.maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (mime === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); } // no black where PNG was transparent
  ctx.drawImage(drawable(bitmap), 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? { blob, w, h } : null), mime, preset.quality));
}

function pct(saved, total) { return total > 0 ? Math.round((saved / total) * 100) : 0; }

export default function AttachFileDialog({ file, onConfirm, onCancel }) {
  const kind = useMemo(() => classifyFile(file?.type, file?.name), [file]);
  const isRasterImage = kind === "image" && !/image\/(gif|svg\+xml)/i.test(file?.type || "") && !/\.(gif|svg)$/i.test(file?.name || "");
  const isGif = kind === "image" && (/image\/gif/i.test(file?.type || "") || /\.gif$/i.test(file?.name || ""));

  const [dims, setDims] = useState(null);            // { w, h }
  const [options, setOptions] = useState([]);        // computed compress options
  const [computing, setComputing] = useState(isRasterImage);
  const [choice, setChoice] = useState("original");
  const [saveCopy, setSaveCopy] = useState(() => { try { return localStorage.getItem(SAVE_COPY_KEY) === "1"; } catch { return false; } });
  const [previewUrl, setPreviewUrl] = useState(null);
  const bitmapRef = useRef(null);

  // Preview URL (image thumbnail / video poster frame).
  useEffect(() => {
    if (!file || !(kind === "image" || kind === "video")) return undefined;
    const u = URL.createObjectURL(file);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, kind]);

  // Measure the image and build the compress options.
  useEffect(() => {
    if (!file || !isRasterImage) return undefined;
    let alive = true;
    (async () => {
      try {
        const bmp = await loadBitmap(file);
        if (!alive) { bmp.close?.(); return; }
        bitmapRef.current = bmp;
        setDims({ w: bmp.width, h: bmp.height });
        const longest = Math.max(bmp.width, bmp.height);
        const outMime = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
        const out = [];
        for (const p of PRESETS) {
          if (!alive) return;
          if (p.maxDim >= longest) continue;              // would not shrink the picture
          const r = await encode(bmp, p, outMime);
          if (!r) continue;
          if (r.blob.size >= file.size * 0.95) continue;  // not worth offering
          out.push({ ...p, blob: r.blob, w: r.w, h: r.h, size: r.blob.size });
        }
        // Already small in pixels but heavy on disk (a big PNG/JPEG): offer a
        // same-size re-encode when it saves real space.
        if (out.length === 0 && file.size > 300 * 1024) {
          const r = await encode(bmp, { id: "reencode", label: "Re-encode", maxDim: longest, quality: 0.8 }, outMime);
          if (r && r.blob.size < file.size * 0.85) out.push({ id: "reencode", label: "Lighter file", maxDim: longest, quality: 0.8, blob: r.blob, w: r.w, h: r.h, size: r.blob.size });
        }
        if (!alive) return;
        // Suggest the biggest option that is still a real saving: ≤ 20% of the
        // original or ≤ 500 KB — otherwise the smallest on offer.
        const suggested = out.find((o) => o.size <= Math.max(500 * 1024, file.size * 0.2)) || out[out.length - 1];
        setOptions(out.map((o) => ({ ...o, suggested: o === suggested })));
      } catch {
        /* the original can still be used */
      } finally {
        if (alive) setComputing(false);
      }
    })();
    return () => { alive = false; try { bitmapRef.current?.close?.(); } catch { /* noop */ } };
  }, [file, isRasterImage]);

  if (!file) return null;

  const chosen = options.find((o) => o.id === choice);
  const folder = SAVE_SUBFOLDERS[kind] || "Files";
  // Every stored file rides backups and the app's private-file copy, so the
  // same cap as an Assets upload applies.
  const tooBig = (chosen ? chosen.blob.size : file.size) > MAX_FILE_BYTES;
  const capMb = Math.round(MAX_FILE_BYTES / (1024 * 1024));

  const confirm = () => {
    try { localStorage.setItem(SAVE_COPY_KEY, saveCopy ? "1" : "0"); } catch { /* noop */ }
    const blob = chosen ? chosen.blob : file;
    // A compressed result needs a matching file name when saved as a copy.
    onConfirm({ kind, blob, file, saveCopy, compressed: !!chosen, name: chosen ? file.name.replace(/\.[^.]+$/, "") + (chosen.blob.type === "image/png" ? ".png" : chosen.blob.type === "image/webp" ? ".webp" : ".jpg") : file.name });
  };

  const KindIcon = kind === "video" ? Film : kind === "audio" ? Music : FileIcon;
  const title = kind === "image" ? "Add image" : kind === "video" ? "Add video" : kind === "audio" ? "Add audio" : "Attach file";

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[230] p-3" onClick={onCancel}>
      <div
        className="bg-card border border-border rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">{title}</p>
          <button type="button" onClick={onCancel} aria-label="Cancel" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {/* Preview */}
        {kind === "image" && previewUrl && (
          <div className="rounded-xl border border-border/50 bg-muted/20 p-2">
            <img src={previewUrl} alt="Preview" className="mx-auto max-h-44 rounded-lg object-contain" />
          </div>
        )}
        {kind === "video" && previewUrl && (
          <div className="rounded-xl border border-border/50 bg-black overflow-hidden">
            <video src={previewUrl + "#t=0.1"} preload="metadata" muted playsInline className="mx-auto max-h-44 w-full" />
          </div>
        )}
        {(kind === "audio" || kind === "file") && (
          <div className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5">
            <KindIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <p className="text-sm font-medium truncate">{file.name}</p>
          </div>
        )}

        {/* Image: original vs compress */}
        {isRasterImage ? (
          <div className="space-y-1.5" role="radiogroup" aria-label="Image quality">
            <OptionRow
              selected={choice === "original"}
              onSelect={() => setChoice("original")}
              title="Keep original"
              detail={`${dims ? `${dims.w}×${dims.h} px · ` : ""}${formatBytes(file.size)}`}
              note="Exactly the file you picked — no quality loss."
            />
            {computing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Working out smaller sizes…
              </div>
            )}
            {options.map((o) => (
              <OptionRow
                key={o.id}
                selected={choice === o.id}
                onSelect={() => setChoice(o.id)}
                title={`Compress — ${o.label}`}
                detail={`${o.w}×${o.h} px · ${formatBytes(o.size)} · ${pct(file.size - o.size, file.size)}% smaller`}
                badge={o.suggested ? "Suggested" : null}
              />
            ))}
            {!computing && options.length === 0 && (
              <p className="text-[0.6875rem] text-muted-foreground px-1">This image is already small — nothing worth compressing.</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-muted/10 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
            <p><span className="font-medium text-foreground">{formatBytes(file.size)}</span>{file.type ? ` · ${file.type}` : ""}</p>
            <p>{isGif ? "GIFs are kept as-is so they keep animating." : "Stored as the original file — no compression."}</p>
          </div>
        )}

        {tooBig && (
          <p className="text-xs text-destructive">
            This is over {capMb} MB, so it can&apos;t be stored in the app{isRasterImage ? " — pick a compressed size" : ""}.
          </p>
        )}

        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={saveCopy} onChange={(e) => setSaveCopy(e.target.checked)} className="mt-0.5" />
          <span>Also save a copy to my device <span className="opacity-80">(Downloads/Oceans Symphony/files/{folder})</span></span>
        </label>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm border border-border/60 text-muted-foreground hover:text-foreground">Cancel</button>
          <button type="button" onClick={confirm} disabled={tooBig || (computing && isRasterImage && choice !== "original")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Check className="w-3.5 h-3.5" /> {chosen ? "Use compressed" : "Use original"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function OptionRow({ selected, onSelect, title, detail, note, badge }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${selected ? "border-primary bg-primary/10" : "border-border/60 hover:bg-muted/30"}`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 ${selected ? "border-primary bg-primary" : "border-muted-foreground/50"}`} />
        <span className="text-sm font-medium">{title}</span>
        {badge && (
          <span className="ml-auto inline-flex items-center gap-1 text-[0.625rem] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
            <Sparkles className="w-2.5 h-2.5" /> {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 pl-5 tabular-nums">{detail}</p>
      {note && <p className="text-[0.6875rem] text-muted-foreground/80 pl-5">{note}</p>}
    </button>
  );
}
