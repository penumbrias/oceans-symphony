import { useEffect, useRef } from "react";
import { getAnalyser, currentMotion, getSoundscapeState } from "@/lib/soundscape/engine";
import { motionValue } from "@/lib/soundscape/soundMath";
import { createStars, drawStars, createFractal, drawFractal } from "./spaceVisuals";

// Draws the sound. Two styles:
//   • "calm" (default) — the SHAPE the current settings predict, worked out
//     from the same math the engine uses (noise colour slope × filters,
//     plus the tone), breathing slowly with the sound's overall level and
//     its movement. Nothing in it changes faster than about once a second.
//   • "layers" — each part of the sound as its own slow ripple instead of
//     their sum (the real waveform is all of them interfering): the noise
//     as a soft band (longer swells for deeper colours, more ripples when
//     brighter), the tone as a clean wave (more ripples at higher pitch),
//     a binaural beat as the two ears' waves sliding past each other, and
//     the movement curve as the band's centre line. Drawn far slower than
//     the sound itself.
//   • "stars" / "fractal" — space visuals, see spaceVisuals.js.
//   • "detailed" — the live spectrum from the analyser, still smoothed
//     frame to frame so it drifts rather than jitters.
// No waveform is drawn in either: the raw wave vibrates many times a
// second, which reads as flicker (owner, 2026-10-19: worried about
// photosensitivity). Colours are fixed; nothing flashes.
// variant "spectrum" is the panel view; "radial" is the focused-mode shape.

const F_MIN = 30;
const F_MAX = 9000;

const fOfX = (x, w) => F_MIN * Math.pow(F_MAX / F_MIN, x / w);

export function predictedDb(f, p) {
  let db = 0;
  const rel = f / 100;
  if (p.noise === "pink" || p.noise === "rain") db -= 10 * Math.log10(rel);
  else if (p.noise === "brown") db -= 20 * Math.log10(rel);
  if (p.noise === "rain") db += 6 * Math.exp(-Math.pow(Math.log2(f / 2000), 2));
  if (p.noise === "none") db = -60;
  else db += 20 * Math.log10(Math.max(0.001, p.noiseLevel));
  db -= 10 * Math.log10(1 + Math.pow(f / p.lowpass, 4));
  db -= 10 * Math.log10(1 + Math.pow(p.highpass / f, 4));
  if (p.toneOn && p.toneLevel > 0) {
    const spread = Math.max(0.015, (p.beat || 0) / p.toneFreq);
    const near = Math.exp(-Math.pow(Math.log(f / p.toneFreq) / spread, 2));
    db = Math.max(db, -6 + 20 * Math.log10(p.toneLevel) + 20 * Math.log10(Math.max(near, 1e-4)));
  }
  return db;
}

function primary(alpha) {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "200 80% 60%";
  return `hsl(${v} / ${alpha})`;
}

// ── Layers ──────────────────────────────────────────────────────────
// Visual wave counts are log-mapped from the real frequencies so they
// stay readable; every speed here is capped well under 1 Hz.
const CYCLES_MAX = 7;
const noiseCycles = (p) => {
  const base = { brown: 1.2, pink: 2, rain: 3, white: 3.2, none: 0 }[p.noise] || 2;
  return base * (0.6 + 0.8 * (Math.log(p.lowpass / 200) / Math.log(8000 / 200)));
};
const toneCycles = (p) => 1 + (CYCLES_MAX - 1) * (Math.log(p.toneFreq / 40) / Math.log(600 / 40));

