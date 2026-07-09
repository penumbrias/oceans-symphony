import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, addMinutes } from "date-fns";
import { toast } from "sonner";
import { Trash2, Loader2, X, Repeat, Users } from "lucide-react";
import { contactDisplayName } from "@/lib/contacts";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import AlterAvatar from "@/components/shared/AlterAvatar";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import MentionTextarea from "@/components/shared/MentionTextarea";
import RichText from "@/components/shared/RichText";
import { applyWhisper } from "@/lib/whisperUtils";
import { applyLogCommands } from "@/lib/logCommands";
import ActivityLifecyclePopover from "@/components/activities/ActivityLifecyclePopover";
import RecurrenceBranchDialog from "@/components/activities/RecurrenceBranchDialog";
import { statusFor, STATUS_LABELS, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import {
  RECURRENCE_BRANCHES,
  membersForBranch,
  deleteSeries,
  BRANCH_LABELS,
} from "@/lib/recurrenceUtils";

const EMOTION_COLORS = [
  "#f43f5e","#ec4899","#a855f7","#3b82f6","#14b8a6",
  "#22c55e","#f59e0b","#ef4444","#8b5cf6","#06b6d4",
  "#f97316","#84cc16","#e11d48","#7c3aed","#0891b2",
];
function emotionColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return EMOTION_COLORS[h % EMOTION_COLORS.length];
}

