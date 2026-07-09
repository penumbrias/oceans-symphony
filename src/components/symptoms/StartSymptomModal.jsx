import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Play, Search } from "lucide-react";
import { toLocalDatetimeValue, fromLocalDatetimeValue } from "@/lib/dateTimeInput";
import { seedSymptomDefaults } from "@/utils/symptomDefaults";

const TABS = ["symptom", "habit"];
const TAB_LABELS = { symptom: "Symptoms", habit: "Habits" };

// Dashboard quick-start button — minimal "start an active symptom/habit
// session now" flow. Same shape as StartActivityModal (picker + adjustable
// start time + optional notes), but there is no full "log a symptom after
// the fact" modal to delegate to like ActivityLogModal, so this button only
// ever starts a session — no mode toggle.
export default function StartSymptomModal({ isOpen, onClose }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("symptom");
  const [search, setSearch] = useState("");
  const [selectedSymptomId, setSelectedSymptomId] = useState(null);
  const [severity, setSeverity] = useState(null);
  const [startTimeStr, setStartTimeStr] = useState(() => toLocalDatetimeValue(new Date().toISOString()));
  const [notes, setNotes] = useState("");
  const [starting, setStarting] = useState(false);

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });
  const selectedSymptom = symptoms.find((s) => s.id === selectedSymptomId) || null;
  const isRating = selectedSymptom?.type === "rating";

  useEffect(() => {
    if (!isOpen) return;
    seedSymptomDefaults().then(() => queryClient.invalidateQueries({ queryKey: ["symptoms"] })).catch(() => {});
  }, [isOpen, queryClient]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return symptoms
      .filter((s) => !s.is_archived && s.category === tab)
      .filter((s) => !q || (s.label || "").toLowerCase().includes(q))
      .sort((a, b) => (a.label || "").localeCompare(b.label || ""));
  }, [symptoms, tab, search]);

  const reset = () => {
    setSelectedSymptomId(null);
    setSeverity(null);
    setStartTimeStr(toLocalDatetimeValue(new Date().toISOString()));
    setNotes("");
    setSearch("");
  };

  const pickSymptom = (id) => {
    setSelectedSymptomId(id);
    setSeverity(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleStart = async () => {
    if (!selectedSymptomId) {
      toast.error("Select a symptom or habit");
      return;
    }
    const startDate = fromLocalDatetimeValue(startTimeStr);
    if (!startDate) {
      toast.error("Set a start time");
      return;
    }
    setStarting(true);
    try {
      await base44.entities.SymptomSession.create({
        symptom_id: selectedSymptomId,
        start_time: startDate.toISOString(),
        is_active: true,
        severity_snapshots: severity !== null ? [{ severity, timestamp: startDate.toISOString() }] : [],
        notes: notes.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
      const sym = symptoms.find((s) => s.id === selectedSymptomId);
      toast.success(`▶ Started ${sym?.label || "session"}`);
      handleClose();
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-4 h-4" /> Start Symptom / Habit
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Symptom / habit <span className="text-destructive">*</span>
            </label>
            <div className="flex gap-1 bg-muted/40 rounded-lg p-1 mb-2">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); pickSymptom(null); }}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                    tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${TAB_LABELS[tab].toLowerCase()}…`}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <div className="max-h-48 overflow-y-auto overscroll-contain space-y-1 pr-1">
              {visible.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No {TAB_LABELS[tab].toLowerCase()} found</p>
              ) : (
                visible.map((s) => {
                  const selected = selectedSymptomId === s.id;
                  const color = s.color || "#8b5cf6";
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => pickSymptom(s.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-colors"
                      style={{
                        borderColor: selected ? color : "hsl(var(--border))",
                        backgroundColor: selected ? `${color}15` : "hsl(var(--card))",
                      }}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-sm font-medium truncate">{s.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {isRating && (
            <div>
              <label className="text-sm font-medium text-foreground">Severity</label>
              <div className="flex gap-2 mt-1">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setSeverity((cur) => (cur === i ? null : i))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      severity === i
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-foreground">Start time <span className="text-destructive">*</span></label>
            <input
              type="datetime-local"
              value={startTimeStr}
              onChange={(e) => setStartTimeStr(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Notes about this session…"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
          <Button className="flex-1 gap-1.5" onClick={handleStart} disabled={starting}>
            <Play className="w-3.5 h-3.5" /> Start
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
