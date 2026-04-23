import React, { useState, useRef, useCallback, useEffect } from "react";
import { HexColorPicker } from "react-colorful";
import { X, ChevronDown } from "lucide-react";
import InternalLinkPicker, { buildInternalLinkHTML } from "@/components/shared/InternalLinkPicker";

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

const FONTS = [
  { label: "Default", value: "inherit" },
  // Sans-serif
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Poppins", value: "Poppins, sans-serif" },
  { label: "Nunito", value: "Nunito, sans-serif" },
  { label: "Raleway", value: "Raleway, sans-serif" },
  // Serif
  { label: "Playfair", value: "Playfair Display, serif" },
  { label: "Lora", value: "Lora, serif" },
  { label: "Merriweather", value: "Merriweather, serif" },
  // Monospace
  { label: "Fira Code", value: "Fira Code, monospace" },
  { label: "Space Mono", value: "Space Mono, monospace" },
  // Handwriting
  { label: "Caveat", value: "Caveat, cursive" },
  { label: "Dancing Script", value: "Dancing Script, cursive" },
  { label: "Pacifico", value: "Pacifico, cursive" },
  { label: "Satisfy", value: "Satisfy, cursive" },
  // Display/Decorative
  { label: "Righteous", value: "Righteous, cursive" },
  { label: "Lobster", value: "Lobster, cursive" },
  { label: "Bungee", value: "Bungee, display" },
  { label: "Orbitron", value: "Orbitron, sans-serif" },
  { label: "Press Start 2P", value: "'Press Start 2P', cursive" },
  { label: "VT323", value: "VT323, monospace" },
  // Cultural/Diverse
  { label: "Noto Sans", value: "Noto Sans, sans-serif" },
  { label: "Noto Serif", value: "Noto Serif, serif" },
  { label: "Sawarabi Mincho", value: "Sawarabi Mincho, serif" },
  { label: "Nanum Gothic", value: "Nanum Gothic, sans-serif" },
  { label: "Amiri", value: "Amiri, serif" },
  { label: "Tajawal", value: "Tajawal, sans-serif" },
];

// Inject Google Fonts
const GOOGLE_FONTS_URL = "https://fonts.googleapis.com/css2?family=Poppins&family=Nunito&family=Raleway&family=Playfair+Display&family=Lora&family=Merriweather&family=Fira+Code&family=Space+Mono&family=Caveat&family=Dancing+Script&family=Pacifico&family=Satisfy&family=Righteous&family=Lobster&family=Bungee&family=Orbitron&family=Press+Start+2P&family=VT323&family=Noto+Sans&family=Noto+Serif&family=Sawarabi+Mincho&family=Nanum+Gothic&family=Amiri&family=Tajawal&display=swap";

if (typeof document !== "undefined" && !document.getElementById("os-google-fonts")) {
  const link = document.createElement("link");
  link.id = "os-google-fonts";
  link.rel = "stylesheet";
  link.href = GOOGLE_FONTS_URL;
  document.head.appendChild(link);
}

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

