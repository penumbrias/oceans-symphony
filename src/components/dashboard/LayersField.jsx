// A widget option: which layers a widget draws (the Timeline widget's
// "Layers", mockup "Phone: timeline widget options"). One row per layer —
// the eye, its colour, its name and where its records come from. Saves the
// ids switched OFF, so anything new shows by default.

import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { applyTerms } from "@/lib/dailyTaskSystem";
import "@/styles/pixel/planner.css";

export default function LayersField({ label, options = [], value, onChange, terms }) {
  const hidden = Array.isArray(value) ? value : [];
  const toggle = (id) => onChange(hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]);
  return (
    <div role="group" aria-label={label} className="pxl-layers rounded-lg border border-border/50 divide-y divide-border/30 overflow-hidden">
      {options.map((o) => {
        const on = !hidden.includes(o.value);
        const name = applyTerms(String(o.label), terms);
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => toggle(o.value)}
            className={`pxl-layer w-full flex items-center gap-2.5 px-3 min-h-[40px] text-left text-sm ${on ? "" : "text-muted-foreground"}`}>
            <span className="pxl-eye w-4 flex-shrink-0" aria-hidden>
              {on ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </span>
            <span className="pxl-sq w-3 h-3 rounded-sm flex-shrink-0" style={{ background: o.color, opacity: on ? 1 : 0.45 }} />
            <span className="flex-1 min-w-0 truncate">{name}</span>
            {o.source && <span className="pxl-src text-xs text-muted-foreground flex-shrink-0">{o.source}</span>}
          </button>
        );
      })}
    </div>
  );
}
