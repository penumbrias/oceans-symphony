// Fractal math for the Soundscape "Fractal" visual. Pure functions only
// (no DOM), so every algorithm can be rendered and checked in node.
//
// Algorithms, each with a few numbers that change the picture in a way
// you can follow (the ranges stop before the shapes dissolve into noise):
//   • Julia      z ← zⁿ + c. c walks slowly round the edge of the main
//                "bulb" of the matching Mandelbrot set, where every Julia
//                set is connected and intricate. Or hold c still.
//   • Mandelbrot z ← zⁿ + c with c = the point itself. The camera breathes
//                slowly in towards a chosen spot and back out.
//   • Newton     Newton's method for zⁿ = 1: each point is coloured by the
//                root it rolls towards. A relaxation factor swirls it.
//   • Phoenix    z ← z² + p + q·z₋₁ (the previous z): a feathered cousin
//                of the Julia set.
//   • Your own   a formula typed by the person, in z and c, compiled by a
//                small parser here (never eval — the app's CSP forbids it,
//                and a formula is data, not code).
// Photosensitivity: time only enters through slow paths (minutes per
// lap), and speed 0 holds the picture completely still.

export const FRACTAL_KINDS = ["julia", "mandelbrot", "newton", "phoenix", "custom"];
export const FRACTAL_KIND_LABELS = {
  julia: "Julia",
  mandelbrot: "Mandelbrot",
  newton: "Newton",
  phoenix: "Phoenix",
  custom: "Your own",
};

export const FRACTAL_LIMITS = {
  speed: [0, 2],
  spread: [0, 240],
  detail: [24, 96],
  zoom: [0.5, 4],
  power: [2, 6],
  reach: [0.9, 1.15],
  cr: [-2, 2],
  ci: [-2, 2],
  depth: [2, 400],
  nroots: [3, 8],
  swirl: [0, 0.9],
  p: [0.3, 0.7],
  q: [-0.7, -0.3],
};

// Places worth diving towards in the Mandelbrot set.
// Places worth diving towards in the Mandelbrot set. Most are
// Misiurewicz points: the pattern there repeats at every zoom, so the
// dive never runs into a featureless wall.
export const MANDEL_SPOTS = {
  seahorse: { label: "Seahorse spiral", x: -0.77568377, y: 0.13646737 },
  branch: { label: "Lightning branch", x: -0.10109636, y: 0.95628651 },
  starfish: { label: "Starfish", x: 0.42451272, y: 0.20753023 },
  minibrot: { label: "Little copy", x: -1.75487767, y: 0.0001 },
};

export const FORMULA_MAX = 80;

export const DEFAULT_FRACTAL = {
  kind: "julia",
  speed: 1,
  spread: 70,
  detail: 48,
  zoom: 1,
  power: 2,
  reach: 1.02,
  hold: false,
  cr: -0.75,
  ci: 0.11,
  spot: "seahorse",
  depth: 60,
  nroots: 5,
  swirl: 0.45,
  p: 0.5667,
  q: -0.5,
  formula: "z^2 + c",
  formulaMode: "julia",
};

const num = (v, [lo, hi], d, round = null) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  const c = Math.min(hi, Math.max(lo, n));
  return round ? Math.round(c / round) * round : c;
};

export function clampFractal(f) {
  const s = f && typeof f === "object" ? f : {};
  const d = DEFAULT_FRACTAL;
  const L = FRACTAL_LIMITS;
  return {
    kind: FRACTAL_KINDS.includes(s.kind) ? s.kind : d.kind,
    speed: num(s.speed, L.speed, d.speed, 0.05),
    spread: num(s.spread, L.spread, d.spread, 1),
    detail: num(s.detail, L.detail, d.detail, 1),
    zoom: num(s.zoom, L.zoom, d.zoom),
    power: num(s.power, L.power, d.power, 1),
    reach: num(s.reach, L.reach, d.reach, 0.005),
    hold: !!s.hold,
    cr: num(s.cr, L.cr, d.cr, 0.0001),
    ci: num(s.ci, L.ci, d.ci, 0.0001),
    spot: MANDEL_SPOTS[s.spot] ? s.spot : d.spot,
    depth: num(s.depth, L.depth, d.depth, 1),
    nroots: num(s.nroots, L.nroots, d.nroots, 1),
    swirl: num(s.swirl, L.swirl, d.swirl, 0.01),
    p: num(s.p, L.p, d.p, 0.0001),
    q: num(s.q, L.q, d.q, 0.0001),
    formula: typeof s.formula === "string" ? s.formula.slice(0, FORMULA_MAX) : d.formula,
    formulaMode: s.formulaMode === "mandelbrot" ? "mandelbrot" : "julia",
  };
}

