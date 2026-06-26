import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown, Check, Settings2 } from "lucide-react";
import { fetchActiveContactRelationshipTypes } from "@/lib/contacts";
import ContactRelationshipTypesModal from "./ContactRelationshipTypesModal";

// Free-entry relationship-type picker for contacts: a real text input (type
// anything) PLUS a dropdown of suggestions from the editable contact
// relationship-type catalogue, and a "Manage types" shortcut. The stored value
// is whatever the input holds — a picked suggestion or a typed-in custom one.
export default function ContactRelationshipTypeField({ value, onChange, placeholder = "e.g. Friend, Family, Therapist…" }) {
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 260 });

  const { data: types = [] } = useQuery({
    queryKey: ["contactRelationshipTypes"],
    queryFn: () => fetchActiveContactRelationshipTypes(base44.entities),
  });

  useLayoutEffect(() => {
    if (!open) return undefined;
    const compute = () => {
      const node = wrapRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: Math.round(r.width) });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open]);

  // Close on outside click (the input is the trigger, so we keep it open while
  // typing and only close when the click lands outside both wrap and panel).
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const q = (value || "").trim().toLowerCase();
  const suggestions = types.filter((t) => !q || (t.label || "").toLowerCase().includes(q));
  const exact = types.some((t) => (t.label || "").toLowerCase() === q);

  const pick = (label) => { onChange(label); setOpen(false); };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-1 rounded-md border border-input bg-background px-2.5 h-9">
        <input
          value={value || ""}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm min-w-0 placeholder:text-muted-foreground"
        />
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-muted-foreground flex-shrink-0">
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && createPortal(
        <div
          ref={panelRef}
          className="bg-popover border border-border rounded-xl shadow-xl overflow-hidden flex flex-col"
          style={{ position: "fixed", zIndex: 70, top: pos.top, left: pos.left, width: pos.width, maxWidth: "calc(100vw - 16px)", maxHeight: 280 }}
        >
          <div className="overflow-y-auto overscroll-contain flex-1" style={{ WebkitOverflowScrolling: "touch" }}>
            {value && value.trim() && !exact && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(value.trim()); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center gap-2 border-b border-border/40"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                <span className="flex-1 truncate">Use “{value.trim()}”</span>
              </button>
            )}
            {suggestions.map((t) => (
              <button
                key={t.id ?? t.label}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(t.label); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center gap-2"
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || "#94a3b8" }} />
                <span className="flex-1 truncate">{t.label}</span>
                {(value || "").trim().toLowerCase() === (t.label || "").toLowerCase() && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
              </button>
            ))}
            {suggestions.length === 0 && !value?.trim() && (
              <p className="px-3 py-3 text-xs text-muted-foreground">No types yet — type your own or add some.</p>
            )}
          </div>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setOpen(false); setManageOpen(true); }}
            className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 border-t border-border/50 flex items-center gap-1.5 flex-shrink-0"
          >
            <Settings2 className="w-3.5 h-3.5" /> Manage relationship types…
          </button>
        </div>,
        document.body
      )}

      <ContactRelationshipTypesModal open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}
