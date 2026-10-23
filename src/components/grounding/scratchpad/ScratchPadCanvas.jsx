import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  createPad, resizePad, clearPad, beginStroke, extendStroke, endStroke, stepPad, alphaOf,
} from "@/lib/scratchpad/particles";

// The drawing surface: press and drag to lay down a line of particles,
// let go and the rules take over. Several fingers draw several lines.
// Stops drawing once nothing moves, so a still pad costs no battery.
// Colours are soft and fixed per particle bucket; nothing flashes.

const BUCKETS = 12;
const SPRITE = 24;

function lowEndDevice() {
  const mem = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  return (mem && mem <= 3) || (cores && cores <= 4);
}

function primaryHue() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--primary")) || 210;
}

// One soft dot per colour bucket, drawn once and stamped many times.
function makeSprites(hue, mode) {
  const out = [];
  for (let b = 0; b <= BUCKETS; b++) {
    const c = document.createElement("canvas");
    c.width = c.height = SPRITE;
    const g = c.getContext("2d");
    const t = b / BUCKETS;
    let col;
    if (b === BUCKETS) col = `hsl(${hue} 30% 92%`; // still being drawn
    else if (mode === "speed") col = `hsl(${(hue + 140 * t) % 360} 70% ${58 + 12 * t}%`;
    else if (mode === "age") col = `hsl(${hue} ${65 - 35 * t}% ${70 - 25 * t}%`;
    else col = `hsl(${hue} 65% 66%`;
    const grad = g.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
    grad.addColorStop(0, `${col} / 1)`);
    grad.addColorStop(0.25, `${col} / 0.85)`);
    grad.addColorStop(0.6, `${col} / 0.18)`);
    grad.addColorStop(1, `${col} / 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE, SPRITE);
    out.push(c);
  }
  return out;
}

const ScratchPadCanvas = forwardRef(function ScratchPadCanvas({ rules, color = "speed", trails = 0.6, className = "" }, ref) {
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const rulesRef = useRef(rules);
  const lookRef = useRef({ color, trails });
  const wakeRef = useRef(() => {});

  rulesRef.current = rules;
  lookRef.current = { color, trails };

  useImperativeHandle(ref, () => ({
    clear: () => { if (padRef.current) clearPad(padRef.current); wakeRef.current(true); },
  }), []);

  // New rules or look apply to what's already on the pad.
  useEffect(() => { wakeRef.current(true); }, [rules, color, trails]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas.getContext("2d");
    const pad = createPad({ capacity: lowEndDevice() ? 450 : 800, seed: Date.now() });
    padRef.current = pad;
    let raf = 0;
    let running = false;
    let lastFrame = 0;
    let still = 0;
    let scale = 1;
    let cssW = 0, cssH = 0, dpr = 1;
    let sprites = null, spriteKey = "";
    let hue = primaryHue();
    let bg = "";
    let fullRedraw = true;
    const pointers = new Map();

    const fit = () => {
      cssW = canvas.clientWidth; cssH = canvas.clientHeight;
      if (!cssW || !cssH) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      scale = Math.min(cssW, cssH) / 1000;
      resizePad(pad, cssW / scale, cssH / scale);
      fullRedraw = true;
    };

    const frame = (now) => {
      raf = 0;
      if (!cssW) { fit(); if (!cssW) { running = false; return; } }
      const reduce = document.documentElement.classList.contains("a11y-reduce-motion");
      const minGap = reduce ? 1000 / 30 : 1000 / 61;
      if (lastFrame && now - lastFrame < minGap) { raf = requestAnimationFrame(frame); return; }
      const dt = lastFrame ? Math.min(1 / 30, (now - lastFrame) / 1000) : 1 / 60;
      lastFrame = now;

      const rules = rulesRef.current;
      const { color: mode, trails: tr } = lookRef.current;
      const moving = stepPad(pad, rules, dt);

      const key = `${hue}|${mode}`;
      if (key !== spriteKey) {
        sprites = makeSprites(hue, mode);
        spriteKey = key;
        bg = `hsl(${hue} 30% 6%)`;
      }

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = fullRedraw ? 1 : 1 - tr;
      g.fillStyle = bg;
      g.fillRect(0, 0, cssW, cssH);
      fullRedraw = false;

      g.globalCompositeOperation = "lighter";
      const size = Math.max(7, 13 * scale * 1.6);
      const half = size / 2;
      for (let i = 0; i < pad.cap; i++) {
        if (!pad.alive[i]) continue;
        let b;
        if (pad.pinned[i]) b = BUCKETS;
        else if (mode === "speed") b = Math.min(BUCKETS - 1, ((Math.abs(pad.vx[i]) + Math.abs(pad.vy[i])) / 500 * BUCKETS) | 0);
        else if (mode === "age") b = Math.min(BUCKETS - 1, (pad.age[i] / 20 * BUCKETS) | 0);
        else b = 0;
        g.globalAlpha = alphaOf(pad, i, rules) * 0.9;
        g.drawImage(sprites[b], pad.x[i] * scale - half, pad.y[i] * scale - half, size, size);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";

      // Keep going while anything moves, then a little longer so trails
      // finish fading; after that sleep until the next touch.
      still = moving > 0.5 * pad.count || pointers.size ? 0 : still + 1;
      if (still === 80) fullRedraw = true; // wipe faint trail ghosts
      if (still > 90) { running = false; return; }
      raf = requestAnimationFrame(frame);
    };

    const wake = (redraw) => {
      if (redraw) fullRedraw = true;
      still = 0;
      if (running) return;
      running = true;
      lastFrame = 0;
      hue = primaryHue();
      raf = requestAnimationFrame(frame);
    };
    wakeRef.current = wake;

    const toPad = (e) => {
      const rect = canvas.getBoundingClientRect();
      return [(e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale];
    };
    // Each finger draws its own line; the pad keeps one live stroke, so
    // extra fingers each get their own pad state swapped in and out.
    const onDown = (e) => {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      if (!cssW) fit();
      const [x, y] = toPad(e);
      const prev = pad.stroke;
      pad.stroke = null;
      beginStroke(pad, x, y, e.timeStamp);
      pointers.set(e.pointerId, pad.stroke);
      pad.stroke = prev;
      wake();
    };
    const onMove = (e) => {
      const s = pointers.get(e.pointerId);
      if (!s) return;
      e.preventDefault();
      const events = e.getCoalescedEvents?.() || [e];
      const prev = pad.stroke;
      pad.stroke = s;
      for (const ev of events) {
        const [x, y] = toPad(ev);
        extendStroke(pad, x, y, ev.timeStamp);
      }
      pad.stroke = prev;
      wake();
    };
    const onUp = (e) => {
      const s = pointers.get(e.pointerId);
      if (!s) return;
      pointers.delete(e.pointerId);
      const prev = pad.stroke;
      pad.stroke = s;
      endStroke(pad, rulesRef.current);
      pad.stroke = prev === s ? null : prev;
      wake();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    const ro = new ResizeObserver(() => { fit(); wake(true); });
    ro.observe(canvas);
    fit();
    wake(true);
    return () => {
      cancelAnimationFrame(raf);
      running = false;
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      wakeRef.current = () => {};
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`block w-full h-full touch-none select-none ${className}`}
      style={{ touchAction: "none" }}
      data-no-panic-taps=""
      role="img"
      aria-label="Scratch pad. Press and drag to draw a line of particles; let go to set them moving."
    />
  );
});

export default ScratchPadCanvas;