const F = (patch) => clampFractal({ ...DEFAULT_FRACTAL, ...patch });
export const FRACTAL_PRESETS = [
  { id: "drifting_julia", name: "Drifting Julia", fractal: F({}) },
  { id: "triple_julia", name: "Three-fold Julia", fractal: F({ power: 3, reach: 1.01, spread: 110 }) },
  { id: "seahorse", name: "Seahorse dive", fractal: F({ kind: "mandelbrot", spot: "seahorse", depth: 300, spread: 90 }) },
  { id: "branch_dive", name: "Lightning dive", fractal: F({ kind: "mandelbrot", spot: "branch", depth: 200, spread: 60 }) },
  { id: "newton_flower", name: "Newton's flower", fractal: F({ kind: "newton", nroots: 5, swirl: 0.45, spread: 200 }) },
  { id: "newton_calm", name: "Still basins", fractal: F({ kind: "newton", nroots: 3, swirl: 0, speed: 0.3, spread: 160 }) },
  { id: "phoenix", name: "Phoenix", fractal: F({ kind: "phoenix", spread: 80 }) },
  { id: "dendrite", name: "Lightning", fractal: F({ kind: "julia", hold: true, cr: 0, ci: 1, speed: 0.4, spread: 120 }) },
  { id: "rabbit", name: "Douady rabbit", fractal: F({ kind: "julia", hold: true, cr: -0.1226, ci: 0.7449, speed: 0.5, spread: 90 }) },
  { id: "own_cubic", name: "Formula: z³ − z + c", fractal: F({ kind: "custom", formula: "z^3 - z + c", formulaMode: "julia", spread: 100 }) },
  { id: "own_ripple", name: "Formula: z² + c/z", fractal: F({ kind: "custom", formula: "z^2 + 0.04/z + c", formulaMode: "julia", spread: 130 }) },
];

// ── c on the edge of the main bulb ────────────────────────────────────
// For zⁿ + c the main bulb's edge is where the fixed point z has
// multiplier n·zⁿ⁻¹ = e^{iθ}: z = (e^{iθ}/n)^{1/(n−1)}, c = z − zⁿ.
// n = 2 gives the familiar cardioid ½e^{iθ} − ¼e^{2iθ}. `reach` a touch
// over 1 sits just outside, where the shapes are richest.
export function bulbC(n, th, reach = 1) {
  const r = Math.pow(1 / n, 1 / (n - 1));
  const a = th / (n - 1);
  const zr = r * Math.cos(a), zi = r * Math.sin(a);
  const rn = Math.pow(r, n);
  return [reach * (zr - rn * Math.cos(n * a)), reach * (zi - rn * Math.sin(n * a))];
}

// The Julia c in use at time t (t = seconds × speed).
export function juliaC(f, t) {
  if (f.hold) return [f.cr, f.ci];
  return bulbC(f.power, 1.9 + t * 0.012, f.reach);
}

const zoomFactor = (f, t) => Math.pow(f.depth, 0.5 - 0.5 * Math.cos(t * 0.03));

// ── A small, safe formula language ────────────────────────────────────
// Numbers, i, z, c; + − × ÷ ^; brackets; sin cos tan sinh cosh exp log
// sqrt conj abs. Compiled to a flat list of register operations, so a
// formula can only ever compute numbers.
const FUNCS = ["sin", "cos", "tan", "sinh", "cosh", "exp", "log", "sqrt", "conj", "abs"];

