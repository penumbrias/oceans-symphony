import React, { useState, useRef, useCallback } from "react";
import { HexColorPicker } from "react-colorful";
import { X } from "lucide-react";

export const PRESET_COLORS = [
  "#ff4d4d","#ff85a1","#ff1493","#c0392b",
  "#ff8c00","#ffd700","#f39c12","#ffe066",
  "#2ecc71","#00fa9a","#7fff00","#27ae60",
  "#00bfff","#4169e1","#9b59b6","#c39bd3",
  "#ffffff","#cccccc","#888888","#333333",
];
export const PRESET_HIGHLIGHTS = [
  "#ff4d4d60","#ff85a160","#ffd70080","#2ecc7160",
  "#00bfff60","#9b59b660","#ff8c0080","#ffffff30",
  "#ff149370","#7fff0060","#4169e160","#f39c1260",
  "#ffe066a0","#c0392b60","#27ae6060","#c39bd360",
];

export function ColorPickerModal({ mode, onApply, onClose }) {
  const isFg = mode === "fg";
  const [hex, setHex] = useState(isFg ? "#ff4d4d" : "#ffd70080");
  const presets = isFg ? PRESET_COLORS : PRESET_HIGHLIGHTS;
  const pickerColor = hex.length === 9 ? hex.slice(0, 7) : hex;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
      <div className="bg-background border-2 border-border rounded-xl p-5 space-y-4 max-w-xs mx-4 w-full shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{isFg ? "Text color" : "Highlight color"}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        {isFg && <HexColorPicker color={pickerColor} onChange={setHex} style={{ width: "100%" }} />}
        <div className="grid grid-cols-10 gap-1">
          {presets.map(c => (
            <button key={c} type="button" onClick={() => setHex(c)}
              className={`w-6 h-6 rounded-md border-2 hover:scale-110 transition-transform ${hex === c ? "border-primary" : "border-border/30"}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input type="text" value={hex} onChange={e => setHex(e.target.value)}
            className="flex-1 h-9 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
          <div className="w-9 h-9 rounded-lg border-2 border-border" style={{ backgroundColor: hex }} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium">Cancel</button>
          <button type="button" onClick={() => { onApply(hex); onClose(); }} className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Apply</button>
        </div>
      </div>
    </div>
  );
}

export function useTextareaInsert(ref, value, onChange) {
  return useCallback((before, after = "") => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      const cursor = start + before.length + selected.length + after.length;
      ta.setSelectionRange(
        selected ? start + before.length : cursor,
        selected ? start + before.length + selected.length : cursor
      );
    });
  }, [ref, value, onChange]);
}

export function MiniToolbar({ onInsert }) {
  const [colorModal, setColorModal] = useState(null);
  const savedSelection = useRef(null);
  const btn = (label, before, after, title) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={() => onInsert(before, after)}
      className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs font-bold">
      {label}
    </button>
  );
  const openColorModal = (mode) => {
    const ta = document.activeElement;
    if (ta && (ta.tagName === "TEXTAREA" || ta.tagName === "INPUT")) {
      savedSelection.current = { el: ta, start: ta.selectionStart, end: ta.selectionEnd };
    }
    setColorModal(mode);
  };
  const applyColor = (color) => {
    const s = savedSelection.current;
    if (s) { s.el.focus(); s.el.setSelectionRange(s.start, s.end); }
    if (colorModal === "fg") onInsert(`<span style="color:${color};">`, `</span>`);
    else onInsert(`<span style="background:${color};border-radius:3px;padding:0 2px;">`, `</span>`);
    savedSelection.current = null;
  };
  return (
    <>
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-t border-border/30 bg-muted/10 flex-wrap">
        {btn("B", "<strong>", "</strong>", "Bold")}
        {btn("I", "<em>", "</em>", "Italic")}
        {btn("S̶", "<s>", "</s>", "Strikethrough")}
        {btn("U", "<u>", "</u>", "Underline")}
        <div className="w-px h-4 bg-border/40 mx-0.5" />
        {btn("H1", "<h1>", "</h1>", "Heading 1")}
        {btn("H2", "<h2>", "</h2>", "Heading 2")}
        {btn("H3", "<h3>", "</h3>", "Heading 3")}
        <div className="w-px h-4 bg-border/40 mx-0.5" />
        {btn("🔗", '<a href="https://">', "</a>", "Link")}
        {btn("✎", '<span data-edit="true">', "</span>", "Make editable in Simple mode")}
        <div className="w-px h-4 bg-border/40 mx-0.5" />
        <button type="button" title="Text color" onMouseDown={e => e.preventDefault()} onClick={() => openColorModal("fg")}
          className="w-6 h-6 flex flex-col items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors gap-0">
          <span className="text-xs font-bold" style={{ lineHeight: 1 }}>A</span>
          <span className="w-4 h-0.5 rounded-full" style={{ background: "linear-gradient(90deg,#ff4d4d,#ffd700,#2ecc71,#00bfff,#9b59b6)" }} />
        </button>
        <button type="button" title="Highlight color" onMouseDown={e => e.preventDefault()} onClick={() => openColorModal("hl")}
          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
          <span className="text-xs font-bold px-0.5 rounded" style={{ background: "linear-gradient(90deg,#ff4d4d60,#ffd70060,#2ecc7160)", lineHeight: 1.6 }}>A</span>
        </button>
      </div>
      {colorModal && <ColorPickerModal mode={colorModal} onApply={applyColor} onClose={() => setColorModal(null)} />}
    </>
  );
}