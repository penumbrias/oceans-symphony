import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format, formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, AlertTriangle, X, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// Modal opened from the stale-sessions banner on the Analytics
// page. Lists every session that's been open for >48h with no
// end_time, alongside three quick actions per row:
//   - Close now → end_time = current time.
//   - Close at a chosen time → end_time = picked datetime.
//   - Mark as still active → sets confirmed_long_session: true
//     so the normaliser stops applying the 48h staleness cap.
//
// Without this surface the analytics page silently caps every
// long-running session at 48h, which is wrong for alters who
// legitimately stay fronting for days. The user gets to make the
// call per-session.

function smallAvatar(alter) {
  return (
    <AvatarCircle alter={alter} />
  );
}

function AvatarCircle({ alter }) {
  const url = useResolvedAvatarUrl(alter?.avatar_url);
  const [err, setErr] = useState(false);
  if (!alter) return <div className="w-7 h-7 rounded-full bg-muted/50 flex-shrink-0" />;
  return (
    <div
      className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30 text-white text-[0.625rem] font-semibold"
      style={{ backgroundColor: alter.color || "#9333ea" }}
      title={alter.name}
    >
      {url && !err
        ? <img src={url} alt={alter.name} className="w-full h-full object-cover" onError={() => setErr(true)} />
        : (alter.name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function StaleSessionsModal({ isOpen, onClose, staleSessions = [], altersById = {} }) {
  const qc = useQueryClient();
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const [busyId, setBusyId] = useState(null);
  const [pickerOpenId, setPickerOpenId] = useState(null);
  const [pickerValue, setPickerValue] = useState("");

  const rows = useMemo(() => {
    return staleSessions.map((s) => {
      const alters = (s.alterIds || []).map((id) => altersById[id]).filter(Boolean);
      const primaryAlter = s.primaryAlterId ? altersById[s.primaryAlterId] : alters[0];
      return { session: s, alters, primaryAlter };
    }).sort((a, b) => a.session.startMs - b.session.startMs);
  }, [staleSessions, altersById]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["frontingSessions"] });
    qc.invalidateQueries({ queryKey: ["activeFront"] });
    qc.invalidateQueries({ queryKey: ["frontHistory"] });
  };

  const closeNow = async (session) => {
    setBusyId(session.id);
    try {
      await base44.entities.FrontingSession.update(session.id, {
        end_time: new Date().toISOString(),
        is_active: false,
      });
      toast.success("Session closed now");
      invalidate();
    } catch (err) {
      toast.error(err?.message || "Couldn't close the session");
    } finally {
      setBusyId(null);
    }
  };

  const closeAt = async (session, datetimeLocal) => {
    if (!datetimeLocal) { toast.error("Pick a close time"); return; }
    const dt = new Date(datetimeLocal);
    if (Number.isNaN(dt.getTime())) { toast.error("Invalid date / time"); return; }
    if (dt.getTime() < session.startMs) { toast.error("End time can't be before start"); return; }
    if (dt.getTime() > Date.now() + 60_000) { toast.error("End time can't be in the future"); return; }
    setBusyId(session.id);
    try {
      await base44.entities.FrontingSession.update(session.id, {
        end_time: dt.toISOString(),
        is_active: false,
      });
      toast.success(`Session closed at ${format(dt, "MMM d, HH:mm")}`);
      setPickerOpenId(null);
      invalidate();
    } catch (err) {
      toast.error(err?.message || "Couldn't close the session");
    } finally {
      setBusyId(null);
    }
  };

  const markActive = async (session) => {
    setBusyId(session.id);
    try {
      await base44.entities.FrontingSession.update(session.id, {
        confirmed_long_session: true,
      });
      toast.success("Marked as still active — won't be capped");
      invalidate();
    } catch (err) {
      toast.error(err?.message || "Couldn't update the session");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Long-running {terms.fronting} sessions
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">
            These have been open for over 48 hours. Their duration is capped at 48h in analytics until you confirm or close them.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6 italic">
              Nothing to review — every {terms.fronting} session looks healthy.
            </p>
          ) : rows.map(({ session, alters, primaryAlter }) => {
            const start = new Date(session.startMs);
            const dur = formatDistanceToNow(start);
            const defaultPickerStr = format(new Date(session.startMs + 48 * 60 * 60 * 1000), "yyyy-MM-dd'T'HH:mm");
            const minPicker = format(start, "yyyy-MM-dd'T'HH:mm");
            const maxPicker = format(new Date(), "yyyy-MM-dd'T'HH:mm");
            return (
              <div key={session.id} className="rounded-xl border border-border/50 bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <AvatarCircle alter={primaryAlter} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: primaryAlter?.color || undefined }}>
                      {alters.length > 0 ? alters.map((a) => formatAlter(a)).join(", ") : "Unknown"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Started {format(start, "EEE d MMM, HH:mm")} · {dur} ago
                    </p>
                  </div>
                </div>

                {pickerOpenId === session.id ? (
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-muted-foreground">When did it actually end?</label>
                    <Input
                      type="datetime-local"
                      value={pickerValue || defaultPickerStr}
                      onChange={(e) => setPickerValue(e.target.value)}
                      min={minPicker}
                      max={maxPicker}
                      className="h-8 text-xs"
                    />
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 h-7 text-xs"
                        onClick={() => { setPickerOpenId(null); setPickerValue(""); }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={busyId === session.id}
                        onClick={() => closeAt(session, pickerValue || defaultPickerStr)}
                        className="flex-1 h-7 text-xs"
                      >
                        Close at this time
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === session.id}
                      onClick={() => closeNow(session)}
                      className="h-7 text-xs px-2"
                    >
                      <Clock className="w-3 h-3 mr-1" /> Close now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === session.id}
                      onClick={() => { setPickerOpenId(session.id); setPickerValue(defaultPickerStr); }}
                      className="h-7 text-xs px-2"
                    >
                      <ArrowRight className="w-3 h-3 mr-1" /> Close at…
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === session.id}
                      onClick={() => markActive(session)}
                      className="h-7 text-xs px-2"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Still active
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex-shrink-0 border-t border-border/50 px-4 py-3 flex items-center justify-end">
          <Button variant="ghost" onClick={onClose} className="gap-1">
            <X className="w-3.5 h-3.5" /> Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
