import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, addMinutes } from "date-fns";
import { toast } from "sonner";
import { Trash2, Loader2, X } from "lucide-react";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { saveMentions } from "@/lib/mentionUtils";

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
                {alter.avatar_url ? (
                  <img src={alter.avatar_url} alt={alter.name} className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: alter.color || "#8b5cf6" }}>
                    {alter.name?.charAt(0)}
                  </div>
                )}
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
        <div className="grid grid-cols-4 gap-2">
          {selectedIds.map((alterId) => {
            const alter = activeAlters.find(a => a.id === alterId);
            return (
              <div key={alterId} className="relative group">
                <div className="aspect-square rounded-lg bg-muted flex flex-col items-center justify-center p-1.5 overflow-hidden">
                  {alter?.avatar_url ? (
                    <img src={alter.avatar_url} alt={alter.name} className="w-full h-full rounded-lg object-cover" />
                  ) : (
                    <div className="w-full h-full rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: alter?.color ? `${alter.color}30` : "hsl(var(--muted))" }}>
                      <span className="text-xs font-bold" style={{ color: alter?.color || "hsl(var(--primary))" }}>
                        {alter?.name?.charAt(0)}
                      </span>
                    </div>
                  )}
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

export default function ActivityDetailsModal({ isOpen, onClose, activity, alters = [], onSave }) {
  const [editingId, setEditingId] = useState(null);
  // keyed by act.id so each activity has independent edit state
  const [editDataMap, setEditDataMap] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const editData = editDataMap[editingId] || {};

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
    const endTime = addMinutes(startTime, act.duration_minutes || 60);
    setEditingId(act.id);
    setEditDataMap(prev => ({
      ...prev,
      [act.id]: {
        activity_category_ids: act.activity_category_ids || [],
        startTimeStr: timeToStr(startTime),
        endTimeStr: timeToStr(endTime),
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
    setIsLoading(true);
    try {
      const startDt = applyTimeStr(act.timestamp, data.startTimeStr);
      const endDt = applyTimeStr(act.timestamp, data.endTimeStr);
      const duration = Math.max(1, Math.round((endDt - startDt) / 60000));
      const catIds = data.activity_category_ids;
      const catName = catIds.map(id => catById[id]?.name).filter(Boolean).join(" + ") || "Activity";

      await base44.entities.Activity.update(act.id, {
        activity_name: catName,
        activity_category_ids: catIds,
        timestamp: startDt.toISOString(),
        duration_minutes: duration,
        fronting_alter_ids: data.fronting_alter_ids,
        notes: data.notes,
      });
      
      
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
    if (!window.confirm("Delete this activity?")) return;
    setIsLoading(true);
    try {
      await base44.entities.Activity.delete(actId);
      toast.success("Activity deleted");
      onSave?.();
      if (activities.length === 1) onClose();
    } finally {
      setIsLoading(false);
    }
  };

  if (activities.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-sm font-medium block mb-1">Start</label>
                    <input type="datetime-local" value={(editDataMap[act.id] || {}).startTimeStr || ""}
                      onChange={e => setEditDataForAct(act.id, d => ({ ...d, startTimeStr: e.target.value }))}
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm" />
                  </div>
                  <div className="flex-1">
                    <label className="text-sm font-medium block mb-1">End</label>
                    <input type="datetime-local" value={(editDataMap[act.id] || {}).endTimeStr || ""}
                      onChange={e => setEditDataForAct(act.id, d => ({ ...d, endTimeStr: e.target.value }))}
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm" />
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
                    placeholder="Add any notes... use @ to mention an alter"
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
                const endTime = addMinutes(startTime, act.duration_minutes || 60);
                const activityAlters = (act.fronting_alter_ids || []).map(id => alters.find(a => a.id === id)).filter(Boolean);
                const emotions = getEmotionsNearActivity(act);
                const color = getActivityColor(act);
                return (
                  <div key={act.id} className="border border-border rounded-lg p-4 space-y-3">
                    <div className="rounded-lg p-3 text-center font-semibold text-lg"
                      style={{ backgroundColor: color, color: getContrastColor(color) }}>
                      {act.activity_name}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                      <div><p className="text-muted-foreground text-xs font-semibold mb-1">Start</p><p className="font-medium">{format(startTime, "HH:mm")}</p></div>
                      <div><p className="text-muted-foreground text-xs font-semibold mb-1">End</p><p className="font-medium">{format(endTime, "HH:mm")}</p></div>
                      <div><p className="text-muted-foreground text-xs font-semibold mb-1">Duration</p><p className="font-medium">{Math.round((act.duration_minutes || 60) / 60 * 10) / 10}h</p></div>
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
                              {alter.avatar_url && <img src={alter.avatar_url} alt={alter.name} className="w-5 h-5 rounded-full object-cover" />}
                              <span>{alter.alias || alter.name}</span>
                            </div>
                          ))}
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
                    {act.notes && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Notes</p>
                        <p className="text-sm bg-muted/30 rounded-lg p-3">{act.notes}</p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" onClick={() => handleEdit(act)} className="flex-1">Edit</Button>
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
    </Dialog>
  );
}