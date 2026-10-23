// Quick Support → Scratch pad: draw a line, let go, and a handful of
// simple rules decide what the particles in it do.
//
// Every rule is one plain property, and a "ruleset" (preset) is just a
// set of values for them:
//   carry   – how much of the stroke's speed a particle keeps when let go
//   drag    – how quickly it slows down (per second)
//   life    – seconds before it fades away (0 = it stays)
//   pull    – what it does to near neighbours: + attracts, − repels
//   reach   – how near "near" is
//   center  – a spring towards the middle (+) or a push outwards (−)
//   gravity – a steady pull down
//   spin    – every particle is a small whirlpool that turns the others
//             (point vortices; a drawn line of them rolls up into spirals)
//   tether  – a spring back to the spot where it was drawn
//   link    – a spring to the particles drawn either side of it
//   jitter  – a little random wander
//   edges   – "bounce" | "wrap" | "fade" (leave and vanish)
//
// The field is measured in units where the shorter side of the pad is
// 1000, so the same rules look the same on any screen. Plain typed
// arrays and a spatial grid for neighbours; no WebGL, so it runs the same
// on older Android web views.

export const EDGES = ["bounce", "wrap", "fade"];

export const RULES = {
  carry: { min: 0, max: 1.5, step: 0.05 },
  drag: { min: 0, max: 3, step: 0.05 },
  life: { min: 0, max: 60, step: 1 },
  pull: { min: -1, max: 1, step: 0.05 },
  reach: { min: 20, max: 200, step: 5 },
  center: { min: -1, max: 1, step: 0.05 },
  gravity: { min: 0, max: 1, step: 0.05 },
  spin: { min: 0, max: 1, step: 0.05 },
  tether: { min: 0, max: 1, step: 0.05 },
  link: { min: 0, max: 1, step: 0.05 },
  jitter: { min: 0, max: 1, step: 0.05 },
};

const BASE = {
  carry: 0.8, drag: 0.4, life: 20, pull: 0, reach: 80, center: 0,
  gravity: 0, spin: 0, tether: 0, link: 0, jitter: 0, edges: "bounce",
};

export const PRESETS = [
  { id: "drift", name: "Drift", help: "Keeps the speed you drew it with, slows gently and fades.",
    rules: { ...BASE, carry: 0.9, drag: 0.35, life: 16 } },
  { id: "whirl", name: "Whirlpool", help: "Each particle turns its neighbours, so the line curls up into spirals.",
    rules: { ...BASE, carry: 0.15, drag: 0.2, life: 40, spin: 0.55 } },
  { id: "droplets", name: "Droplets", help: "Near neighbours pull together and gather into beads.",
    rules: { ...BASE, carry: 0.4, drag: 1.4, life: 0, pull: 0.6, reach: 70 } },
  { id: "spread", name: "Spread", help: "Neighbours push apart until they sit evenly spaced.",
    rules: { ...BASE, carry: 0.5, drag: 1.6, life: 0, pull: -0.7, reach: 110 } },
  { id: "orbit", name: "Orbit", help: "A spring to the middle: what you throw swings round in loops.",
    rules: { ...BASE, carry: 1, drag: 0.03, life: 45, center: 0.35 } },
  { id: "spring", name: "String", help: "Tied to where you drew it and to each other, so the line wobbles in waves and settles.",
    rules: { ...BASE, carry: 0.8, drag: 0.5, life: 0, tether: 0.3, link: 0.6 } },
  { id: "fall", name: "Fall", help: "Gravity and bouncy edges, like sand poured from the line.",
    rules: { ...BASE, carry: 0.6, drag: 0.15, life: 30, gravity: 0.5, jitter: 0.15 } },
];
export const DEFAULT_PRESET = "whirl";
export const presetById = (id) => PRESETS.find((p) => p.id === id) || PRESETS.find((p) => p.id === DEFAULT_PRESET);

export function clampRules(r) {
  const out = { ...BASE };
  const src = r && typeof r === "object" ? r : {};
  for (const [k, lim] of Object.entries(RULES)) {
    const v = Number(src[k]);
    if (Number.isFinite(v)) out[k] = Math.min(lim.max, Math.max(lim.min, v));
  }
  out.edges = EDGES.includes(src.edges) ? src.edges : BASE.edges;
  return out;
}

