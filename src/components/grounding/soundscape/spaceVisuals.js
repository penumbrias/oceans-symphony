import { clampFractal, compileFormula, renderFractalField } from "@/lib/soundscape/fractals";

// Soundscape "space" visuals, drawn from math alone:
//   • Stars — the classic flying-through-a-starfield screensaver. Each star
//     is a point (x, y, z) moving towards the viewer; it's drawn where
//     perspective puts it (x/z, y/z) as a short streak from where it was a
//     moment ago. Stars fade in from the distance so none pop into view.
//   • Fractal — Julia, Mandelbrot, Newton, Phoenix or the person's own
//     formula (see lib/soundscape/fractals.js), moving along slow paths.
// Photosensitivity: nothing blinks or strobes, brightness changes are
// gradual, and reduce-motion slows both right down.

export function createStars(count = 420, seed = 5) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const stars = [];
  for (let i = 0; i < count; i++) stars.push({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: rnd(), pz: 0 });
  return { stars, rnd };
}

// speed: depth units per second (1 = a star crosses the whole depth in 1s).
export function drawStars(g, w, h, field, dt, speed, color) {
  const cx = w / 2, cy = h / 2;
  const scale = Math.max(w, h) * 0.6;
  g.lineCap = "round";
  for (const s of field.stars) {
    s.pz = s.z;
    s.z -= speed * dt;
    if (s.z <= 0.02) {
      s.x = field.rnd() * 2 - 1;
      s.y = field.rnd() * 2 - 1;
      s.z = 1;
      s.pz = 1;
      continue;
    }
    const x = cx + (s.x / s.z) * scale * 0.5;
    const y = cy + (s.y / s.z) * scale * 0.5;
    const px = cx + (s.x / s.pz) * scale * 0.5;
    const py = cy + (s.y / s.pz) * scale * 0.5;
    if (x < -20 || x > w + 20 || y < -20 || y > h + 20) { s.z = 0; continue; }
    // Far stars are faint and fine; near ones brighter and thicker.
    const near = 1 - s.z;
    g.strokeStyle = color(Math.min(0.95, 0.08 + near * near));
    g.lineWidth = 0.6 + near * 2.2;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(x, y);
    g.stroke();
  }
}

// Fractal into a small offscreen buffer shaped like the screen, scaled
// up smoothly. The math lives in lib/soundscape/fractals.js.
const FRACTAL_PIXELS = 240 * 240;
export function createFractal() {
  const c = document.createElement("canvas");
  return { canvas: c, ctx: c.getContext("2d"), img: null, tone: null, bright: null, formula: null, program: null };
}

export function drawFractal(g, w, h, fr, t, hue, settings, render = true) {
  if (render || !fr.img) renderFractal(fr, w / h, t, hue, settings);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.filter = `blur(${Math.max(1, Math.max(w, h) / 400)}px)`;
  g.globalAlpha = 0.9;
  g.drawImage(fr.canvas, 0, 0, w, h);
  g.globalAlpha = 1;
  g.filter = "none";
}

function renderFractal(fr, aspect, t, hue, settings) {
  const f = clampFractal(settings);
  // A formula is costlier per point than the built-in kinds: fewer points.
  const budget = f.kind === "custom" ? FRACTAL_PIXELS * 0.6 : FRACTAL_PIXELS;
  const W = Math.max(40, Math.round(Math.sqrt(budget * aspect)));
  const H = Math.max(40, Math.round(budget / W));
  if (fr.canvas.width !== W || fr.canvas.height !== H || !fr.img) {
    fr.canvas.width = W;
    fr.canvas.height = H;
    fr.img = fr.ctx.createImageData(W, H);
    fr.tone = new Float32Array(W * H);
    fr.bright = new Float32Array(W * H);
  }
  let program = null;
  if (f.kind === "custom") {
    if (fr.formula !== f.formula) {
      const res = compileFormula(f.formula);
      fr.formula = f.formula;
      fr.program = res.ok ? res.program : null;
    }
    program = fr.program;
    // A formula that doesn't compile shows the plain z² + c meanwhile.
    if (!program) f.kind = "julia";
  }
  renderFractalField(f, t, W, H, fr.tone, fr.bright, program);
  // The theme colour, drifting `spread` degrees round the colour wheel.
  if (!fr.palette || fr.paletteHue !== hue || fr.paletteSpread !== f.spread) {
    fr.palette = Array.from({ length: 65 }, (_, i) => hslToRgb(hue + f.spread * (i / 64), 0.6, 0.62));
    fr.paletteHue = hue;
    fr.paletteSpread = f.spread;
  }
  const data = fr.img.data;
  for (let i = 0; i < W * H; i++) {
    const [r0, g0, b0] = fr.palette[Math.round(fr.tone[i] * 64)];
    const b = fr.bright[i];
    const idx = i * 4;
    data[idx] = r0 * b; data[idx + 1] = g0 * b; data[idx + 2] = b0 * b; data[idx + 3] = 255;
  }
  fr.ctx.putImageData(fr.img, 0, 0);
}

function hslToRgb(hDeg, s, l) {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
