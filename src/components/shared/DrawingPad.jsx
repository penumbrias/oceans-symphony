import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Undo2, Redo2, Trash2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Row, SliderRow, ColourRow, Segmented } from "@/components/shared/SettingRows";
import { saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { paintStrokes, renderDrawing, drawingHtml, hasInk } from "@/lib/inkDrawing";
import { useEdgeSafeSliders } from "@/lib/gestureExclusion";

// The drawing pad behind the mini toolbar's brush button (v0.332.0): a
// quick place to draw instead of type — for anyone who'd rather not use
// words. Two modes:
//   Ink      black & white; goes into the text like a word, in the text's
//            own colour.
//   Picture  colours and paper; goes in as a picture.
// Strokes live in memory until Insert, then save to the local picture store
// like an uploaded image. Nothing closes it by accident: no tap-outside, and
// the × asks before throwing a drawing away.
//
// A stylus (S Pen etc.) draws with pressure, and once one is used the pad
// ignores the palm resting on the screen.

const MODES = [
  { value: "ink", label: "Ink" },
  { value: "picture", label: "Picture" },
];
const TOOLS = [
  { value: "pen", label: "Pen" },
  { value: "eraser", label: "Eraser" },
];
const MODE_HINT = {
  ink: "Black and white. Sits in your text like writing.",
  picture: "Colours and paper. Goes in as a picture.",
};

export default function DrawingPad({ onInsert, onClose }) {
  const [mode, setMode] = useState("ink");
  const [tool, setTool] = useState("pen");
  const [size, setSize] = useState(3);
  const [colour, setColour] = useState("#4169e1");
  const [paper, setPaper] = useState("#ffffff");
  // History: `strokes` is the page now; `past`/`future` are whole pages,
  // so Clear is undoable like any stroke.
  const [strokes, setStrokes] = useState([]);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);

  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const live = useRef(null);       // the stroke being drawn
  const activeId = useRef(null);   // the one pointer drawing it
  const penSeen = useRef(false);   // palm rejection once a stylus is used
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  useEdgeSafeSliders(true, [mode]);

  const commit = useCallback((next) => {
    setPast((p) => [...p, strokes].slice(-100));
    setFuture([]);
    setStrokes(next);
  }, [strokes]);

  const inkColour = () => (wrapRef.current ? getComputedStyle(wrapRef.current).color : "#000");

  // Paint the whole page. Ink mode shows strokes in the text colour so the
  // pad looks like the post will.
  const redraw = useCallback((list = strokes) => {
    const c = canvasRef.current;
    if (!c) return;
    const { dpr } = sizeRef.current;
    const ctx = c.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    paintStrokes(ctx, list, { inkColor: mode === "ink" ? inkColour() : null, scale: dpr });
  }, [strokes, mode]);

  const redrawRef = useRef(redraw);
  redrawRef.current = redraw;

  // Keep the canvas sharp at the screen's pixel density and its size.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const c = canvasRef.current;
    if (!wrap || !c) return undefined;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      sizeRef.current = { w: r.width, h: r.height, dpr };
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      redrawRef.current();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { redraw(); }, [redraw]);

  const pointFrom = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const p = e.pointerType === "pen" ? e.pressure : null;
    return { x: e.clientX - r.left, y: e.clientY - r.top, p };
  };

  // Draw just the newest segment while the pointer moves — a full redraw
  // per move would lag on long drawings.
  const paintTail = (stroke, from) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const pts = stroke.points.slice(Math.max(0, from - 1));
    paintStrokes(ctx, [{ ...stroke, points: pts }], { inkColor: mode === "ink" ? inkColour() : null, scale: sizeRef.current.dpr });
  };

  const onPointerDown = (e) => {
    if (e.pointerType === "pen") penSeen.current = true;
    else if (e.pointerType === "touch" && penSeen.current) return; // resting palm
    if (activeId.current != null) return;
    e.preventDefault();
    activeId.current = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    live.current = {
      tool,
      color: mode === "picture" ? colour : null,
      size,
      points: [pointFrom(e)],
    };
    paintTail(live.current, 0);
  };

  const onPointerMove = (e) => {
    if (e.pointerId !== activeId.current || !live.current) return;
    e.preventDefault();
    const from = live.current.points.length;
    const evs = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    for (const ev of (evs.length ? evs : [e])) live.current.points.push(pointFrom(ev));
    paintTail(live.current, from);
  };

  const onPointerUp = (e) => {
    if (e.pointerId !== activeId.current) return;
    activeId.current = null;
    const stroke = live.current;
    live.current = null;
    if (stroke && stroke.points.length) commit([...strokes, stroke]);
  };

  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [strokes, ...f]);
    setStrokes(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, strokes]);
    setStrokes(future[0]);
    setFuture((f) => f.slice(1));
  };
  const clear = () => { if (strokes.length) commit([]); };

  const drawn = hasInk(strokes);

  const close = () => {
    if (drawn && !confirmDiscard) { setConfirmDiscard(true); return; }
    onClose();
  };

  const insert = async () => {
    if (!drawn || saving) return;
    setSaving(true);
    try {
      const out = renderDrawing(strokes, { mode, paper: mode === "picture" ? paper : null });
      if (!out) throw new Error("Nothing to insert yet.");
      const blob = await new Promise((res, rej) => out.canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't save the drawing."))), "image/png"));
      const id = `drawing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await saveLocalImage(id, blob, "image/png");
      onInsert(drawingHtml(createLocalImageUrl(id), { mode, w: out.w, h: out.h }));
      onClose();
    } catch (err) {
      // Keep the pad open with the drawing on it, so nothing is lost.
      toast.error(err?.message || "Couldn't save the drawing. It's still here, try again.");
      setSaving(false);
    }
  };

  const iconBtn = "h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40";

  return createPortal(
    // ui-ok: a full-screen drawing page, not a sheet over something it edits
    <div role="dialog" aria-modal="true" aria-label="Draw"
      className="drawing-pad fixed inset-0 z-[225] bg-black/50 flex items-stretch sm:items-center justify-center">
      <div className="bg-background w-full sm:max-w-2xl sm:h-[92vh] sm:rounded-2xl sm:border sm:border-border flex flex-col overflow-hidden"
        style={{ paddingTop: "var(--os-sat, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {/* Header: close, title, history, Insert. */}
        <div className="flex items-center gap-1 px-2 h-14 border-b border-border/50 flex-shrink-0">
          <button type="button" onClick={close} aria-label="Close the drawing pad" className={iconBtn}>
            <X className="w-5 h-5" />
          </button>
          <h2 className="font-semibold text-sm flex-1 min-w-0 truncate pl-1">Draw</h2>
          <button type="button" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo" className={iconBtn}>
            <Undo2 className="w-4 h-4" />
          </button>
          <button type="button" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo" className={iconBtn}>
            <Redo2 className="w-4 h-4" />
          </button>
          <button type="button" onClick={clear} disabled={!strokes.length} aria-label="Clear the page" title="Clear the page" className={iconBtn}>
            <Trash2 className="w-4 h-4" />
          </button>
          <button type="button" onClick={insert} disabled={!drawn || saving}
            className="ml-1 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Insert
          </button>
        </div>

        {confirmDiscard && (
          <div role="alert" className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/40 flex-shrink-0">
            <p className="text-sm flex-1 min-w-0">Throw this drawing away?</p>
            <button type="button" onClick={() => setConfirmDiscard(false)}
              className="h-9 px-3 rounded-lg border border-border/60 text-sm">Keep drawing</button>
            <button type="button" onClick={onClose}
              className="h-9 px-3 rounded-lg bg-destructive text-destructive-foreground text-sm">Discard</button>
          </div>
        )}

        {/* Tools. The colour pop-up opens downward over the page. */}
        <div className="px-4 pt-2 flex-shrink-0">
          <Segmented label="Kind of drawing" options={MODES} value={mode} onChange={setMode} />
          <p className="text-[0.6875rem] text-muted-foreground text-center mt-1">{MODE_HINT[mode]}</p>
          <Row label="Tool">
            <Segmented label="Tool" options={TOOLS} value={tool} onChange={setTool} equal={false} />
          </Row>
          <SliderRow label="Line size" value={size} min={1} max={40} unit="px" onChange={(v) => setSize(Math.max(1, Math.min(40, Number(v) || 1)))} />
          {mode === "picture" && (
            <>
              <ColourRow label="Colour" value={colour} onChange={setColour} />
              <ColourRow label="Paper" value={paper} onChange={setPaper} />
            </>
          )}
        </div>

        {/* The page. touch-action none so a drag draws instead of scrolling;
            data-no-panic-taps so dotting quickly can't raise the privacy
            cover; data-no-swipe-back / data-edge-safe keep the back gesture
            off strokes that start at the edge. */}
        <div className="flex-1 min-h-0 p-3">
          <div ref={wrapRef}
            data-no-panic-taps="" data-no-swipe-back="" data-edge-safe=""
            className="relative w-full h-full rounded-xl border border-border/60 overflow-hidden text-foreground"
            style={{ background: mode === "picture" ? paper : "hsl(var(--muted) / 0.25)" }}>
            <canvas ref={canvasRef}
              aria-label="Drawing page"
              className="absolute inset-0 block"
              style={{ touchAction: "none", cursor: tool === "eraser" ? "cell" : "crosshair" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onContextMenu={(e) => e.preventDefault()} />
            {!strokes.length && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none select-none px-6 text-center">
                Draw here with a finger or a pen.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