const SPACING = 7;          // units between particles along a stroke
const MAX_STROKE_SPEED = 900;

export function createPad({ capacity = 800, seed = 1 } = {}) {
  const f = () => new Float32Array(capacity);
  let s = seed >>> 0 || 1;
  return {
    cap: capacity,
    w: 1000, h: 1000,
    x: f(), y: f(), vx: f(), vy: f(), hx: f(), hy: f(),
    sv: f(), svy: f(), // stroke velocity, held until release
    ax: f(), ay: f(), swx: f(), swy: f(),
    age: f(), gam: f(), rest: f(),
    alive: new Uint8Array(capacity), pinned: new Uint8Array(capacity),
    prev: new Int32Array(capacity).fill(-1), next: new Int32Array(capacity).fill(-1),
    born: new Float64Array(capacity),
    count: 0, serial: 0,
    // grid for neighbours
    cell: 80, gw: 0, gh: 0, head: new Int32Array(0), link: new Int32Array(capacity),
    stroke: null,
    rand: () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; },
  };
}

// The pad's size in units (shorter side 1000). Particles outside a
// shrunk pad are brought back in.
export function resizePad(pad, w, h) {
  pad.w = w; pad.h = h;
  for (let i = 0; i < pad.cap; i++) {
    if (!pad.alive[i]) continue;
    pad.x[i] = Math.min(w, Math.max(0, pad.x[i]));
    pad.y[i] = Math.min(h, Math.max(0, pad.y[i]));
  }
}

export function clearPad(pad) {
  pad.alive.fill(0); pad.pinned.fill(0); pad.prev.fill(-1); pad.next.fill(-1);
  pad.count = 0; pad.stroke = null;
}

// Free a slot: an empty one, else the oldest particle.
function slot(pad) {
  let oldest = -1, oldestBorn = Infinity;
  for (let i = 0; i < pad.cap; i++) {
    if (!pad.alive[i]) return i;
    if (!pad.pinned[i] && pad.born[i] < oldestBorn) { oldestBorn = pad.born[i]; oldest = i; }
  }
  if (oldest < 0) return -1;
  kill(pad, oldest);
  return oldest;
}

function kill(pad, i) {
  if (!pad.alive[i]) return;
  pad.alive[i] = 0; pad.pinned[i] = 0; pad.count--;
  const p = pad.prev[i], n = pad.next[i];
  if (p >= 0) pad.next[p] = -1;
  if (n >= 0) pad.prev[n] = -1;
  pad.prev[i] = -1; pad.next[i] = -1;
}

function spawn(pad, x, y, vx, vy) {
  const i = slot(pad);
  if (i < 0) return -1;
  pad.alive[i] = 1; pad.pinned[i] = 1; pad.count++;
  pad.x[i] = x; pad.y[i] = y; pad.hx[i] = x; pad.hy[i] = y;
  pad.vx[i] = 0; pad.vy[i] = 0; pad.sv[i] = vx; pad.svy[i] = vy;
  pad.age[i] = 0; pad.gam[i] = 0; pad.rest[i] = SPACING;
  pad.born[i] = pad.serial++;
  pad.prev[i] = -1; pad.next[i] = -1;
  return i;
}

// ── Drawing ────────────────────────────────────────────────────────────
export function beginStroke(pad, x, y, t) {
  pad.stroke = { lx: x, ly: y, lt: t, vx: 0, vy: 0, last: -1, ids: [], dx: 0, carry: 0 };
  const i = spawn(pad, x, y, 0, 0);
  if (i >= 0) { pad.stroke.last = i; pad.stroke.ids.push(i); }
}

export function extendStroke(pad, x, y, t) {
  const s = pad.stroke;
  if (!s) return;
  const dt = Math.max(0.004, (t - s.lt) / 1000);
  let vx = (x - s.lx) / dt, vy = (y - s.ly) / dt;
  const sp = Math.hypot(vx, vy);
  if (sp > MAX_STROKE_SPEED) { vx *= MAX_STROKE_SPEED / sp; vy *= MAX_STROKE_SPEED / sp; }
  s.vx += (vx - s.vx) * 0.5; s.vy += (vy - s.vy) * 0.5;
  s.dx += x - s.lx;
  const segLen = Math.hypot(x - s.lx, y - s.ly);
  let d = s.carry;
  while (d + SPACING <= segLen) {
    d += SPACING;
    const k = d / segLen;
    const i = spawn(pad, s.lx + (x - s.lx) * k, s.ly + (y - s.ly) * k, s.vx, s.vy);
    if (i < 0) break;
    if (s.last >= 0 && pad.alive[s.last]) { pad.next[s.last] = i; pad.prev[i] = s.last; }
    s.last = i; s.ids.push(i);
  }
  s.carry = d - segLen; // distance already walked past the last particle (≤ 0)
  s.lx = x; s.ly = y; s.lt = t;
}

