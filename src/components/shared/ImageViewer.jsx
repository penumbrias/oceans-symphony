import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, Maximize2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { formatBytes } from "@/lib/assetFiles";

// Full-screen image viewer: pinch / wheel / double-tap zoom, drag to pan, and a
// quality choice for the DISPLAYED copy —
//   Original  the stored picture exactly as it is (highest quality)
//   Medium    shown at up to 1600 px on the long side
//   Low       shown at up to 720 px — smoothest on a slow or low-memory device
// This only changes what is drawn on screen. The stored picture is never
// resized, re-encoded or replaced. Animated GIFs and SVGs always show at
// original (shrinking them would freeze or blur them).

const QUALITY_KEY = "symphony_image_view_quality_v1";
const QUALITIES = [
  { id: "original", label: "Original", max: 0 },
  { id: "medium", label: "Medium", max: 1600 },
  { id: "low", label: "Low", max: 720 },
];
const MAX_ZOOM = 8;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function readQuality() {
  try {
    const q = localStorage.getItem(QUALITY_KEY);
    return QUALITIES.some((x) => x.id === q) ? q : "original";
  } catch { return "original"; }
}

// True for animated (GIF / animated WebP / APNG) and vector (SVG) pictures —
// shrinking those would freeze or blur them. Looks at the file's own bytes, so
// it works for pictures stored with no extension.
async function isAnimatedOrVector(url) {
  try {
    const blob = await (await fetch(url)).blob();
    if (/gif|svg/i.test(blob.type)) return true;
    const buf = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
    const head = (i, n) => String.fromCharCode(...buf.slice(i, i + n));
    if (head(0, 4) === "GIF8") return true;
    if (head(0, 4) === "RIFF" && head(8, 4) === "WEBP") return head(12, 4) === "VP8X" ? (buf[20] & 0x02) !== 0 : false;
    if (buf[0] === 0x89 && head(1, 3) === "PNG") return new TextDecoder("latin1").decode(buf).includes("acTL");
    return false;
  } catch {
    // Can't tell → don't risk freezing a GIF; show the original.
    return true;
  }
}

// Loads `src` and, for Medium / Low, makes a smaller copy to display.
function useViewImage(src, qualityId, keepOriginal) {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let alive = true;
    let madeUrl = null;
    if (!src) {
      // A picture stored on this device is still being looked up — wait, but
      // not forever.
      setState({ status: "loading" });
      const t = setTimeout(() => { if (alive) setState({ status: "error" }); }, 8000);
      return () => { alive = false; clearTimeout(t); };
    }
    setState((s) => (s.status === "ready" ? s : { status: "loading" }));
    (async () => {
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
        await img.decode();
        if (!alive) return;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const max = QUALITIES.find((q) => q.id === qualityId)?.max || 0;
        const long = Math.max(w, h);
        if (!max || keepOriginal || long <= max) {
          setState({ status: "ready", url: src, w, h, shownW: w, shownH: h, scaled: false });
          return;
        }
        if (await isAnimatedOrVector(src)) {
          if (!alive) return;
          setState({ status: "ready", url: src, w, h, shownW: w, shownH: h, scaled: false, forcedOriginal: true });
          return;
        }
        if (!alive) return;
        const k = max / long;
        const cw = Math.max(1, Math.round(w * k));
        const ch = Math.max(1, Math.round(h * k));
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const g = canvas.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(img, 0, 0, cw, ch);
        const blob = await new Promise((res) => canvas.toBlob(res, "image/webp", 0.88));
        if (!alive) return;
        if (!blob) { setState({ status: "ready", url: src, w, h, shownW: w, shownH: h, scaled: false }); return; }
        madeUrl = URL.createObjectURL(blob);
        setState({ status: "ready", url: madeUrl, w, h, shownW: cw, shownH: ch, scaled: true, bytes: blob.size });
      } catch {
        if (alive) setState({ status: "error" });
      }
    })();
    return () => { alive = false; if (madeUrl) URL.revokeObjectURL(madeUrl); };
  }, [src, qualityId, keepOriginal]);
  return state;
}

