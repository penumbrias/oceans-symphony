// Soundscape "space" visuals, drawn from math alone:
//   • Stars — the classic flying-through-a-starfield screensaver. Each star
//     is a point (x, y, z) moving towards the viewer; it's drawn where
//     perspective puts it (x/z, y/z) as a short streak from where it was a
//     moment ago. Stars fade in from the distance so none pop into view.
//   • Fractal — a Julia set, z → z² + c, coloured by how fast each point
//     escapes. c travels slowly along the edge of the Mandelbrot set, so
//     the shape keeps folding into new forms; a lap takes several minutes.
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

// Julia set into a small offscreen buffer, scaled up smoothly.
export function createFractal() {
  const c = document.createElement("canvas");
  c.width = 240;
  c.height = 240;
  return { canvas: c, ctx: c.getContext("2d"), img: null };
}

export function drawFractal(g, w, h, fr, t, hue, presence = 1, render = true) {
  if (render || !fr.img) renderFractal(fr, t, hue, presence);
  const side = Math.max(w, h);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.filter = `blur(${Math.max(1, side / 400)}px)`;
  g.globalAlpha = 0.9;
  g.drawImage(fr.canvas, (w - side) / 2, (h - side) / 2, side, side);
  g.globalAlpha = 1;
  g.filter = "none";
}

function renderFractal(fr, t, hue, presence) {
  const W = fr.canvas.width, H = fr.canvas.height;
  if (!fr.img) fr.img = fr.ctx.createImageData(W, H);
  const data = fr.img.data;
  // c walks just outside the edge of the Mandelbrot set's main cardioid
  // (c = ½e^iθ − ¼e^2iθ), where every Julia set is connected and
  // intricate. One lap ≈ 8.7 minutes.
  const th = 1.9 + t * 0.012;
  const cr = 1.02 * (0.5 * Math.cos(th) - 0.25 * Math.cos(2 * th));
  const ci = 1.02 * (0.5 * Math.sin(th) - 0.25 * Math.sin(2 * th));
  const zoom = 1.55 - 0.08 * presence;
  const rot = t * 0.01;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const MAX = 48;
  // A small palette: the theme colour, drifting 70° round the colour wheel
  // as points get closer to the edge.
  if (!fr.palette || fr.paletteHue !== hue) {
    fr.palette = Array.from({ length: 65 }, (_, i) => hslToRgb(hue + 70 * (i / 64), 0.6, 0.62));
    fr.paletteHue = hue;
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const u = ((i / W) * 2 - 1) * zoom, v = ((j / H) * 2 - 1) * zoom;
      let zr = u * cosR - v * sinR, zi = u * sinR + v * cosR;
      let n = 0;
      while (n < MAX && zr * zr + zi * zi < 4) {
        const nr = zr * zr - zi * zi + cr;
        zi = 2 * zr * zi + ci;
        zr = nr;
        n++;
      }
      // Smooth (fractional) escape count, so bands blend instead of stepping.
      let k = n;
      if (n < MAX) k = n + 1 - Math.log2(Math.log2(zr * zr + zi * zi) / 2 || 1);
      // The set itself is a dark silhouette; points that escape slowly (near
      // its edge) glow, fading out with distance.
      const f = n >= MAX ? 0 : Math.min(1, k / MAX) ** 0.55;
      const b = n >= MAX ? 0.1 : 0.06 + 0.94 * f;
      const idx = (j * W + i) * 4;
      const [r0, g0, b0] = fr.palette[Math.round(f * 64)];
      data[idx] = r0 * b; data[idx + 1] = g0 * b; data[idx + 2] = b0 * b; data[idx + 3] = 255;
    }
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