function tokenize(src) {
  const out = [];
  let i = 0;
  const s = src.replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/²/g, "^2").replace(/³/g, "^3");
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const text = s.slice(i, j);
      const v = Number(text);
      if (!Number.isFinite(v) || (text.match(/\./g) || []).length > 1) throw new Error(`"${text}" isn't a number.`);
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      let j = i;
      while (j < s.length && /[a-z]/i.test(s[j])) j++;
      const w = s.slice(i, j).toLowerCase();
      if (FUNCS.includes(w)) out.push({ t: "fn", v: w });
      else if (w === "z" || w === "c" || w === "i") out.push({ t: "id", v: w });
      else if (w === "zc") { out.push({ t: "id", v: "z" }, { t: "id", v: "c" }); }
      else throw new Error(`Unknown name "${w}". Use z, c, i or a function like sin.`);
      i = j;
      continue;
    }
    if ("+-*/^()".includes(ch)) { out.push({ t: ch }); i++; continue; }
    throw new Error(`"${ch}" can't be used in a formula.`);
  }
  return out;
}

function parse(tokens) {
  let k = 0;
  let nodes = 0;
  const peek = () => tokens[k];
  const take = (t) => {
    if (peek()?.t !== t) throw new Error(t === ")" ? "A bracket isn't closed." : `Expected "${t}".`);
    return tokens[k++];
  };
  const node = (n) => { if (++nodes > 60) throw new Error("That formula is too long."); return n; };
  const startsPrimary = (tk) => tk && (tk.t === "num" || tk.t === "id" || tk.t === "fn" || tk.t === "(");

  function primary() {
    const tk = peek();
    if (!tk) throw new Error("The formula ends too soon.");
    if (tk.t === "num") { k++; return node({ op: "const", re: tk.v, im: 0 }); }
    if (tk.t === "id") {
      k++;
      if (tk.v === "i") return node({ op: "const", re: 0, im: 1 });
      return node({ op: "var", name: tk.v });
    }
    if (tk.t === "fn") {
      k++;
      take("(");
      const a = expr();
      take(")");
      return node({ op: tk.v, a });
    }
    if (tk.t === "(") {
      k++;
      const a = expr();
      take(")");
      return a;
    }
    throw new Error(`"${tk.t}" is in the wrong place.`);
  }
  function power() {
    const base = primary();
    if (peek()?.t === "^") { k++; return node({ op: "pow", a: base, b: unary() }); }
    return base;
  }
  function unary() {
    if (peek()?.t === "-") { k++; return node({ op: "neg", a: unary() }); }
    if (peek()?.t === "+") { k++; return unary(); }
    return power();
  }
  function term() {
    let a = unary();
    for (;;) {
      const tk = peek();
      if (tk?.t === "*" || tk?.t === "/") { k++; a = node({ op: tk.t === "*" ? "mul" : "div", a, b: unary() }); }
      else if (startsPrimary(tk)) a = node({ op: "mul", a, b: power() }); // 2z, 0.5i
      else return a;
    }
  }
  function expr() {
    let a = term();
    for (;;) {
      const tk = peek();
      if (tk?.t === "+" || tk?.t === "-") { k++; a = node({ op: tk.t === "+" ? "add" : "sub", a, b: term() }); }
      else return a;
    }
  }
  const tree = expr();
  if (k < tokens.length) throw new Error(`"${tokens[k].t === "num" ? tokens[k].v : tokens[k].t}" is in the wrong place.`);
  return tree;
}

const usesZ = (n) => !!n && (n.op === "var" ? n.name === "z" : usesZ(n.a) || usesZ(n.b));

// Returns { ok: true, program } or { ok: false, error } (a sentence the
// person can act on).
export function compileFormula(src) {
  try {
    const text = String(src || "").trim();
    if (!text) throw new Error("Type a formula, like z^2 + c.");
    if (text.length > FORMULA_MAX) throw new Error("That formula is too long.");
    const tree = parse(tokenize(text));
    if (!usesZ(tree)) throw new Error("Use z in the formula, or nothing will move.");
    // Registers: 0 = z, 1 = c, then constants, then temporaries.
    const consts = [];
    const ins = [];
    let next = 2;
    const reg = (n) => {
      if (n.op === "var") return n.name === "z" ? 0 : 1;
      if (n.op === "const") { const r = next++; consts.push([r, n.re, n.im]); return r; }
      if (n.op === "pow" && n.b.op === "const" && n.b.im === 0 && Number.isInteger(n.b.re) && Math.abs(n.b.re) <= 12) {
        const a = reg(n.a);
        const r = next++;
        ins.push(["powi", r, a, n.b.re]);
        return r;
      }
      const a = n.a ? reg(n.a) : -1;
      const b = n.b ? reg(n.b) : -1;
      const r = next++;
      ins.push([n.op, r, a, b]);
      return r;
    };
    const out = reg(tree);
    return { ok: true, program: { consts, ins, out, size: next } };
  } catch (e) {
    return { ok: false, error: e?.message || "That formula can't be read." };
  }
}

