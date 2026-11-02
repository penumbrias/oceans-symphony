// Scratchboard — a library mod for Oceans Symphony (docs/mods.md).
//
// A small creative drawing space, not an art program: layers (raster or
// vector), a brush you shape yourself, an eraser, a fill bucket, a lasso and
// an eyedropper. Drawings save as drafts inside the mod; "Save to Assets"
// hands a finished picture to the app (pictures:save — the app shows it and
// asks every time), optionally credited to the alter who made it so it shows
// in their Pictures.
//
// Saved data (all in this mod's own storage):
//   "drawing" { name, w, h, paper, layers: [{ id, name, kind, visible,
//               opacity, rev }], active, thumb64, thumb_type, edited_at, made_by,
//               deleted_at }
//             Deleting a drawing only sets deleted_at ("Recently deleted");
//             it leaves for good only on "Delete forever".
//   "chunk"   { drawing_id, layer_id, rev, seq, data } — one layer's saved
//             content (bare PNG base64 for raster, stroke JSON for vector),
//             split into pieces under the record size limit. A save writes
//             the new pieces FIRST, then points the drawing at them, and only
//             then removes the old ones, so a crash mid-save never loses a
//             layer.
//   "brush"   { name, brush } — brushes the person saved.
//   "prefs"   { brush, eraser, color, recent, tool, fill_ref, brush_id } — one record.

