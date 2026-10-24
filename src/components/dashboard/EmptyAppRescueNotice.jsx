// "Expected your data to be here?" — the rescue path, on the home screen.
//
// After a storage wipe the app can look brand new. Every recovery tool
// (Find my data, the orphan scanner) only helps if the person finds it,
// and someone staring at an empty home screen is not going to dig through
// Settings → Data & privacy. So whenever the active data holds no alters
// at all, this small row offers Find my data right there. It disappears
// the moment there's data.
//
// Someone who simply doesn't add any can hide it (v0.277.1). The hide only
// holds while this device has never seen data here: the moment any
// appear, it's cleared, so a later wipe always brings the row back.
//
// Renders on the classic dashboard AND the v2 notice stack from this one
// component (same pattern as BackupHealthNotice).

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeartHandshake, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import DataRescuePanel from "@/components/settings/DataRescuePanel";

const HIDE_KEY = "symphony_empty_rescue_hidden_v1";
const readHidden = () => { try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } };
const HIDE_EVENT = "symphony-empty-rescue-hidden";

// True once the alters list has loaded and is empty (and the row wasn't
// hidden). Shared with V2Notices so it can reserve a slot in its stack.
// Reuses the ["alters"] cache.
export function useEmptyApp() {
  const { data: alters, isFetched } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const [hidden, setHidden] = useState(readHidden);
  const hasData = isFetched && (alters || []).length > 0;
  useEffect(() => {
    if (hasData && readHidden()) {
      try { localStorage.removeItem(HIDE_KEY); } catch { /* fine */ }
      setHidden(false);
    }
  }, [hasData]);
  useEffect(() => {
    const on = () => setHidden(readHidden());
    window.addEventListener(HIDE_EVENT, on);
    return () => window.removeEventListener(HIDE_EVENT, on);
  }, []);
  return isFetched && (alters || []).length === 0 && !hidden;
}

function hideRescue() {
  try { localStorage.setItem(HIDE_KEY, "1"); } catch { /* fine */ }
  window.dispatchEvent(new Event(HIDE_EVENT));
}

// `variant`: "v2" (transparent, notice look) | "classic"
export default function EmptyAppRescueNotice({ variant = "classic", className = "" }) {
  const terms = useTerms();
  const empty = useEmptyApp();
  const [open, setOpen] = useState(false);
  if (!empty) return null;

  const shell = variant === "v2"
    ? "w-full bg-background/80 backdrop-blur-md px-3 py-2 flex items-center gap-2"
    : "w-full rounded-xl border px-3 py-2 flex items-center gap-2 bg-card/60";
  const style = variant === "v2"
    ? { borderRadius: "var(--v2-radius, 12px)", borderWidth: "var(--v2-border-w, 1px)", borderStyle: "solid", borderColor: "rgb(16 185 129)", borderLeftWidth: 3 }
    : { borderColor: "rgb(16 185 129 / 0.5)", borderLeftWidth: 3, borderLeftColor: "rgb(16 185 129)" };

  return (
    <>
      <div className={`${shell} ${className}`} style={style} role="status">
        <HeartHandshake className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <p className="flex-1 min-w-0 text-xs text-muted-foreground">
          No {terms.alters} here. Expected your data to be?
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs px-2.5 py-1 rounded-full border border-emerald-500/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 whitespace-nowrap"
        >
          Find my data
        </button>
        <button
          type="button"
          onClick={hideRescue}
          aria-label="Hide this until there's data here"
          title="Hide this until there's data here"
          className="w-7 h-7 -mr-1 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && <DataRescuePanel onClose={() => setOpen(false)} />}
    </>
  );
}
