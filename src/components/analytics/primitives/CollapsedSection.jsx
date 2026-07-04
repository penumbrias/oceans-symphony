import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// Collapsed housing for legacy analytics sections that survive inside the
// rebuilt tabs until their own rebuild phase. Collapsed by default so the
// new engine-driven cards lead the page.
export default function CollapsedSection({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 p-3.5 text-left">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-3.5 pt-0">{children}</div>}
    </div>
  );
}
