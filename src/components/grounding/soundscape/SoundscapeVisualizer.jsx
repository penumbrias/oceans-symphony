import { useEffect, useRef } from "react";
import { getAnalyser, currentMotion, getSoundscapeState } from "@/lib/soundscape/engine";

// Draws the sound. Two layers:
//   • the SHAPE — the spectrum the current settings predict, worked out
//     from the same math the engine uses (noise colour slope × filters,
//     plus the tone). Always drawn, so changing a slider visibly changes
//     the curve even while nothing is playing.
//   • the LIVE sound from the analyser while playing.
// variant "spectrum" is the panel view; "radial" is the focused-mode ring.
// Nothing flashes: colours are fixed and the analyser is heavily smoothed.

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

export default function SoundscapeVisualizer({ params, variant = "spectrum", className = "", style }) {
  const canvasRef = useRef(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

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
        colors = { line: primary(0.95), fill: primary(0.22), faint: primary(0.35), glow: primary(0.12) };
        colorsAt = now;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const p = paramsRef.current;
      const analyser = getSoundscapeState().playing ? getAnalyser() : null;
      if (analyser) {
        if (!freq || freq.length !== analyser.frequencyBinCount) {
          freq = new Float32Array(analyser.frequencyBinCount);
          wave = new Float32Array(analyser.fftSize);
        }
        analyser.getFloatFrequencyData(freq);
        analyser.getFloatTimeDomainData(wave);
      }
      const sr = analyser?.context?.sampleRate || 48000;
      const liveDb = (f) => {
        if (!analyser) return null;
        const bin = Math.min(freq.length - 1, Math.round((f / (sr / 2)) * freq.length));
        // Average a few bins either side: smoother, never spiky.
        let s = 0, n = 0;
        for (let k = Math.max(0, bin - 2); k <= Math.min(freq.length - 1, bin + 2); k++) { s += freq[k]; n++; }
        return s / n;
      };

      if (variant === "radial") {
        const cx = w / 2, cy = h / 2;
        const R = Math.min(w, h) * 0.3;
        const m = analyser ? currentMotion() : 1;
        const steps = 180;
        // Spectrum petals: predicted shape, swelling with the live level.
        g.beginPath();
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const t = Math.abs(((i / steps) * 2) - 1); // mirror: lows at top & bottom
          const f = fOfX(t * 400, 400);
          const db = analyser ? (liveDb(f) + 100) / 70 : (predictedDb(f, p) + 60) / 60;
          const r = R * (1 + 0.45 * Math.max(0, Math.min(1.2, db)) * (0.6 + 0.4 * m));
          const x = cx + Math.sin(a) * r, y = cy - Math.cos(a) * r;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath();
        g.fillStyle = colors.fill;
        g.fill();
        // Waveform ring.
        g.beginPath();
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const s = analyser ? wave[Math.floor((i / steps) * (wave.length - 1))] : 0;
          const r = R * (0.92 + Math.max(-0.25, Math.min(0.25, s * 0.8)));
          const x = cx + Math.sin(a) * r, y = cy - Math.cos(a) * r;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath();
        g.strokeStyle = colors.line;
        g.lineWidth = 1.5;
        g.stroke();
        return;
      }

      // Spectrum panel.
      const toY = (db, lo, hi) => h - 6 - ((Math.max(lo, Math.min(hi, db)) - lo) / (hi - lo)) * (h - 12);
      // Predicted shape.
      // Normalised so the loudest point of the shape sits near the top.
      const shape = [];
      let peak = -Infinity;
      for (let x = 0; x <= w; x += 2) {
        const db = predictedDb(fOfX(x, w), p);
        shape.push(db);
        if (db > peak) peak = db;
      }
      const lift = p.noise === "none" && !p.toneOn ? 0 : -peak;
      g.beginPath();
      shape.forEach((db, i) => {
        const y = toY(db + lift, -54, 3);
        if (i === 0) g.moveTo(0, y); else g.lineTo(i * 2, y);
      });
      g.strokeStyle = analyser ? colors.faint : colors.line;
      g.lineWidth = analyser ? 1 : 2;
      g.setLineDash(analyser ? [4, 4] : []);
      g.stroke();
      g.setLineDash([]);
      if (!analyser) {
        g.lineTo(w, h); g.lineTo(0, h); g.closePath();
        g.fillStyle = colors.glow;
        g.fill();
        return;
      }
      // Live spectrum.
      // Auto-ranged with a slowly following peak, so quiet and loud sounds
      // both fill the panel without the scale jumping around.
      const live = [];
      let lp = -Infinity;
      for (let x = 0; x <= w; x += 2) { const db = liveDb(fOfX(x, w)); live.push(db); if (db > lp) lp = db; }
      livePeak = livePeak == null ? lp : livePeak + (lp - livePeak) * 0.04;
      g.beginPath();
      g.moveTo(0, h);
      live.forEach((db, i) => g.lineTo(i * 2, toY(db - livePeak, -60, 4)));
      g.lineTo(w, h);
      g.closePath();
      g.fillStyle = colors.fill;
      g.fill();
      g.strokeStyle = colors.line;
      g.lineWidth = 1.5;
      g.stroke();
      // Waveform across the middle.
      g.beginPath();
      const step = Math.max(1, Math.floor(wave.length / w));
      for (let x = 0; x < w; x++) {
        const y = h / 2 - Math.max(-1, Math.min(1, wave[x * step] * 1.6)) * (h * 0.3);
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = colors.faint;
      g.lineWidth = 1;
      g.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [variant]);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height: "100%", display: "block", ...style }} aria-hidden="true" />;
}

