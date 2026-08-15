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
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => { setHex(value || '#6366f1'); }, [value]);

  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    const W = 232, H = 320; // approximate popover size for clamping
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
    setHex(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
  };

  const handlePickerChange = (color) => {
    setHex(color);
    onChange(color);
  };

  return (
    <div className='relative' ref={containerRef}>
      {label && !compact && <p className='text-xs text-muted-foreground mb-1'>{label}</p>}
      <div className='flex items-center gap-2'>
        <button
          type='button'
          onClick={() => setOpen(v => !v)}
          className='w-8 h-8 rounded-lg border-2 border-border hover:border-primary/50 transition-colors flex-shrink-0 shadow-sm'
          style={{ backgroundColor: hex }}
          title={label || 'Pick color'}
          aria-label={label || 'Pick colour'}
        />
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
      {open && createPortal(
        <div ref={popRef} data-color-picker-popover
          className='fixed z-[90] p-3 bg-card border border-border rounded-xl shadow-xl'
          style={{ top: pos.top, left: pos.left }}>
          {compact && label && (
            <p className='text-xs font-medium mb-2'>{label}</p>
          )}
          <HexColorPicker color={hex} onChange={handlePickerChange} />
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
            <div className='mt-2 flex items-center gap-1.5'>
              {extraAction && (
                <button type='button' onClick={() => { extraAction.onClick(); setOpen(false); }}
                  className='flex-1 text-xs px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground whitespace-nowrap'>
                  {extraAction.label}
                </button>
              )}
              {onClear && (
                <button type='button' onClick={() => { onClear(); setOpen(false); }}
                  className='flex-1 text-xs px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground'>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}