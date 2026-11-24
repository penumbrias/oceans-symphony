// A page's own tabs, shown as subtabs in the pixel look's document-tab
// row on a computer (next to the open page's tab) instead of a second strip
// inside the page. The page publishes its tabs here and keeps drawing its
// own strip for phones; CSS hides that strip where the subtabs show.
//
// publishSubtabs(owner, { label, items: [{ id, label }], value, onChange, onAdd? })
// returns a cleanup that clears the slot only if this owner still holds it.

import { useEffect, useState } from "react";

const EVENT = "os-page-subtabs";
let slot = null;

function emit() {
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* ignore */ }
}

export function publishSubtabs(owner, data) {
  slot = { owner, ...data };
  emit();
  return () => {
    if (slot && slot.owner === owner) { slot = null; emit(); }
  };
}

export function useSubtabs() {
  const [s, setS] = useState(slot);
  useEffect(() => {
    const on = () => setS(slot);
    on();
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return s;
}

// The pixel frame sets this while its document-tab row can show subtabs.
export const SUBTABS_ATTR = "data-px-subtabs";