function getContrastColor(hex) {
  if (!hex) return "#000000";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

function timeToStr(date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}
function applyTimeStr(baseDate, timeStr) {
  // If timeStr is a full datetime-local string, parse directly
  if (timeStr.includes('T') && timeStr.length > 6) return new Date(timeStr);
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

// Resolves local-image:// avatars (raw <img src> on a legacy
// local-image:// URL renders broken). Square grid-cell avatar.
function SelectedAlterAvatar({ alter }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  return resolved ? (
    <img src={resolved} alt={alter?.name} className="w-full h-full rounded-lg object-cover" />
  ) : (
    <div className="w-full h-full rounded-lg flex items-center justify-center"
      style={{ backgroundColor: alter?.color ? `${alter.color}30` : "hsl(var(--muted))" }}>
      <span className="text-xs font-bold" style={{ color: alter?.color || "hsl(var(--primary))" }}>
        {alter?.name?.charAt(0)}
      </span>
    </div>
  );
}

// Small round avatar next to a fronting-alter chip; renders nothing when
// there's no avatar (same as the original raw-<img> behaviour).
function ChipAlterAvatar({ alter }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  return resolved ? <img src={resolved} alt={alter?.name} className="w-5 h-5 rounded-full object-cover" /> : null;
}

// Alter search+grid selector matching QuickCheckIn style
function AlterSelector({ selectedIds, onChange, alters }) {
  const [input, setInput] = useState("");
  const activeAlters = useMemo(() => alters.filter(a => !a.is_archived), [alters]);
  const filtered = useMemo(() => {
    if (!input.trim()) return [];
    return activeAlters.filter(a =>
      !selectedIds.includes(a.id) &&
      (a.name.toLowerCase().includes(input.toLowerCase()) ||
       a.alias?.toLowerCase().includes(input.toLowerCase()))
    );
  }, [input, activeAlters, selectedIds]);

  return (
    <div>
      <label className="block text-sm font-semibold mb-2">Fronting Alters</label>
      <div className="relative mb-3">
        <Input
          placeholder="Type name or alias..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="text-sm"
        />
        {filtered.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 max-h-32 overflow-y-auto">
            {filtered.map((alter) => (
              <button
                key={alter.id}
                onClick={() => { onChange([...selectedIds, alter.id]); setInput(""); }}
                className="w-full text-left p-2 hover:bg-muted flex items-center gap-2 text-sm transition-colors"
              >
                <AlterAvatar alter={alter} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{alter.name}</p>
                  {alter.alias && <p className="text-xs text-muted-foreground">{alter.alias}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedIds.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 w-full">
          {selectedIds.map((alterId) => {
            const alter = activeAlters.find(a => a.id === alterId);
            return (
              <div key={alterId} className="relative group">
                <div className="aspect-square rounded-lg bg-muted flex flex-col items-center justify-center p-1.5 overflow-hidden">
                  <SelectedAlterAvatar alter={alter} />
                </div>
                <div className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <button onClick={() => onChange(selectedIds.filter(id => id !== alterId))}
                    className="bg-destructive text-destructive-foreground rounded-full p-1">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs font-medium text-center mt-1 truncate">{alter?.alias || alter?.name}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ActivityDetailsModal({ isOpen, onClose, activity, alters = [], onSave, onEditPlan }) {
  const terms = useTerms();
  const [editingId, setEditingId] = useState(null);
  // keyed by act.id so each activity has independent edit state
  const [editDataMap, setEditDataMap] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [lifecycleAct, setLifecycleAct] = useState(null);

  // Reset edit state whenever the modal closes OR the underlying
  // activity changes. Without this, opening the modal for a different
  // activity while `editingId` still points at a previously-edited
  // record makes the body render null (the editing branch finds no
  // match in the new `activities` list) and the user sees a modal
  // with just a header and no content.
  useEffect(() => {
    if (!isOpen) {
      setEditingId(null);
      setEditDataMap({});
      return;
    }
    // Modal opened with a (possibly different) activity — drop any
    // stale editing context from a previous activity.
    setEditingId(null);
  }, [isOpen, activity]);
  // When set, the recurrence-branch chooser is open over the details
  // modal. Holds the activity the user is trying to delete from a
  // series; the actual deletion happens after they pick a branch.
  const [pendingDeleteRecurring, setPendingDeleteRecurring] = useState(null);
  const editData = editDataMap[editingId] || {};

  // Full activity list for series resolution. Cached query — cheap.
  const { data: allActivities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });

  const activities = useMemo(() => {
    if (!activity) return [];
    return Array.isArray(activity) ? activity : [activity];
  }, [activity]);

  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list(),
  });
  const contactsById = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);

  const catById = useMemo(() => {
    const m = {};
    categories.forEach(c => { m[c.id] = c; });
    return m;
  }, [categories]);

  const getEmotionsNearActivity = (act) => {
    const actTime = new Date(act.timestamp);
    const found = emotionCheckIns.find(e => Math.abs(new Date(e.timestamp) - actTime) < 30 * 60 * 1000);
    return found?.emotions || [];
  };

  const getActivityColor = (act) => {
    const ids = act.activity_category_ids || [];
    for (const id of ids) {
      const cat = catById[id];
      if (cat?.color) return cat.color;
    }
    return act.color || "hsl(var(--primary))";
  };

  const handleEdit = (act) => {
    const startTime = new Date(act.timestamp);
    // If the activity has no duration we leave the End field empty
    // instead of defaulting to "start + 60 min" — the user is
    // editing an instant-style log and forcing them into a duration
    // is the whole bug the report described.
    const hasDuration = typeof act.duration_minutes === "number" && act.duration_minutes > 0;
    const endTime = hasDuration ? addMinutes(startTime, act.duration_minutes) : null;
    setEditingId(act.id);
    setEditDataMap(prev => ({
      ...prev,
      [act.id]: {
        activity_category_ids: act.activity_category_ids || [],
        startTimeStr: timeToStr(startTime),
        endTimeStr: endTime ? timeToStr(endTime) : "",
        fronting_alter_ids: act.fronting_alter_ids || [],
        notes: act.notes || "",
      }
    }));
  };

  const setEditDataForAct = (actId, updater) => {
    setEditDataMap(prev => ({
      ...prev,
      [actId]: updater(prev[actId] || {}),
    }));
  };

  const handleSave = async (act) => {
    const data = editDataMap[act.id] || {};
    if (!data.activity_category_ids?.length) {
      toast.error("Select an activity");
      return;
    }
    // Run inline ~commands first (each becomes a chip), then whisper handling.
    const lc = await applyLogCommands(data.notes || "", { isRich: false });
    // "/w @name [secret]" in the notes hides that part behind a whisper bar
    // (no brackets warns first — an activity note is a personal record).
    const w = applyWhisper(lc.content, alters, { allowWholeBlur: false, rich: lc.logged.length > 0, surfaceLabel: "note" });
    if (w === null) return;
    const notes = w.content;
    setIsLoading(true);
    try {
      const startDt = applyTimeStr(act.timestamp, data.startTimeStr);
      // Empty End field → save as "instant-style log": timestamp
      // only, no duration. The activity displays at the start time
      // without an end-time / duration footprint on the grid.
      const trimmedEnd = (data.endTimeStr || "").trim();
      const endDt = trimmedEnd ? applyTimeStr(act.timestamp, trimmedEnd) : null;
      const duration = endDt
        ? Math.max(1, Math.round((endDt - startDt) / 60000))
        : null;
      const catIds = data.activity_category_ids;
      const catName = catIds.map(id => catById[id]?.name).filter(Boolean).join(" + ") || "Activity";

      await base44.entities.Activity.update(act.id, {
        activity_name: catName,
        activity_category_ids: catIds,
        timestamp: startDt.toISOString(),
        duration_minutes: duration,
        fronting_alter_ids: data.fronting_alter_ids,
        notes,
      });
      // Whisper recipients are peeled off the note — notify them.
      for (const rid of (w.recipientIds || [])) {
        try {
          await base44.entities.MentionLog.create({
            mentioned_alter_id: rid,
            author_alter_id: null,
            log_type: "mention",
            source_type: "activity",
            source_id: act.id,
            source_label: "Whisper in an activity note",
            source_date: new Date().toISOString(),
            preview_text: "🔒 private whisper",
            navigate_path: "/activity-tracker",
          });
        } catch { /* best-effort */ }
      }

      // If this is the auto-created Activity that mirrors a Sleep record,
      // reflect the timestamp / wake_time / notes back so the Sleep page
      // doesn't drift. Sleep records need a wake_time, so only update
      // it when we have a real duration to compute one from.
      if (act.source_sleep_id) {
        try {
          const wakeTimeISO = duration
            ? new Date(startDt.getTime() + duration * 60_000).toISOString()
            : null;
          await base44.entities.Sleep.update(act.source_sleep_id, {
            bedtime: startDt.toISOString(),
            ...(wakeTimeISO ? { wake_time: wakeTimeISO } : {}),
            notes: data.notes ?? null,
          });
        } catch {}
      }

      toast.success("Activity updated");
      setEditingId(null);
      onSave?.();
    } catch (err) {
      toast.error("Failed to update activity");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (actId) => {
    const target = activities.find(a => a.id === actId);
    if (!target) return;
    // Recurring plans go through the branch chooser. The actual delete
    // happens in handleConfirmRecurringDelete after the user picks a
    // scope.
    if (target.recurrence_group_id) {
      setPendingDeleteRecurring(target);
      return;
    }
    if (!window.confirm("Delete this activity?")) return;
    setIsLoading(true);
    try {
      await base44.entities.Activity.delete(actId);
      // Cancel any pending OS notification for this plan — leaving one
      // alive after delete would notify the user about a plan that no
      // longer exists.
      try {
        const { cancelPlanReminder } = await import("@/lib/planReminderScheduler");
        await cancelPlanReminder(actId);
      } catch { /* non-fatal */ }
      // Cascade-delete the linked Sleep record so the Sleep page doesn't
      // keep an orphaned entry after the user removes its activity.
      if (target?.source_sleep_id) {
        try { await base44.entities.Sleep.delete(target.source_sleep_id); } catch {}
      }
      toast.success("Activity deleted");
      onSave?.();
      if (activities.length === 1) onClose();
    } finally {
      setIsLoading(false);
    }
  };

  // "Log again" — quickly re-log the same activity at the current time as a
  // fresh instant log (no duration, no carried-over alters/contacts). The
  // common "I just did this again" flow without reopening the full modal.
  const handleLogAgain = async (act) => {
    setIsLoading(true);
    try {
      await base44.entities.Activity.create({
        timestamp: new Date().toISOString(),
        activity_name: act.activity_name,
        activity_category_ids: act.activity_category_ids || [],
        ...(act.color ? { color: act.color } : {}),
        duration_minutes: null,
        fronting_alter_ids: [],
        contact_ids: [],
        notes: null,
        is_planned: false,
        status: ACTIVITY_STATUSES.LOGGED,
      });
      toast.success(`Logged "${act.activity_name}" again`);
      onSave?.();
      onClose();
    } catch {
      toast.error("Couldn't log it again");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmRecurringDelete = async (branch) => {
    const target = pendingDeleteRecurring;
    setPendingDeleteRecurring(null);
    if (!target) return;
    setIsLoading(true);
    try {
      let deletedIds = [];
      if (branch === RECURRENCE_BRANCHES.THIS_ONLY) {
        await base44.entities.Activity.delete(target.id);
        deletedIds = [target.id];
        toast.success("Deleted this instance");
      } else {
        const members = membersForBranch(allActivities, target, branch);
        deletedIds = members.map(m => m.id);
        const count = await deleteSeries(members);
        toast.success(`Deleted ${BRANCH_LABELS[branch]} (${count})`);
      }
      // Cancel any pending OS notifications for the deleted plans so
      // the user doesn't get a "starts in 30 minutes" alert for a plan
      // that no longer exists.
      try {
        const { cancelPlanReminder } = await import("@/lib/planReminderScheduler");
        for (const id of deletedIds) {
          await cancelPlanReminder(id);
        }
      } catch { /* non-fatal */ }
      onSave?.();
      if (activities.length === 1) onClose();
    } catch (err) {
      toast.error(err?.message || "Couldn't delete plan");
    } finally {
      setIsLoading(false);
    }
  };

  if (activities.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Activity Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {editingId ? (() => {
            const act = activities.find(a => a.id === editingId);
            if (!act) return null;
            const color = getActivityColor(act);
            return (
              <div className="space-y-4">
                <div className="rounded-lg p-3 text-center font-semibold"
                  style={{ backgroundColor: color, color: getContrastColor(color) }}>
                  ✏️ Editing: {act.activity_name}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="text-sm font-medium block mb-1">Start</label>
                    <input type="datetime-local" value={(editDataMap[act.id] || {}).startTimeStr || ""}
                      onChange={e => setEditDataForAct(act.id, d => ({ ...d, startTimeStr: e.target.value }))}
                      className="w-full min-w-0 h-9 px-3 rounded-md border border-input bg-background text-sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="text-sm font-medium block mb-1">End</label>
                    <input type="datetime-local" value={(editDataMap[act.id] || {}).endTimeStr || ""}
                      onChange={e => setEditDataForAct(act.id, d => ({ ...d, endTimeStr: e.target.value }))}
                      className="w-full min-w-0 h-9 px-3 rounded-md border border-input bg-background text-sm" />
                  </div>
                </div>
                <ActivityPillSelector
                  selectedActivities={(editDataMap[act.id] || {}).activity_category_ids || []}
                  onActivityChange={(ids) => setEditDataForAct(act.id, d => ({ ...d, activity_category_ids: ids }))}
                />
                <AlterSelector
                  selectedIds={(editDataMap[act.id] || {}).fronting_alter_ids || []}
                  onChange={(ids) => setEditDataForAct(act.id, d => ({ ...d, fronting_alter_ids: ids }))}
                  alters={alters}
                />
                <div>
                  <label className="block text-sm font-semibold mb-2">Notes</label>
                  <MentionTextarea
                    value={(editDataMap[act.id] || {}).notes || ""}
                    onChange={(v) => setEditDataForAct(act.id, d => ({ ...d, notes: v }))}
                    alters={alters}
                    placeholder={`Add notes… @ to mention, /w @name [secret] to whisper`}
                    className="h-20"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditingId(null)} disabled={isLoading} className="flex-1">Cancel</Button>
                  <Button onClick={() => handleSave(act)} disabled={isLoading} className="flex-1">
                    {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
                  </Button>
                </div>
              </div>
            );
          })() : (
            <div className="space-y-4">
              {activities.map((act) => {
                const startTime = new Date(act.timestamp);
                const hasDuration = typeof act.duration_minutes === "number" && act.duration_minutes > 0;
                const endTime = hasDuration ? addMinutes(startTime, act.duration_minutes) : null;
                const durationLabel = hasDuration
                  ? (act.duration_minutes >= 60
                    ? `${Math.round((act.duration_minutes / 60) * 10) / 10}h`
                    : `${act.duration_minutes}m`)
                  : "—";
                const activityAlters = (act.fronting_alter_ids || []).map(id => alters.find(a => a.id === id)).filter(Boolean);
                const emotions = getEmotionsNearActivity(act);
                const color = getActivityColor(act);
                return (
                  <div key={act.id} className="border border-border rounded-lg p-4 space-y-3">
                    <div className="rounded-lg p-3 text-center font-semibold text-lg relative"
                      style={{ backgroundColor: color, color: getContrastColor(color) }}>
                      {act.activity_name}
                      {(() => {
                        const st = statusFor(act);
                        if (st === ACTIVITY_STATUSES.LOGGED) return null;
                        return (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-black/25 align-middle">
                            {STATUS_LABELS[st]}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-xs text-muted-foreground text-center">{format(startTime, "EEEE, MMM d, yyyy")}</p>
                    <div className="grid grid-cols-3 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                      <div><p className="text-muted-foreground text-xs font-semibold mb-1">Start</p><p className="font-medium">{format(startTime, "HH:mm")}</p></div>
                      <div>
                        <p className="text-muted-foreground text-xs font-semibold mb-1">End</p>
                        <p className="font-medium">{endTime ? format(endTime, "HH:mm") : "—"}</p>
                      </div>
                      <div><p className="text-muted-foreground text-xs font-semibold mb-1">Duration</p><p className="font-medium">{durationLabel}</p></div>
                    </div>
                    {(act.activity_category_ids || []).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Categories</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(act.activity_category_ids || []).map(id => {
                            const cat = catById[id];
                            if (!cat) return null;
                            return <span key={id} className="px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: cat.color || "#8b5cf6" }}>{cat.name}</span>;
                          })}
                        </div>
                      </div>
                    )}
                    {activityAlters.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Fronting Alters</p>
                        <div className="flex flex-wrap gap-2">
                          {activityAlters.map(alter => (
                            <div key={alter.id} className="px-3 py-2 rounded-lg border text-sm font-medium flex items-center gap-2" style={{ borderColor: alter.color || "#999" }}>
                              <ChipAlterAvatar alter={alter} />
                              <span>{alter.alias || alter.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(act.contact_ids || []).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Company</p>
                        <div className="flex flex-wrap gap-2">
                          {(act.contact_ids || []).map((id) => {
                            const c = contactsById[id];
                            if (!c) return null;
                            return (
                              <span key={id} className="px-3 py-1.5 rounded-lg border text-sm font-medium flex items-center gap-1.5" style={{ borderColor: c.color || "#0ea5e9" }}>
                                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                                {contactDisplayName(c)}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {emotions.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Emotions</p>
                        <div className="flex flex-wrap gap-1.5">
                          {emotions.map((emotion, idx) => (
                            <span key={idx} className="px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: emotionColor(emotion) }}>{emotion}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {act.location && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Location</p>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(act.location)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-primary hover:underline bg-muted/30 rounded-lg p-3"
                        >
                          📍 <span>{act.location}</span>
                          <span className="text-xs text-muted-foreground">· open in Maps ↗</span>
                        </a>
                      </div>
                    )}
                    {act.is_critical && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Critical lead-window alerts</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(act.critical_lead_steps || []).map((k) => (
                            <span key={k} className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/30">{k}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {act.notes && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Notes</p>
                        <div className="text-sm bg-muted/30 rounded-lg p-3"><RichText content={act.notes} alters={alters} /></div>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2 flex-wrap">
                      {/* Show status management for any non-logged plan AND for
                          every instance of a recurring series — including past
                          occurrences (which derive a LOGGED status from their
                          date), so a missed/attended recurring session can still
                          be marked done / partial / skipped / rescheduled. */}
                      {(statusFor(act) !== ACTIVITY_STATUSES.LOGGED || act.recurrence_group_id) && (
                        <Button
                          variant="outline"
                          onClick={() => setLifecycleAct(act)}
                          className="flex-1 min-w-[120px]"
                        >
                          {act.recurrence_group_id ? "Manage this occurrence" : "Manage Plan"}
                        </Button>
                      )}
                      {statusFor(act) === ACTIVITY_STATUSES.LOGGED && !act.recurrence_group_id && (
                        <Button
                          variant="outline"
                          onClick={() => handleLogAgain(act)}
                          disabled={isLoading}
                          className="flex-1 min-w-[110px] gap-1.5"
                        >
                          <Repeat className="w-4 h-4" /> Log again
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => {
                          // Plans get the full Plan Activity modal so all
                          // their fields (location, critical lead steps,
                          // assigned alters, …) are editable in one place.
                          // Logged activities keep the lightweight inline edit.
                          // Detect a plan by STATUS, not the legacy is_planned
                          // flag — new-model plans use status:"scheduled" and
                          // leave is_planned falsy, which is why Edit used to
                          // dead-end into the inline editor for them.
                          const isPlan = act.is_planned
                            || statusFor(act) !== ACTIVITY_STATUSES.LOGGED
                            || !!act.recurrence_group_id;
                          if (isPlan && onEditPlan) {
                            onEditPlan(act);
                            return;
                          }
                          handleEdit(act);
                        }}
                        className="flex-1 min-w-[80px]"
                      >
                        Edit
                      </Button>
                      <Button variant="destructive" size="icon" onClick={() => handleDelete(act.id)} disabled={isLoading}>
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
      <ActivityLifecyclePopover
        isOpen={!!lifecycleAct}
        activity={lifecycleAct}
        onClose={() => setLifecycleAct(null)}
        onChanged={() => { onSave?.(); setLifecycleAct(null); }}
      />
      <RecurrenceBranchDialog
        isOpen={!!pendingDeleteRecurring}
        actionLabel="delete"
        subject={pendingDeleteRecurring?.activity_name || null}
        onClose={() => setPendingDeleteRecurring(null)}
        onChoose={handleConfirmRecurringDelete}
      />
    </Dialog>
  );
}