symphony.registerPage("board", async (root) => {
  "use strict";
  const T = (k, fallback) => (typeof symphony.terms[k] === "string" && symphony.terms[k] ? symphony.terms[k] : fallback);
  const can = (p) => symphony.permissions.includes(p);

  // ── tiny helpers ─────────────────────────────────────────────────────────
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "style") n.style.cssText = v;
      else if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (k in n && typeof v !== "string") n[k] = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c);
    return n;
  };
  const put = (parent, ...kids) => parent.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } };

  const ICON = {
    brush: '<path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    fill: '<path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/>',
    lasso: '<path d="M7 22a5 5 0 0 1-2-4"/><path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1"/><path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
    picker: '<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    next: '<path d="m9 18 6-6-6-6"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  };
  const icon = (name, size = 20) => el("span", { class: "sb-ico", "aria-hidden": "true", html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>` });

  document.head.append(el("style", {}, `
    .sb { display: flex; flex-direction: column; gap: 10px; }
    .sb-ico { display: inline-flex; line-height: 0; }
    .sb-bar { display: flex; align-items: center; gap: 6px; }
    .sb-bar .sb-grow { flex: 1; min-width: 0; }
    .sb-iconbtn { font: inherit; display: inline-flex; align-items: center; justify-content: center; gap: 4px;
      min-width: 40px; height: 40px; padding: 0 8px; border-radius: 10px; cursor: pointer;
      border: 1px solid var(--color-muted, #B6D4E3); background: var(--color-surface, #E0F2FE); color: var(--color-text-primary, #1E293B); }
    .sb-iconbtn:disabled { opacity: .4; cursor: default; }
    .sb-iconbtn.plain { border-color: transparent; background: transparent; }
    .sb-tools { display: grid; grid-template-columns: repeat(5, 1fr) auto; gap: 6px; }
    .sb-tool { font: inherit; font-size: 11px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px;
      border-radius: 10px; border: 1px solid var(--color-muted, #B6D4E3); background: transparent; color: var(--color-text-primary, #1E293B); cursor: pointer; }
    .sb-tool[aria-pressed="true"] { background: var(--color-primary, #3B82F6); border-color: var(--color-primary, #3B82F6); color: #fff; }
    .sb-swatchbtn { width: 46px; border-radius: 10px; border: 1px solid var(--color-muted, #B6D4E3); cursor: pointer; padding: 4px; background: transparent; }
    .sb-swatchbtn span { display: block; width: 100%; height: 100%; min-height: 34px; border-radius: 7px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }
    .sb-stage { position: relative; border-radius: var(--radius, 12px); overflow: hidden; touch-action: none;
      background: color-mix(in srgb, var(--color-text-primary, #1E293B) 8%, transparent); user-select: none; -webkit-user-select: none; }
    .sb-stage canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    .sb-zoom { position: absolute; right: 6px; bottom: 6px; display: flex; gap: 4px; align-items: center; }
    .sb-zoom .sb-iconbtn { min-width: 34px; height: 34px; background: var(--color-surface, #fff); opacity: .92; }
    .sb-zoomlabel { font-size: 11px; padding: 2px 6px; border-radius: 6px; background: var(--color-surface, #fff); opacity: .92; }
    .sb-selbar { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .sb-panel { border: 1px solid var(--color-muted, #B6D4E3); border-radius: var(--radius, 12px); background: var(--color-surface, #E0F2FE); padding: 4px 12px 12px; }
    .sb-pagehead { display: flex; align-items: center; gap: 4px; margin: 0 -6px 4px; }
    .sb-pagehead h3 { margin: 0; font-size: 1em; font-weight: 600; flex: 1; }
    .sb-row { display: flex; align-items: center; gap: 10px; min-height: 44px; border-bottom: 1px solid color-mix(in srgb, var(--color-muted, #B6D4E3) 60%, transparent); }
    .sb-row:last-child { border-bottom: 0; }
    .sb-row > .sb-label { flex: 0 0 auto; min-width: 86px; font-size: .9em; }
    .sb-row input[type=range] { flex: 1; min-width: 0; accent-color: var(--color-primary, #3B82F6); height: 28px; }
    .sb-row .sb-num { width: 44px; text-align: right; font-variant-numeric: tabular-nums; font-size: .9em; color: var(--color-text-secondary, #64748B); }
    .sb-hint { font-size: .8em; color: var(--color-text-secondary, #64748B); margin: 2px 0 6px; }
    .sb-link { font: inherit; width: 100%; display: flex; align-items: center; gap: 10px; min-height: 48px; background: transparent; border: 0;
      border-bottom: 1px solid color-mix(in srgb, var(--color-muted, #B6D4E3) 60%, transparent); color: var(--color-text-primary, #1E293B); cursor: pointer; text-align: left; padding: 0; }
    .sb-link:last-child { border-bottom: 0; }
    .sb-link .sb-val { color: var(--color-text-secondary, #64748B); font-size: .9em; margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 55%; }
    .sb-link.danger { color: #dc2626; }
    .sb-section { font-size: .78em; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--color-text-secondary, #64748B); margin: 14px 0 2px; }
    .sb-switch { position: relative; width: 44px; height: 26px; flex: 0 0 auto; margin-left: auto; }
    .sb-switch input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
    .sb-switch span { position: absolute; inset: 0; border-radius: 999px; background: var(--color-muted, #B6D4E3); transition: background .15s; pointer-events: none; }
    .sb-switch span::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .15s; }
    .sb-switch input:checked + span { background: var(--color-primary, #3B82F6); }
    .sb-switch input:checked + span::after { transform: translateX(18px); }
    .sb-seg { display: inline-flex; border: 1px solid var(--color-muted, #B6D4E3); border-radius: 10px; overflow: hidden; margin-left: auto; }
    .sb-seg button { font: inherit; font-size: .85em; border: 0; background: transparent; padding: 7px 12px; cursor: pointer; color: var(--color-text-primary, #1E293B); }
    .sb-seg button[aria-pressed="true"] { background: var(--color-primary, #3B82F6); color: #fff; }
    .sb-brushes { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; margin: 6px 0; }
    .sb-brush { font: inherit; font-size: .8em; border-radius: 10px; border: 1px solid var(--color-muted, #B6D4E3); background: var(--color-bg, #fff); padding: 4px; cursor: pointer; color: var(--color-text-primary, #1E293B); }
    .sb-brush[aria-pressed="true"] { border-color: var(--color-primary, #3B82F6); box-shadow: 0 0 0 2px var(--color-primary, #3B82F6); }
    .sb-brush canvas { display: block; width: 100%; height: 34px; }
    .sb-shapepad { display: block; width: 220px; height: 220px; max-width: 100%; margin: 6px auto; border-radius: 12px; touch-action: none;
      background: var(--color-bg, #fff); border: 1px solid var(--color-muted, #B6D4E3); }
    .sb-preview { display: block; width: 100%; height: 84px; border-radius: 10px; background: #fff; border: 1px solid var(--color-muted, #B6D4E3); margin: 8px 0 4px; }
    .sb-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(36px, 1fr)); gap: 6px; margin: 8px 0; }
    .sb-sw { aspect-ratio: 1; border-radius: 8px; border: 2px solid transparent; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,.18); padding: 0; }
    .sb-sw[aria-pressed="true"] { border-color: var(--color-primary, #3B82F6); }
    .sb-layer { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid color-mix(in srgb, var(--color-muted, #B6D4E3) 60%, transparent); }
    .sb-layer.active { background: color-mix(in srgb, var(--color-primary, #3B82F6) 12%, transparent); border-radius: 10px; padding: 6px; }
    .sb-layer .sb-thumb { width: 44px; height: 44px; border-radius: 6px; flex: 0 0 auto; border: 1px solid var(--color-muted, #B6D4E3);
      background: repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 10px 10px; object-fit: contain; }
    .sb-layer .sb-lname { flex: 1; min-width: 0; text-align: left; font: inherit; background: transparent; border: 0; color: inherit; cursor: pointer; padding: 4px 0; }
    .sb-layer .sb-lname small { display: block; color: var(--color-text-secondary, #64748B); font-size: .78em; }
    .sb-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .sb-card { font: inherit; text-align: left; border: 1px solid var(--color-muted, #B6D4E3); border-radius: var(--radius, 12px); background: var(--color-surface, #E0F2FE);
      padding: 6px; cursor: pointer; color: var(--color-text-primary, #1E293B); display: flex; flex-direction: column; gap: 4px; }
    .sb-card img, .sb-card .sb-blank { width: 100%; aspect-ratio: 1; object-fit: contain; border-radius: 8px;
      background: repeating-conic-gradient(#e5e5e5 0 25%, #fff 0 50%) 0 0 / 14px 14px; }
    .sb-card small { color: var(--color-text-secondary, #64748B); }
    .sb-choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 8px; margin: 6px 0 10px; }
    .sb-choice { font: inherit; font-size: .85em; border-radius: 10px; border: 1px solid var(--color-muted, #B6D4E3); background: transparent; padding: 8px; cursor: pointer; color: var(--color-text-primary, #1E293B); }
    .sb-choice[aria-pressed="true"] { background: var(--color-primary, #3B82F6); color: #fff; border-color: var(--color-primary, #3B82F6); }
    .sb-people { max-height: 240px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--color-muted, #B6D4E3); border-radius: 10px; margin: 6px 0; }
    .sb-person { font: inherit; width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 10px; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--color-muted, #B6D4E3) 50%, transparent);
      background: transparent; color: var(--color-text-primary, #1E293B); cursor: pointer; text-align: left; }
    .sb-person[aria-pressed="true"] { background: color-mix(in srgb, var(--color-primary, #3B82F6) 16%, transparent); font-weight: 600; }
    .sb-dot { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; box-shadow: inset 0 0 0 1px rgba(0,0,0,.2); }
    .sb-status { font-size: .78em; color: var(--color-text-secondary, #64748B); white-space: nowrap; }
    .sb-status.bad { color: #dc2626; cursor: pointer; text-decoration: underline; }
    .sb-name { font: inherit; font-weight: 600; background: transparent; border: 0; color: inherit; padding: 4px 2px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; text-align: left; }
  `));

  // ═════════════════════════════════════════════════════════════════════════
  // Brush shapes
  // ═════════════════════════════════════════════════════════════════════════
  // A shape is { n, pts: [[x,y]…] in -1..1, round 0..1, width 0..1 (n=2),
  // connect, dot 0..1, angle (deg), follow }.
  //   n = 1      circle (round 1) … square (round 0)
  //   n = 2      the two points are the ends; ellipse … rectangle, `width` wide
  //   n ≥ 3      the points are the corners; rounded … sharp
  //   connect off → a dot at each point instead (sprays, bristles).
  const MAX_POINTS = 12;

  function regularPoints(n) {
    if (n <= 1) return [[0, 0]];
    if (n === 2) return [[-0.9, 0], [0.9, 0]];
    const out = [];
    const start = n === 4 ? -Math.PI * 3 / 4 : -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const a = start + (i / n) * Math.PI * 2;
      out.push([+(Math.cos(a) * 0.9).toFixed(3), +(Math.sin(a) * 0.9).toFixed(3)]);
    }
    return out;
  }

  // Superellipse: exponent 2 is an ellipse, large is a rectangle.
  function superellipse(cx, cy, ax, ay, rot, round) {
    const p = 2 + Math.pow(1 - round, 2) * 28;
    const out = [];
    const cos = Math.cos(rot), sin = Math.sin(rot);
    for (let i = 0; i < 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / p) * ax;
      const y = Math.sign(s) * Math.pow(Math.abs(s), 2 / p) * ay;
      out.push([cx + x * cos - y * sin, cy + x * sin + y * cos]);
    }
    return out;
  }

  // Polygon with its corners rounded: each corner is cut `round/2` of the way
  // along both edges and replaced by a curve, so full roundness is a smooth
  // blob through the edge midpoints.
  function roundedPolygon(pts, round) {
    const n = pts.length;
    const f = clamp(round, 0, 1) * 0.5;
    if (f < 0.01) return pts.map((p) => [p[0], p[1]]);
    const out = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
      const a = [cur[0] + (prev[0] - cur[0]) * f, cur[1] + (prev[1] - cur[1]) * f];
      const b = [cur[0] + (next[0] - cur[0]) * f, cur[1] + (next[1] - cur[1]) * f];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8, u = 1 - t;
        out.push([u * u * a[0] + 2 * u * t * cur[0] + t * t * b[0], u * u * a[1] + 2 * u * t * cur[1] + t * t * b[1]]);
      }
    }
    return out;
  }

  function circlePoly(cx, cy, r) {
    const out = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return out;
  }

  // The tip as a list of polygons scaled to fit -1..1, centred.
  const tipCache = new Map();
  function shapeKey(s) { return JSON.stringify([s.n, s.pts, s.round, s.width, s.connect, s.dot]); }
  function tipPolygons(shape) {
    const key = shapeKey(shape);
    if (tipCache.has(key)) return tipCache.get(key);
    const n = clamp(shape.n | 0, 1, MAX_POINTS);
    const pts = (shape.pts || []).slice(0, n);
    while (pts.length < n) pts.push(...regularPoints(n).slice(pts.length));
    let polys;
    if (!shape.connect && n > 1) {
      const r = 0.05 + clamp(shape.dot ?? 0.25, 0, 1) * 0.45;
      polys = pts.map((p) => circlePoly(p[0], p[1], r));
    } else if (n === 1) {
      polys = [superellipse(0, 0, 1, 1, 0, shape.round)];
    } else if (n === 2) {
      const [a, b] = pts;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 || 0.5;
      polys = [superellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, len, Math.max(0.04, len * clamp(shape.width ?? 0.5, 0.05, 1)), Math.atan2(b[1] - a[1], b[0] - a[0]), shape.round)];
    } else {
      polys = [roundedPolygon(pts, shape.round)];
    }
    // Centre the outline and scale so its larger half-extent is 1.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const poly of polys) for (const [x, y] of poly) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const half = Math.max(maxX - minX, maxY - minY) / 2 || 1;
    const out = polys.map((poly) => poly.map(([x, y]) => [(x - cx) / half, (y - cy) / half]));
    out.norm = { cx, cy, half }; // so the shape editor can draw its points where the tip is
    if (tipCache.size > 60) tipCache.clear();
    tipCache.set(key, out);
    return out;
  }

  function tracePolys(ctx, polys, cx, cy, r) {
    ctx.beginPath();
    for (const poly of polys) {
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * r, cy + y * r) : ctx.moveTo(cx + x * r, cy + y * r)));
      ctx.closePath();
    }
  }

  // ── free draw → shape ────────────────────────────────────────────────────
  // A drawn outline becomes a point shape: the outline is evened out, cut
  // down to its corners (Ramer–Douglas–Peucker, loosening until it has at
  // most MAX_POINTS), and how "round" it is comes from how much of its
  // turning happens away from those corners.
  function resampleLoop(pts, count) {
    const closed = pts.concat([pts[0]]);
    let total = 0;
    const seg = [];
    for (let i = 1; i < closed.length; i++) { const d = Math.hypot(closed[i][0] - closed[i - 1][0], closed[i][1] - closed[i - 1][1]); seg.push(d); total += d; }
    if (!total) return null;
    const step = total / count, out = [];
    let i = 0, acc = 0;
    for (let k = 0; k < count; k++) {
      const want = k * step;
      while (i < seg.length - 1 && acc + seg[i] < want) { acc += seg[i]; i++; }
      const t = seg[i] ? (want - acc) / seg[i] : 0;
      out.push([closed[i][0] + (closed[i + 1][0] - closed[i][0]) * t, closed[i][1] + (closed[i + 1][1] - closed[i][1]) * t]);
    }
    return out;
  }
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.map((_, i) => i);
    const [a, b] = [pts[0], pts[pts.length - 1]];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bi = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
      if (d > best) { best = d; bi = i; }
    }
    if (best <= eps) return [0, pts.length - 1];
    const left = rdp(pts.slice(0, bi + 1), eps);
    const right = rdp(pts.slice(bi), eps).map((j) => j + bi);
    return left.slice(0, -1).concat(right);
  }
  function shapeFromDrawing(raw) {
    if (!raw || raw.length < 8) return null;
    const ring = resampleLoop(raw, 96);
    if (!ring) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const half = Math.max(maxX - minX, maxY - minY) / 2;
    if (half < 4) return null;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const norm = ring.map(([x, y]) => [(x - cx) / half * 0.9, (y - cy) / half * 0.9]);
    // Split the loop at the point farthest from the start so RDP sees two open halves.
    let far = 0, fd = 0;
    norm.forEach(([x, y], i) => { const d = Math.hypot(x - norm[0][0], y - norm[0][1]); if (d > fd) { fd = d; far = i; } });
    let idx = [];
    for (let eps = 0.03; eps < 2; eps *= 1.35) {
      const a = rdp(norm.slice(0, far + 1), eps);
      const b = rdp(norm.slice(far).concat([norm[0]]), eps).map((j) => j + far);
      idx = a.slice(0, -1).concat(b.slice(0, -1)).map((j) => j % norm.length);
      idx = [...new Set(idx)];
      if (idx.length <= MAX_POINTS) break;
    }
    if (idx.length < 3) return null;
    // Turning at every sample; how much of it sits near a corner?
    const N = norm.length;
    const turn = norm.map((p, i) => {
      const a = norm[(i - 1 + N) % N], b = norm[(i + 1) % N];
      let d = Math.atan2(b[1] - p[1], b[0] - p[0]) - Math.atan2(p[1] - a[1], p[0] - a[0]);
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return Math.abs(d);
    });
    const total = turn.reduce((s, v) => s + v, 0) || 1;
    let near = 0;
    const counted = new Set();
    for (const c of idx) for (let k = -2; k <= 2; k++) { const j = (c + k + N) % N; if (!counted.has(j)) { counted.add(j); near += turn[j]; } }
    const concentration = near / total;
    const round = clamp(1 - (concentration - 0.35) / 0.5, 0, 1);
    idx.sort((a, b) => a - b);
    return { n: idx.length, pts: idx.map((i) => [+norm[i][0].toFixed(3), +norm[i][1].toFixed(3)]), round: +round.toFixed(2) };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Brushes and painting
  // ═════════════════════════════════════════════════════════════════════════
  // brush: { name, size px, opacity, hardness, spacing (fraction of size),
  //          scatter (fraction of size), pressure, shape }
  const shape = (o) => ({ n: 1, pts: [[0, 0]], round: 1, width: 0.5, connect: true, dot: 0.25, angle: 0, follow: false, ...o });
  const PRESETS = [
    { id: "p-pen", name: "Pen", size: 8, opacity: 1, hardness: 0.95, spacing: 0.06, scatter: 0, pressure: true, shape: shape({}) },
    { id: "p-soft", name: "Soft brush", size: 40, opacity: 0.7, hardness: 0.15, spacing: 0.08, scatter: 0, pressure: true, shape: shape({}) },
    { id: "p-air", name: "Airbrush", size: 70, opacity: 0.18, hardness: 0, spacing: 0.05, scatter: 0, pressure: true, shape: shape({}) },
    { id: "p-spray", name: "Spray", size: 36, opacity: 0.8, hardness: 0.8, spacing: 0.3, scatter: 0.35, pressure: false, shape: shape({ n: 8, pts: regularPoints(8).map(([x, y], i) => [x * (i % 2 ? 0.45 : 1), y * (i % 2 ? 0.45 : 1)]), connect: false, dot: 0.08 }) },
    { id: "p-chisel", name: "Chisel", size: 22, opacity: 1, hardness: 1, spacing: 0.05, scatter: 0, pressure: true, shape: shape({ n: 2, pts: [[-0.9, 0], [0.9, 0]], round: 0, width: 0.2, angle: -45 }) },
    { id: "p-square", name: "Square", size: 24, opacity: 1, hardness: 1, spacing: 0.08, scatter: 0, pressure: false, shape: shape({ round: 0 }) },
  ];
  const ERASER_DEFAULT = { id: "p-eraser", name: "Eraser", size: 28, opacity: 1, hardness: 0.85, spacing: 0.06, scatter: 0, pressure: true, shape: shape({}) };

  function normaliseBrush(b, fallback) {
    const f = fallback || PRESETS[0];
    const o = b && typeof b === "object" ? b : {};
    return {
      id: typeof o.id === "string" ? o.id : f.id,
      name: typeof o.name === "string" ? o.name.slice(0, 40) : f.name,
      size: clamp(Number(o.size) || f.size, 1, 300),
      opacity: clamp(o.opacity == null ? f.opacity : Number(o.opacity), 0.02, 1),
      hardness: clamp(o.hardness == null ? f.hardness : Number(o.hardness), 0, 1),
      spacing: clamp(Number(o.spacing) || f.spacing, 0.01, 2),
      scatter: clamp(Number(o.scatter) || 0, 0, 2),
      pressure: o.pressure == null ? f.pressure : !!o.pressure,
      shape: shape({ ...f.shape, ...(o.shape && typeof o.shape === "object" ? o.shape : {}) }),
    };
  }

  // A stamp is the brush tip drawn once at a size and colour, soft edge
  // included (a shadow blur, which every WebView draws). Strokes place it
  // again and again along the line.
  const stampCache = new Map();
  function getStamp(brush, color, size) {
    const qs = size <= 40 ? Math.max(1, Math.round(size)) : Math.round(size / 4) * 4;
    const key = `${shapeKey(brush.shape)}|${brush.hardness.toFixed(2)}|${color}|${qs}`;
    let st = stampCache.get(key);
    if (st) return st;
    const blur = (1 - brush.hardness) * qs * 0.35;
    const R = Math.max(0.5, qs / 2 - blur * 0.9);
    const pad = Math.ceil(blur * 1.8) + 2;
    const D = Math.ceil(R * 2 + pad * 2);
    const c = document.createElement("canvas");
    c.width = c.height = D;
    const ctx = c.getContext("2d");
    const polys = tipPolygons(brush.shape);
    ctx.fillStyle = color;
    if (blur > 0.3) {
      const off = D * 3;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = off;
      tracePolys(ctx, polys, D / 2 - off, D / 2, R);
      ctx.fill();
    } else {
      tracePolys(ctx, polys, D / 2, D / 2, R);
      ctx.fill();
    }
    st = { canvas: c, D, size: qs };
    if (stampCache.size > 40) stampCache.delete(stampCache.keys().next().value);
    stampCache.set(key, st);
    return st;
  }

  // Paints one stroke onto `ctx`, a point at a time. The same seed always
  // gives the same dabs, so vector strokes redraw exactly as they were made.
  function makePainter(ctx, brush, color, seed, pen) {
    const rng = mulberry32(seed || 1);
    const stamp = getStamp(brush, color, brush.size);
    const baseAngle = (brush.shape.angle || 0) * Math.PI / 180;
    const sizeAt = (p) => brush.size * (pen && brush.pressure ? 0.15 + 0.85 * clamp(p == null ? 1 : p, 0, 1) : 1);
    const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    let last = null, need = 0, dir = 0;
    function dab(x, y, p) {
      const size = sizeAt(p);
      const ra = rng(), rb = rng();
      if (brush.scatter > 0) {
        const r = ra * brush.scatter * size, a = rb * Math.PI * 2;
        x += Math.cos(a) * r; y += Math.sin(a) * r;
      }
      const k = size / stamp.size;
      const h = (stamp.D / 2) * k;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(baseAngle + (brush.shape.follow ? dir : 0));
      ctx.drawImage(stamp.canvas, -h, -h, h * 2, h * 2);
      ctx.restore();
      const e = h * 1.42 + 1;
      if (x - e < bounds.x0) bounds.x0 = x - e;
      if (y - e < bounds.y0) bounds.y0 = y - e;
      if (x + e > bounds.x1) bounds.x1 = x + e;
      if (y + e > bounds.y1) bounds.y1 = y + e;
    }
    return {
      bounds,
      add(x, y, p) {
        if (!last) { last = { x, y, p }; dab(x, y, p); need = Math.max(0.4, brush.spacing * sizeAt(p)); return; }
        const dx = x - last.x, dy = y - last.y, dist = Math.hypot(dx, dy);
        if (dist < 0.01) return;
        dir = Math.atan2(dy, dx);
        let travelled = 0;
        while (need <= dist - travelled) {
          travelled += need;
          const t = travelled / dist;
          const pp = last.p == null || p == null ? p : last.p + (p - last.p) * t;
          dab(last.x + dx * t, last.y + dy * t, pp);
          need = Math.max(0.4, brush.spacing * sizeAt(pp));
        }
        need -= dist - travelled;
        last = { x, y, p };
      },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Saved preferences and brushes
  // ═════════════════════════════════════════════════════════════════════════
  let prefsRow = null;
  const prefs = { brush: clone(PRESETS[0]), eraser: clone(ERASER_DEFAULT), color: "#2b2b3a", recent: [], tool: "brush", fill_ref: "all", brush_id: "p-pen" };
  try {
    const rows = await symphony.data.list("prefs");
    prefsRow = rows[rows.length - 1] || null;
    if (prefsRow) {
      prefs.brush = normaliseBrush(prefsRow.brush, PRESETS[0]);
      prefs.eraser = normaliseBrush(prefsRow.eraser, ERASER_DEFAULT);
      if (/^#[0-9a-f]{6}$/i.test(prefsRow.color || "")) prefs.color = prefsRow.color;
      if (Array.isArray(prefsRow.recent)) prefs.recent = prefsRow.recent.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 10);
      if (["brush", "eraser", "fill", "lasso", "picker"].includes(prefsRow.tool)) prefs.tool = prefsRow.tool;
      if (prefsRow.fill_ref === "layer") prefs.fill_ref = "layer";
      if (typeof prefsRow.brush_id === "string") prefs.brush_id = prefsRow.brush_id;
    }
  } catch { /* defaults */ }
  let prefsTimer = null;
  function savePrefsSoon() {
    clearTimeout(prefsTimer);
    prefsTimer = setTimeout(async () => {
      const fields = { brush: prefs.brush, eraser: prefs.eraser, color: prefs.color, recent: prefs.recent, tool: prefs.tool, fill_ref: prefs.fill_ref, brush_id: prefs.brush_id };
      try { prefsRow = prefsRow ? await symphony.data.update("prefs", prefsRow.id, fields) : await symphony.data.create("prefs", fields); } catch { /* next change retries */ }
    }, 800);
  }
  let myBrushes = [];
  async function loadBrushes() {
    try { myBrushes = (await symphony.data.list("brush")).map((r) => ({ row: r, brush: normaliseBrush({ ...r.brush, id: r.id, name: r.name }) })); } catch { myBrushes = []; }
  }
  await loadBrushes();

  // People, for "Made by".
  let alters = [];
  let fronting = [];
  if (can("alters:read")) { try { alters = (await symphony.alters.list()).filter((a) => !a.archived); } catch { alters = []; } }
  if (can("fronting:read")) { try { fronting = (await symphony.fronting.current()).map((f) => f.alter_id); } catch { fronting = []; } }
  const alterById = (id) => alters.find((a) => a.id === id) || null;
  const alterLabel = (a) => (a ? a.name || a.alias || "?" : "");

  // ═════════════════════════════════════════════════════════════════════════
  // Views
  // ═════════════════════════════════════════════════════════════════════════
  const app = el("div", { class: "sb" });
  root.append(app);
  let leaveEditor = null; // set while a drawing is open

  // ── gallery ──────────────────────────────────────────────────────────────
  const PAPERS = [
    { id: "square", label: "Square", w: 1200, h: 1200 },
    { id: "wide", label: "Wide", w: 1600, h: 1200 },
    { id: "tall", label: "Tall", w: 1200, h: 1600 },
  ];
  const PAPER_COLOURS = [
    { id: "#ffffff", label: "White" },
    { id: "#f6f0e1", label: "Cream" },
    { id: "#1f2430", label: "Dark" },
    { id: "", label: "See-through" },
  ];

  const thumbUrl = (d) => (typeof d.thumb64 === "string" && /^image\/(png|jpeg)$/.test(d.thumb_type || "") && /^[A-Za-z0-9+/=]+$/.test(d.thumb64.slice(0, 64)) ? `data:${d.thumb_type};base64,${d.thumb64}` : "");
  async function showGallery() {
    leaveEditor = null;
    app.replaceChildren(el("p", { class: "os-muted" }, "Loading…"));
    let drawings = [];
    let chunkSizes = new Map();
    try {
      drawings = await symphony.data.list("drawing");
      for (const c of await symphony.data.list("chunk")) chunkSizes.set(c.drawing_id, (chunkSizes.get(c.drawing_id) || 0) + (c.data ? c.data.length : 0));
    } catch (e) {
      app.replaceChildren(el("div", { class: "os-card" }, "Your drawings couldn't be read just now. Nothing was changed. Try opening the page again."));
      return;
    }
    const live = drawings.filter((d) => !d.deleted_at).sort((a, b) => String(b.edited_at || b.updated_date).localeCompare(String(a.edited_at || a.updated_date)));
    const gone = drawings.filter((d) => d.deleted_at);

    let paper = PAPERS[0], paperColour = PAPER_COLOURS[0].id;
    const sizeChoices = el("div", { class: "sb-choices" });
    const colourChoices = el("div", { class: "sb-choices" });
    const drawChoices = () => {
      sizeChoices.replaceChildren(...PAPERS.map((p) => el("button", { type: "button", class: "sb-choice", "aria-pressed": String(p === paper), onclick: () => { paper = p; drawChoices(); } }, p.label)));
      colourChoices.replaceChildren(...PAPER_COLOURS.map((c) => el("button", { type: "button", class: "sb-choice", "aria-pressed": String(c.id === paperColour), onclick: () => { paperColour = c.id; drawChoices(); } },
        el("span", { class: "sb-dot", style: `display:inline-block;vertical-align:-1px;margin-right:6px;background:${c.id || "repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/6px 6px"}` }), c.label)));
    };
    drawChoices();

    const newCard = el("div", { class: "os-card" },
      el("div", { class: "os-h" }, "New drawing"),
      el("div", { class: "sb-hint" }, "Paper shape"), sizeChoices,
      el("div", { class: "sb-hint" }, "Paper colour"), colourChoices,
      el("button", { type: "button", class: "os-button", onclick: () => openEditor(null, { w: paper.w, h: paper.h, paper: paperColour }) }, "Start drawing"),
    );

    const card = (d) => el("button", { type: "button", class: "sb-card", onclick: () => openEditor(d) },
      thumbUrl(d) ? el("img", { src: thumbUrl(d), alt: "" }) : el("div", { class: "sb-blank" }),
      el("span", {}, d.name || "Untitled"),
      el("small", {}, `${fmtDate(d.edited_at || d.updated_date)} · ${fmtBytes(chunkSizes.get(d.id) || 0)}`),
    );

    put(app,
      el("div", { class: "os-muted" }, "A small place to draw, sketch and play. Your drawings stay here until you save one to Assets."),
      newCard,
      live.length ? el("div", { class: "sb-section" }, "Your drawings") : null,
      live.length ? el("div", { class: "sb-gallery" }, live.map(card)) : null,
      gone.length ? el("button", { type: "button", class: "sb-link", onclick: () => showDeleted(gone) }, `Recently deleted (${gone.length})`, el("span", { class: "sb-val" }, icon("next", 18))) : null,
    );
  }

  function showDeleted(gone) {
    const list = el("div", {});
    const draw = () => list.replaceChildren(...(gone.length ? gone : []).map((d) => el("div", { class: "sb-layer" },
      thumbUrl(d) ? el("img", { class: "sb-thumb", src: thumbUrl(d), alt: "" }) : el("div", { class: "sb-thumb" }),
      el("div", { class: "sb-lname", style: "cursor:default" }, d.name || "Untitled", el("small", {}, `Deleted ${fmtDate(d.deleted_at)}`)),
      el("button", { type: "button", class: "os-button secondary small", onclick: async () => {
        try { await symphony.data.update("drawing", d.id, { deleted_at: null }); gone.splice(gone.indexOf(d), 1); symphony.ui.toast("Drawing restored"); draw(); } catch { symphony.ui.toast("Couldn't restore that drawing"); }
      } }, "Restore"),
      el("button", { type: "button", class: "os-button secondary small", onclick: async () => {
        const ok = await symphony.ui.confirm("Delete this drawing forever?", "It and all its layers are removed for good. This can't be undone.", { confirmLabel: "Delete forever", destructive: true });
        if (!ok) return;
        try {
          await symphony.data.remove("drawing", d.id);
          for (const c of await symphony.data.list("chunk", { drawing_id: d.id })) await symphony.data.remove("chunk", c.id);
          gone.splice(gone.indexOf(d), 1); draw();
        } catch { symphony.ui.toast("Couldn't delete it all. Try again."); }
      } }, "Delete forever"),
    )));
    draw();
    put(app,
      el("div", { class: "sb-pagehead" }, el("button", { type: "button", class: "sb-iconbtn plain", "aria-label": "Back", onclick: showGallery }, icon("back")), el("h3", {}, "Recently deleted")),
      el("div", { class: "os-muted" }, "Deleted drawings wait here until you restore them or delete them forever."),
      list,
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // The editor
  // ═════════════════════════════════════════════════════════════════════════
  async function openEditor(record, fresh) {
    app.replaceChildren(el("p", { class: "os-muted" }, "Opening…"));
    // ── document ──
    const doc = {
      id: record ? record.id : null,
      name: record ? record.name || "Untitled" : `Drawing ${new Date().toLocaleDateString()}`,
      w: clamp((record ? record.w : fresh.w) | 0 || 1200, 64, 4096),
      h: clamp((record ? record.h : fresh.h) | 0 || 1200, 64, 4096),
      paper: record ? (typeof record.paper === "string" ? record.paper : "#ffffff") : fresh.paper,
      made_by: record ? record.made_by || null : null,
      layers: [],
      activeId: null,
    };
    const allLayers = new Map(); // every layer object seen this session (undo can bring one back)
    const newCanvas = () => { const c = document.createElement("canvas"); c.width = doc.w; c.height = doc.h; return c; };
    function makeLayer(kind, name, extra) {
      const canvas = newCanvas();
      const L = { id: uid(), name, kind, visible: true, opacity: 1, canvas, ctx: canvas.getContext("2d"), strokes: [], savedRev: null, rev: "", dirty: true, failed: false, ...(extra || {}) };
      allLayers.set(L.id, L);
      return L;
    }

    // ── vector layers ──
    function cleanStroke(s) {
      if (!s || typeof s !== "object" || !Array.isArray(s.pts) || s.pts.length < 3) return null;
      return { b: normaliseBrush(s.b), c: /^#[0-9a-f]{6}$/i.test(s.c || "") ? s.c : "#000000", s: Number(s.s) || 1, pen: !!s.pen, pts: s.pts.map(Number) };
    }
    const strokeBuf = newCanvas();
    const strokeBufCtx = strokeBuf.getContext("2d");
    function paintStroke(ctx, s, offX = 0, offY = 0) {
      const painter = makePainter(strokeBufCtx, s.b, s.c, s.s, s.pen);
      for (let i = 0; i < s.pts.length; i += 3) painter.add(s.pts[i] + offX, s.pts[i + 1] + offY, s.pts[i + 2]);
      const r = rectOf(painter.bounds);
      if (!r) return;
      ctx.save(); ctx.globalAlpha = s.b.opacity; ctx.drawImage(strokeBuf, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h); ctx.restore();
      strokeBufCtx.clearRect(r.x, r.y, r.w, r.h);
    }
    function renderVector(L, skip) {
      L.ctx.clearRect(0, 0, doc.w, doc.h);
      for (const s of L.strokes) if (!skip || !skip.has(s)) paintStroke(L.ctx, s);
    }
    function rectOf(b) {
      const x = Math.max(0, Math.floor(b.x0)), y = Math.max(0, Math.floor(b.y0));
      const x1 = Math.min(doc.w, Math.ceil(b.x1)), y1 = Math.min(doc.h, Math.ceil(b.y1));
      return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
    }
    let loadProblems = 0;
    if (record) {
      let chunks = [];
      try { chunks = await symphony.data.list("chunk", { drawing_id: record.id }); } catch { chunks = null; }
      if (!chunks) {
        app.replaceChildren(el("div", { class: "os-card" }, "This drawing couldn't be read just now. Nothing was changed. Go back and try again."), el("button", { type: "button", class: "os-button secondary", onclick: showGallery }, "Back"));
        return;
      }
      for (const meta of Array.isArray(record.layers) ? record.layers : []) {
        const L = makeLayer(meta.kind === "vector" ? "vector" : "raster", String(meta.name || "Layer").slice(0, 40), {
          id: String(meta.id), visible: meta.visible !== false, opacity: clamp(meta.opacity == null ? 1 : Number(meta.opacity), 0, 1),
          rev: String(meta.rev || ""), savedRev: String(meta.rev || ""), dirty: false,
        });
        const parts = chunks.filter((c) => c.layer_id === L.id && String(c.rev) === L.rev).sort((a, b) => a.seq - b.seq);
        const joined = parts.map((p) => p.data || "").join("");
        const data = L.kind === "raster" && joined && !joined.startsWith("data:") ? "data:image/png;base64," + joined : joined;
        try {
          if (!parts.length || !data) throw new Error("missing");
          if (L.kind === "raster") {
            await new Promise((res, rej) => { const img = new Image(); img.onload = () => { L.ctx.drawImage(img, 0, 0); res(); }; img.onerror = rej; img.src = data; });
          } else {
            const strokes = JSON.parse(data);
            if (!Array.isArray(strokes)) throw new Error("bad");
            L.strokes = strokes.map(cleanStroke).filter(Boolean);
            renderVector(L);
          }
        } catch {
          // Never draw over (or save over) a layer that didn't load: it keeps
          // its saved copy and stays locked so the person can still get it back.
          L.failed = true;
          loadProblems++;
        }
        doc.layers.push(L);
      }
    }
    if (!doc.layers.length) doc.layers.push(makeLayer("raster", "Layer 1"));
    doc.activeId = record && doc.layers.some((l) => l.id === record.active) ? record.active : doc.layers[doc.layers.length - 1].id;
    const active = () => doc.layers.find((l) => l.id === doc.activeId) || doc.layers[doc.layers.length - 1];

    const union = (a, b) => (!a ? b : !b ? a : rectOf({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x + a.w, b.x + b.w), y1: Math.max(a.y + a.h, b.y + b.h) }));

    // ── history ──
    const undoStack = [], redoStack = [];
    let histBytes = 0;
    const entryBytes = (e) => (e.kind === "raster" ? e.before.data.length * 2 : 2000);
    function pushHistory(e) {
      undoStack.push(e);
      histBytes += entryBytes(e);
      for (const r of redoStack) histBytes -= entryBytes(r);
      redoStack.length = 0;
      while (undoStack.length > 1 && (histBytes > 90 * 1048576 || undoStack.length > 60)) histBytes -= entryBytes(undoStack.shift());
      touched(e);
    }
    function touched(e) {
      if (e.layer) e.layer.dirty = true;
      docDirty = true;
      scheduleSave();
      updateUndoButtons();
    }
    function applyEntry(e, side) {
      if (e.kind === "raster") e.layer.ctx.putImageData(e[side], e.r.x, e.r.y);
      else if (e.kind === "strokes") { e.layer.strokes = e[side]; renderVector(e.layer); }
      else if (e.kind === "layers") restoreLayers(e[side]);
      else if (e.kind === "paper") doc.paper = e[side];
      touched(e);
      requestRender();
      refreshPanel();
    }
    function undo() { settleSelection(); const e = undoStack.pop(); if (!e) return; histBytes -= entryBytes(e); redoStack.push(e); histBytes += entryBytes(e); applyEntry(e, "before"); }
    function redo() { settleSelection(); const e = redoStack.pop(); if (!e) return; undoStack.push(e); applyEntry(e, "after"); }
    const snapLayers = () => ({ order: doc.layers.slice(), props: doc.layers.map((l) => ({ name: l.name, visible: l.visible, opacity: l.opacity })), activeId: doc.activeId });
    function restoreLayers(s) {
      doc.layers = s.order.slice();
      s.order.forEach((l, i) => Object.assign(l, s.props[i]));
      doc.activeId = doc.layers.some((l) => l.id === s.activeId) ? s.activeId : doc.layers[doc.layers.length - 1].id;
    }
    function layerChange(fn) {
      const before = snapLayers();
      fn();
      pushHistory({ kind: "layers", before, after: snapLayers() });
      requestRender();
      refreshPanel();
    }

    // ── saving ──
    let docDirty = !record;
    let saveTimer = null, saving = null, saveAgain = false, saveFailed = false;
    const CHUNK = 180000;
    function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveNow(), 4000); setStatus(); }
    async function saveNow() {
      clearTimeout(saveTimer);
      if (saving) { saveAgain = true; return saving; }
      if (!docDirty) return;
      saving = (async () => {
        docDirty = false;
        setStatus();
        try {
          if (!doc.id) {
            const row = await symphony.data.create("drawing", { name: doc.name, w: doc.w, h: doc.h, paper: doc.paper, layers: [], active: doc.activeId, edited_at: new Date().toISOString() });
            doc.id = row.id;
          }
          // 1. New pieces first.
          for (const L of doc.layers) {
            if (L.failed || (!L.dirty && L.savedRev != null)) continue;
            // Raster pieces are bare base64 (no "data:" prefix): the app's
            // stored text then never looks like a picture link to anything.
            const data = L.kind === "raster" ? L.canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "") : JSON.stringify(L.strokes);
            // A fresh token, so pieces written by two devices never mix.
            const rev = uid();
            for (let i = 0, seq = 0; i < data.length || seq === 0; i += CHUNK, seq++) {
              await symphony.data.create("chunk", { drawing_id: doc.id, layer_id: L.id, rev, seq, data: data.slice(i, i + CHUNK) });
            }
            L.rev = rev; L.savedRev = rev; L.dirty = false;
          }
          // 2. Point the drawing at them.
          await symphony.data.update("drawing", doc.id, {
            name: doc.name, w: doc.w, h: doc.h, paper: doc.paper, active: doc.activeId, made_by: doc.made_by,
            layers: doc.layers.map((l) => ({ id: l.id, name: l.name, kind: l.kind, visible: l.visible, opacity: l.opacity, rev: l.rev })),
            ...makeThumb(), edited_at: new Date().toISOString(),
          });
          // 3. Only now tidy away pieces nothing points at.
          const keep = new Set(doc.layers.map((l) => `${l.id}:${l.rev}`));
          for (const c of await symphony.data.list("chunk", { drawing_id: doc.id })) {
            if (keep.has(`${c.layer_id}:${String(c.rev)}`)) continue;
            await symphony.data.remove("chunk", c.id);
            const gone = allLayers.get(c.layer_id);
            if (gone && !doc.layers.includes(gone)) { gone.savedRev = null; gone.dirty = true; }
          }
          saveFailed = false;
        } catch (e) {
          docDirty = true;
          saveFailed = true;
        }
      })();
      await saving;
      saving = null;
      setStatus();
      if (saveAgain) { saveAgain = false; return saveNow(); }
    }
    function makeThumb() {
      const s = 200 / Math.max(doc.w, doc.h);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(doc.w * s)); c.height = Math.max(1, Math.round(doc.h * s));
      const ctx = c.getContext("2d");
      if (doc.paper) { ctx.fillStyle = doc.paper; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.scale(s, s);
      for (const L of doc.layers) if (L.visible) { ctx.globalAlpha = L.opacity; ctx.drawImage(L.canvas, 0, 0); }
      try {
        const url = doc.paper ? c.toDataURL("image/jpeg", 0.8) : c.toDataURL("image/png");
        const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(url);
        return m ? { thumb_type: m[1], thumb64: m[2] } : {};
      } catch { return {}; }
    }
    const onHide = () => { if (document.visibilityState === "hidden") saveNow(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", saveNow);
    leaveEditor = async () => {
      settleSelection();
      await saveNow();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", saveNow);
      if (saveFailed) {
        const ok = await symphony.ui.confirm("Your latest changes aren't saved", "Saving didn't work. Stay here and try again, or leave and lose the changes since the last save.", { confirmLabel: "Leave anyway", destructive: true });
        if (!ok) { document.addEventListener("visibilitychange", onHide); window.addEventListener("pagehide", saveNow); return; }
      }
      showGallery();
    };

    // ── state ──
    // A drawing always opens on the brush or eraser, never mid-fill or lasso.
    let tool = prefs.tool === "eraser" ? "eraser" : "brush";
    const curBrush = () => (tool === "eraser" ? prefs.eraser : prefs.brush);
    let sel = null; // lasso selection
    let page = "main";

    // ── layout ──
    const statusEl = el("span", { class: "sb-status" });
    function setStatus() {
      statusEl.className = "sb-status" + (saveFailed ? " bad" : "");
      statusEl.textContent = saveFailed ? "Not saved, tap to retry" : saving ? "Saving…" : docDirty ? "Edited" : "Saved";
      statusEl.onclick = saveFailed ? () => saveNow() : null;
    }
    const nameBtn = el("button", { type: "button", class: "sb-name", title: "Rename", onclick: () => openPage("more") }, doc.name);
    const undoBtn = el("button", { type: "button", class: "sb-iconbtn", "aria-label": "Undo", title: "Undo", onclick: undo }, icon("undo"));
    const redoBtn = el("button", { type: "button", class: "sb-iconbtn", "aria-label": "Redo", title: "Redo", onclick: redo }, icon("redo"));
    function updateUndoButtons() { undoBtn.disabled = !undoStack.length && !sel; redoBtn.disabled = !redoStack.length; }

    const TOOLS = [["brush", "Brush"], ["eraser", "Eraser"], ["fill", "Fill"], ["lasso", "Lasso"], ["picker", "Pick colour"]];
    const toolBtns = {};
    const swatchInner = el("span", {});
    const swatchBtn = el("button", { type: "button", class: "sb-swatchbtn", "aria-label": "Colour", title: "Colour", onclick: () => openPage("colour") }, swatchInner);
    const toolsRow = el("div", { class: "sb-tools", role: "toolbar", "aria-label": "Tools" },
      TOOLS.map(([id, label]) => (toolBtns[id] = el("button", { type: "button", class: "sb-tool", onclick: () => setTool(id) }, icon(id === "picker" ? "picker" : id), label))),
      swatchBtn);
    let prevTool = tool === "picker" ? "brush" : tool;
    function setTool(t) {
      if (t !== "lasso") settleSelection();
      if (t !== "picker") prevTool = t;
      tool = t; prefs.tool = t; savePrefsSoon();
      for (const [id, b] of Object.entries(toolBtns)) b.setAttribute("aria-pressed", String(id === t));
      if (page === "brush" || page === "main") refreshPanel();
    }

    const stage = el("div", { class: "sb-stage" });
    const view = el("canvas", { "aria-label": "Drawing canvas" });
    const zoomLabel = el("span", { class: "sb-zoomlabel" }, "100%");
    stage.append(view, el("div", { class: "sb-zoom" },
      el("button", { type: "button", class: "sb-iconbtn", "aria-label": "Zoom out", onclick: () => zoomBy(1 / 1.4) }, icon("minus", 16)),
      zoomLabel,
      el("button", { type: "button", class: "sb-iconbtn", "aria-label": "Zoom in", onclick: () => zoomBy(1.4) }, icon("plus", 16)),
      el("button", { type: "button", class: "sb-iconbtn", "aria-label": "Fit to screen", onclick: () => fitView() }, icon("fit", 16)),
    ));
    const selBar = el("div", { class: "sb-selbar", hidden: true });
    const panel = el("div", { class: "sb-panel" });

    app.replaceChildren(
      el("div", { class: "sb-bar" },
        el("button", { type: "button", class: "sb-iconbtn plain", "aria-label": "Back to your drawings", title: "Your drawings", onclick: () => leaveEditor && leaveEditor() }, icon("back")),
        el("div", { class: "sb-grow" }, nameBtn, el("div", {}, statusEl)),
        undoBtn, redoBtn,
        el("button", { type: "button", class: "sb-iconbtn", "aria-label": "Save and more", title: "Save and more", onclick: () => openPage("more") }, icon("more")),
      ),
      toolsRow, stage, selBar, panel,
    );
    if (loadProblems) symphony.ui.toast(`${loadProblems} layer${loadProblems === 1 ? "" : "s"} couldn't be loaded. ${loadProblems === 1 ? "It's" : "They're"} locked so the saved copy stays safe.`);

    // ── view (zoom & pan) ──
    let cssW = 0, cssH = 0, dpr = 1, fit = 1, vs = 1, tx = 0, ty = 0;
    const vctx = view.getContext("2d");
    function layoutStage() {
      const w = stage.clientWidth || 320;
      const maxH = symphony.viewportHeight ? Math.max(260, symphony.viewportHeight * 0.62) : 560;
      const h = Math.round(clamp(w * doc.h / doc.w, 220, maxH));
      stage.style.height = h + "px";
      const changed = w !== cssW || h !== cssH;
      cssW = w; cssH = h;
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      view.width = Math.round(w * dpr); view.height = Math.round(h * dpr);
      fit = Math.min(w / doc.w, h / doc.h) * 0.96;
      if (changed) fitView(true);
      requestRender();
    }
    function fitView(silent) { vs = fit; tx = (cssW - doc.w * vs) / 2; ty = (cssH - doc.h * vs) / 2; if (!silent) requestRender(); updateZoomLabel(); }
    function updateZoomLabel() { zoomLabel.textContent = `${Math.round((vs / fit) * 100)}%`; }
    function zoomAt(f, mx, my) {
      const ns = clamp(vs * f, fit * 0.5, fit * 16);
      const px = (mx - tx) / vs, py = (my - ty) / vs;
      vs = ns; tx = mx - px * vs; ty = my - py * vs;
      clampPan(); updateZoomLabel(); requestRender();
    }
    function zoomBy(f) { zoomAt(f, cssW / 2, cssH / 2); }
    function clampPan() {
      const pw = doc.w * vs, ph = doc.h * vs, m = 40;
      tx = clamp(tx, Math.min(m - pw, (cssW - pw) / 2), Math.max(cssW - m, (cssW - pw) / 2));
      ty = clamp(ty, Math.min(m - ph, (cssH - ph) / 2), Math.max(cssH - m, (cssH - ph) / 2));
    }
    const toPaper = (e) => { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left - tx) / vs, y: (e.clientY - r.top - ty) / vs }; };

    // ── rendering ──
    let rafId = 0;
    const scratch = newCanvas();
    const scratchCtx = scratch.getContext("2d");
    let checker = null;
    function requestRender() { if (!rafId) rafId = requestAnimationFrame(render); }
    function render() {
      rafId = 0;
      const ctx = vctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, view.width, view.height);
      ctx.setTransform(dpr * vs, 0, 0, dpr * vs, dpr * tx, dpr * ty);
      ctx.imageSmoothingEnabled = vs / fit < 3;
      if (doc.paper) { ctx.fillStyle = doc.paper; ctx.fillRect(0, 0, doc.w, doc.h); }
      else {
        if (!checker) { const c = document.createElement("canvas"); c.width = c.height = 32; const k = c.getContext("2d"); k.fillStyle = "#fff"; k.fillRect(0, 0, 32, 32); k.fillStyle = "#e3e3e3"; k.fillRect(0, 0, 16, 16); k.fillRect(16, 16, 16, 16); checker = ctx.createPattern(c, "repeat"); }
        ctx.fillStyle = checker; ctx.fillRect(0, 0, doc.w, doc.h);
      }
      for (const L of doc.layers) {
        if (!L.visible) continue;
        ctx.globalAlpha = L.opacity;
        if (stroke && stroke.layer === L && stroke.raster) {
          scratchCtx.clearRect(0, 0, doc.w, doc.h);
          scratchCtx.drawImage(L.canvas, 0, 0);
          scratchCtx.globalAlpha = stroke.brush.opacity;
          scratchCtx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
          scratchCtx.drawImage(strokeBuf, 0, 0);
          scratchCtx.globalAlpha = 1; scratchCtx.globalCompositeOperation = "source-over";
          ctx.drawImage(scratch, 0, 0);
        } else {
          ctx.drawImage(L.canvas, 0, 0);
          if (stroke && stroke.layer === L && !stroke.raster) { ctx.globalAlpha = L.opacity * stroke.brush.opacity; ctx.drawImage(strokeBuf, 0, 0); }
        }
        if (sel && sel.layer === L && sel.float) { ctx.globalAlpha = L.opacity; ctx.drawImage(sel.float, sel.fx + sel.dx, sel.fy + sel.dy); }
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1 / vs; ctx.strokeRect(0, 0, doc.w, doc.h);
      // Lasso outline (being drawn, or the selection).
      const path = lassoDraft || (sel && sel.path);
      if (path && path.length > 1) {
        const ox = sel && !lassoDraft ? sel.dx : 0, oy = sel && !lassoDraft ? sel.dy : 0;
        ctx.beginPath();
        path.forEach(([x, y], i) => (i ? ctx.lineTo(x + ox, y + oy) : ctx.moveTo(x + ox, y + oy)));
        if (!lassoDraft) ctx.closePath();
        ctx.lineWidth = 1.5 / vs;
        ctx.setLineDash([]); ctx.strokeStyle = "#fff"; ctx.stroke();
        ctx.setLineDash([5 / vs, 4 / vs]); ctx.strokeStyle = "#111"; ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── pointers ──
    const pointers = new Map();
    let penSeen = false;
    let stroke = null; // { layer, brush, color, erase, raster, painter, pts, pen, seed }
    let gesture = null;
    let lassoDraft = null;
    let dragSel = null;
    let vectorErase = null;

    function startGesture() {
      cancelStroke();
      lassoDraft = null;
      const [a, b] = [...pointers.values()];
      gesture = { s0: vs, tx0: tx, ty0: ty, mid: [(a.x + b.x) / 2, (a.y + b.y) / 2], dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    }
    function localXY(e) { const r = view.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    view.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (e.pointerType === "pen") penSeen = true;
      try { view.setPointerCapture(e.pointerId); } catch { /* fine */ }
      pointers.set(e.pointerId, { ...localXY(e), type: e.pointerType });
      const touches = [...pointers.values()].filter((p) => p.type === "touch").length;
      if (pointers.size >= 2 && touches >= 2) { startGesture(); return; }
      if (pointers.size > 1) return;
      // With a stylus in use, one finger moves the page instead of drawing.
      if (penSeen && e.pointerType === "touch") { gesture = { pan: true, x: e.clientX, y: e.clientY, tx0: tx, ty0: ty }; return; }
      if (e.button === 1 || (e.pointerType === "mouse" && e.buttons === 4)) { gesture = { pan: true, x: e.clientX, y: e.clientY, tx0: tx, ty0: ty }; return; }
      beginTool(e);
    });
    view.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { ...localXY(e), type: e.pointerType });
      if (gesture) {
        if (gesture.pan) { tx = gesture.tx0 + (e.clientX - gesture.x); ty = gesture.ty0 + (e.clientY - gesture.y); clampPan(); requestRender(); return; }
        const pts = [...pointers.values()];
        if (pts.length < 2) return;
        const [a, b] = pts;
        const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const ns = clamp(gesture.s0 * dist / gesture.dist, fit * 0.5, fit * 16);
        const px = (gesture.mid[0] - gesture.tx0) / gesture.s0, py = (gesture.mid[1] - gesture.ty0) / gesture.s0;
        vs = ns; tx = mid[0] - px * vs; ty = mid[1] - py * vs;
        clampPan(); updateZoomLabel(); requestRender();
        return;
      }
      const evs = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      for (const ce of evs.length ? evs : [e]) moveTool(ce);
    });
    const endPointer = (e, cancelled) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (gesture) { if (pointers.size === 0) gesture = null; return; }
      if (cancelled) { cancelStroke(); lassoDraft = null; requestRender(); return; }
      endTool(e);
    };
    view.addEventListener("pointerup", (e) => endPointer(e, false));
    view.addEventListener("pointercancel", (e) => endPointer(e, true));
    view.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = localXY(e);
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) zoomAt(Math.exp(-e.deltaY * 0.0022), p.x, p.y);
      else { tx -= e.deltaX; clampPan(); requestRender(); }
    }, { passive: false });

    function lockedLayerMessage(L) {
      if (L.failed) { symphony.ui.toast("This layer didn't load, so it's locked to keep its saved copy safe."); return true; }
      if (!L.visible) { symphony.ui.toast("This layer is hidden. Show it in Layers to draw on it."); return true; }
      return false;
    }

    function beginTool(e) {
      const p = toPaper(e);
      const L = active();
      if (tool === "picker") { pickColour(p); return; }
      if (tool === "lasso") {
        if (sel && pointInSel(p)) { dragSel = { x: p.x, y: p.y, dx0: sel.dx, dy0: sel.dy }; if (!sel.float) liftSelection(false); return; }
        settleSelection();
        if (lockedLayerMessage(L)) return;
        lassoDraft = [[p.x, p.y]];
        requestRender();
        return;
      }
      if (lockedLayerMessage(L)) return;
      if (tool === "fill") { fillAt(p); return; }
      settleSelection();
      if (tool === "eraser" && L.kind === "vector") { vectorErase = { before: L.strokes.slice(), removed: false }; eraseVectorAt(L, p); return; }
      const brush = clone(curBrush());
      const pen = e.pointerType === "pen";
      const seed = (Math.random() * 2147483647) | 0;
      stroke = { layer: L, brush, color: tool === "eraser" ? "#000000" : prefs.color, erase: tool === "eraser", raster: L.kind === "raster", pen, seed, pts: [] };
      stroke.painter = makePainter(strokeBufCtx, brush, stroke.color, seed, pen);
      addStrokePoint(e, p);
    }
    function addStrokePoint(e, p) {
      const pr = stroke.pen ? (e.pressure || 0.5) : 1;
      stroke.painter.add(p.x, p.y, pr);
      stroke.pts.push(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(pr * 100) / 100);
      requestRender();
    }
    function moveTool(e) {
      if (stroke) { addStrokePoint(e, toPaper(e)); return; }
      const p = toPaper(e);
      if (vectorErase) { eraseVectorAt(active(), p); return; }
      if (lassoDraft) { const last = lassoDraft[lassoDraft.length - 1]; if (Math.hypot(p.x - last[0], p.y - last[1]) * vs > 3) { lassoDraft.push([p.x, p.y]); requestRender(); } return; }
      if (dragSel && sel) { sel.dx = Math.round(dragSel.dx0 + p.x - dragSel.x); sel.dy = Math.round(dragSel.dy0 + p.y - dragSel.y); requestRender(); }
    }
    function endTool() {
      if (stroke) { commitStroke(); return; }
      if (vectorErase) {
        const L = active();
        if (vectorErase.removed) pushHistory({ kind: "strokes", layer: L, before: vectorErase.before, after: L.strokes.slice() });
        vectorErase = null;
        return;
      }
      if (lassoDraft) {
        const path = lassoDraft; lassoDraft = null;
        if (path.length >= 3) makeSelection(path); else requestRender();
        return;
      }
      if (dragSel) { dragSel = null; }
    }
    function cancelStroke() {
      if (stroke) {
        const r = rectOf(stroke.painter.bounds);
        if (r) strokeBufCtx.clearRect(r.x, r.y, r.w, r.h);
        stroke = null;
        requestRender();
      }
      if (vectorErase) {
        const L = active();
        L.strokes = vectorErase.before; renderVector(L); vectorErase = null; requestRender();
      }
    }
    function commitStroke() {
      const s = stroke; stroke = null;
      const r = rectOf(s.painter.bounds);
      if (!r) return;
      const L = s.layer;
      if (s.raster) {
        const before = L.ctx.getImageData(r.x, r.y, r.w, r.h);
        L.ctx.save();
        L.ctx.globalAlpha = s.brush.opacity;
        L.ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
        L.ctx.drawImage(strokeBuf, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        L.ctx.restore();
        strokeBufCtx.clearRect(r.x, r.y, r.w, r.h);
        pushHistory({ kind: "raster", layer: L, r, before, after: L.ctx.getImageData(r.x, r.y, r.w, r.h) });
      } else {
        strokeBufCtx.clearRect(r.x, r.y, r.w, r.h);
        const st = cleanStroke({ b: s.brush, c: s.color, s: s.seed, pen: s.pen, pts: s.pts.length >= 3 ? s.pts : [] });
        if (!st) return;
        const before = L.strokes.slice();
        L.strokes = before.concat([st]);
        paintStroke(L.ctx, st);
        pushHistory({ kind: "strokes", layer: L, before, after: L.strokes.slice() });
      }
      if (!s.erase) rememberColour(s.color);
      requestRender();
    }
    function strokeHit(st, p, rad) {
      const reach = rad + st.b.size / 2;
      for (let i = 0; i < st.pts.length; i += 3) if (Math.hypot(st.pts[i] - p.x, st.pts[i + 1] - p.y) <= reach) return true;
      for (let i = 3; i < st.pts.length; i += 3) {
        const ax = st.pts[i - 3], ay = st.pts[i - 2], bx = st.pts[i], by = st.pts[i + 1];
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
        const t = clamp(((p.x - ax) * dx + (p.y - ay) * dy) / l2, 0, 1);
        if (Math.hypot(ax + dx * t - p.x, ay + dy * t - p.y) <= reach) return true;
      }
      return false;
    }
    function eraseVectorAt(L, p) {
      const rad = prefs.eraser.size / 2;
      const keep = L.strokes.filter((st) => !strokeHit(st, p, rad));
      if (keep.length !== L.strokes.length) { L.strokes = keep; vectorErase.removed = true; renderVector(L); requestRender(); }
    }

    // ── eyedropper ──
    function pickColour(p) {
      const c = document.createElement("canvas"); c.width = c.height = 1;
      const k = c.getContext("2d");
      if (doc.paper) { k.fillStyle = doc.paper; k.fillRect(0, 0, 1, 1); }
      for (const L of doc.layers) if (L.visible) { k.globalAlpha = L.opacity; k.drawImage(L.canvas, -Math.floor(p.x), -Math.floor(p.y)); }
      const d = k.getImageData(0, 0, 1, 1).data;
      if (d[3] < 8) { symphony.ui.toast("Nothing to pick there"); return; }
      const hex = "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
      setColour(hex);
      symphony.ui.toast("Colour picked");
      setTool(prevTool);
    }

    // ── fill bucket ──
    function fillAt(p) {
      const L = active();
      if (L.kind !== "raster") { symphony.ui.toast("Fill works on raster layers. Add a raster layer to colour in."); return; }
      const x0 = Math.floor(p.x), y0 = Math.floor(p.y);
      if (x0 < 0 || y0 < 0 || x0 >= doc.w || y0 >= doc.h) return;
      settleSelection();
      let src;
      if (prefs.fill_ref === "all") {
        scratchCtx.clearRect(0, 0, doc.w, doc.h);
        for (const K of doc.layers) if (K.visible) { scratchCtx.globalAlpha = K.opacity; scratchCtx.drawImage(K.canvas, 0, 0); }
        scratchCtx.globalAlpha = 1;
        src = scratchCtx.getImageData(0, 0, doc.w, doc.h).data;
      } else src = L.ctx.getImageData(0, 0, doc.w, doc.h).data;
      const W = doc.w, H = doc.h;
      const i0 = (y0 * W + x0) * 4;
      const tr = src[i0], tg = src[i0 + 1], tb = src[i0 + 2], ta = src[i0 + 3];
      const TOL = 48;
      const same = (i) => {
        const a = src[i + 3];
        if (ta < 8 && a < 8) return true;
        return Math.abs(src[i] - tr) + Math.abs(src[i + 1] - tg) + Math.abs(src[i + 2] - tb) + Math.abs(a - ta) * 1.5 <= TOL * 3;
      };
      const mask = new Uint8Array(W * H);
      const stack = [x0, y0];
      let bx0 = x0, by0 = y0, bx1 = x0, by1 = y0, count = 0;
      while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        let l = x;
        while (l > 0 && !mask[y * W + l - 1] && same((y * W + l - 1) * 4)) l--;
        let r = x;
        while (r < W - 1 && !mask[y * W + r + 1] && same((y * W + r + 1) * 4)) r++;
        for (let i = l; i <= r; i++) mask[y * W + i] = 1;
        count += r - l + 1;
        if (l < bx0) bx0 = l; if (r > bx1) bx1 = r; if (y < by0) by0 = y; if (y > by1) by1 = y;
        for (const ny of [y - 1, y + 1]) {
          if (ny < 0 || ny >= H) continue;
          let i = l;
          while (i <= r) {
            if (!mask[ny * W + i] && same((ny * W + i) * 4)) {
              stack.push(i, ny);
              while (i <= r && !mask[ny * W + i] && same((ny * W + i) * 4)) i++;
            } else i++;
          }
        }
      }
      if (!count) return;
      // Grow by a pixel so the fill tucks under soft line edges.
      const r = rectOf({ x0: bx0 - 2, y0: by0 - 2, x1: bx1 + 3, y1: by1 + 3 });
      const out = new ImageData(r.w, r.h);
      const col = hexRgb(prefs.color);
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        let on = mask[y * W + x];
        if (!on) for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && mask[yy * W + xx]) on = 1;
        }
        if (on) { const o = ((y - r.y) * r.w + (x - r.x)) * 4; out.data[o] = col[0]; out.data[o + 1] = col[1]; out.data[o + 2] = col[2]; out.data[o + 3] = 255; }
      }
      const before = L.ctx.getImageData(r.x, r.y, r.w, r.h);
      const tmp = document.createElement("canvas"); tmp.width = r.w; tmp.height = r.h;
      tmp.getContext("2d").putImageData(out, 0, 0);
      L.ctx.save(); L.ctx.globalAlpha = prefs.brush.opacity; L.ctx.drawImage(tmp, r.x, r.y); L.ctx.restore();
      pushHistory({ kind: "raster", layer: L, r, before, after: L.ctx.getImageData(r.x, r.y, r.w, r.h) });
      rememberColour(prefs.color);
      requestRender();
    }
    const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

    // ── lasso ──
    function makeSelection(path) {
      const L = active();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of path) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const box = rectOf({ x0, y0, x1, y1 });
      if (!box) { requestRender(); return; }
      const p2d = new Path2D();
      path.forEach(([x, y], i) => (i ? p2d.lineTo(x, y) : p2d.moveTo(x, y)));
      p2d.closePath();
      sel = { layer: L, path, p2d, box, dx: 0, dy: 0, float: null, fx: box.x, fy: box.y };
      if (L.kind === "vector") {
        const hit = document.createElement("canvas").getContext("2d");
        sel.strokes = new Set(L.strokes.filter((st) => { for (let i = 0; i < st.pts.length; i += 3) if (hit.isPointInPath(p2d, st.pts[i], st.pts[i + 1])) return true; return false; }));
        if (!sel.strokes.size) { sel = null; symphony.ui.toast("No strokes inside that loop"); requestRender(); return; }
      }
      showSelBar();
      updateUndoButtons();
      requestRender();
    }
    function pointInSel(p) {
      if (!sel) return false;
      const k = document.createElement("canvas").getContext("2d");
      return k.isPointInPath(sel.p2d, p.x - sel.dx, p.y - sel.dy);
    }
    // Take the selected part off its layer into a floating piece. `copy`
    // leaves the original where it was.
    function liftSelection(copy) {
      const L = sel.layer;
      if (L.kind === "raster") {
        sel.full = L.ctx.getImageData(0, 0, doc.w, doc.h);
        const f = document.createElement("canvas"); f.width = sel.box.w; f.height = sel.box.h;
        const fc = f.getContext("2d");
        fc.save(); fc.translate(-sel.box.x, -sel.box.y); fc.clip(sel.p2d); fc.drawImage(L.canvas, 0, 0); fc.restore();
        if (!copy) { L.ctx.save(); L.ctx.clip(sel.p2d); L.ctx.clearRect(sel.box.x, sel.box.y, sel.box.w, sel.box.h); L.ctx.restore(); }
        sel.float = f;
      } else {
        sel.before = L.strokes.slice();
        sel.copy = copy;
        let b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        for (const st of sel.strokes) for (let i = 0; i < st.pts.length; i += 3) {
          const e = st.b.size;
          b = { x0: Math.min(b.x0, st.pts[i] - e), y0: Math.min(b.y0, st.pts[i + 1] - e), x1: Math.max(b.x1, st.pts[i] + e), y1: Math.max(b.y1, st.pts[i + 1] + e) };
        }
        const box = rectOf(b) || sel.box;
        const f = document.createElement("canvas"); f.width = box.w; f.height = box.h;
        const fc = f.getContext("2d");
        fc.translate(-box.x, -box.y);
        for (const st of sel.strokes) paintStroke(fc, st);
        sel.fx = box.x; sel.fy = box.y;
        if (!copy) renderVector(L, sel.strokes);
        sel.float = f;
      }
      requestRender();
    }
    // Put a lifted selection down where it is now (one undo step).
    function settleSelection() {
      if (!sel) return;
      const s = sel; sel = null;
      selBar.hidden = true;
      if (s.float) {
        const L = s.layer;
        if (L.kind === "raster") {
          L.ctx.drawImage(s.float, s.box.x + s.dx, s.box.y + s.dy);
          const r = union(s.box, rectOf({ x0: s.box.x + s.dx, y0: s.box.y + s.dy, x1: s.box.x + s.dx + s.box.w, y1: s.box.y + s.dy + s.box.h }));
          if (r) {
            const before = new ImageData(r.w, r.h);
            for (let y = 0; y < r.h; y++) before.data.set(s.full.data.subarray(((r.y + y) * doc.w + r.x) * 4, ((r.y + y) * doc.w + r.x + r.w) * 4), y * r.w * 4);
            pushHistory({ kind: "raster", layer: L, r, before, after: L.ctx.getImageData(r.x, r.y, r.w, r.h) });
          }
        } else {
          const moved = [...s.strokes].map((st) => ({ ...st, pts: st.pts.map((v, i) => (i % 3 === 0 ? Math.round((v + s.dx) * 10) / 10 : i % 3 === 1 ? Math.round((v + s.dy) * 10) / 10 : v)) }));
          const after = s.copy ? s.before.concat(moved) : s.before.filter((st) => !s.strokes.has(st)).concat(moved);
          L.strokes = after;
          renderVector(L);
          pushHistory({ kind: "strokes", layer: L, before: s.before, after: after.slice() });
        }
      }
      updateUndoButtons();
      requestRender();
    }
    function deleteSelection() {
      if (!sel) return;
      const s = sel; sel = null; selBar.hidden = true;
      const L = s.layer;
      if (L.kind === "raster") {
        if (s.float) {
          // Already lifted: the original spot is clear; drop the piece.
          const r = s.box;
          const before = new ImageData(r.w, r.h);
          for (let y = 0; y < r.h; y++) before.data.set(s.full.data.subarray(((r.y + y) * doc.w + r.x) * 4, ((r.y + y) * doc.w + r.x + r.w) * 4), y * r.w * 4);
          pushHistory({ kind: "raster", layer: L, r, before, after: L.ctx.getImageData(r.x, r.y, r.w, r.h) });
        } else {
          const r = s.box;
          const before = L.ctx.getImageData(r.x, r.y, r.w, r.h);
          L.ctx.save(); L.ctx.clip(s.p2d); L.ctx.clearRect(r.x, r.y, r.w, r.h); L.ctx.restore();
          pushHistory({ kind: "raster", layer: L, r, before, after: L.ctx.getImageData(r.x, r.y, r.w, r.h) });
        }
      } else {
        const before = s.before || L.strokes.slice();
        L.strokes = before.filter((st) => !s.strokes.has(st));
        renderVector(L);
        pushHistory({ kind: "strokes", layer: L, before, after: L.strokes.slice() });
      }
      requestRender();
    }
    function showSelBar() {
      selBar.hidden = false;
      selBar.replaceChildren(
        el("span", { class: "os-muted", style: "flex:1;min-width:140px" }, "Drag inside the loop to move it."),
        el("button", { type: "button", class: "os-button secondary small", onclick: () => { if (sel && !sel.float) { liftSelection(true); sel.dx = 12; sel.dy = 12; requestRender(); symphony.ui.toast("Copied. Drag it where you like."); } } }, "Copy"),
        el("button", { type: "button", class: "os-button secondary small", onclick: deleteSelection }, "Delete"),
        el("button", { type: "button", class: "os-button small", onclick: settleSelection }, "Done"),
      );
    }

    // ── colour ──
    function setColour(hex) {
      prefs.color = hex.toLowerCase();
      swatchInner.style.background = prefs.color;
      savePrefsSoon();
      if (page === "colour" || page === "brush") refreshPanel();
    }
    function rememberColour(hex) {
      const h = hex.toLowerCase();
      prefs.recent = [h, ...prefs.recent.filter((c) => c !== h)].slice(0, 10);
      savePrefsSoon();
    }
    swatchInner.style.background = prefs.color;

    // ═══════════════════════════════════════════════════════════════════════
    // The panel under the canvas: one page at a time, drill-in style
    // ═══════════════════════════════════════════════════════════════════════
    function openPage(p) { settleSelection(); page = p; refreshPanel(); }
    function head(title, extra) {
      return el("div", { class: "sb-pagehead" },
        el("button", { type: "button", class: "sb-iconbtn plain", "aria-label": "Back", onclick: () => openPage("main") }, icon("back")),
        el("h3", {}, title), extra || null);
    }
    function sliderRow(label, { min, max, step = 1, value, fmt = (v) => String(v), onInput, onChange }) {
      const num = el("span", { class: "sb-num" }, fmt(value));
      const input = el("input", { type: "range", min: String(min), max: String(max), step: String(step), value: String(value), "aria-label": label });
      input.addEventListener("input", () => { const v = Number(input.value); num.textContent = fmt(v); onInput(v); });
      if (onChange) input.addEventListener("change", () => onChange(Number(input.value)));
      return el("label", { class: "sb-row" }, el("span", { class: "sb-label" }, label), input, num);
    }
    function switchRow(label, checked, onChange, hint) {
      const input = el("input", { type: "checkbox", checked: !!checked, "aria-label": label });
      input.addEventListener("change", () => onChange(input.checked));
      return el("label", { class: "sb-row", title: hint || "" }, el("span", { class: "sb-label", style: "flex:1" }, label), el("span", { class: "sb-switch" }, input, el("span", {})));
    }
    function segRow(label, options, value, onPick) {
      return el("div", { class: "sb-row" }, el("span", { class: "sb-label" }, label),
        el("div", { class: "sb-seg", role: "group", "aria-label": label }, options.map(([v, l]) => el("button", { type: "button", "aria-pressed": String(v === value), onclick: () => onPick(v) }, l))));
    }
    const link = (label, value, onClick, cls) => el("button", { type: "button", class: "sb-link" + (cls ? " " + cls : ""), onclick: onClick }, el("span", {}, label), value != null ? el("span", { class: "sb-val" }, value) : null, icon("next", 18));
    const brushChanged = () => savePrefsSoon();

    function refreshPanel() {
      nameBtn.textContent = doc.name;
      updateUndoButtons();
      for (const [id, b] of Object.entries(toolBtns)) b.setAttribute("aria-pressed", String(id === tool));
      const P = { main: mainPage, brush: brushPage, colour: colourPage, layers: layersPage, more: morePage, assets: assetsPage }[page] || mainPage;
      put(panel, P());
    }

    function mainPage() {
      const b = curBrush();
      const L = active();
      const out = [];
      if (tool === "brush" || tool === "eraser") {
        out.push(
          sliderRow("Size", { min: 1, max: 300, value: Math.round(b.size), fmt: (v) => `${v}`, onInput: (v) => { b.size = v; brushChanged(); } }),
          sliderRow("Opacity", { min: 2, max: 100, value: Math.round(b.opacity * 100), fmt: (v) => `${v}%`, onInput: (v) => { b.opacity = v / 100; brushChanged(); } }),
          link(tool === "eraser" ? "Eraser shape" : "Brush", tool === "eraser" ? "Shape, softness, spacing" : b.name || "Custom", () => openPage("brush")),
        );
        if (tool === "eraser" && L.kind === "vector") out.unshift(el("div", { class: "sb-hint", style: "margin-top:8px" }, "On a vector layer the eraser removes whole strokes."));
      } else if (tool === "fill") {
        out.push(
          el("div", { class: "sb-hint", style: "margin-top:8px" }, "Tap an area to fill it with your colour."),
          segRow("Look at", [["all", "All layers"], ["layer", "This layer"]], prefs.fill_ref, (v) => { prefs.fill_ref = v; savePrefsSoon(); refreshPanel(); }),
          sliderRow("Opacity", { min: 2, max: 100, value: Math.round(prefs.brush.opacity * 100), fmt: (v) => `${v}%`, onInput: (v) => { prefs.brush.opacity = v / 100; brushChanged(); } }),
        );
      } else if (tool === "lasso") {
        out.push(el("div", { class: "sb-hint", style: "margin-top:8px" }, L.kind === "vector" ? "Draw a loop around strokes to select them, then move, copy or delete them." : "Draw a loop around part of the layer, then move, copy or delete it."));
      } else if (tool === "picker") {
        out.push(el("div", { class: "sb-hint", style: "margin-top:8px" }, "Tap the drawing to pick up a colour."));
      }
      out.push(
        link("Colour", el("span", { class: "sb-dot", style: `display:inline-block;width:18px;height:18px;background:${prefs.color}` }), () => openPage("colour")),
        link("Layers", `${L.name} · ${L.kind === "vector" ? "Vector" : "Raster"}`, () => openPage("layers")),
      );
      return out;
    }

    // ── brush page ──
    function brushPage() {
      const b = curBrush();
      const isEraser = tool === "eraser";
      const preview = el("canvas", { class: "sb-preview", "aria-label": "Brush preview" });
      const drawPreview = () => {
        const w = preview.clientWidth || 300, h = 84, d = Math.min(window.devicePixelRatio || 1, 2);
        preview.width = w * d; preview.height = h * d;
        const ctx = preview.getContext("2d");
        ctx.scale(d, d);
        const pb = { ...b, size: Math.min(b.size, 60), shape: b.shape };
        const buf = document.createElement("canvas"); buf.width = w; buf.height = h;
        const bctx = buf.getContext("2d");
        const painter = makePainter(bctx, pb, isEraser ? "#334155" : prefs.color, 7, false);
        for (let i = 0; i <= 60; i++) { const t = i / 60; painter.add(20 + t * (w - 40), h / 2 + Math.sin(t * Math.PI * 2) * (h / 2 - Math.min(30, pb.size / 2 + 6)), 1); }
        ctx.globalAlpha = b.opacity; ctx.drawImage(buf, 0, 0, w, h);
      };
      requestAnimationFrame(drawPreview);
      const touch = () => { brushChanged(); drawPreview(); drawPad(); };

      // Brush picker
      const tiles = el("div", { class: "sb-brushes" });
      const refreshBrushTiles = () => {
        if (isEraser) return;
        const all = PRESETS.map((p) => ({ brush: p, own: false })).concat(myBrushes.map((m) => ({ brush: m.brush, own: true, row: m.row })));
        tiles.replaceChildren(...all.map(({ brush }) => {
          const c = el("canvas", {});
          requestAnimationFrame(() => {
            const w = c.clientWidth || 90, h = 34; c.width = w; c.height = h;
            const k = c.getContext("2d");
            const buf = document.createElement("canvas"); buf.width = w; buf.height = h;
            const pb = normaliseBrush({ ...brush, size: Math.min(brush.size, 22) });
            const painter = makePainter(buf.getContext("2d"), pb, prefs.color, 3, false);
            for (let i = 0; i <= 20; i++) { const t = i / 20; painter.add(10 + t * (w - 20), h / 2 + Math.sin(t * Math.PI * 2) * 6, 1); }
            k.globalAlpha = pb.opacity; k.drawImage(buf, 0, 0);
          });
          return el("button", { type: "button", class: "sb-brush", "aria-pressed": String(prefs.brush_id === brush.id), onclick: () => {
            prefs.brush = normaliseBrush(clone(brush)); prefs.brush_id = brush.id; savePrefsSoon(); refreshPanel();
          } }, c, brush.name);
        }));
      };
      refreshBrushTiles();

      // Shape pad: drag the points, or draw a shape freehand.
      const pad = el("canvas", { class: "sb-shapepad", "aria-label": "Brush shape. Drag the points to change it." });
      let freeDraw = false, freePts = null, dragIdx = -1;
      const PAD = 220;
      function padXY(e) { const r = pad.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * PAD, ((e.clientY - r.top) / r.height) * PAD]; }
      const toUnit = ([x, y]) => [clamp((x - PAD / 2) / (PAD * 0.42), -1, 1), clamp((y - PAD / 2) / (PAD * 0.42), -1, 1)];
      const toPad = ([x, y]) => [PAD / 2 + x * PAD * 0.42, PAD / 2 + y * PAD * 0.42];
      function drawPad() {
        const d = Math.min(window.devicePixelRatio || 1, 2);
        pad.width = PAD * d; pad.height = PAD * d;
        const k = pad.getContext("2d");
        k.scale(d, d);
        k.clearRect(0, 0, PAD, PAD);
        k.strokeStyle = "rgba(100,116,139,.25)"; k.lineWidth = 1;
        k.beginPath(); k.moveTo(PAD / 2, 8); k.lineTo(PAD / 2, PAD - 8); k.moveTo(8, PAD / 2); k.lineTo(PAD - 8, PAD / 2); k.stroke();
        if (freeDraw) {
          k.fillStyle = "#64748b"; k.font = "13px sans-serif"; k.textAlign = "center";
          if (!freePts) k.fillText("Draw a shape here", PAD / 2, PAD / 2 - 12), k.fillText("in one go", PAD / 2, PAD / 2 + 8);
          if (freePts && freePts.length > 1) {
            k.strokeStyle = "#0f172a"; k.lineWidth = 2; k.beginPath();
            freePts.forEach(([x, y], i) => (i ? k.lineTo(x, y) : k.moveTo(x, y))); k.stroke();
          }
          return;
        }
        // The tip as it stamps (unrotated), then its points.
        const polys = tipPolygons(b.shape);
        k.save(); k.translate(PAD / 2, PAD / 2); k.rotate((b.shape.angle || 0) * Math.PI / 180);
        k.fillStyle = "rgba(59,130,246,.22)"; k.strokeStyle = "rgba(37,99,235,.9)"; k.lineWidth = 1.5;
        tracePolys(k, polys, 0, 0, PAD * 0.42); k.fill(); k.stroke();
        k.restore();
        if (b.shape.n >= 2) {
          b.shape.pts.slice(0, b.shape.n).forEach((pt, i) => {
            const [x, y] = toPad(rotatePt(fromRaw(pt), b.shape.angle));
            k.beginPath(); k.arc(x, y, 7, 0, Math.PI * 2);
            k.fillStyle = i === dragIdx ? "#2563eb" : "#fff"; k.fill();
            k.strokeStyle = "#2563eb"; k.lineWidth = 2; k.stroke();
          });
        }
      }
      // Handles are shown rotated with the tip so what you drag is what you see.
      // Points are stored before the tip is centred and scaled; these map
      // between that and what the pad shows.
      const normOf = () => tipPolygons(b.shape).norm || { cx: 0, cy: 0, half: 1 };
      const fromRaw = ([x, y]) => { const n = normOf(); return [(x - n.cx) / n.half, (y - n.cy) / n.half]; };
      const toRaw = ([x, y]) => { const n = normOf(); return [x * n.half + n.cx, y * n.half + n.cy]; };
      const rotatePt = ([x, y], deg) => { const a = (deg || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
      pad.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try { pad.setPointerCapture(e.pointerId); } catch { /* fine */ }
        const p = padXY(e);
        if (freeDraw) { freePts = [p]; drawPad(); return; }
        if (b.shape.n < 2) return;
        let best = -1, bd = 22;
        b.shape.pts.slice(0, b.shape.n).forEach((pt, i) => { const q = toPad(rotatePt(fromRaw(pt), b.shape.angle)); const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = i; } });
        dragIdx = best; drawPad();
      });
      pad.addEventListener("pointermove", (e) => {
        const p = padXY(e);
        if (freeDraw && freePts) { freePts.push(p); drawPad(); return; }
        if (dragIdx < 0) return;
        const u = toRaw(rotatePt(toUnit(p), -(b.shape.angle || 0)));
        b.shape.pts[dragIdx] = [+clamp(u[0], -1, 1).toFixed(3), +clamp(u[1], -1, 1).toFixed(3)];
        touch();
      });
      const padUp = () => {
        if (freeDraw && freePts) {
          const made = shapeFromDrawing(freePts);
          freePts = null;
          if (made) { Object.assign(b.shape, made, { connect: true }); freeDraw = false; symphony.ui.toast(`New brush shape with ${made.n} points`); refreshPanel(); return; }
          symphony.ui.toast("Draw a bigger closed shape and try again");
          drawPad();
          return;
        }
        dragIdx = -1; drawPad();
      };
      pad.addEventListener("pointerup", padUp);
      pad.addEventListener("pointercancel", () => { freePts = null; dragIdx = -1; drawPad(); });
      requestAnimationFrame(drawPad);

      const s = b.shape;
      const shapeRows = [
        el("div", { class: "sb-row", style: "justify-content:center;gap:8px;border:0" },
          el("button", { type: "button", class: "os-button secondary small", onclick: () => { freeDraw = !freeDraw; freePts = null; drawPad(); } }, "Draw a shape"),
          el("button", { type: "button", class: "os-button secondary small", onclick: () => { s.pts = regularPoints(s.n); touch(); } }, "Even out points"),
        ),
        sliderRow("Points", { min: 1, max: MAX_POINTS, value: s.n, onInput: (v) => { s.n = v; s.pts = regularPoints(v); touch(); }, onChange: () => refreshPanel() }),
        sliderRow("Roundness", { min: 0, max: 100, value: Math.round(s.round * 100), fmt: (v) => `${v}%`, onInput: (v) => { s.round = v / 100; touch(); } }),
      ];
      if (s.n === 2) shapeRows.push(sliderRow("Width", { min: 5, max: 100, value: Math.round((s.width ?? 0.5) * 100), fmt: (v) => `${v}%`, onInput: (v) => { s.width = v / 100; touch(); } }));
      if (s.n >= 2) shapeRows.push(switchRow("Connect points", s.connect, (v) => { s.connect = v; touch(); refreshPanel(); }, "Off puts a dot at each point instead, for sprays and bristles"));
      if (s.n >= 2 && !s.connect) shapeRows.push(sliderRow("Dot size", { min: 0, max: 100, value: Math.round((s.dot ?? 0.25) * 100), fmt: (v) => `${v}%`, onInput: (v) => { s.dot = v / 100; touch(); } }));
      shapeRows.push(
        sliderRow("Angle", { min: -180, max: 180, value: Math.round(s.angle || 0), fmt: (v) => `${v}°`, onInput: (v) => { s.angle = v; touch(); } }),
        switchRow("Turn with the stroke", s.follow, (v) => { s.follow = v; touch(); }),
      );

      const strokeRows = [
        sliderRow("Size", { min: 1, max: 300, value: Math.round(b.size), onInput: (v) => { b.size = v; touch(); } }),
        sliderRow("Opacity", { min: 2, max: 100, value: Math.round(b.opacity * 100), fmt: (v) => `${v}%`, onInput: (v) => { b.opacity = v / 100; touch(); } }),
        sliderRow("Hardness", { min: 0, max: 100, value: Math.round(b.hardness * 100), fmt: (v) => `${v}%`, onInput: (v) => { b.hardness = v / 100; touch(); } }),
        sliderRow("Spacing", { min: 1, max: 200, value: Math.round(b.spacing * 100), fmt: (v) => `${v}%`, onInput: (v) => { b.spacing = v / 100; touch(); } }),
        el("div", { class: "sb-hint" }, "Spacing is how far apart each print of the brush lands along a stroke. Low is a smooth line; high leaves dots."),
        sliderRow("Scatter", { min: 0, max: 200, value: Math.round(b.scatter * 100), fmt: (v) => `${v}%`, onInput: (v) => { b.scatter = v / 100; touch(); } }),
        switchRow("Pen pressure changes size", b.pressure, (v) => { b.pressure = v; touch(); }),
      ];

      // Saving brushes (not for the eraser, which keeps its own settings).
      const own = !isEraser && myBrushes.find((m) => m.brush.id === prefs.brush_id);
      const nameInput = el("input", { class: "os-input", placeholder: "Brush name", value: own ? own.brush.name : "", maxLength: 40, "aria-label": "Brush name" });
      const saveRows = isEraser ? [] : [
        el("div", { class: "sb-section" }, "Keep this brush"),
        el("div", { class: "os-row", style: "margin-top:6px" }, el("div", { style: "flex:1;min-width:140px" }, nameInput),
          el("button", { type: "button", class: "os-button small", onclick: async () => {
            const name = nameInput.value.trim() || "My brush";
            try {
              const row = await symphony.data.create("brush", { name, brush: { ...b, id: undefined, name } });
              await loadBrushes();
              prefs.brush = normaliseBrush({ ...b, id: row.id, name }); prefs.brush_id = row.id; savePrefsSoon();
              symphony.ui.toast("Brush saved"); refreshPanel();
            } catch { symphony.ui.toast("Couldn't save the brush"); }
          } }, "Save as new"),
          own ? el("button", { type: "button", class: "os-button secondary small", onclick: async () => {
            const name = nameInput.value.trim() || own.brush.name;
            try { await symphony.data.update("brush", own.row.id, { name, brush: { ...b, name } }); b.name = name; await loadBrushes(); symphony.ui.toast("Brush updated"); refreshPanel(); } catch { symphony.ui.toast("Couldn't update the brush"); }
          } }, "Update") : null,
        ),
        own ? link("Delete this brush", null, async () => {
          const ok = await symphony.ui.confirm(`Delete “${own.brush.name}”?`, "Drawings made with it stay as they are.", { confirmLabel: "Delete", destructive: true });
          if (!ok) return;
          try { await symphony.data.remove("brush", own.row.id); await loadBrushes(); prefs.brush_id = null; savePrefsSoon(); refreshPanel(); } catch { symphony.ui.toast("Couldn't delete the brush"); }
        }, "danger") : null,
      ];

      return [
        head(isEraser ? "Eraser" : "Brush"),
        preview,
        isEraser ? null : tiles,
        el("div", { class: "sb-section" }, "Shape"),
        el("div", { class: "sb-hint" }, freeDraw ? "Draw a closed shape in the box. It becomes the brush tip." : "Drag the points to reshape the tip. One point is round or square; two make an ellipse or bar; more make corners."),
        pad, ...shapeRows,
        el("div", { class: "sb-section" }, "Stroke"),
        ...strokeRows,
        ...saveRows,
        el("div", { class: "sb-row", style: "border:0;justify-content:flex-end" },
          el("button", { type: "button", class: "os-button secondary small", onclick: () => {
            const base = isEraser ? ERASER_DEFAULT : (PRESETS.find((p) => p.id === prefs.brush_id) || (own ? own.brush : PRESETS[0]));
            if (isEraser) prefs.eraser = normaliseBrush(clone(base)); else prefs.brush = normaliseBrush(clone(base));
            savePrefsSoon(); refreshPanel();
          } }, "Reset")),
      ];
    }

    // ── colour page ──
    const PALETTE = ["#2b2b3a", "#000000", "#ffffff", "#7f8c8d", "#c0392b", "#e74c3c", "#e67e22", "#f1c40f", "#f6e7b4", "#27ae60", "#16a085", "#2ecc71",
      "#2980b9", "#3498db", "#8e44ad", "#9b59b6", "#e84393", "#fd79a8", "#6d4c41", "#d7a86e", "#a3c4f3", "#b8e0d2", "#ffd6e0", "#cdb4db"];
    function colourPage() {
      const sw = (c) => el("button", { type: "button", class: "sb-sw", style: `background:${c}`, "aria-label": c, "aria-pressed": String(c === prefs.color), onclick: () => setColour(c) });
      const hex = el("input", { class: "os-input", value: prefs.color, maxLength: 7, "aria-label": "Colour code", style: "max-width:120px" });
      hex.addEventListener("change", () => { const v = hex.value.trim(); if (/^#?[0-9a-f]{6}$/i.test(v)) setColour(v.startsWith("#") ? v : "#" + v); else hex.value = prefs.color; });
      const pick = el("input", { type: "color", value: prefs.color, "aria-label": "Choose any colour", style: "width:52px;height:40px;border:0;padding:0;background:transparent;cursor:pointer" });
      pick.addEventListener("input", () => setColour(pick.value));
      return [
        head("Colour"),
        prefs.recent.length ? el("div", { class: "sb-section" }, "Recent") : null,
        prefs.recent.length ? el("div", { class: "sb-swatches" }, prefs.recent.map(sw)) : null,
        el("div", { class: "sb-section" }, "Palette"),
        el("div", { class: "sb-swatches" }, PALETTE.map(sw)),
        el("div", { class: "sb-section" }, "Any colour"),
        el("div", { class: "os-row", style: "margin-top:6px" }, pick, hex),
      ];
    }

    // ── layers page ──
    function layersPage() {
      const rows = doc.layers.slice().reverse().map((L) => {
        const isActive = L.id === doc.activeId;
        const thumb = el("canvas", { class: "sb-thumb", width: 88, height: 88 });
        const tk = thumb.getContext("2d"); const s = 88 / Math.max(doc.w, doc.h);
        tk.drawImage(L.canvas, (88 - doc.w * s) / 2, (88 - doc.h * s) / 2, doc.w * s, doc.h * s);
        const row = el("div", { class: "sb-layer" + (isActive ? " active" : "") },
          el("button", { type: "button", class: "sb-iconbtn plain", "aria-label": L.visible ? `Hide ${L.name}` : `Show ${L.name}`, onclick: () => layerChange(() => { L.visible = !L.visible; }) }, icon(L.visible ? "eye" : "eyeOff", 18)),
          thumb,
          el("button", { type: "button", class: "sb-lname", onclick: () => { settleSelection(); doc.activeId = L.id; docDirty = true; scheduleSave(); refreshPanel(); } },
            L.name, el("small", {}, `${L.kind === "vector" ? "Vector" : "Raster"}${L.opacity < 1 ? ` · ${Math.round(L.opacity * 100)}%` : ""}${L.failed ? " · didn't load (locked)" : ""}`)),
        );
        if (!isActive) return row;
        const idx = doc.layers.indexOf(L);
        const name = el("input", { class: "os-input", value: L.name, maxLength: 40, "aria-label": "Layer name" });
        name.addEventListener("change", () => { const v = name.value.trim() || L.name; if (v !== L.name) layerChange(() => { L.name = v; }); });
        let opBefore = null;
        const op = sliderRow("Opacity", { min: 0, max: 100, value: Math.round(L.opacity * 100), fmt: (v) => `${v}%`, onInput: (v) => { if (!opBefore) opBefore = snapLayers(); L.opacity = v / 100; requestRender(); } });
        op.querySelector("input").addEventListener("change", () => { if (opBefore) { pushHistory({ kind: "layers", before: opBefore, after: snapLayers() }); opBefore = null; } });
        return el("div", {}, row, el("div", { style: "padding:4px 2px 8px 6px" },
          el("label", { class: "os-label" }, "Name"), name, op,
          el("div", { class: "os-row", style: "margin-top:6px" },
            el("button", { type: "button", class: "os-button secondary small", disabled: idx === doc.layers.length - 1, onclick: () => layerChange(() => { doc.layers.splice(idx, 1); doc.layers.splice(idx + 1, 0, L); }) }, "Move up"),
            el("button", { type: "button", class: "os-button secondary small", disabled: idx === 0, onclick: () => layerChange(() => { doc.layers.splice(idx, 1); doc.layers.splice(idx - 1, 0, L); }) }, "Move down"),
            el("button", { type: "button", class: "os-button secondary small", disabled: L.failed || doc.layers.length >= 12, onclick: () => layerChange(() => {
              const D = makeLayer(L.kind, `${L.name} copy`.slice(0, 40), { opacity: L.opacity });
              if (L.kind === "raster") D.ctx.drawImage(L.canvas, 0, 0); else { D.strokes = L.strokes.slice(); renderVector(D); }
              doc.layers.splice(idx + 1, 0, D); doc.activeId = D.id;
            }) }, "Duplicate"),
            el("button", { type: "button", class: "os-button secondary small", disabled: L.failed, onclick: async () => {
              const ok = await symphony.ui.confirm(`Clear “${L.name}”?`, "Everything on this layer is wiped. Undo brings it back.", { confirmLabel: "Clear", destructive: true });
              if (!ok) return;
              if (L.kind === "raster") { const r = { x: 0, y: 0, w: doc.w, h: doc.h }; const before = L.ctx.getImageData(0, 0, doc.w, doc.h); L.ctx.clearRect(0, 0, doc.w, doc.h); pushHistory({ kind: "raster", layer: L, r, before, after: L.ctx.getImageData(0, 0, doc.w, doc.h) }); }
              else { const before = L.strokes.slice(); L.strokes = []; renderVector(L); pushHistory({ kind: "strokes", layer: L, before, after: [] }); }
              requestRender(); refreshPanel();
            } }, "Clear"),
            el("button", { type: "button", class: "os-button secondary small", disabled: doc.layers.length <= 1, onclick: async () => {
              const ok = await symphony.ui.confirm(`Delete “${L.name}”?`, "Undo brings it back while this drawing is open.", { confirmLabel: "Delete layer", destructive: true });
              if (!ok) return;
              layerChange(() => { doc.layers.splice(idx, 1); doc.activeId = doc.layers[Math.max(0, idx - 1)].id; });
            } }, "Delete"),
          )));
      });
      const add = (kind) => el("button", { type: "button", class: "os-button secondary small", disabled: doc.layers.length >= 12, onclick: () => layerChange(() => {
        const n = doc.layers.length + 1;
        const L = makeLayer(kind, `${kind === "vector" ? "Vector" : "Layer"} ${n}`);
        const i = doc.layers.indexOf(active());
        doc.layers.splice(i + 1, 0, L); doc.activeId = L.id;
      }) }, icon("plus", 16), kind === "vector" ? "Vector layer" : "Raster layer");
      return [
        head("Layers"),
        el("div", { class: "sb-hint" }, "Raster layers are pixels: paint, fill and erase freely. Vector layers keep every stroke separate, so you can lasso, move or remove strokes later."),
        el("div", { class: "os-row", style: "margin:6px 0" }, add("raster"), add("vector")),
        ...rows,
        doc.layers.length >= 12 ? el("div", { class: "sb-hint" }, "That's the most layers a drawing can have.") : null,
      ];
    }

    // ── "more" page: save, export, rename, paper, delete ──
    function morePage() {
      const name = el("input", { class: "os-input", value: doc.name, maxLength: 60, "aria-label": "Drawing name" });
      name.addEventListener("change", () => { const v = name.value.trim(); if (v && v !== doc.name) { doc.name = v; docDirty = true; scheduleSave(); nameBtn.textContent = v; } });
      const paperRow = el("div", { class: "sb-choices" }, PAPER_COLOURS.map((c) => el("button", { type: "button", class: "sb-choice", "aria-pressed": String(c.id === doc.paper), onclick: () => {
        if (c.id === doc.paper) return;
        const before = doc.paper; doc.paper = c.id;
        pushHistory({ kind: "paper", before, after: c.id });
        requestRender(); refreshPanel();
      } }, el("span", { class: "sb-dot", style: `display:inline-block;vertical-align:-1px;margin-right:6px;background:${c.id || "repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/6px 6px"}` }), c.label)));
      return [
        head("Drawing"),
        el("label", { class: "os-label" }, "Name"), name,
        el("div", { class: "sb-section" }, "Paper colour"), paperRow,
        el("div", { class: "sb-section" }, "Save"),
        can("pictures:save")
          ? link("Save to Assets", doc.made_by && alterById(doc.made_by) ? `${T("alter", "alter")}: ${alterLabel(alterById(doc.made_by))}` : null, () => openPage("assets"))
          : el("div", { class: "sb-hint" }, "Saving to Assets is turned off for this mod. You can turn it on from the Mods page."),
        can("files:save")
          ? link("Export as PNG", `${doc.w} × ${doc.h}`, () => exportPng())
          : el("div", { class: "sb-hint" }, "Saving files is turned off for this mod. You can turn it on from the Mods page."),
        el("div", { style: "height:14px" }),
        link("Delete this drawing", null, async () => {
          const ok = await symphony.ui.confirm(`Delete “${doc.name}”?`, "It moves to Recently deleted, where you can restore it.", { confirmLabel: "Delete", destructive: true });
          if (!ok) return;
          settleSelection();
          await saveNow();
          if (doc.id) { try { await symphony.data.update("drawing", doc.id, { deleted_at: new Date().toISOString() }); } catch { symphony.ui.toast("Couldn't delete it. Try again."); return; } }
          document.removeEventListener("visibilitychange", onHide);
          window.removeEventListener("pagehide", saveNow);
          showGallery();
        }, "danger"),
      ];
    }

    async function flatBlob() {
      settleSelection();
      const c = document.createElement("canvas"); c.width = doc.w; c.height = doc.h;
      const k = c.getContext("2d");
      if (doc.paper) { k.fillStyle = doc.paper; k.fillRect(0, 0, doc.w, doc.h); }
      for (const L of doc.layers) if (L.visible) { k.globalAlpha = L.opacity; k.drawImage(L.canvas, 0, 0); }
      return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
    }
    const fileName = () => (doc.name.replace(/[\\/:*?"<>|]/g, " ").trim() || "drawing") + ".png";
    async function exportPng() {
      try {
        const blob = await flatBlob();
        if (!blob) throw new Error("empty");
        const r = await symphony.ui.saveFile(fileName(), blob, "image/png");
        if (r === "downloaded" || r === "shared") symphony.ui.toast("Exported");
      } catch { symphony.ui.toast("Couldn't export the drawing"); }
    }

    // ── save to Assets: name + who made it ──
    function assetsPage() {
      let pick = doc.made_by && alterById(doc.made_by) ? doc.made_by : null;
      if (pick == null && !doc.made_by && fronting.length) pick = fronting.find((id) => alterById(id)) || null;
      const name = el("input", { class: "os-input", value: doc.name, maxLength: 80, "aria-label": "Picture name" });
      const search = el("input", { class: "os-input", placeholder: `Search ${T("alters", "alters")}`, "aria-label": `Search ${T("alters", "alters")}` });
      const list = el("div", { class: "sb-people", role: "listbox", "aria-label": "Made by" });
      const drawList = () => {
        const q = search.value.trim().toLowerCase();
        const people = alters.filter((a) => !q || `${a.name} ${a.alias}`.toLowerCase().includes(q))
          .sort((a, b) => (fronting.includes(b.id) - fronting.includes(a.id)) || alterLabel(a).localeCompare(alterLabel(b)));
        list.replaceChildren(
          el("button", { type: "button", class: "sb-person", role: "option", "aria-pressed": String(pick == null), onclick: () => { pick = null; drawList(); } }, el("span", { class: "sb-dot", style: "background:transparent" }), "No one in particular"),
          ...people.map((a) => el("button", { type: "button", class: "sb-person", role: "option", "aria-pressed": String(pick === a.id), onclick: () => { pick = a.id; drawList(); } },
            el("span", { class: "sb-dot", style: `background:${/^#[0-9a-f]{3,8}$/i.test(a.color || "") ? a.color : "#94a3b8"}` }),
            alterLabel(a), fronting.includes(a.id) ? el("small", { class: "os-muted", style: "margin-left:auto" }, T("fronting", "fronting")) : null)),
        );
      };
      search.addEventListener("input", drawList);
      drawList();
      const saveBtn = el("button", { type: "button", class: "os-button", onclick: async () => {
        saveBtn.disabled = true;
        try {
          const blob = await flatBlob();
          if (!blob) throw new Error("empty");
          const result = await symphony.pictures.save({ name: name.value.trim() || doc.name, data: blob, alter_id: pick });
          if (result === "saved") {
            doc.made_by = pick; docDirty = true; scheduleSave();
            symphony.ui.toast(pick ? `Saved to Assets and ${alterLabel(alterById(pick))}'s pictures` : "Saved to Assets");
            openPage("main");
          }
        } catch (e) { symphony.ui.toast(e && e.message ? e.message : "Couldn't save the picture"); }
        saveBtn.disabled = false;
      } }, "Save to Assets");
      return [
        head("Save to Assets"),
        el("div", { class: "sb-hint" }, "Saves a picture of the drawing as it looks now. The drawing itself stays here so you can keep working on it."),
        el("label", { class: "os-label" }, "Picture name"), name,
        el("label", { class: "os-label" }, "Made by"),
        can("alters:read")
          ? [search, list, el("div", { class: "sb-hint" }, `Picking someone puts the picture in their profile's Pictures too.`)]
          : el("div", { class: "sb-hint" }, `To credit ${T("alters", "alters")}, let this mod see your ${T("alters", "alters")} on the Mods page.`),
        el("div", { style: "margin-top:10px" }, saveBtn),
      ];
    }

    // ── go ──
    setTool(tool);
    refreshPanel();
    setStatus();
    updateUndoButtons();
    if (typeof ResizeObserver === "function") new ResizeObserver(() => layoutStage()).observe(stage);
    layoutStage();
    if (!record) saveNow();
  }

  // Data changed elsewhere (another device, Recent changes): refresh the list
  // if it's showing; never reload a drawing out from under the person.
  let galleryTimer = null;
  symphony.onDataChange(() => { if (!leaveEditor && app.querySelector(".sb-gallery, .os-card")) { clearTimeout(galleryTimer); galleryTimer = setTimeout(() => { if (!leaveEditor) showGallery(); }, 1500); } });

  await showGallery();
});