// Let go: the line starts following the rules. Its spin direction comes
// from which way it was drawn, so a line drawn the other way turns the
// other way.
export function endStroke(pad, rules) {
  const s = pad.stroke;
  if (!s) return;
  const sign = s.dx >= 0 ? 1 : -1;
  for (const i of s.ids) {
    if (!pad.alive[i]) continue;
    pad.pinned[i] = 0;
    pad.vx[i] = pad.sv[i] * rules.carry;
    pad.vy[i] = pad.svy[i] * rules.carry;
    pad.gam[i] = sign;
    if (pad.next[i] >= 0) {
      const j = pad.next[i];
      pad.rest[i] = Math.hypot(pad.x[j] - pad.x[i], pad.y[j] - pad.y[i]) || SPACING;
    }
  }
  pad.stroke = null;
}

// ── Stepping ───────────────────────────────────────────────────────────
function buildGrid(pad, cell) {
  pad.cell = cell;
  const gw = Math.max(1, Math.ceil(pad.w / cell) + 1);
  const gh = Math.max(1, Math.ceil(pad.h / cell) + 1);
  if (pad.head.length !== gw * gh) pad.head = new Int32Array(gw * gh);
  pad.gw = gw; pad.gh = gh;
  pad.head.fill(-1);
  for (let i = 0; i < pad.cap; i++) {
    if (!pad.alive[i]) continue;
    const cx = Math.min(gw - 1, Math.max(0, (pad.x[i] / cell) | 0));
    const cy = Math.min(gh - 1, Math.max(0, (pad.y[i] / cell) | 0));
    const c = cy * gw + cx;
    pad.link[i] = pad.head[c];
    pad.head[c] = i;
  }
}

