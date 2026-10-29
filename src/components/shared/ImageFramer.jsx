// Frame a picture (v0.314.0): drag the preview to choose what stays in
// view, zoom with the slider. Same rows as every inspector (SliderRow), so
// the numbers are visible and typeable. See src/lib/imageFraming.js.
//
// The frame is kept here while it's being dragged and handed to onChange
// a moment after the last change (and on let-go), so a drag doesn't write
// the record on every pixel.

import React, { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { SliderRow } from "@/components/shared/SettingRows";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { framingOf, framedImageStyle, CENTRED, ZOOM_MIN, ZOOM_MAX } from "@/lib/imageFraming";

const SHAPE_RADIUS = { circle: "9999px", rounded: "22%", square: "6%", box: "12px" };

export default function ImageFramer({ src, value, onChange, shape = "circle", label = "Picture", fit = "cover" }) {
  const url = useResolvedAvatarUrl(src);
  const [frame, setFrame] = useState(() => framingOf(value) || CENTRED);
  const timer = useRef(null);
  const drag = useRef(null);
  const boxRef = useRef(null);
  const pending = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // A different picture (or a change from elsewhere) resets the local copy.
  const valueKey = JSON.stringify(framingOf(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!drag.current) setFrame(framingOf(value) || CENTRED); }, [src, valueKey]);
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); flush(); } }, []);

  function flush() {
    if (!pending.current) return;
    const f = pending.current;
    pending.current = null;
    onChangeRef.current?.(framingOf(f));
  }
  const update = (next, { now = false } = {}) => {
    setFrame(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    if (now) flush();
    else timer.current = setTimeout(() => { timer.current = null; flush(); }, 350);
  };

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: frame };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    const box = boxRef.current;
    if (!d || !box) return;
    const w = box.clientWidth || 1;
    const h = box.clientHeight || 1;
    // Dragging the picture right shows more of its left side.
    const k = 100 / Math.max(1, d.start.zoom);
    update({
      ...d.start,
      x: Math.round(Math.max(0, Math.min(100, d.start.x - ((e.clientX - d.x) / w) * k))),
      y: Math.round(Math.max(0, Math.min(100, d.start.y - ((e.clientY - d.y) / h) * k))),
    });
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    flush();
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 10 : 2;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    update({ ...frame, x: Math.max(0, Math.min(100, frame.x + m[0])), y: Math.max(0, Math.min(100, frame.y + m[1])) });
  };

  const zoomPct = Math.round(frame.zoom * 100);
  return (
    <div className="py-1" data-image-framer="">
      <div className="flex items-center gap-3 py-1.5">
        <div ref={boxRef} role="slider" tabIndex={0} aria-label={`${label}: drag to choose what stays in view`}
          aria-valuetext={`${frame.x}% across, ${frame.y}% down, ${zoomPct}% zoom`}
          data-vaul-no-drag="" data-own-hold=""
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className="relative w-28 h-28 flex-shrink-0 overflow-hidden bg-muted/40 cursor-grab active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          style={{ borderRadius: SHAPE_RADIUS[shape] || SHAPE_RADIUS.box, touchAction: "none" }}>
          {url && <img src={url} alt="" draggable={false} className="w-full h-full block select-none pointer-events-none" style={framedImageStyle(frame, { fit })} />}
        </div>
        <div className="flex-1 min-w-0 text-[0.6875rem] text-muted-foreground leading-snug space-y-2">
          <p>Drag the picture to choose what stays in view. Arrow keys move it too.</p>
          <button type="button" onClick={() => update(CENTRED, { now: true })}
            disabled={!framingOf(frame)}
            className="text-xs px-2.5 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-40">
            <RotateCcw className="w-3 h-3" /> Centre it again
          </button>
        </div>
      </div>
      <SliderRow label="Zoom" value={zoomPct} fallback={100} min={ZOOM_MIN * 100} max={ZOOM_MAX * 100} step={5} unit="%"
        onChange={(v) => update({ ...frame, zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (Number(v) || 100) / 100)) })} />
      <SliderRow label="Across" hint="Which part stays in view, left to right" value={frame.x} fallback={50} min={0} max={100} unit="%"
        onChange={(v) => update({ ...frame, x: Math.max(0, Math.min(100, Number(v) || 0)) })} />
      <SliderRow label="Down" hint="Top to bottom" value={frame.y} fallback={50} min={0} max={100} unit="%"
        onChange={(v) => update({ ...frame, y: Math.max(0, Math.min(100, Number(v) || 0)) })} />
    </div>
  );
}
