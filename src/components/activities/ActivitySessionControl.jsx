import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, Square, X, Loader2, Timer } from "lucide-react";
import { toast } from "sonner";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { getActiveActivity, setActiveActivity, clearActiveActivity, ACTIVE_ACTIVITY_EVENT } from "@/lib/activitySession";

function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Start an activity and time it in real time (like start/end sleep). The running
// session lives in localStorage; the Activity record is created only on End.
export default function ActivitySessionControl() {
  const qc = useQueryClient();
  const [active, setActive] = useState(() => getActiveActivity());
  const [showStart, setShowStart] = useState(false);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });

  // Keep in sync with the shared localStorage session (e.g. ended elsewhere).
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

  const startActivity = async () => {
    const catId = picked[0];
    if (!catId) { toast.error("Pick an activity first"); return; }
    setBusy(true);
    try {
      const cat = categories.find((c) => c.id === catId);
      let alterId = null;
      try {
        const sessions = await base44.entities.FrontingSession.filter({ is_active: true });
        alterId = sessions.find((s) => s.is_primary)?.alter_id || sessions[0]?.alter_id || null;
      } catch { /* no fronter */ }
      setActiveActivity({ categoryId: catId, name: cat?.name || "Activity", color: cat?.color || null, startTime: new Date().toISOString(), alterId });
      setActive(getActiveActivity());
      setShowStart(false); setPicked([]);
      toast.success(`▶ Started ${cat?.name || "activity"}`);
    } finally { setBusy(false); }
  };

  const endActivity = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const start = new Date(active.startTime);
      const end = new Date();
      const mins = Math.max(1, Math.round((end - start) / 60000));
      await base44.entities.Activity.create({
        activity_name: active.name || "Activity",
        parent_category_id: active.categoryId || null,
        timestamp: start.toISOString(),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        duration_minutes: mins,
        actual_duration_minutes: mins,
        status: ACTIVITY_STATUSES.LOGGED,
        alter_id: active.alterId || null,
      });
      clearActiveActivity();
      setActive(null);
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success(`✅ Logged ${active.name} (${mins}m)`);
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

  if (active) {
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

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setShowStart(true)} className="mb-3 gap-1.5">
        <Play className="w-3.5 h-3.5" /> Start activity
      </Button>
      <Dialog open={showStart} onOpenChange={(o) => { if (!o) { setShowStart(false); setPicked([]); } }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Start an activity</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">Pick what you're doing — it times in real time until you tap End, then it's logged automatically.</p>
          <ActivityPillSelector selectedActivities={picked} onActivityChange={setPicked} />
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={() => { setShowStart(false); setPicked([]); }}>Cancel</Button>
            <Button onClick={startActivity} disabled={busy || !picked.length} className="gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Start
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
