import React, { useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { parseDate } from "@/lib/dateUtils";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function toLocalDatetimeValue(isoString) {
  if (!isoString) return "";
  const d = parseDate(isoString);
  // format as YYYY-MM-DDTHH:mm for <input type="datetime-local">
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

// Info panel (single tap)
export function AlterSessionInfo({ session, alter, onClose, onEdit }) {
  if (!session) return null;
  const start = parseDate(session.start_time);
  const end = session.end_time ? parseDate(session.end_time) : null;
  const durationMins = end ? differenceInMinutes(end, start) : differenceInMinutes(new Date(), start);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {alter?.avatar_url
              ? <img src={alter.avatar_url} alt={alter.name} className="w-6 h-6 rounded-full object-cover" />
              : <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: alter?.color || "#9333ea" }}>
                  {alter?.name?.charAt(0)?.toUpperCase()}
                </div>
            }
            {alter?.name || "Unknown"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Started</p>
              <p className="font-medium">{format(start, "h:mm a")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ended</p>
              <p className="font-medium">{end ? format(end, "h:mm a") : <span className="text-primary italic">Active</span>}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="font-semibold text-primary">{formatDuration(durationMins)}</p>
          </div>
          {session.note && (
            <div>
              <p className="text-xs text-muted-foreground">Status note</p>
              <p className="italic text-muted-foreground">{session.note}</p>
            </div>
          )}
          <Button size="sm" variant="outline" className="w-full" onClick={onEdit}>
            Edit session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Edit panel (double tap)
export function AlterSessionEdit({ session, alter, onClose }) {
  const queryClient = useQueryClient();
  const [startVal, setStartVal] = useState(toLocalDatetimeValue(session?.start_time));
  const [endVal, setEndVal] = useState(toLocalDatetimeValue(session?.end_time));
  const [note, setNote] = useState(session?.note || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.FrontingSession.update(session.id, {
      start_time: startVal ? new Date(startVal).toISOString() : session.start_time,
      end_time: endVal ? new Date(endVal).toISOString() : session.end_time || null,
      note: note || null,
    });
    queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    queryClient.invalidateQueries({ queryKey: ["activeFront"] });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {alter?.avatar_url
              ? <img src={alter.avatar_url} alt={alter.name} className="w-6 h-6 rounded-full object-cover" />
              : <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: alter?.color || "#9333ea" }}>
                  {alter?.name?.charAt(0)?.toUpperCase()}
                </div>
            }
            Edit session — {alter?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Start time</p>
            <Input type="datetime-local" value={startVal} onChange={e => setStartVal(e.target.value)} className="text-sm" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">End time</p>
            <Input type="datetime-local" value={endVal} onChange={e => setEndVal(e.target.value)} className="text-sm" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Custom status note</p>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Feeling tired, taking a break..." className="text-sm h-16 resize-none" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}