function Viewer({ src, name, isGif, onClose }) {
  const resolved = useResolvedAvatarUrl(src);
  const url = resolved || (/^(https?:|data:|blob:)/i.test(src || "") ? src : null);
  const [quality, setQuality] = useState(readQuality);
  const keepOriginal = !!isGif || /\.(gif|svg)(\?|#|$)/i.test(src || "") || /^data:image\/(gif|svg)/i.test(src || "");
  const view = useViewImage(url, quality, keepOriginal);

  const pickQuality = (id) => {
    setQuality(id);
    try { localStorage.setItem(QUALITY_KEY, id); } catch { /* not saved */ }
  };

  // ── zoom / pan ──
  const [tf, setTf] = useState({ s: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  // Keep the picture from being dragged out of reach.
  const bound = useCallback((s, x, y) => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return { s, x, y };
    if (s <= 1.001) return { s: 1, x: 0, y: 0 };
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const mx = Math.max(0, (img.offsetWidth * s - sw) / 2);
    const my = Math.max(0, (img.offsetHeight * s - sh) / 2);
    return { s, x: clamp(x, -mx, mx), y: clamp(y, -my, my) };
  }, []);

  // Zoom to scale `ns`, keeping the content under stage point (px,py) fixed.
  // Points are measured from the stage centre.
  const zoomAt = useCallback((ns, px, py) => {
    setTf((t) => {
      const s2 = clamp(ns, 1, MAX_ZOOM);
      const qx = (px - t.x) / t.s;
      const qy = (py - t.y) / t.s;
      return bound(s2, px - qx * s2, py - qy * s2);
    });
  }, [bound]);

  const rel = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  const onPointerDown = (e) => {
    if (e.target.closest("[data-viewer-ui]")) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, rel(e));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, t0: tf };
    } else if (pointers.current.size === 1) {
      gesture.current = { kind: "pan", p0: rel(e), t0: tf, moved: 0, at: Date.now() };
      setDragging(true);
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, rel(e));
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s2 = clamp(g.t0.s * (d / g.d0), 1, MAX_ZOOM);
      const qx = (mid.x - g.t0.x) / g.t0.s;
      const qy = (mid.y - g.t0.y) / g.t0.s;
      setTf(bound(s2, mid.x - qx * s2, mid.y - qy * s2));
    } else if (g.kind === "pan") {
      const p = rel(e);
      const dx = p.x - g.p0.x;
      const dy = p.y - g.p0.y;
      g.moved = Math.max(g.moved, Math.hypot(dx, dy));
      if (g.t0.s > 1.001) setTf(bound(g.t0.s, g.t0.x + dx, g.t0.y + dy));
    }
  };

  const onPointerUp = (e) => {
    const g = gesture.current;
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      setDragging(false);
      // Double tap / double click: toggle between fit and 2.5×.
      if (g?.kind === "pan" && g.moved < 8 && p) {
        const now = Date.now();
        const lt = lastTap.current;
        if (now - lt.t < 320 && Math.hypot(p.x - lt.x, p.y - lt.y) < 40) {
          zoomAt(tf.s > 1.05 ? 1 : 2.5, p.x, p.y);
          lastTap.current = { t: 0, x: 0, y: 0 };
        } else {
          lastTap.current = { t: now, x: p.x, y: p.y };
        }
      }
      gesture.current = null;
    } else if (pointers.current.size === 1) {
      // Finger lifted from a pinch — carry on panning with the one left.
      const [only] = [...pointers.current.values()];
      gesture.current = { kind: "pan", p0: only, t0: tf, moved: 99, at: Date.now() };
    }
  };

  // React's onWheel is passive — attach a real listener so the page behind
  // doesn't scroll while zooming.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(tf.s * Math.exp(-e.deltaY * 0.0018), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, tf.s, view.status]);

  // A new picture / quality starts back at "fit".
  useEffect(() => { setTf({ s: 1, x: 0, y: 0 }); }, [src, quality]);

  const zoomBy = (f) => zoomAt(tf.s * f, 0, 0);
  const qLabel = QUALITIES.find((q) => q.id === quality)?.label;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        style={{ top: "50%", maxHeight: "100dvh", zIndex: 200 }}
        className="max-w-none w-screen h-[100dvh] p-0 gap-0 rounded-none border-0 bg-black text-white overflow-hidden sm:rounded-none"
        aria-describedby={undefined}
        // Dialogs portal out, but React events still bubble to the card / link
        // the thumbnail sits in — keep taps in the viewer to the viewer.
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DialogTitle className="sr-only">{name || "Picture"}</DialogTitle>

        <div
          ref={stageRef}
          className="absolute inset-0 overflow-hidden select-none"
          style={{ touchAction: "none", cursor: tf.s > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {view.status === "ready" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <img
                ref={imgRef}
                src={view.url}
                alt={name || ""}
                draggable={false}
                className="max-w-full max-h-full object-contain"
                style={{
                  transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.s})`,
                  transition: dragging ? "none" : "transform 120ms ease-out",
                  willChange: "transform",
                }}
              />
            </div>
          )}
          {view.status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/70" /></div>
          )}
          {view.status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-white/70">
              This picture couldn't be shown.
            </div>
          )}
        </div>

        {/* Top bar */}
        <div data-viewer-ui className="absolute top-0 inset-x-0 z-10 bg-gradient-to-b from-black/80 to-transparent px-3 pb-6"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}>
          <div className="flex items-center gap-2">
            <p className="flex-1 min-w-0 truncate text-sm font-medium">{name || "Picture"}</p>
            <button type="button" onClick={onClose} aria-label="Close"
              className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-lg hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-1 flex items-center gap-1" role="group" aria-label="Picture quality">
            {QUALITIES.map((q) => (
              <button key={q.id} type="button" onClick={() => pickQuality(q.id)} aria-pressed={quality === q.id}
                disabled={keepOriginal && q.id !== "original"}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors disabled:opacity-40 ${
                  quality === q.id ? "bg-white text-black border-white font-medium" : "border-white/40 text-white/90 hover:bg-white/10"}`}>
                {q.label}
              </button>
            ))}
          </div>
          {view.status === "ready" && (
            <p className="mt-1.5 text-[0.6875rem] text-white/70 tabular-nums">
              {(keepOriginal || view.forcedOriginal)
                ? `${view.w} × ${view.h} · animated / vector pictures always show at original`
                : view.scaled
                  ? `${qLabel}: showing ${view.shownW} × ${view.shownH} (original ${view.w} × ${view.h}${view.bytes ? ` · shown copy ${formatBytes(view.bytes)}` : ""})`
                  : `${view.w} × ${view.h}${quality === "original" ? " · original quality" : " · already small enough, shown at original"}`}
            </p>
          )}
        </div>

        {/* Zoom controls */}
        <div data-viewer-ui className="absolute bottom-0 inset-x-0 z-10 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent pt-8 px-3"
          style={{ paddingBottom: "calc(var(--os-sab, 0px) + 0.75rem)" }}>
          <button type="button" onClick={() => zoomBy(1 / 1.5)} disabled={tf.s <= 1.001} aria-label="Zoom out"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40"><ZoomOut className="w-5 h-5" /></button>
          <button type="button" onClick={() => setTf({ s: 1, x: 0, y: 0 })} disabled={tf.s <= 1.001} aria-label="Fit to screen"
            className="min-h-[44px] px-3 flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs tabular-nums disabled:opacity-40">
            <Maximize2 className="w-4 h-4" /> {Math.round(tf.s * 100)}%
          </button>
          <button type="button" onClick={() => zoomBy(1.5)} disabled={tf.s >= MAX_ZOOM - 0.01} aria-label="Zoom in"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40"><ZoomIn className="w-5 h-5" /></button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ImageViewer({ open, ...props }) {
  if (!open) return null;
  return <Viewer {...props} />;
}

// Drop-in <img> that opens the viewer when tapped. For pictures shown in chat,
// bulletins and the like (view mode only — never used inside an editor).
export function ZoomableImage({ src, alt = "", style, className, ...rest }) {
  const [open, setOpen] = useState(false);
  const show = (e) => {
    // A still-hidden spoiler / whisper: let the global tap handler reveal it first.
    if (e.currentTarget.closest(".spoiler:not(.revealed), .whisper:not(.revealed)")) return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };
  return (
    <>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        style={{ cursor: "zoom-in", ...style }}
        className={className}
        role="button"
        tabIndex={0}
        onClick={show}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") show(e); }}
        {...rest}
      />
      <ImageViewer open={open} src={src} name={alt} onClose={() => setOpen(false)} />
    </>
  );
}
