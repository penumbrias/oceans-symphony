import React, { useState, useRef, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';

// compact: show ONLY the swatch in the row — the name, the hex field and any
// actions (Clear, "use the app colour") live inside the popover, which is
// what the user sees once they've opened it anyway. Lets a panel show four
// colours side by side instead of four labelled rows.
export default function ColorPicker({ value, onChange, label, compact = false, onClear, extraAction }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value || '#6366f1');
  const containerRef = useRef(null);

  useEffect(() => { setHex(value || '#6366f1'); }, [value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
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
      {open && (
        <div className='absolute z-50 mt-2 p-3 bg-card border border-border rounded-xl shadow-xl'
          style={{ top: '100%', left: 0 }}>
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
        </div>
      )}
    </div>
  );
}