function drawLayers(g, w, h, p, t, variant, colors, presence, reduce) {
  const speed = reduce ? 0 : 1;
  const lanes = [];
  if (p.noise !== "none" && p.noiseLevel > 0) lanes.push("noise");
  if (p.toneOn && p.toneLevel > 0) lanes.push("tone");
  if (!lanes.length) return;
  const nc = noiseCycles(p);
  const tc = toneCycles(p);
  // Beat shown as a slow phase slide between the ears (≤ 0.4 Hz).
  const beatPhase = p.beat > 0 ? t * speed * Math.min(0.4, p.beat / 25) * Math.PI * 2 : 0;
  const swell = (x) => motionValue(p.motion, t * speed + x * 20, p.motionSpeed, p.motionAmount);

  // A layer's value at position u (0..1 along the lane), as -1..1.
  const noiseAt = (u) => {
    const ph = t * speed * 0.12;
    return 0.6 * Math.sin(2 * Math.PI * (nc * u + ph)) +
      0.3 * Math.sin(2 * Math.PI * (nc * 1.7 * u - ph * 0.7) + 1.1) +
      0.1 * Math.sin(2 * Math.PI * (nc * 2.9 * u + ph * 0.5) + 2.3);
  };
  const toneAt = (u, shift = 0) => Math.sin(2 * Math.PI * (tc * u - t * speed * 0.1) + shift);

  if (variant === "radial") {
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.3;
    const steps = 200;
    const ring = (radius, amp, fn, stroke, width, fill) => {
      g.beginPath();
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const a = u * Math.PI * 2;
        const r = radius + amp * fn(u);
        const x = cx + Math.sin(a) * r, y = cy - Math.cos(a) * r;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      g.strokeStyle = stroke; g.lineWidth = width; g.stroke();
    };
    if (lanes.includes("noise")) {
      const amp = R * 0.12 * p.noiseLevel * presence;
      // Whole cycles round the circle, so the ring has no seam.
      const kn = Math.max(2, Math.round(nc * 2));
      const ph = t * speed * 0.12;
      const noiseRing = (u) => 0.65 * Math.sin(2 * Math.PI * (kn * u + ph)) + 0.35 * Math.sin(2 * Math.PI * (kn * 2 * u - ph * 0.7) + 1.1);
      ring(R * 1.25 * (0.9 + 0.1 * swell(0)), amp, noiseRing, colors.faint, 6, colors.glow);
    }
    if (lanes.includes("tone")) {
      const amp = R * 0.08 * (0.4 + p.toneLevel);
      // Whole cycles around the circle so the ring closes cleanly.
      const k = Math.max(2, Math.round(tc * 2));
      const fn = (shift) => (u) => Math.sin(2 * Math.PI * k * u - t * speed * 0.3 + shift);
      ring(R * 0.8, amp, fn(0), colors.line, 1.5, null);
      if (p.beat > 0) ring(R * 0.8, amp, fn(beatPhase), colors.faint, 1.5, null);
    }
    return;
  }

  const laneH = h / lanes.length;
  const label = (text, y0) => {
    g.fillStyle = colors.faint;
    g.font = "10px system-ui, sans-serif";
    g.fillText(text, 6, y0 + 12);
  };
  lanes.forEach((lane, idx) => {
    const y0 = idx * laneH;
    const mid = y0 + laneH / 2;
    if (lane === "noise") {
      // A soft band: thickness from the level, centre line from the movement.
      const thick = laneH * 0.32 * p.noiseLevel;
      const top = [], bot = [];
      for (let x = 0; x <= w; x += 3) {
        const u = x / w;
        const c = mid + (1 - swell(u)) * laneH * 0.25;
        const v = noiseAt(u) * laneH * 0.18 * presence;
        top.push([x, c + v - thick / 2]);
        bot.push([x, c + v + thick / 2]);
      }
      g.beginPath();
      top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      bot.reverse().forEach(([x, y]) => g.lineTo(x, y));
      g.closePath();
      g.fillStyle = colors.fill; g.fill();
      label(`Noise · ${p.noise}`, y0);
    } else {
      const amp = laneH * 0.3 * (0.4 + 0.6 * p.toneLevel);
      const wave = (shift, stroke) => {
        g.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const y = mid + toneAt(x / w, shift) * amp;
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.strokeStyle = stroke; g.lineWidth = 2; g.stroke();
      };
      wave(0, colors.line);
      if (p.beat > 0) wave(beatPhase, colors.faint);
      label(p.beat > 0 ? `Tone · left and right ears, ${p.beat.toFixed(1)} Hz apart` : "Tone", y0);
    }
  });
}

const N = 96; // points across the frequency range

export const STAR_SPEEDS = { drift: 0.08, cruise: 0.22, warp: 0.55 };

