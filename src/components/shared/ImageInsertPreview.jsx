import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, Check } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// Shown between "the user picked/uploaded an image" and "the <img> lands in
// the content": a real preview plus a size choice, so inserting an image is
// never a blind paste of markup (owner request — especially the bulletin
// composer, whose plain textarea shows the raw tag). The insert emits the
// same <img> the call sites used to write, with a width baked in.
//
// Width model: percentage of the content's width. "Full" omits the width so
// the existing max-width:100% behaviour is unchanged.
const SIZES = [
  { id: 25, label: "Small" },
  { id: 50, label: "Medium" },
  { id: 75, label: "Large" },
  { id: 100, label: "Full" },
];

export default function ImageInsertPreview({ url, onInsert, onClose }) {
  const [pct, setPct] = useState(100);
  const resolved = useResolvedAvatarUrl(url);

  const insert = () => {
    const width = pct >= 100 ? "" : `width:${pct}%;`;
    onInsert(
      `<img src="${url}" alt="" style="${width}max-width:100%;height:auto;border-radius:8px;display:block;margin:6px 0;" />`
    );
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[220] p-3" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full sm:max-w-sm p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">Insert image</p>
          <button type="button" onClick={onClose} aria-label="Cancel image insert"
            className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {/* Preview at the chosen size, against the card background so the
            proportion reads the way it will in the content. */}
        <div className="rounded-xl border border-border/50 bg-muted/20 p-2 max-h-56 overflow-auto">
          {resolved ? (
            <img src={resolved} alt="Preview" style={{ width: `${pct}%`, maxWidth: "100%", height: "auto", borderRadius: 8, display: "block", margin: "0 auto" }} />
          ) : (
            <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">Loading preview…</div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {SIZES.map((s) => (
            <button key={s.id} type="button" onClick={() => setPct(s.id)}
              className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${pct === s.id ? "border-primary bg-primary/10 text-primary font-medium" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <input
          type="range" min={10} max={100} step={5} value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="w-full accent-primary"
          aria-label="Image width"
        />
        <p className="text-[0.6875rem] text-muted-foreground text-center -mt-1 tabular-nums">{pct}% of the content width</p>

        <button type="button" onClick={insert}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <Check className="w-3.5 h-3.5" /> Insert
        </button>
      </div>
    </div>,
    document.body
  );
}
