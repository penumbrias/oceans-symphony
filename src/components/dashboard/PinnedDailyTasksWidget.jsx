import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowRight, Settings as SettingsIcon, CheckCircle2, Circle, ChevronUp, ChevronDown, Sparkles, ExternalLink,
} from "lucide-react";
import {
  applyTerms,
  getPeriodKey,
  getTodayString,
  FREQUENCY_LABELS,
} from "@/lib/dailyTaskSystem";
import {
  loadPrefs, savePrefs, subscribePrefs, FREQUENCIES, DEFAULT_PREFS,
} from "@/lib/pinnedDailyTasksPrefs";

function usePinnedPrefs() {
  // useSyncExternalStore so settings changes in the dialog reflect in
  // the widget immediately without remount.
  return useSyncExternalStore(
    (cb) => subscribePrefs(cb),
    () => JSON.stringify(loadPrefs()),
    () => JSON.stringify(DEFAULT_PREFS),
  );
}

const FREQ_BADGE_CLASS = {
  daily: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  weekly: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  monthly: "bg-violet-500/10 text-violet-600 border-violet-500/30",
  yearly: "bg-amber-500/10 text-amber-600 border-amber-500/30",
};

export default function PinnedDailyTasksWidget() {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const prefsJson = usePinnedPrefs();
  const prefs = useMemo(() => JSON.parse(prefsJson), [prefsJson]);
  const [showSettings, setShowSettings] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["dailyTaskTemplates"],
    queryFn: () => base44.entities.DailyTaskTemplate.list("sort_order", 200),
  });

  const { data: allProgress = [] } = useQuery({
    queryKey: ["dailyProgress"],
    queryFn: () => base44.entities.DailyProgress.list("-date", 200),
  });

  // Build a per-frequency map of (period_key -> Set(completed_task_ids))
  // limited to the CURRENT period for each frequency. That's the only
  // record we care about for "done now?".
  const completionByFreq = useMemo(() => {
    const out = {};
    for (const f of FREQUENCIES) {
      const pk = getPeriodKey(f, new Date());
      const rec = allProgress.find((p) =>
        (p.frequency === f || (!p.frequency && f === "daily")) &&
        (p.period_key === pk || (f === "daily" && p.date === pk))
      );
      out[f] = {
        periodKey: pk,
        record: rec || null,
        completed: new Set(rec?.completed_task_ids || []),
      };
    }
    return out;
  }, [allProgress]);

  const isDone = (template) => {
    const f = template.frequency || "daily";
    return completionByFreq[f]?.completed.has(template.id) || false;
  };

  // Active templates (the manager page surfaces an is_active toggle to
  // soft-disable templates without deleting them).
  const activeTemplates = useMemo(
    () => templates.filter((t) => t.is_active !== false),
    [templates]
  );

  // Build the rendered list per prefs.
  const visibleTasks = useMemo(() => {
    if (prefs.mode === "manual") {
      // Render picked ids in the saved order, skipping any that no
      // longer exist or have been deactivated.
      const byId = Object.fromEntries(activeTemplates.map((t) => [t.id, t]));
      return prefs.pickedIds.map((id) => byId[id]).filter(Boolean);
    }
    // Auto mode: filter by enabled freqs, optionally hide completed,
    // then sort by priority (and within a freq by sort_order then title).
    const priorityIndex = (f) => {
      const i = prefs.priorityOrder.indexOf(f);
      return i === -1 ? 999 : i;
    };
    const filtered = activeTemplates.filter((t) => {
      const f = t.frequency || "daily";
      if (!prefs.enabledFrequencies.includes(f)) return false;
      if (prefs.hideCompleted && isDone(t)) return false;
      return true;
    });
    filtered.sort((a, b) => {
      const aF = a.frequency || "daily";
      const bF = b.frequency || "daily";
      const aP = priorityIndex(aF);
      const bP = priorityIndex(bF);
      if (aP !== bP) return aP - bP;
      const aS = a.sort_order ?? 0;
      const bS = b.sort_order ?? 0;
      if (aS !== bS) return aS - bS;
      return (a.title || "").localeCompare(b.title || "");
    });
    // Incomplete-first within the sort. (When hideCompleted is off we
    // still want done tasks at the bottom so the user sees what's left.)
    filtered.sort((a, b) => {
      const aD = isDone(a) ? 1 : 0;
      const bD = isDone(b) ? 1 : 0;
      return aD - bD;
    });
    return filtered;
  }, [activeTemplates, prefs, completionByFreq]);

  const toggleManualDone = async (template) => {
    if (template.mode !== "MANUAL") return; // AUTO tasks update via the
    // DailyTasks page's trigger pipeline; don't fake-toggle them.
    const f = template.frequency || "daily";
    const slot = completionByFreq[f];
    // Refetch the freshest DailyProgress row for this period before toggling, so
    // a background refetch or a rapid tap can't write to a stale record / stale
    // completion set (which could also duplicate the row).
    let record = slot.record;
    try {
      const rows = await base44.entities.DailyProgress.filter({ period_key: slot.periodKey, frequency: f });
      if (rows && rows[0]) record = rows[0];
    } catch { /* fall back to the cached record */ }
    const completed = new Set((record && record.completed_task_ids) || []);
    const nowDone = !completed.has(template.id);
    if (nowDone) completed.add(template.id);
    else completed.delete(template.id);
    const newIds = [...completed];
    // Compute XP for THIS freq's active manual templates only (auto
    // tasks get persisted separately by DailyTasks page).
    const newXP = activeTemplates
      .filter((t) => (t.frequency || "daily") === f && t.mode === "MANUAL")
      .reduce((sum, t) => completed.has(t.id) ? sum + (t.points || 0) : sum, 0);
    // Stamp/clear completion time so each task lists individually on the Timeline.
    const completion_times = { ...((record && record.completion_times) || {}) };
    if (nowDone) completion_times[template.id] = new Date().toISOString();
    else delete completion_times[template.id];
    if (record) {
      await base44.entities.DailyProgress.update(record.id, {
        completed_task_ids: newIds,
        completion_times,
        // Write the recomputed value directly. Math.max meant unchecking a task
        // never lowered XP, so lifetime XP inflated and desynced from the
        // DailyTasks page (which writes newXP).
        xp_earned: newXP,
      });
    } else {
      await base44.entities.DailyProgress.create({
        date: slot.periodKey,
        period_key: slot.periodKey,
        frequency: f,
        completed_task_ids: newIds,
        completion_times,
        xp_earned: newXP,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["dailyProgress"] });
  };

  return (
    <div data-tour="pinned-daily-tasks" className="mb-3">
      {/* Compact label-style header — matches the other dashboard section
          headers (UpcomingPlans, DashboardPins, CurrentSymptoms) so the
          widget no longer reads as a separate card with its own padding. */}
      <div className="flex items-center justify-between px-1 mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Pinned tasks
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Pinned tasks settings"
            title="Configure pinned tasks"
            className="text-muted-foreground hover:text-foreground"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
          </button>
          <Link to="/tasks" className="text-xs text-muted-foreground hover:text-foreground">
            See all
          </Link>
        </div>
      </div>

      {visibleTasks.length === 0 ? (
        <EmptyState
          mode={prefs.mode}
          onConfigure={() => setShowSettings(true)}
        />
      ) : (
        <div
          className="space-y-1.5 overflow-y-auto pr-1"
          style={{ maxHeight: `${prefs.maxHeight}px` }}
        >
          {visibleTasks.map((t) => (
            <TaskRow
              key={t.id}
              template={t}
              done={isDone(t)}
              terms={terms}
              onToggle={() => toggleManualDone(t)}
            />
          ))}
        </div>
      )}

      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        templates={activeTemplates}
        terms={terms}
      />
    </div>
  );
}

