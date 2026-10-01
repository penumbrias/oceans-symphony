// App-wide "your changes aren't saved" banner (audit 2026-10-01,
// durability H1). localDb fires `symphony-save-health` when a write to
// this device's storage fails (usually: storage full) and again when one
// gets through. Until then the newest changes exist only in memory, so
// this stays on screen, offers a retry, and asks before the page closes.

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getSaveHealth, retrySave } from "@/lib/localDb";

export default function SaveHealthBanner() {
  const navigate = useNavigate();
  const [health, setHealth] = useState(() => { try { return getSaveHealth(); } catch { return { ok: true }; } });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const on = (e) => setHealth(e.detail || getSaveHealth());
    window.addEventListener("symphony-save-health", on);
    return () => window.removeEventListener("symphony-save-health", on);
  }, []);

  // The Android private-files copy failing over and over (audit M4): the
  // data is still saved, but its second copy isn't — say so once a session.
  useEffect(() => {
    let warned = false;
    const on = (e) => {
      if (warned || !(e.detail?.consecutive >= 3)) return;
      warned = true;
      toast.warning("This device's backup copy of your data isn't updating", {
        description: "Your data is still saved. Settings → Data & privacy shows the details — making a backup now is a good idea.",
        duration: 12000,
      });
    };
    window.addEventListener("symphony-mirror-health", on);
    return () => window.removeEventListener("symphony-mirror-health", on);
  }, []);

  // Closing or reloading now would drop what's only in memory.
  useEffect(() => {
    if (health.ok) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [health.ok]);

  if (health.ok) return null;

  const retry = async () => {
    setBusy(true);
    try { await retrySave(); } catch { /* still failing — banner stays */ }
    setBusy(false);
  };

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[200] px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 bg-destructive text-destructive-foreground shadow-lg"
    >
      <div className="max-w-2xl mx-auto flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-semibold">Your latest changes aren't saved yet</p>
          <p className="opacity-90">This device's storage refused the save — usually because it's full. Keep the app open, free up some space, then try again.</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" onClick={retry} disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-background text-foreground text-xs font-semibold disabled:opacity-60">
              {busy ? "Saving…" : "Try again"}
            </button>
            <button type="button" onClick={() => navigate("/settings#data")}
              className="px-3 py-1.5 rounded-lg border border-current text-xs font-semibold">
              Back up now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
