import { useEffect, useState } from "react";

// Anonymize / screenshot-mode toggle. Three states:
//   "off"   — show names + avatars normally
//   "names" — blur names + pronouns + roles, keep avatars
//   "all"   — blur names AND avatars
//
// State lives in localStorage so the toggle on the Alters page applies
// system-wide — including the Dashboard's Currently Fronting widget —
// without needing a global context or a prop drill through unrelated
// surfaces. A storage-event listener keeps multiple open tabs in sync
// and also lets components that change the mode (AlterGrid) re-render
// any other component on the same page that's reading it.

const STORAGE_KEY = "symphony_anonymize_mode";
const VALID = new Set(["off", "names", "all"]);
const NEXT = { off: "names", names: "all", all: "off" };

function read() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID.has(v) ? v : "off";
  } catch {
    return "off";
  }
}

export default function useAnonymizeMode() {
  const [mode, setMode] = useState(read);

  useEffect(() => {
    // Cross-tab sync via the standard storage event. Also fired by our
    // own dispatch below so multiple in-page subscribers stay in lockstep.
    const onChange = (e) => {
      if (e && e.key && e.key !== STORAGE_KEY) return;
      setMode(read());
    };
    window.addEventListener("storage", onChange);
    window.addEventListener("symphony-anonymize-change", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("symphony-anonymize-change", onChange);
    };
  }, []);

  const updateMode = (next) => {
    const v = VALID.has(next) ? next : "off";
    try { localStorage.setItem(STORAGE_KEY, v); } catch { /* ignore */ }
    setMode(v);
    // Notify in-page subscribers — `storage` events only fire in *other*
    // tabs, not the one that wrote the value, so we dispatch a custom
    // event for same-tab observers.
    try { window.dispatchEvent(new CustomEvent("symphony-anonymize-change")); } catch { /* ignore */ }
  };

  const cycle = () => updateMode(NEXT[mode] || "off");

  return { mode, setMode: updateMode, cycle };
}