export function MiniToolbar({ onInsert, onInsertLink }) {
  const [colorModal, setColorModal] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(() => {
    try { return localStorage.getItem("os_toolbar_advanced") === "true"; } catch { return false; }
  });
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const savedSelection = useRef(null);

  const toggleAdvanced = () => {
    const next = !showAdvanced;
    setShowAdvanced(next);
    try { localStorage.setItem("os_toolbar_advanced", String(next)); } catch {}
  };

  const btn = (label, before, after, title) => (
    <button type="button" title={title}
      onMouseDown={e => e.preventDefault()}
      onClick={() => onInsert(before, after)}
      className="h-6 px-1 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs font-bold flex-shrink-0">
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

  const applyFont = (fontValue) => {
    onInsert(`<span style="font-family:${fontValue};">`, `</span>`);
    setShowFontPicker(false);
  };

  const sep = <div className="w-px h-4 bg-border/40 mx-0.5 flex-shrink-0" />;

  return (
    <>
      {/* Simple toolbar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-t border-border/30 bg-muted/10 flex-wrap">
        {btn("B", "<strong>", "</strong>", "Bold")}
        {btn("I", "<em>", "</em>", "Italic")}
        {btn("S̶", "<s>", "</s>", "Strikethrough")}
        {btn("U", "<u>", "</u>", "Underline")}
        {sep}
        {btn("H1", "<h1>", "</h1>", "Heading 1")}
        {btn("H2", "<h2>", "</h2>", "Heading 2")}
        {btn("H3", "<h3>", "</h3>", "Heading 3")}
        {sep}
        {btn("↵", "<br />", "", "Line break")}
        {btn("—", '<hr style="border:none;border-top:1px solid hsl(var(--border));margin:12px 0;" />', "", "Divider")}
        {sep}
        {btn("🔗", '<a href="https://">', "</a>", "Link")}
        <button type="button" title="Insert internal link"
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            const ta = document.activeElement;
            if (ta && (ta.tagName === "TEXTAREA" || ta.tagName === "INPUT")) {
              savedSelection.current = { el: ta, start: ta.selectionStart, end: ta.selectionEnd };
            }
            setShowLinkPicker(true);
          }}
          className="h-6 px-1 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs font-bold flex-shrink-0">
          🧩
        </button>
        {btn("✎", '<span data-edit="true">', "</span>", "Make editable in Simple mode")}
        {sep}
        {/* Text color */}
        <button type="button" title="Text color" onMouseDown={e => e.preventDefault()} onClick={() => openColorModal("fg")}
          className="w-6 h-6 flex flex-col items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors gap-0 flex-shrink-0">
          <span className="text-xs font-bold" style={{ lineHeight: 1 }}>A</span>
          <span className="w-4 h-0.5 rounded-full" style={{ background: "linear-gradient(90deg,#ff4d4d,#ffd700,#2ecc71,#00bfff,#9b59b6)" }} />
        </button>
        {/* Highlight */}
        <button type="button" title="Highlight color" onMouseDown={e => e.preventDefault()} onClick={() => openColorModal("hl")}
          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0">
          <span className="text-xs font-bold px-0.5 rounded" style={{ background: "linear-gradient(90deg,#ff4d4d60,#ffd70060,#2ecc7160)", lineHeight: 1.6 }}>A</span>
        </button>
        {sep}
        {/* Advanced toggle */}
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={toggleAdvanced}
          className={`h-6 px-1.5 flex items-center gap-0.5 rounded text-xs font-medium transition-colors flex-shrink-0 ${showAdvanced ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}>
          {showAdvanced ? "▲" : "▼"} More
        </button>
      </div>

      {/* Advanced toolbar */}
      {showAdvanced && (
        <div className="flex items-center gap-0.5 px-1.5 py-1 border-t border-border/20 bg-muted/5 flex-wrap">
          {/* Alignment */}
          {btn("◀", '<div style="text-align:left;">', "</div>", "Align left")}
          {btn("■", '<div style="text-align:center;">', "</div>", "Align center")}
          {btn("▶", '<div style="text-align:right;">', "</div>", "Align right")}
          {sep}
          {/* Size */}
          {btn("xs", '<span style="font-size:0.7em;">', "</span>", "Extra small")}
          {btn("sm", '<span style="font-size:0.85em;">', "</span>", "Small")}
          {btn("lg", '<span style="font-size:1.3em;">', "</span>", "Large")}
          {btn("xl", '<span style="font-size:1.8em;font-weight:bold;">', "</span>", "Extra large")}
          {sep}
          {/* Super/sub */}
          {btn("X²", "<sup>", "</sup>", "Superscript")}
          {btn("X₂", "<sub>", "</sub>", "Subscript")}
          {sep}
          {/* Block */}
          {btn("❝", '<blockquote style="border-left:3px solid hsl(var(--primary));margin:4px 0;padding:4px 12px;color:hsl(var(--muted-foreground));">', "</blockquote>", "Blockquote")}
          {btn("</>", '<code style="background:hsl(var(--muted));padding:1px 6px;border-radius:4px;font-family:monospace;font-size:0.9em;">', "</code>", "Inline code")}
          {sep}
          {/* Styling */}
          {btn("✨", '<span style="background:linear-gradient(90deg,#ff6ec7,#ffe680,#6effc8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">', "</span>", "Rainbow gradient text")}
          {btn("🌊", '<span style="background:linear-gradient(90deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">', "</span>", "Ocean gradient text")}
          {btn("🔥", '<span style="background:linear-gradient(90deg,#ff4d00,#ff9900,#ffee00);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">', "</span>", "Fire gradient text")}
          {btn("🌿", '<span style="background:linear-gradient(90deg,#00c853,#64dd17,#b2ff59);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">', "</span>", "Nature gradient text")}
          {sep}
          {btn("🔲", '<div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:12px;">', "</div>", "Dark box")}
          {btn("💠", '<div style="border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:12px;background:rgba(255,255,255,0.05);backdrop-filter:blur(10px);">', "</div>", "Glass box")}
          {btn("🟣", '<div style="background:linear-gradient(135deg,#1a0a2e,#2d1b4e);border-radius:12px;padding:16px;border:1px solid rgba(147,51,234,0.3);">', "</div>", "Purple dark box")}
          {btn("🌑", '<div style="background:radial-gradient(ellipse at top,#1a0533,#000);border-radius:16px;padding:20px;">', "</div>", "Dark radial box")}
          {sep}
          {/* Effects */}
          {btn("⚡", '<span style="animation:float 3s ease-in-out infinite;display:inline-block;">', "</span>", "Float animation")}
          {btn("💥", '<span style="text-shadow:0 0 10px currentColor;">', "</span>", "Glow")}
          {btn("🌀", '<span style="display:inline-block;animation:spin 3s linear infinite;">', "</span>", "Spin")}
          {btn("〰", '<span style="display:inline-block;animation:wave 1s ease-in-out infinite alternate;transform-origin:bottom;">', "</span>", "Wave")}
          {btn("👻", '<span style="opacity:0.6;">', "</span>", "Faded/ghost")}
          {btn("📦", '<span style="border:1px solid currentColor;border-radius:4px;padding:1px 6px;">', "</span>", "Boxed text")}
          {btn("blur", '<span style="filter:blur(3px);">', "</span>", "Blur")}
          {btn("rot", '<span style="display:inline-block;transform:rotate(-5deg);">', "</span>", "Slight rotation")}
          {sep}
          {/* Font picker */}
          <div className="relative flex-shrink-0">
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowFontPicker(f => !f)}
              className="h-6 px-1.5 flex items-center gap-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
              Aa <ChevronDown className="w-2.5 h-2.5" />
            </button>
            {showFontPicker && (
              <div className="absolute bottom-full left-0 mb-1 w-48 bg-background border-2 border-border rounded-xl shadow-2xl overflow-hidden z-[70]">
                <div className="max-h-64 overflow-y-auto p-1 space-y-0.5">
                  {FONTS.map(f => (
                    <button key={f.value} type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => applyFont(f.value)}
                      className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                      style={{ fontFamily: f.value }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {colorModal && <ColorPickerModal mode={colorModal} onApply={applyColor} onClose={() => setColorModal(null)} />}
      {showLinkPicker && (
        <InternalLinkPicker
          onSelect={(html) => {
            const s = savedSelection.current;
            if (s) { s.el.focus(); s.el.setSelectionRange(s.start, s.end); }
            onInsert(html, "");
            savedSelection.current = null;
            setShowLinkPicker(false);
          }}
          onClose={() => { savedSelection.current = null; setShowLinkPicker(false); }}
        />
      )}
    </>
  );
}