function TaskRow({ template, done, terms, onToggle }) {
  const navigate = useNavigate();
  const f = template.frequency || "daily";
  const isAuto = template.mode === "AUTO";
  const Icon = done ? CheckCircle2 : Circle;
  // Tapping a row jumps to the task's associated page — same as
  // clicking it on the Daily Tasks page (TaskCard navigates to
  // task.nav_path). AUTO tasks without an explicit nav_path fall back
  // to the Daily Tasks page so the auto state can be refreshed there.
  const navPath = template.nav_path || (isAuto ? "/tasks" : null);
  const goToPage = () => { if (navPath) navigate(navPath); };
  return (
    <div
      onClick={navPath ? goToPage : undefined}
      role={navPath ? "link" : undefined}
      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors ${navPath ? "cursor-pointer" : ""} ${
        done
          ? "border-border/30 bg-muted/20 opacity-60"
          : "border-border/50 bg-card hover:bg-muted/20"
      }`}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        disabled={isAuto}
        aria-label={done ? "Mark not done" : "Mark done"}
        className={`flex-shrink-0 ${isAuto ? "cursor-default" : "cursor-pointer text-muted-foreground hover:text-primary"} ${
          done ? "text-green-500" : ""
        }`}
        title={isAuto ? "This task is auto-completed — open its page to do it" : undefined}
      >
        <Icon className="w-5 h-5" />
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {applyTerms(template.title, terms)}
        </p>
      </div>
      <span className={`flex-shrink-0 text-[0.65rem] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border ${FREQ_BADGE_CLASS[f] || FREQ_BADGE_CLASS.daily}`}>
        {FREQUENCY_LABELS?.[f] || f}
      </span>
      {template.points ? (
        <span className="flex-shrink-0 text-[0.65rem] font-medium text-muted-foreground tabular-nums">
          {template.points} XP
        </span>
      ) : null}
      {navPath && (
        <span className="flex-shrink-0 text-muted-foreground" aria-hidden="true">
          <ExternalLink className="w-3.5 h-3.5" />
        </span>
      )}
    </div>
  );
}

function EmptyState({ mode, onConfigure }) {
  return (
    <div className="text-center py-6 space-y-2">
      <p className="text-sm text-muted-foreground">
        {mode === "manual"
          ? "No tasks pinned yet — pick which ones should appear here."
          : "All caught up! Nothing to show."}
      </p>
      <Button variant="outline" size="sm" onClick={onConfigure}>
        <SettingsIcon className="w-3.5 h-3.5 mr-1" /> Configure
      </Button>
    </div>
  );
}

function SettingsDialog({ open, onClose, templates, terms }) {
  const [draft, setDraft] = useState(loadPrefs);

  // Reset draft from storage every time the dialog opens, so an
  // unsaved tweak from a prior session doesn't bleed in.
  useEffect(() => {
    if (open) setDraft(loadPrefs());
  }, [open]);

  const handleSave = () => {
    savePrefs(draft);
    onClose();
  };

  const movePriority = (freq, dir) => {
    setDraft((d) => {
      const order = [...d.priorityOrder];
      const i = order.indexOf(freq);
      if (i === -1) return d;
      const j = i + dir;
      if (j < 0 || j >= order.length) return d;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...d, priorityOrder: order };
    });
  };

  const toggleFreq = (freq) => {
    setDraft((d) => {
      const set = new Set(d.enabledFrequencies);
      if (set.has(freq)) set.delete(freq);
      else set.add(freq);
      return { ...d, enabledFrequencies: [...set] };
    });
  };

  const togglePicked = (id) => {
    setDraft((d) => {
      const picked = d.pickedIds.includes(id)
        ? d.pickedIds.filter((x) => x !== id)
        : [...d.pickedIds, id];
      return { ...d, pickedIds: picked };
    });
  };

  const movePicked = (id, dir) => {
    setDraft((d) => {
      const arr = [...d.pickedIds];
      const i = arr.indexOf(id);
      if (i === -1) return d;
      const j = i + dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...d, pickedIds: arr };
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pinned tasks settings</DialogTitle>
          <DialogDescription>
            Choose what appears in the Pinned tasks card on the dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Pick mode</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={draft.mode === "auto" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setDraft((d) => ({ ...d, mode: "auto" }))}
              >
                Auto by frequency
              </Button>
              <Button
                type="button"
                variant={draft.mode === "manual" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setDraft((d) => ({ ...d, mode: "manual" }))}
              >
                Hand-pick
              </Button>
            </div>
          </div>

          {/* Height */}
          <div className="space-y-2">
            <Label htmlFor="pinned-height" className="text-sm font-medium">
              List height: {draft.maxHeight}px
            </Label>
            <input
              id="pinned-height"
              type="range"
              min={140}
              max={800}
              step={10}
              value={draft.maxHeight}
              onChange={(e) => setDraft((d) => ({ ...d, maxHeight: Number(e.target.value) }))}
              className="w-full accent-primary"
            />
            <p className="text-xs text-muted-foreground">
              Tasks beyond this height scroll inside the card.
            </p>
          </div>

          {draft.mode === "auto" && (
            <div className="space-y-3 border-t border-border/50 pt-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Which frequencies to include</Label>
                <div className="flex flex-wrap gap-1.5">
                  {FREQUENCIES.map((f) => {
                    const on = draft.enabledFrequencies.includes(f);
                    return (
                      <button
                        type="button"
                        key={f}
                        onClick={() => toggleFreq(f)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${
                          on
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-muted-foreground border-border hover:text-foreground"
                        }`}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Priority order</Label>
                <p className="text-xs text-muted-foreground">
                  Top of the list = highest priority. Tasks of higher-priority
                  frequencies render first; completed ones {draft.hideCompleted ? "drop out" : "sink to the bottom"}.
                </p>
                <div className="space-y-1">
                  {draft.priorityOrder.map((f, i) => (
                    <div key={f} className="flex items-center gap-2 px-2 py-1 rounded-md border border-border/50 bg-card">
                      <span className="text-xs text-muted-foreground tabular-nums w-4">{i + 1}.</span>
                      <span className="text-sm flex-1 capitalize">{f}</span>
                      <Button
                        type="button" variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => movePriority(f, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${f} up`}
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button" variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => movePriority(f, 1)}
                        disabled={i === draft.priorityOrder.length - 1}
                        aria-label={`Move ${f} down`}
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.hideCompleted}
                  onChange={(e) => setDraft((d) => ({ ...d, hideCompleted: e.target.checked }))}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">Hide completed tasks</span>
              </label>
            </div>
          )}

          {draft.mode === "manual" && (
            <div className="space-y-3 border-t border-border/50 pt-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Pick tasks to show</Label>
                <p className="text-xs text-muted-foreground">
                  Order is the on-screen order. Use ↑/↓ to rearrange.
                </p>
                {draft.pickedIds.length > 0 && (
                  <div className="space-y-1">
                    {draft.pickedIds.map((id, i) => {
                      const t = templates.find((x) => x.id === id);
                      if (!t) return null;
                      return (
                        <div key={id} className="flex items-center gap-2 px-2 py-1 rounded-md border border-border/50 bg-card">
                          <span className="text-xs text-muted-foreground tabular-nums w-4">{i + 1}.</span>
                          <span className="text-sm flex-1 truncate">{applyTerms(t.title, terms)}</span>
                          <span className="text-[0.65rem] uppercase text-muted-foreground capitalize">{t.frequency || "daily"}</span>
                          <Button
                            type="button" variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => movePicked(id, -1)} disabled={i === 0}
                            aria-label="Move up"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button" variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => movePicked(id, 1)} disabled={i === draft.pickedIds.length - 1}
                            aria-label="Move down"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive"
                            onClick={() => togglePicked(id)}
                          >
                            Remove
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Available tasks</Label>
                <div className="max-h-56 overflow-y-auto border border-border/50 rounded-md p-1 space-y-0.5">
                  {templates.length === 0 && (
                    <p className="text-xs text-muted-foreground p-2">
                      No task templates yet. Add some on the Daily Tasks page.
                    </p>
                  )}
                  {templates.map((t) => {
                    const picked = draft.pickedIds.includes(t.id);
                    return (
                      <label key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={() => togglePicked(t.id)}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-sm flex-1 truncate">{applyTerms(t.title, terms)}</span>
                        <span className="text-[0.65rem] uppercase text-muted-foreground capitalize">{t.frequency || "daily"}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
