import React, { useState, useRef, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';

export default function ColorPicker({ value, onChange, label }) {
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
      {label && <p className='text-xs text-muted-foreground mb-1'>{label}</p>}
      <div className='flex items-center gap-2'>
        <button
          onClick={() => setOpen(v => !v)}
          className='w-8 h-8 rounded-lg border-2 border-border hover:border-primary/50 transition-colors flex-shrink-0 shadow-sm'
          style={{ backgroundColor: hex }}
          title='Pick color'
        />
        <input
          value={hex}
          onChange={handleHexInput}
          placeholder='#6366f1'
          className='flex-1 h-8 px-2 rounded-md border border-border bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50'
          maxLength={7}
        />
      </div>
      {open && (
        <div className='absolute z-50 mt-2 p-3 bg-card border border-border rounded-xl shadow-xl'
          style={{ top: '100%', left: 0 }}>
          <HexColorPicker color={hex} onChange={handlePickerChange} />
          <input
            value={hex}
            onChange={handleHexInput}
            className='mt-2 w-full h-7 px-2 rounded border border-border bg-background text-xs font-mono text-center'
            maxLength={7}
          />
        </div>
      )}
    </div>
  );
}