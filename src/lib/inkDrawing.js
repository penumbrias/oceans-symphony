// The scratch pad's drawing model (v0.332.0) — pure helpers shared by the
// DrawingPad sheet and its test. A drawing is a list of strokes kept in the
// pad's own CSS pixels:
//
//   { tool: "pen" | "eraser", color: "#rrggbb" | null, size: px,
//     points: [{ x, y, p }] }        p = pen pressure 0..1 (1 for touch/mouse)
//
// Two ways out, both saved to the local picture store like an uploaded image:
//   ink     — black strokes on nothing, trimmed to what was drawn, inserted
//             INLINE and sized in em so it sits in the line like a word. It
//             is drawn in the text colour wherever it shows (renderer mask,
//             or the .ink-drawing CSS fallback), so it reads as handwriting.
//   picture — the strokes in their colours on the chosen paper, inserted as
//             an ordinary picture (block, tap to zoom).

export const INK_CLASS = "ink-drawing";
// One em of the drawing = this many pad pixels, so writing at the size of
// the surrounding text in the pad comes out that size in the post.
const PX_PER_EM = 16;
// Never let one stroke blow the bounding box up past this many pad pixels.
const MAX_EXPORT_SIDE = 2400;

// The width a segment is drawn at: a stylus presses lighter or harder; a
// finger or mouse (pressure reported as 0.5 or 0) draws the chosen size.
export function strokeWidth(size, p) {
  const s = Math.max(0.5, Number(size) || 3);
  if (p == null || !Number.isFinite(p) || p <= 0 || p === 0.5) return s;
  return Math.max(0.5, s * (0.35 + 0.9 * Math.min(1, p)));
}

// Smallest box holding every stroke, with room for its line width. Eraser
// strokes don't grow the box (they only take ink away). null when nothing
// has been drawn.
export function strokesBounds(strokes, pad = 4) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes || []) {
    if (!s || s.tool === "eraser" || !Array.isArray(s.points)) continue;
    for (const pt of s.points) {
      const r = strokeWidth(s.size, pt.p) / 2;
      if (pt.x - r < minX) minX = pt.x - r;
      if (pt.y - r < minY) minY = pt.y - r;
      if (pt.x + r > maxX) maxX = pt.x + r;
      if (pt.y + r > maxY) maxY = pt.y + r;
    }
  }
  if (!Number.isFinite(minX)) return null;
  const x = Math.floor(minX - pad);
  const y = Math.floor(minY - pad);
  const w = Math.min(MAX_EXPORT_SIDE, Math.ceil(maxX + pad) - x);
  const h = Math.min(MAX_EXPORT_SIDE, Math.ceil(maxY + pad) - y);
  return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
}

export const hasInk = (strokes) => !!strokesBounds(strokes, 0);

// Paint strokes onto a 2D context. `inkColor` overrides every pen colour
// (ink mode, or the live pad's text colour); eraser strokes cut through
// what is under them on this layer only.
export function paintStrokes(ctx, strokes, { inkColor = null, offsetX = 0, offsetY = 0, scale = 1 } = {}) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes || []) {
    if (!s || !Array.isArray(s.points) || !s.points.length) continue;
    const erase = s.tool === "eraser";
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    const colour = erase ? "#000" : (inkColor || s.color || "#000");
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    const pts = s.points;
    const X = (pt) => (pt.x - offsetX) * scale;
    const Y = (pt) => (pt.y - offsetY) * scale;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(X(pts[0]), Y(pts[0]), (strokeWidth(s.size, pts[0].p) * scale) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      ctx.beginPath();
      ctx.lineWidth = strokeWidth(s.size, b.p) * scale;
      ctx.moveTo(X(a), Y(a));
      ctx.lineTo(X(b), Y(b));
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Render the drawing for saving. Returns { canvas, w, h } in pad pixels
// (the canvas itself is `scale`× for crisp lines), or null when empty.
export function renderDrawing(strokes, { mode = "ink", paper = null, scale = 2, doc = globalThis.document } = {}) {
  const box = strokesBounds(strokes, mode === "ink" ? 3 : 12);
  if (!box || !doc) return null;
  const layer = doc.createElement("canvas");
  layer.width = Math.max(1, Math.round(box.w * scale));
  layer.height = Math.max(1, Math.round(box.h * scale));
  paintStrokes(layer.getContext("2d"), strokes, {
    inkColor: mode === "ink" ? "#000000" : null,
    offsetX: box.x, offsetY: box.y, scale,
  });
  if (mode === "ink" || !paper || paper === "transparent") return { canvas: layer, w: box.w, h: box.h };
  // Picture on paper: the eraser cut the ink layer, so the paper shows
  // through where something was rubbed out.
  const out = doc.createElement("canvas");
  out.width = layer.width;
  out.height = layer.height;
  const ctx = out.getContext("2d");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(layer, 0, 0);
  return { canvas: out, w: box.w, h: box.h };
}

const round2 = (n) => Math.round(n * 100) / 100;

// The markup each mode inserts. Both use the same <img> the image upload
// writes, so every renderer, backup and the picture-usage scan already know
// it; the ink one carries INK_CLASS and an em size so it flows with text.
export function drawingHtml(url, { mode, w, h }) {
  const src = String(url).replace(/"/g, "%22");
  if (mode === "ink") {
    const wEm = round2(w / PX_PER_EM);
    return `<img src="${src}" class="${INK_CLASS}" alt="Drawing" style="width:${wEm}em;max-width:100%;height:auto;aspect-ratio:${Math.round(w)} / ${Math.round(h)};display:inline-block;vertical-align:middle;margin:0 0.1em;border-radius:0;" />`;
  }
  return `<img src="${src}" alt="Drawing" style="width:${Math.round(w)}px;max-width:100%;height:auto;border-radius:8px;display:block;margin:6px 0;" />`;
}

export function isInkImageClass(cls) {
  return new RegExp(`(^|\\s)${INK_CLASS}(\\s|$)`).test(String(cls || ""));
}