export default function SoundscapeVisualizer({ params, variant = "spectrum", detail = "calm", starSpeed = "cruise", className = "", style }) {
  const canvasRef = useRef(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const starSpeedRef = useRef(starSpeed);
  starSpeedRef.current = starSpeed;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const g = canvas.getContext("2d");
    let raf = 0;
    let last = 0;
    let freq = null;
    let wave = null;
    let colors = null;
    let colorsAt = 0;
    let livePeak = null;
    let level = 0;          // smoothed overall loudness, 0..1
    let spin = 0;           // very slow rotation of the radial shape
    const shown = new Float32Array(N); // smoothed live spectrum, 0..1
    const stars = detail === "stars" ? createStars() : null;
    const fractal = detail === "fractal" ? createFractal() : null;
    let fractalAt = 0;
    let prevNow = 0;
    let hue = 210;

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      const reduce = document.documentElement.classList.contains("a11y-reduce-motion");
      if (reduce && now - last < 66) return; // ~15 fps
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      if (!colors || now - colorsAt > 2000) {
        colors = { line: primary(0.9), fill: primary(0.22), faint: primary(0.35), glow: primary(0.12) };
        hue = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--primary")) || 210;
        colorsAt = now;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const p = paramsRef.current;
      const analyser = getSoundscapeState().playing ? getAnalyser() : null;

      // The predicted shape, normalised: 1 = loudest point, 0 = 54 dB below.
      const shape = new Float32Array(N);
      let peak = -Infinity;
      for (let i = 0; i < N; i++) { shape[i] = predictedDb(fOfX(i, N - 1), p); if (shape[i] > peak) peak = shape[i]; }
      const silent = p.noise === "none" && !p.toneOn;
      for (let i = 0; i < N; i++) shape[i] = silent ? 0 : Math.max(0, Math.min(1, (shape[i] - peak + 54) / 54));

      // Live data → a smoothed level, and (detailed) a smoothed spectrum.
      let target = 0;
      if (analyser) {
        if (!freq || freq.length !== analyser.frequencyBinCount) {
          freq = new Float32Array(analyser.frequencyBinCount);
          wave = new Float32Array(analyser.fftSize);
        }
        analyser.getFloatTimeDomainData(wave);
        let ss = 0;
        for (let k = 0; k < wave.length; k++) ss += wave[k] * wave[k];
        const db = 10 * Math.log10(ss / wave.length + 1e-12);
        target = Math.max(0, Math.min(1, (db + 50) / 35));
        if (detail === "detailed") {
          analyser.getFloatFrequencyData(freq);
          const sr = analyser.context?.sampleRate || 48000;
          const live = new Float32Array(N);
          let lp = -Infinity;
          for (let i = 0; i < N; i++) {
            const bin = Math.min(freq.length - 1, Math.round((fOfX(i, N - 1) / (sr / 2)) * freq.length));
            let s = 0, n = 0;
            for (let k = Math.max(0, bin - 3); k <= Math.min(freq.length - 1, bin + 3); k++) { s += freq[k]; n++; }
            live[i] = s / n;
            if (live[i] > lp) lp = live[i];
          }
          livePeak = livePeak == null ? lp : livePeak + (lp - livePeak) * 0.02;
          for (let i = 0; i < N; i++) {
            const v = Math.max(0, Math.min(1, (live[i] - livePeak + 60) / 60));
            shown[i] += (v - shown[i]) * 0.08;
          }
        }
      }
      level += (target - level) * 0.02;
      const m = analyser ? currentMotion() : 1;
      // How "present" the sound is right now: slow by construction.
      const presence = analyser ? 0.55 + 0.45 * level * m : 1;
      const useLive = detail === "detailed" && analyser;
      const vals = useLive ? shown : shape;

      const dt = Math.min(0.1, prevNow ? (now - prevNow) / 1000 : 0);
      prevNow = now;
      if (stars) {
        const base = STAR_SPEEDS[starSpeedRef.current] || STAR_SPEEDS.cruise;
        drawStars(g, w, h, stars, dt, base * (reduce ? 0.25 : 1) * (0.8 + 0.3 * presence), (a) => `hsl(${hue} 45% 88% / ${a})`);
        return;
      }
      if (fractal) {
        // Re-rendered ~10 times a second; the shape moves far slower than that.
        const due = now - fractalAt > (reduce ? 400 : 100);
        if (due) fractalAt = now;
        drawFractal(g, w, h, fractal, (reduce ? 0.3 : 1) * now / 1000, hue, presence, due);
        return;
      }
      if (detail === "layers") {
        drawLayers(g, w, h, p, now / 1000, variant, colors, presence, reduce);
        return;
      }

      if (variant === "radial") {
        const cx = w / 2, cy = h / 2;
        const R = Math.min(w, h) * 0.28;
        if (!reduce) spin += 0.0006;
        const glow = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.2);
        glow.addColorStop(0, colors.glow);
        glow.addColorStop(1, "transparent");
        g.fillStyle = glow;
        g.fillRect(0, 0, w, h);
        const steps = 160;
        const ring = (scale, fill, stroke) => {
          g.beginPath();
          for (let i = 0; i <= steps; i++) {
            const a = (i / steps) * Math.PI * 2 + spin;
            const t = Math.abs(((i / steps) * 2) - 1); // mirrored: lows top and bottom
            const v = vals[Math.round(t * (N - 1))];
            const r = R * scale * (0.9 + 0.5 * v * presence);
            const x = cx + Math.sin(a) * r, y = cy - Math.cos(a) * r;
            if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.closePath();
          if (fill) { g.fillStyle = fill; g.fill(); }
          if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); }
        };
        ring(1.15, colors.glow, null);
        ring(1, colors.fill, colors.line);
        return;
      }

      // Spectrum panel.
      const toY = (v) => h - 6 - v * (h - 12);
      g.beginPath();
      g.moveTo(0, h);
      for (let i = 0; i < N; i++) g.lineTo((i / (N - 1)) * w, toY(vals[i] * (useLive ? 1 : presence)));
      g.lineTo(w, h);
      g.closePath();
      g.fillStyle = analyser ? colors.fill : colors.glow;
      g.fill();
      g.strokeStyle = colors.line;
      g.lineWidth = 2;
      g.stroke();
      if (useLive) {
        // The predicted shape as a dashed guide over the live sound.
        g.beginPath();
        for (let i = 0; i < N; i++) {
          const x = (i / (N - 1)) * w, y = toY(shape[i]);
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.setLineDash([4, 4]);
        g.strokeStyle = colors.faint;
        g.lineWidth = 1;
        g.stroke();
        g.setLineDash([]);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [variant, detail]);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height: "100%", display: "block", ...style }} aria-hidden="true" />;
}
