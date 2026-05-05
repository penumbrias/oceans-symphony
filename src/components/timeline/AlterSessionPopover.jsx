import React, { useState } from "react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { format, differenceInMinutes } from "date-fns";
import { parseDate } from "@/lib/dateUtils";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertTriangle } from "lucide-react";

function parseJsonSafe(str, fallback) {
  try { return JSON.parse(str) || fallback; } catch { return fallback; }
}

function SessionDetails({ session }) {
  const notes = parseJsonSafe(session.note, []);
  const noteText = Array.isArray(notes) ? notes.map(n => n.text).filter(Boolean).join("\n") : (session.note || "");
  const emotions = parseJsonSafe(session.session_emotions, []);
  const symptoms = parseJsonSafe(session.session_symptoms, []);
  const isTriggered = !!session.is_triggered_switch;

  if (!noteText && emotions.length === 0 && symptoms.length === 0 && !isTriggered) return null;

  return (
    <div className="space-y-2.5 pt-2 border-t border-border/40">
      {isTriggered && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs min-w-0">
            <span className="font-semibold text-orange-600 dark:text-orange-400">Triggered switch</span>
            {session.trigger_category && (
              <span className="text-muted-foreground"> · {session.trigger_category}</span>
            )}
            {session.trigger_label && (
              <p className="text-muted-foreground mt-0.5 truncate">{session.trigger_label}</p>
            )}
          </div>
        </div>
      )}
      {noteText && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">💬 Note</p>
          <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{noteText}</p>
        </div>
      )}
      {emotions.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Emotions</p>
          <div className="flex flex-wrap gap-1">
            {emotions.map(e => (
              <span key={e} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{e}</span>
            ))}
          </div>
        </div>
      )}
      {symptoms.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Symptoms</p>
          <div className="flex flex-col gap-1">
            {symptoms.map(s => (
              <div key={s.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-medium text-foreground">
                  {s.type === "boolean" ? (s.value ? "Yes" : "No") : `${s.value}/5`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function toLocalDatetimeValue(isoString) {
  if (!isoString) return "";
  const d = parseDate(isoString);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

function localDatetimeToISO(val) {
  if (!val) return null;
  const [datePart, timePart] = val.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

export function AlterSessionInfo({ session, alter, onClose, onEdit }) {
  const infoResolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);
  const [infoImgError, setInfoImgError] = useState(false);

  // Always fetch fresh data so note/emotions/symptoms are current
  const { data: freshSession } = useQuery({
    queryKey: ["session", session?.id],
    queryFn: () => base44.entities.FrontingSession.get(session.id),
    enabled: !!session?.id,
    staleTime: 0,
  });
  const s = freshSession || session;

  if (!s) return null;
  const start = parseDate(s.start_time);
  const end = s.end_time ? parseDate(s.end_time) : null;
  const durationMins = end ? differenceInMinutes(end, start) : differenceInMinutes(new Date(), start);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xs max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {infoResolvedUrl && !infoImgError
              ? <img src={infoResolvedUrl} alt={alter?.name} className="w-6 h-6 rounded-full object-cover" onError={() => setInfoImgError(true)} />
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

          <SessionDetails session={s} />

          <Button size="sm" variant="outline" className="w-full" onClick={onEdit}>
            Edit session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AlterSessionEdit({ session, alter, onClose }) {
  const editResolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);
  const [editImgError, setEditImgError] = useState(false);
  const queryClient = useQueryClient();
  const [startVal, setStartVal] = useState(toLocalDatetimeValue(session?.start_time));
  const [endVal, setEndVal] = useState(toLocalDatetimeValue(session?.end_time));
  const [note, setNote] = useState(session?.note || "");
  const [saving, setSaving] = useState(false);
  const [asPrimary, setAsPrimary] = useState(
    session?.alter_id ? (session?.is_primary ?? false) : session?.primary_alter_id === alter?.id
  );

const handleSave = async () => {
  setSaving(true);
  try {
    const newStart = localDatetimeToISO(startVal) || session.start_time;
    const newEnd = localDatetimeToISO(endVal) || session.end_time || null;

    if (session.alter_id) {
      // New individual model — update this record directly (no note field)
      await base44.entities.FrontingSession.update(session.id, {
        is_primary: asPrimary,
        start_time: newStart,
        end_time: newEnd,
        is_active: !newEnd,
      });
    } else {
      // Legacy model fallback
      const allIds = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
      if (!allIds.includes(alter.id)) allIds.push(alter.id);
      const otherIds = allIds.filter(id => id !== alter.id);

      if (otherIds.length === 0) {
        await base44.entities.FrontingSession.update(session.id, {
          primary_alter_id: asPrimary ? alter.id : null,
          co_fronter_ids: asPrimary ? [] : [alter.id],
          start_time: newStart,
          end_time: newEnd,
          is_active: !newEnd,
        });
      } else {
        const otherPrimary = session.primary_alter_id === alter.id ? otherIds[0] : session.primary_alter_id;
        await base44.entities.FrontingSession.update(session.id, {
          primary_alter_id: otherPrimary,
          co_fronter_ids: otherIds.filter(id => id !== otherPrimary),
          start_time: session.start_time,
          end_time: session.end_time,
          is_active: session.is_active,
        });
        await base44.entities.FrontingSession.create({
          alter_id: alter.id,
          is_primary: asPrimary,
          start_time: newStart,
          end_time: newEnd,
          is_active: !newEnd,
        });
      }
    }

    queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    queryClient.invalidateQueries({ queryKey: ["activeFront"] });
    onClose();
  } finally {
    setSaving(false);
  }
};

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editResolvedUrl && !editImgError
              ? <img src={editResolvedUrl} alt={alter?.name} className="w-6 h-6 rounded-full object-cover" onError={() => setEditImgError(true)} />
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
            <p className="text-xs text-muted-foreground mb-1">Note (use Emotion Check-In for notes)</p>
            <p className="text-xs text-muted-foreground italic">Session notes are stored as Emotion Check-Ins.</p>
          </div>
          <div className="flex items-center gap-2 py-1 border-t border-border/40">
            <input
              type="checkbox"
              id="as-primary"
              checked={asPrimary}
              onChange={e => setAsPrimary(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="as-primary" className="text-sm text-muted-foreground cursor-pointer select-none">
              Primary fronter during this session
            </label>
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