import React, { useState, useEffect } from "react";
import { normalizeHex } from "@/lib/hexColor";

// Colour swatch (native picker) + hex text box. `value` is "" (= use the
// category colour) or a valid "#rrggbb". onChange always gets "" or a
// valid hex, so callers never store garbage.
export default function EmotionColorField({ value = "", onChange, compact = false }) {
  const [text, setText] = useState(value || "");
  useEffect(() => { setText(value || ""); }, [value]);

  const commit = (raw) => {
    setText(raw);
    if (!raw.trim()) { onChange?.(""); return; }
    const hex = normalizeHex(raw);
    if (hex) onChange?.(hex);
  };

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <input
        type="color"
        value={value || "#8b5cf6"}
        onChange={(e) => { setText(e.target.value); onChange?.(e.target.value.toLowerCase()); }}
        aria-label="Emotion colour"
        className={`${compact ? "w-6 h-6" : "w-7 h-7"} rounded-md border border-border/50 bg-transparent p-0 cursor-pointer`}
      />
      <input
        type="text"
        value={text}
        onChange={(e) => commit(e.target.value)}
        placeholder="#hex"
        maxLength={7}
        aria-label="Emotion colour hex code"
        className={`${compact ? "h-6 w-[4.5rem]" : "h-7 w-20"} rounded-md bg-muted border border-border/50 text-[0.6875rem] px-1.5 focus:outline-none focus:ring-1 focus:ring-primary ${
          text && !normalizeHex(text) ? "border-destructive" : ""
        }`}
      />
      {value && (
        <button type="button" onClick={() => { setText(""); onChange?.(""); }}
          aria-label="Reset to category colour"
          className="text-[0.625rem] text-muted-foreground hover:text-foreground">reset</button>
      )}
    </div>
  );
}