// Runs a compiled program once: z, c in → new z in re[0], im[0].
function step(prog, re, im) {
  const ins = prog.ins;
  for (let k = 0; k < ins.length; k++) {
    const [op, d, a, b] = ins[k];
    const ar = re[a], ai = im[a];
    switch (op) {
      case "add": re[d] = ar + re[b]; im[d] = ai + im[b]; break;
      case "sub": re[d] = ar - re[b]; im[d] = ai - im[b]; break;
      case "mul": { const br = re[b], bi = im[b]; re[d] = ar * br - ai * bi; im[d] = ar * bi + ai * br; break; }
      case "div": {
        const br = re[b], bi = im[b];
        const den = br * br + bi * bi || 1e-300;
        re[d] = (ar * br + ai * bi) / den; im[d] = (ai * br - ar * bi) / den; break;
      }
      case "neg": re[d] = -ar; im[d] = -ai; break;
      case "powi": {
        let n = b, rr = 1, ri = 0, xr = ar, xi = ai;
        const inv = n < 0;
        if (inv) n = -n;
        while (n > 0) {
          if (n & 1) { const t = rr * xr - ri * xi; ri = rr * xi + ri * xr; rr = t; }
          const t = xr * xr - xi * xi; xi = 2 * xr * xi; xr = t;
          n >>= 1;
        }
        if (inv) { const den = rr * rr + ri * ri || 1e-300; re[d] = rr / den; im[d] = -ri / den; } else { re[d] = rr; im[d] = ri; }
        break;
      }
      case "pow": {
        // a^b = exp(b · log a)
        const lr = Math.log(Math.hypot(ar, ai) || 1e-300), li = Math.atan2(ai, ar);
        const br = re[b], bi = im[b];
        const er = br * lr - bi * li, ei = br * li + bi * lr;
        const m = Math.exp(er);
        re[d] = m * Math.cos(ei); im[d] = m * Math.sin(ei); break;
      }
      case "sin": re[d] = Math.sin(ar) * Math.cosh(ai); im[d] = Math.cos(ar) * Math.sinh(ai); break;
      case "cos": re[d] = Math.cos(ar) * Math.cosh(ai); im[d] = -Math.sin(ar) * Math.sinh(ai); break;
      case "tan": {
        const den = Math.cos(2 * ar) + Math.cosh(2 * ai) || 1e-300;
        re[d] = Math.sin(2 * ar) / den; im[d] = Math.sinh(2 * ai) / den; break;
      }
      case "sinh": re[d] = Math.sinh(ar) * Math.cos(ai); im[d] = Math.cosh(ar) * Math.sin(ai); break;
      case "cosh": re[d] = Math.cosh(ar) * Math.cos(ai); im[d] = Math.sinh(ar) * Math.sin(ai); break;
      case "exp": { const m = Math.exp(ar); re[d] = m * Math.cos(ai); im[d] = m * Math.sin(ai); break; }
      case "log": re[d] = Math.log(Math.hypot(ar, ai) || 1e-300); im[d] = Math.atan2(ai, ar); break;
      case "sqrt": {
        const m = Math.sqrt(Math.hypot(ar, ai)), th = Math.atan2(ai, ar) / 2;
        re[d] = m * Math.cos(th); im[d] = m * Math.sin(th); break;
      }
      case "conj": re[d] = ar; im[d] = -ai; break;
      case "abs": re[d] = Math.hypot(ar, ai); im[d] = 0; break;
      default: break;
    }
  }
  re[0] = re[prog.out];
  im[0] = im[prog.out];
}

