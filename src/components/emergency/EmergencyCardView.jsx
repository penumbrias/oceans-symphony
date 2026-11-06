// The emergency card itself (v0.368.0): big, plain, high-contrast text a
// helper can read at a glance, with one-tap calls to the emergency
// contacts. The /emergency page and the unlock screen (lock-screen copy)
// both draw it from the same section list (emergencyCard.js), so it looks
// the same wherever it opens.
//
// `fullScreen` covers the whole app (nothing else to tap by accident) and
// is closed with a labelled Close button. "Bigger text" makes it larger
// still for someone reading at arm's length.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Phone, X, ALargeSmall } from "lucide-react";

export default function EmergencyCardView({ sections = [], fullScreen = false, onClose = null, footer = null }) {
  const [big, setBig] = useState(false);
  // Escape closes the full-screen card (keyboard users).
  useEffect(() => {
    if (!fullScreen || !onClose) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullScreen, onClose]);
  const first = sections[0]?.id === "communication" ? sections[0] : null;
  const rest = first ? sections.slice(1) : sections;
  const body = (
    <div className={`mx-auto max-w-xl ${big ? "text-2xl" : "text-lg"} leading-snug`} data-tour="emergency-card">
      <div className="flex items-center gap-2 mb-3">
        <p className="flex-1 text-sm font-bold uppercase tracking-widest text-foreground">Emergency information</p>
        <button type="button" onClick={() => setBig((v) => !v)} aria-pressed={big}
          className="inline-flex items-center gap-1.5 h-11 px-3 rounded-lg border border-border text-sm">
          <ALargeSmall className="w-4 h-4" /> {big ? "Smaller text" : "Bigger text"}
        </button>
        {onClose && (
          <button type="button" onClick={onClose}
            className="inline-flex items-center gap-1.5 h-11 px-3 rounded-lg border border-border text-sm">
            <X className="w-4 h-4" /> Close
          </button>
        )}
      </div>
      {first && (
        <div className="rounded-xl border-2 border-foreground p-4 mb-4">
          {first.lines.map((l, i) => <p key={i} className={`font-semibold whitespace-pre-wrap ${big ? "text-3xl" : "text-2xl"}`}>{l}</p>)}
        </div>
      )}
      {rest.map((s) => (
        <section key={s.id} className="py-3 border-b border-border last:border-b-0">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground mb-1">{s.label}</h2>
          {s.lines.map((l, i) => <p key={i} className="whitespace-pre-wrap text-foreground">{l}</p>)}
          {(s.contacts || []).map((c, i) => {
            const tel = c.phone ? c.phone.replace(/[^\d+]/g, "") : "";
            return (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{c.name}</p>
                  {(c.relation || c.phone) && <p className="text-base text-muted-foreground">{[c.relation, c.phone].filter(Boolean).join(" · ")}</p>}
                </div>
                {tel && (
                  <a href={`tel:${tel}`} className="inline-flex items-center gap-2 h-12 px-4 rounded-xl bg-primary text-primary-foreground text-base font-semibold flex-shrink-0">
                    <Phone className="w-5 h-5" /> Call
                  </a>
                )}
              </div>
            );
          })}
        </section>
      ))}
      {footer}
    </div>
  );
  if (!fullScreen) return body;
  // Portalled to <body> above everything (header, bottom bar, floating
  // buttons) so nothing else can be tapped by accident.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Emergency information"
      className="fixed inset-0 bg-background overflow-y-auto overscroll-contain px-4"
      style={{ zIndex: 2147483000, paddingTop: "calc(1rem + var(--os-sat, 0px))", paddingBottom: "calc(1.5rem + var(--os-sab, 0px))" }}>
      {body}
    </div>,
    document.body,
  );
}
