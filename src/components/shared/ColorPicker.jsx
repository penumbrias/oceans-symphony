import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { HexColorPicker } from 'react-colorful';

// compact: show ONLY the swatch in the row — the name, the hex field and any
// actions (Clear, "use the app colour") live inside the popover, which is
// what the user sees once they've opened it anyway. Lets a panel show four
// colours side by side instead of four labelled rows.
// `opacity` (optional) makes translucency a property of THIS colour rather
// than of the whole element — so a gradient stop can fade to nothing while
// the rest of the widget stays solid. Shape: { value, onChange }.
export default function ColorPicker({ value, onChange, label, compact = false, onClear, extraAction, opacity }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value || '#6366f1');
  const containerRef = useRef(null);
  const popRef = useRef(null);
  // Portaled + viewport-clamped: absolutely-positioned popovers were
  // getting clipped by scrolling sheet containers (the edit popup),
  // cutting the picker in half. Fixed positioning from the trigger rect
  // escapes any overflow, and the clamp keeps it fully on screen.
  //
  // EXCEPT inside a MODAL dialog (aria-modal): its focus trap treats the
  // body-portaled popover as "outside" and steals focus back the moment
  // the hex field is clicked — the tester's "can't type colour codes".
  // Modal dialogs don't scroll-clip the way the sheets do, so there the
  // popover renders inline (absolute) exactly as it did before v0.172.1.
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [inModal, setInModal] = useState(false);
  // Sized to the content (react-colorful is 200px + padding) but never
  // wider than the screen.
  const POP_W = 236;
  const popWidth = `min(${POP_W}px, calc(100vw - 16px))`;

  // Echo guard: dragging emits many onChange values whose (throttled,
  // async) persists come back through the `value` prop one by one — each
  // arrival used to snap the knob to a stale colour, so it "wiggled" for
  // a second after the finger lifted. While the user is the one editing,
  // local state is the truth; external changes still sync once idle.
  const lastEditAt = useRef(0);
  const markEdit = () => { lastEditAt.current = Date.now(); };
  useEffect(() => {
    if (Date.now() - lastEditAt.current < 1500) return;
    setHex(value || '#6366f1');
  }, [value]);

  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const modal = !!containerRef.current.closest('[role="dialog"][aria-modal="true"]');
    setInModal(modal);
    if (modal) return; // inline rendering needs no viewport math
    const r = containerRef.current.getBoundingClientRect();
    const W = POP_W, H = 340; // approximate popover size for clamping
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
    const below = r.bottom + 8;
    const top = below + H > window.innerHeight - 8 ? Math.max(8, r.top - H - 8) : below;
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleHexInput = (e) => {
    const v = e.target.value;
    markEdit();
    setHex(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
  };

  const handlePickerChange = (color) => {
    markEdit();
    setHex(color);
    onChange(color);
  };

  return (
    <div className='relative' ref={containerRef}>
      {label && !compact && <p className='text-xs text-muted-foreground mb-1'>{label}</p>}
      <div className={compact && label ? 'flex flex-col items-center gap-0.5' : 'flex items-center gap-2'}>
        <button
          type='button'
          onClick={() => setOpen(v => !v)}
          className='w-8 h-8 rounded-lg border-2 border-border hover:border-primary/50 transition-colors flex-shrink-0 shadow-sm'
          // The swatch shows the colour AT ITS OPACITY over a checkerboard,
          // so a 30% background reads as faded here exactly as it does on
          // the widget — a solid swatch over a translucent widget was the
          // "pickers don't match the preview" report.
          style={(() => {
            const raw = opacity ? opacity.value : null;
            const pct = raw != null && raw !== "" && Number.isFinite(Number(raw)) ? Math.max(0, Math.min(100, Number(raw))) : 100;
            if (pct >= 100) return { backgroundColor: hex };
            const mix = `color-mix(in srgb, ${hex} ${pct}%, transparent)`;
            const check = "linear-gradient(45deg, rgba(128,128,128,.35) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.35) 75%)";
            return {
              backgroundImage: `linear-gradient(${mix}, ${mix}), ${check}, ${check}`,
              backgroundSize: "auto, 8px 8px, 8px 8px",
              backgroundPosition: "0 0, 0 0, 4px 4px",
            };
          })()}
          title={label || 'Pick color'}
          aria-label={label || 'Pick colour'}
        />
        {/* Compact swatches carry a caption — a bare square forced opening
            the picker just to learn which colour it was (owner report). */}
        {compact && label && (
          <span className='text-[0.5625rem] leading-tight text-muted-foreground text-center max-w-[52px] truncate'>{label}</span>
        )}
        {!compact && (
          <input
            value={hex}
            onChange={handleHexInput}
            placeholder='#6366f1'
            className='flex-1 h-8 px-2 rounded-md border border-border bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50'
            maxLength={7}
          />
        )}
      </div>
      {open && (() => {
        const pop = (
          <div ref={popRef} data-color-picker-popover
            className={inModal
              ? 'absolute z-[90] mt-2 p-3 bg-card border border-border rounded-xl shadow-xl'
              : 'fixed z-[90] p-3 bg-card border border-border rounded-xl shadow-xl'}
            // touchAction none: the browser (and the page-swipe/scroll
            // machinery) must never contest a drag that starts in the
            // picker — contested drags stuttered and froze mid-slide.
            style={inModal
              ? { width: popWidth, left: 0, touchAction: "none" }
              : { top: pos.top, left: pos.left, width: popWidth, touchAction: "none" }}>
            {compact && label && (
              <p className='text-xs font-medium mb-2'>{label}</p>
            )}
            {/* react-colorful is 200px by default; stretch it to the popover
                so the layout reads as one designed panel, not a floating
                square with mismatched furniture. */}
            <HexColorPicker color={hex} onChange={handlePickerChange} style={{ width: '100%' }} />
            <input
              value={hex}
              onChange={handleHexInput}
              className='mt-2 w-full h-7 px-2 rounded border border-border bg-background text-xs font-mono text-center'
              maxLength={7}
            />
            {opacity && (
              <div className='mt-2'>
                <label className='text-[0.6875rem] text-muted-foreground flex items-center justify-between'>
                  Opacity <span className='tabular-nums'>{opacity.value ?? 100}%</span>
                </label>
                <input
                  type='range' min={0} max={100} step={5}
                  value={opacity.value ?? 100}
                  onChange={(e) => opacity.onChange(Number(e.target.value))}
                  className='w-full accent-primary'
                  aria-label={`${label || 'Colour'} opacity`}
                />
              </div>
            )}
            {(onClear || extraAction) && (
              // Wrap instead of squeezing: "Use the app colour" at a large
              // text scale was overflowing its pill when forced to share
              // one row with Clear.
              <div className='mt-2 flex flex-wrap items-center gap-1.5'>
                {extraAction && (
                  <button type='button' onClick={() => { extraAction.onClick(); setOpen(false); }}
                    className='flex-1 basis-24 text-xs px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground'>
                    {extraAction.label}
                  </button>
                )}
                {onClear && (
                  <button type='button' onClick={() => { onClear(); setOpen(false); }}
                    className='flex-1 basis-16 text-xs px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground'>
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        );
        return inModal ? pop : createPortal(pop, document.body);
      })()}
    </div>
  );
}