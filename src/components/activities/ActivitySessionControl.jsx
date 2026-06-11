import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Square, X, Loader2, Timer } from "lucide-react";
import { toast } from "sonner";
import { getActiveActivity, clearActiveActivity, endAndLogActiveActivity, ACTIVE_ACTIVITY_EVENT } from "@/lib/activitySession";

function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Live banner for an in-progress activity (started via the "Active" toggle in
// the Log Activity modal). Shows the running timer + End/Discard. Renders
// nothing when no activity is running. The running session lives in
// localStorage; the Activity record is created only on End.
export default function ActivitySessionControl() {
  const qc = useQueryClient();
  const [active, setActive] = useState(() => getActiveActivity());
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Keep in sync with the shared localStorage session (e.g. started in the Log
  // modal, or ended from the notification).
  useEffect(() => {
    const sync = () => setActive(getActiveActivity());
    window.addEventListener(ACTIVE_ACTIVITY_EVENT, sync);
    window.addEventListener("focus", sync);
    return () => { window.removeEventListener(ACTIVE_ACTIVITY_EVENT, sync); window.removeEventListener("focus", sync); };
  }, []);

  // Live timer while running.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active?.startTime]);

  const endActivity = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const res = await endAndLogActiveActivity();
      setActive(null);
      qc.invalidateQueries({ queryKey: ["activities"] });
      if (res) toast.success(`✅ Logged ${res.name} (${res.minutes}m)`);
    } catch (e) { toast.error(e?.message || "Couldn't save the activity"); }
    finally { setBusy(false); }
  };

  const discard = () => {
    if (!active) return;
    if (!window.confirm("Discard this in-progress activity? No record will be saved.")) return;
    clearActiveActivity();
    setActive(null);
    toast.success("Discarded");
  };

  if (!active) return null;

  const elapsed = fmtElapsed(nowMs - new Date(active.startTime).getTime());
  return (
    <div className="mb-3 rounded-xl border border-primary/40 bg-primary/5 p-3 flex items-center gap-3">
      <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: active.color || "#6366f1" }}>
        <Timer className="w-4 h-4 text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{active.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">In progress · {elapsed}</p>
      </div>
      <Button size="sm" onClick={endActivity} disabled={busy} className="gap-1.5">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />} End
      </Button>
      <button onClick={discard} aria-label="Discard activity" className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
}