// Advance dt seconds. Returns how much is still moving (0 = all still),
// so the screen can stop drawing when nothing changes.
export function stepPad(pad, rules, dt) {
  const r = rules;
  const { x, y, vx, vy, alive, pinned, cap } = pad;
  const { ax, ay } = pad;
  ax.fill(0); ay.fill(0);
  const cxm = pad.w / 2, cym = pad.h / 2;

  // Neighbour pull/push, with a short soft push always on so attracting
  // particles gather into beads instead of collapsing to a point.
  if (r.pull !== 0) {
    const reach = r.reach;
    buildGrid(pad, reach);
    const { head, link, gw, gh } = pad;
    const strength = r.pull * 900;
    const core = reach * 0.3;
    for (let i = 0; i < cap; i++) {
      if (!alive[i] || pinned[i]) continue;
      const gx = Math.min(gw - 1, Math.max(0, (x[i] / reach) | 0));
      const gy = Math.min(gh - 1, Math.max(0, (y[i] / reach) | 0));
      for (let oy = -1; oy <= 1; oy++) {
        const yy = gy + oy; if (yy < 0 || yy >= gh) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = gx + ox; if (xx < 0 || xx >= gw) continue;
          for (let j = head[yy * gw + xx]; j >= 0; j = link[j]) {
            if (j === i) continue;
            const dx = x[j] - x[i], dy = y[j] - y[i];
            const d2 = dx * dx + dy * dy;
            if (d2 >= reach * reach || d2 < 1e-6) continue;
            const d = Math.sqrt(d2);
            let fmag = strength * (1 - d / reach);
            if (d < core) fmag -= Math.abs(strength) * 1.5 * (1 - d / core);
            ax[i] += (dx / d) * fmag;
            ay[i] += (dy / d) * fmag;
          }
        }
      }
    }
  }

  // Whirlpools: each particle's velocity gains the swirl of all the
  // others (Biot–Savart with a soft core so nothing shoots off).
  let swirlX = null, swirlY = null;
  if (r.spin > 0) {
    swirlX = pad.swx; swirlY = pad.swy;
    swirlX.fill(0); swirlY.fill(0);
    const k = r.spin * 1400;
    const soft = 18 * 18;
    // Pairs once each: i turns j exactly as j turns i, mirrored.
    const ids = [];
    for (let i = 0; i < cap; i++) if (alive[i] && !pinned[i] && pad.gam[i]) ids.push(i);
    for (let a = 0; a < ids.length; a++) {
      const i = ids[a];
      const xi = x[i], yi = y[i], gi = pad.gam[i];
      let sx = 0, sy = 0;
      for (let b = a + 1; b < ids.length; b++) {
        const j = ids[b];
        const dx = xi - x[j], dy = yi - y[j];
        const inv = 1 / (dx * dx + dy * dy + soft);
        const qj = pad.gam[j] * inv, qi = gi * inv;
        sx -= dy * qj; sy += dx * qj;
        swirlX[j] += dy * qi; swirlY[j] -= dx * qi;
      }
      swirlX[i] += sx; swirlY[i] += sy;
    }
    for (const i of ids) { swirlX[i] *= k; swirlY[i] *= k; }
  }

  // Springs between neighbours along a drawn line, worked out from
  // everyone's positions before anyone moves (so the order particles are
  // visited in can't feed energy into the string).
  const lk = r.link * 300;
  if (lk) {
    for (let i = 0; i < cap; i++) {
      const j = pad.next[i];
      if (!alive[i] || j < 0 || !alive[j]) continue;
      const dx = x[j] - x[i], dy = y[j] - y[i];
      const d = Math.hypot(dx, dy) || 1;
      const e = ((d - pad.rest[i]) * lk) / d;
      ax[i] += dx * e; ay[i] += dy * e;
      ax[j] -= dx * e; ay[j] -= dy * e;
    }
  }

  const keep = Math.exp(-r.drag * dt);
  const g = r.gravity * 600;
  const ck = r.center * 4;
  const tk = r.tether * 40;
  const jit = r.jitter * 300;
  let moving = 0;
  for (let i = 0; i < cap; i++) {
    if (!alive[i]) continue;
    if (pinned[i]) { moving += 1; continue; }
    let fx = ax[i], fy = ay[i] + g;
    if (ck) { fx += (cxm - x[i]) * ck; fy += (cym - y[i]) * ck; }
    if (tk) { fx += (pad.hx[i] - x[i]) * tk; fy += (pad.hy[i] - y[i]) * tk; }
    if (jit) { fx += (pad.rand() - 0.5) * jit; fy += (pad.rand() - 0.5) * jit; }
    vx[i] = (vx[i] + fx * dt) * keep;
    vy[i] = (vy[i] + fy * dt) * keep;
    const ux = vx[i] + (swirlX ? swirlX[i] : 0);
    const uy = vy[i] + (swirlY ? swirlY[i] : 0);
    x[i] += ux * dt; y[i] += uy * dt;
    moving += Math.abs(ux) + Math.abs(uy);

    if (r.edges === "wrap") {
      if (x[i] < 0) x[i] += pad.w; else if (x[i] > pad.w) x[i] -= pad.w;
      if (y[i] < 0) y[i] += pad.h; else if (y[i] > pad.h) y[i] -= pad.h;
    } else if (r.edges === "fade") {
      if (x[i] < -20 || x[i] > pad.w + 20 || y[i] < -20 || y[i] > pad.h + 20) { kill(pad, i); continue; }
    } else {
      if (x[i] < 0) { x[i] = -x[i]; vx[i] = Math.abs(vx[i]) * 0.8; }
      else if (x[i] > pad.w) { x[i] = 2 * pad.w - x[i]; vx[i] = -Math.abs(vx[i]) * 0.8; }
      if (y[i] < 0) { y[i] = -y[i]; vy[i] = Math.abs(vy[i]) * 0.8; }
      else if (y[i] > pad.h) { y[i] = 2 * pad.h - y[i]; vy[i] = -Math.abs(vy[i]) * 0.8; }
    }

    pad.age[i] += dt;
    if (r.life > 0 && pad.age[i] > r.life) kill(pad, i);
  }
  return moving;
}

// 0..1 opacity: fades in the last quarter of its life.
export function alphaOf(pad, i, rules) {
  if (!rules.life) return 1;
  const left = rules.life - pad.age[i];
  return Math.max(0, Math.min(1, left / (rules.life * 0.25)));
}
