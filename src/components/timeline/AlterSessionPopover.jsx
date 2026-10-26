import React, { useState, useEffect } from "react";
import { useFrontLevels, getSessionLevel, frontLevelLabel } from "@/lib/frontLevels";
import { levelChangesOf, levelSpans } from "@/lib/frontLevelSpans";
import { editFrontSession, endFrontSession, removeFrontSession } from "@/lib/frontSessionEdit";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { format, differenceInMinutes } from "date-fns";
import { parseDate } from "@/lib/dateUtils";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, AlertTriangle, ExternalLink, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

function parseJsonSafe(str, fallback) {
  try { return JSON.parse(str) || fallback; } catch { return fallback; }
}

function SessionDetails({ session }) {
  const terms = useTerms();
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
            <span className="font-semibold text-orange-600 dark:text-orange-400">Triggered {terms.switch}</span>
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

// Two-tap-confirm hard-delete button. First press arms it for 4 seconds
// and shows a "Tap again to delete" warning; second press actually
// removes the FrontingSession record. Used when a row keeps resurfacing
// as a ghost and the user wants it gone permanently.
function DeleteSessionButton({ session, alterId, queryClient, onDeleted }) {
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      size="sm"
      variant="outline"
      className={`w-full ${armed ? "border-destructive text-destructive" : "text-muted-foreground"}`}
      disabled={deleting}
      onClick={async () => {
        if (!armed) { setArmed(true); return; }
        setDeleting(true);
        try {
          await removeFrontSession({ session, alterId });
          toast.success("Session deleted");
          queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
          queryClient.invalidateQueries({ queryKey: ["activeFront"] });
          onDeleted?.();
        } catch (e) {
          console.error("[AlterSessionInfo] delete failed", e);
          toast.error(e?.message || "Failed to delete session");
        } finally {
          setDeleting(false);
          setArmed(false);
        }
      }}
    >
      {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
      {armed ? "Tap again to delete" : "Delete session"}
    </Button>
  );
}

export function AlterSessionInfo({ session, alter, onClose, onEdit }) {
  const infoResolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);
  const [infoImgErrorFor, setInfoImgError] = useState(null);
  const infoImgError = !!infoImgErrorFor && infoImgErrorFor === infoResolvedUrl;
  const [endingNow, setEndingNow] = useState(false);
  const queryClient = useQueryClient();

  // Always fetch fresh data so note/emotions/symptoms are current
  const { data: freshSession } = useQuery({
    queryKey: ["session", session?.id],
    queryFn: () => base44.entities.FrontingSession.get(session.id),
    enabled: !!session?.id,
    staleTime: 0,
  });
  const s = freshSession || session;

  // Fronting level (opt-in feature) shown on the session card. Hooks stay
  // ABOVE the early return — conditional hooks crash on re-render.
  const popTerms = useTerms();
  const popLevelCfg = useFrontLevels();
  const popLevelObj = getSessionLevel(s, popLevelCfg);
  const popLevel = popLevelObj ? frontLevelLabel(popLevelObj, popTerms) : null;

  if (!s) return null;
  const start = parseDate(s.start_time);
  const end = s.end_time ? parseDate(s.end_time) : null;

  // A session reads as "Active" only when the rest of the app would also
  // count it as active (is_active === true AND end_time is null). A row
  // with is_active: false but no end_time is an orphan — show it as
  // ended-with-no-recorded-time rather than misleadingly Active.
  const isLive = !end && s.is_active === true;
  const durationMins = end ? differenceInMinutes(end, start) : differenceInMinutes(new Date(), start);
  // A level that changed while the session ran: each part, from when.
  const popSpans = levelChangesOf(s).length
    ? levelSpans(s, start.getTime(), (end || new Date()).getTime())
    : [];
  const spanLabel = (levelId) => {
    const lvl = getSessionLevel({ ...s, front_level: levelId }, popLevelCfg);
    return lvl ? frontLevelLabel(lvl, popTerms) : "—";
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xs max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {infoResolvedUrl && !infoImgError
              ? <img src={infoResolvedUrl} alt={alter?.name} className="w-6 h-6 rounded-full object-cover" onError={() => setInfoImgError(infoResolvedUrl)} />
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
              <p className="font-medium">{
                end
                  ? format(end, "h:mm a")
                  : (isLive
                      ? <span className="text-primary italic">Active</span>
                      : <span className="text-muted-foreground italic">— (no end time)</span>)
              }</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="font-semibold text-primary">{formatDuration(durationMins)}</p>
          </div>

          {/* Fronting level (opt-in feature) — recorded on the session */}
          {popLevel && (
            <div>
              <p className="text-xs text-muted-foreground">{popTerms.Front} level</p>
              {popSpans.length > 1 ? (
                <ul className="space-y-0.5">
                  {popSpans.map((sp, i) => (
                    <li key={i} className="flex items-baseline gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums w-16 flex-shrink-0">{format(new Date(sp.startMs), "h:mm a")}</span>
                      <span className="font-medium">{spanLabel(sp.level)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-medium">{popLevel}</p>
              )}
            </div>
          )}

          <SessionDetails session={s} />

          {/* One-tap "End now" — handy when a session looks Active or has
              no end time recorded. Saves the user a trip into Edit and
              shows the actual error if the update fails so we don't end
              up with the same "I can't end it" issue silently.
              Also sweeps OTHER ghost sessions for the same alter (any
              row >12h old with no end_time) so the user doesn't have
              to play whack-a-mole when there are multiple stale rows. */}
          {(isLive || (!end && !s.is_active)) && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={endingNow}
              onClick={async () => {
                setEndingNow(true);
                try {
                  await endFrontSession({ session: s, alterId: alter?.id || s.alter_id || null });
                  toast.success("Session ended");
                  queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
                  queryClient.invalidateQueries({ queryKey: ["activeFront"] });
                  queryClient.invalidateQueries({ queryKey: ["session", s.id] });
                  onClose();
                } catch (e) {
                  console.error("[AlterSessionInfo] end-now failed", e);
                  toast.error(e?.message || "Failed to end session");
                } finally {
                  setEndingNow(false);
                }
              }}
            >
              {endingNow ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              End session now
            </Button>
          )}

          {/* Hard-delete escape hatch — for sessions that won't stay ended
              (e.g. when there's no matching alter currently fronting and
              the row keeps resurfacing). Two-tap confirm to avoid accidents. */}
          <DeleteSessionButton session={s} alterId={alter?.id} queryClient={queryClient} onDeleted={onClose} />

          <div className="flex gap-2">
            {alter?.id && (
              <Link
                to={`/alter/${alter.id}`}
                onClick={onClose}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-medium border border-input rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View profile
              </Link>
            )}
            <Button size="sm" variant="outline" className="flex-1" onClick={onEdit}>
              Edit session
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AlterSessionEdit({ session, alter, onClose }) {
  const terms = useTerms();
  const editResolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);
  const [editImgErrorFor, setEditImgError] = useState(null);
  const editImgError = !!editImgErrorFor && editImgErrorFor === editResolvedUrl;
  const queryClient = useQueryClient();
  const [startVal, setStartVal] = useState(toLocalDatetimeValue(session?.start_time));
  const [endVal, setEndVal] = useState(toLocalDatetimeValue(session?.end_time));
  const [note, setNote] = useState(session?.note || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The session's LEVEL is the edited property now (v0.122.0) — pre-levels
  // rows seed from their old role via the shared mapping in getSessionLevel.
  const editLevelCfg = useFrontLevels();
  const seedSession = session?.alter_id
    ? session
    : { ...session, is_primary: session?.primary_alter_id === alter?.id };
  const [editLevel, setEditLevel] = useState(getSessionLevel(seedSession, editLevelCfg)?.id || editLevelCfg.levels[0]?.id);
  const editLastChange = levelChangesOf(session).slice(-1)[0] || null;

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await removeFrontSession({ session, alterId: alter.id });
      toast.success("Session deleted");
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      onClose();
    } catch (e) {
      toast.error(e.message || "Failed to delete session");
    } finally {
      setDeleting(false);
    }
  };

const handleSave = async () => {
  setSaving(true);
  try {
    const newEnd = localDatetimeToISO(endVal) || session.end_time || null;
    await editFrontSession({
      session,
      alterId: alter.id,
      start: localDatetimeToISO(startVal),
      end: localDatetimeToISO(endVal),
      levelId: editLevel,
      levelCfg: editLevelCfg,
    });

    queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    queryClient.invalidateQueries({ queryKey: ["activeFront"] });
    queryClient.invalidateQueries({ queryKey: ["session", session.id] });
    toast.success(newEnd && !session.end_time ? "Session ended" : "Session saved");
    onClose();
  } catch (e) {
    // Surface backend errors instead of silently failing — the previous
    // try/finally had no catch, so a rejected update closed the modal
    // with no feedback (or stuck on "Saving…") and the row stayed
    // stale in the timeline.
    console.error("[AlterSessionEdit] save failed", e);
    toast.error(e?.message || "Failed to save session");
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
              ? <img src={editResolvedUrl} alt={alter?.name} className="w-6 h-6 rounded-full object-cover" onError={() => setEditImgError(editResolvedUrl)} />
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
          <div className="py-1 border-t border-border/40">
            <p className="text-xs text-muted-foreground mb-1">
              {editLastChange
                ? `${terms.Fronting} level since ${format(parseDate(editLastChange.timestamp), "h:mm a")} (earlier parts keep their level)`
                : `${terms.Fronting} level during this session`}
            </p>
            <SearchableSelect
              value={editLevel}
              onChange={(v) => { if (v) setEditLevel(v); }}
              options={editLevelCfg.levels.map((l) => ({ id: l.id, label: frontLevelLabel(l, terms) }))}
              placeholder={`${terms.Front} level`}
              searchPlaceholder="Search levels..."
              zIndex={70}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="flex-1" onClick={handleSave} disabled={saving || deleting}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleting}
            className={`w-full flex items-center justify-center gap-1.5 mt-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              confirmDelete
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "text-destructive/80 hover:text-destructive hover:bg-destructive/10"
            }`}
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {confirmDelete ? "Tap again to confirm" : "Delete session"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}