// ── Rendering ─────────────────────────────────────────────────────────
// Fills tone[] (0..1: where along the palette) and bright[] (0..1) for a
// W×H buffer. The shorter side always spans the whole shape, so portrait
// and landscape both show all of it (nothing is cropped).
export function renderFractalField(f, t, W, H, tone, bright, program = null) {
  const kind = f.kind;
  const aspectX = W >= H ? W / H : 1;
  const aspectY = H > W ? H / W : 1;
  let cx = 0, cy = 0, half = 1.55 / f.zoom, rot = t * 0.01;
  let MAX = Math.round(f.detail);
  if (kind === "mandelbrot") {
    const zf = zoomFactor(f, t);
    const s = MANDEL_SPOTS[f.spot];
    const ox = f.power === 2 ? -0.5 : 0;
    const k = 1 - 1 / zf;
    cx = ox + (s.x - ox) * k;
    cy = s.y * k;
    half = 1.45 / (f.zoom * zf);
    rot = t * 0.004;
    MAX = Math.min(220, Math.round(f.detail * (1 + 0.6 * Math.log10(zf))));
  } else if (kind === "newton") {
    half = 1.7 / f.zoom;
    rot = t * 0.008;
  } else if (kind === "phoenix") {
    half = 1.6 / f.zoom;
    rot = Math.PI / 2 + t * 0.006;
  } else if (kind === "custom" && f.formulaMode === "mandelbrot") {
    half = 1.8 / f.zoom;
    rot = 0;
  }
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const [jr, ji] = juliaC(kind === "custom" ? { ...f, power: 2 } : f, t);
  const n = f.power;
  const logN = Math.log(n);

  // Newton: the n roots of unity, and the relaxation factor.
  const roots = kind === "newton" ? Array.from({ length: f.nroots }, (_, j) => [Math.cos((2 * Math.PI * j) / f.nroots), Math.sin((2 * Math.PI * j) / f.nroots)]) : null;
  const th = t * 0.05;
  const ar = 1 + f.swirl * 0.5 * Math.cos(th), ai = f.swirl * 0.5 * Math.sin(th);
  // Phoenix p and q drift a little round where they were set.
  const pp = f.p + 0.015 * Math.sin(t * 0.02), pq = f.q + 0.015 * Math.cos(t * 0.017);

  const re = program ? new Float64Array(program.size) : null;
  const im = program ? new Float64Array(program.size) : null;
  if (program) for (const [r, a, b] of program.consts) { re[r] = a; im[r] = b; }

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const u = ((i + 0.5) / W * 2 - 1) * half * aspectX;
      const v = ((j + 0.5) / H * 2 - 1) * half * aspectY;
      const px = cx + u * cosR - v * sinR, py = cy + u * sinR + v * cosR;
      const idx = j * W + i;
      let it = 0;
      if (kind === "newton") {
        let zr = px, zi = py, root = -1;
        const N = f.nroots;
        for (; it < MAX; it++) {
          // z^(N-1)
          let qr = 1, qi = 0;
          for (let m = 0; m < N - 1; m++) { const t2 = qr * zr - qi * zi; qi = qr * zi + qi * zr; qr = t2; }
          const fr = qr * zr - qi * zi - 1, fi = qr * zi + qi * zr; // z^N − 1
          const dr = N * qr, di = N * qi;
          const den = dr * dr + di * di;
          if (den < 1e-18) break;
          const sr = (fr * dr + fi * di) / den, si = (fi * dr - fr * di) / den;
          zr -= ar * sr - ai * si;
          zi -= ar * si + ai * sr;
          for (let m = 0; m < N; m++) {
            const ddx = zr - roots[m][0], ddy = zi - roots[m][1];
            if (ddx * ddx + ddy * ddy < 1e-6) { root = m; break; }
          }
          if (root >= 0) break;
        }
        if (root < 0) { tone[idx] = 0; bright[idx] = 0.08; continue; }
        const fast = Math.pow(1 - it / MAX, 2.2);
        tone[idx] = root / N;
        bright[idx] = 0.12 + 0.6 * fast;
        continue;
      }
      let zr, zi, cr, ci, br = 0, bi = 0;
      if (kind === "mandelbrot" || (kind === "custom" && f.formulaMode === "mandelbrot")) { zr = 0; zi = 0; cr = px; ci = py; }
      else if (kind === "phoenix") { zr = px; zi = py; cr = pp; ci = 0; }
      else { zr = px; zi = py; cr = jr; ci = ji; }
      const bail = kind === "custom" ? 256 : 4;
      let m2 = zr * zr + zi * zi;
      if (program) { re[1] = cr; im[1] = ci; }
      while (it < MAX && m2 < bail) {
        if (program) {
          re[0] = zr; im[0] = zi;
          step(program, re, im);
          zr = re[0]; zi = im[0];
          if (!Number.isFinite(zr) || !Number.isFinite(zi)) { m2 = bail * 2; it++; break; }
        } else if (kind === "phoenix") {
          const nr = zr * zr - zi * zi + cr + pq * br;
          const ni = 2 * zr * zi + ci + pq * bi;
          br = zr; bi = zi; zr = nr; zi = ni;
        } else if (n === 2) {
          const nr = zr * zr - zi * zi + cr;
          zi = 2 * zr * zi + ci;
          zr = nr;
        } else {
          let qr = zr, qi = zi;
          for (let m = 1; m < n; m++) { const t2 = qr * zr - qi * zi; qi = qr * zi + qi * zr; qr = t2; }
          zr = qr + cr; zi = qi + ci;
        }
        m2 = zr * zr + zi * zi;
        it++;
      }
      if (it >= MAX && m2 < bail) { tone[idx] = 0; bright[idx] = 0.1; continue; }
      // Smooth (fractional) escape count, so bands blend instead of stepping.
      const lp = kind === "custom" || kind === "phoenix" ? Math.LN2 : logN;
      let k = it + 1 - Math.log(Math.log(Math.max(m2, 1.0001)) / 2) / lp;
      if (!Number.isFinite(k)) k = it;
      const fv = Math.min(1, Math.max(0, k / MAX)) ** 0.55;
      tone[idx] = fv;
      bright[idx] = 0.06 + 0.94 * fv;
    }
  }
}

