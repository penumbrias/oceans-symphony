import React, { useEffect, useState } from "react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { formatDistanceToNow, format } from "date-fns";
import { X, Clock, Square, Loader2, Timer, Moon } from "lucide-react";
import { toast } from "sonner";
import {
  getActiveActivities,
  removeActiveActivity,
  updateActiveActivity,
  endAndLogActiveActivity,
  ACTIVE_ACTIVITY_EVENT,
} from "@/lib/activitySession";

function toLocalDatetimeValue(iso) {
  if (!iso) return "";
  try { return format(new Date(iso), "yyyy-MM-dd'T'HH:mm"); } catch { return ""; }
}

// Press-and-hold / tap menu for one running activity — mirrors the active
// symptom menu: adjust the start time, end & log it, or discard it.
function ActivityActionMenu({ activity, onClose }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const [startDraft, setStartDraft] = useState(() => toLocalDatetimeValue(activity.startTime));
  // Blank = end now; set it to backfill a forgotten end time.
  const [endDraft, setEndDraft] = useState("");
  // A note about the activity — persisted onto the logged/resolved record so
  // it shows in the activity's details everywhere. Seeded from the session.
  const [noteDraft, setNoteDraft] = useState(activity.notes || "");

  const handleSaveStart = () => {
    if (!startDraft) return;
    try {
      updateActiveActivity(activity.id, { startTime: new Date(startDraft).toISOString() });
      setEditingStart(false);
    } catch { /* keep editing */ }
  };

  const handleSaveNote = () => {
    updateActiveActivity(activity.id, { notes: noteDraft });
    toast.success("Note saved");
  };

  const handleEnd = async () => {
    if (endDraft && new Date(endDraft) <= new Date(activity.startTime)) { toast.error("End time must be after the start"); return; }
    setBusy(true);
    try {
      // Persist the latest note onto the session so it lands on the record.
      if ((noteDraft || "") !== (activity.notes || "")) updateActiveActivity(activity.id, { notes: noteDraft });
      const res = await endAndLogActiveActivity(activity.id, endDraft ? new Date(endDraft).toISOString() : undefined);
      qc.invalidateQueries({ queryKey: ["activities"] });
      if (res) toast.success(res.resolvedPlan ? `✅ Completed ${res.name} (${res.minutes}m)` : `✅ Logged ${res.name} (${res.minutes}m)`);
    } catch (e) { toast.error(e?.message || "Couldn't save the activity"); }
    finally { setBusy(false); onClose(); }
  };

  const handleDiscard = async () => {
    if (!(await confirm("Discard this in-progress activity? No record will be saved."))) return;
    removeActiveActivity(activity.id);
    toast.success("Discarded");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full sm:max-w-xs p-4 space-y-4 max-h-[85vh] overflow-y-auto my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm flex items-center gap-1.5"><Timer className="w-4 h-4" /> {activity.name}</p>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <p className="text-xs text-muted-foreground">In progress · {formatDistanceToNow(new Date(activity.startTime))}</p>

        {editingStart ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Edit start time</p>
            <input
              type="datetime-local"
              value={startDraft}
              onChange={(e) => setStartDraft(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <div className="flex gap-2">
              <button type="button" onClick={handleSaveStart} disabled={!startDraft}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Save</button>
              <button type="button" onClick={() => { setStartDraft(toLocalDatetimeValue(activity.startTime)); setEditingStart(false); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-muted/50 text-muted-foreground hover:bg-muted">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setEditingStart(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium bg-muted/50 text-foreground hover:bg-muted transition-colors">
            <Clock className="w-3.5 h-3.5" /> Edit start time
            <span className="text-xs text-muted-foreground">({format(new Date(activity.startTime), "MMM d, h:mm a")})</span>
          </button>
        )}

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">End time <span className="font-normal">(blank = now)</span></p>
          <input type="datetime-local" value={endDraft} onChange={(e) => setEndDraft(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Note <span className="font-normal">(saved with the activity)</span></p>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={3}
            placeholder="Add a note about this activity…"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
          />
          {(noteDraft || "").trim() !== (activity.notes || "").trim() && (
            <button type="button" onClick={handleSaveNote}
              className="w-full py-1.5 rounded-lg text-xs font-medium bg-muted/50 text-foreground hover:bg-muted transition-colors">Save note</button>
          )}
        </div>

        {activity.planActivityId && (
          <p className="text-[11px] text-primary px-0.5">Ending this marks the linked plan as done.</p>
        )}

        <button type="button" onClick={handleEnd} disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />} {activity.planActivityId ? "End & complete plan" : "End & log"}
        </button>
        <button type="button" onClick={handleDiscard}
          className="w-full py-2 rounded-lg text-sm font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">Discard</button>
        <button type="button" onClick={onClose}
          className="w-full py-2 rounded-lg text-sm font-medium bg-muted/50 text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
      </div>
    </div>
  );
}

// Dashboard section: the in-progress activity timers, shown as pills next to
// (and styled like) Active Symptoms. Supports MULTIPLE concurrent activities.
// Tap a pill to adjust its start, end & log it, or discard it. Renders nothing
// when nothing is running.
export default function CurrentActivities() {
  const navigate = useNavigate();
  const [activities, setActivities] = useState(() => getActiveActivities());
  const [activeMenu, setActiveMenu] = useState(null);

  // An in-progress sleep (bedtime set, not yet woken) is treated as an active
  // activity too — it shows here and in the persistent notification. Tapping it
  // goes to the Sleep tracker, where its richer end flow (wake time, quality,
  // dream journal) lives.
  const { data: sleeps = [] } = useQuery({
    queryKey: ["sleep"],
    queryFn: () => base44.entities.Sleep.list(),
  });
  const activeSleep = sleeps.find((s) => s.bedtime && !s.wake_time) || null;

  useEffect(() => {
    const sync = () => setActivities(getActiveActivities());
    window.addEventListener(ACTIVE_ACTIVITY_EVENT, sync);
    window.addEventListener("focus", sync);
    // Tick so the "in progress · N minutes" labels stay fresh.
    const tick = setInterval(sync, 30000);
    return () => {
      window.removeEventListener(ACTIVE_ACTIVITY_EVENT, sync);
      window.removeEventListener("focus", sync);
      clearInterval(tick);
    };
  }, []);

  if (activities.length === 0 && !activeSleep) return null;

  return (
    <div className="space-y-2 mt-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Active Activities</p>
      <div className="flex flex-wrap gap-2">
        {activeSleep && (
          <button
            onClick={() => navigate("/sleep")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-opacity hover:opacity-80 active:scale-95"
            style={{ borderColor: "#6366f1", backgroundColor: "#6366f115", color: "#6366f1" }}
            title="Sleeping — tap to end"
          >
            <Moon className="w-3 h-3 flex-shrink-0" />
            Sleep
            <span className="opacity-60 font-normal">· {formatDistanceToNow(new Date(activeSleep.bedtime))}</span>
          </button>
        )}
        {activities.map((a) => {
          const color = a.color || "#6366f1";
          return (
            <button
              key={a.id}
              onClick={() => setActiveMenu(a)}
              onContextMenu={(e) => { e.preventDefault(); setActiveMenu(a); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-opacity hover:opacity-80 active:scale-95"
              style={{ borderColor: color, backgroundColor: `${color}15`, color }}
            >
              <Timer className="w-3 h-3 flex-shrink-0" />
              {a.name}
              <span className="opacity-60 font-normal">· {formatDistanceToNow(new Date(a.startTime))}</span>
            </button>
          );
        })}
      </div>

      {activeMenu && (
        <ActivityActionMenu activity={activeMenu} onClose={() => setActiveMenu(null)} />
      )}
    </div>
  );
}