// ── The equation, written out ─────────────────────────────────────────
const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const sup = (n) => String(n).split("").map((d) => SUP[d] || d).join("");
export const fmtComplex = (r, i) => {
  const a = Math.abs(r) < 0.00005 ? "0" : r.toFixed(3);
  const b = Math.abs(i).toFixed(3);
  return `${a} ${i < 0 ? "−" : "+"} ${b}i`.replace(/-/g, "−");
};

// Two short lines for the readout: the rule, and the numbers in it now.
export function fractalEquation(f, t) {
  switch (f.kind) {
    case "mandelbrot": {
      const zf = zoomFactor(f, t);
      return [`z ← z${sup(f.power)} + c`, `c = each point · zoom ×${zf < 10 ? zf.toFixed(1) : Math.round(zf)}`];
    }
    case "newton": {
      const N = f.nroots;
      const th = t * 0.05;
      return [`z ← z − a·(z${sup(N)} − 1) / ${N}z${sup(N - 1)}`, `a = ${fmtComplex(1 + f.swirl * 0.5 * Math.cos(th), f.swirl * 0.5 * Math.sin(th))}`];
    }
    case "phoenix": {
      const pp = f.p + 0.015 * Math.sin(t * 0.02), pq = f.q + 0.015 * Math.cos(t * 0.017);
      return ["z ← z² + p + q·z₋₁", `p = ${pp.toFixed(3)} · q = ${pq.toFixed(3)}`.replace(/-/g, "−")];
    }
    case "custom": {
      const [cr, ci] = juliaC({ ...f, power: 2 }, t);
      return [`z ← ${f.formula.trim() || "…"}`, f.formulaMode === "mandelbrot" ? "z₀ = 0 · c = each point" : `c = ${fmtComplex(cr, ci)}`];
    }
    default: {
      const [cr, ci] = juliaC(f, t);
      return [`z ← z${sup(f.power)} + c`, `c = ${fmtComplex(cr, ci)}`];
    }
  }
}
