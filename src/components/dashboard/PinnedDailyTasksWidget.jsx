import React, { useMemo, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { openDailyTask, isDailyTaskOpenable } from "@/lib/dailyTaskActivity";
import { isCountedTask } from "@/lib/taskCounts";
import { TaskCountChip, useTaskTicks } from "@/components/tasks/TaskCountControls";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { Button } from "@/components/ui/button";
import { Row, StackedRow, Group, SwitchRow, ChoiceRow, SliderRow, Chips } from "@/components/shared/SettingRows";
import { useWidgetChrome } from "@/v2/primitives";
import { Settings as SettingsIcon, CheckCircle2, Circle, ChevronUp, ChevronDown, Sparkles, ExternalLink,
} from "lucide-react";
import {
  applyTerms,
  getPeriodKey,
  FREQUENCY_LABELS,
  toggleDailyProgressTasks,
  followTaskNavPath,
  hasCustomReset,
  isCustomResetDone,
  lastCompletionOf,
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
  // The cog opens this widget's own options (Content tab). Outside a
  // board (a library preview) there is nothing to open, so no cog.
  const openOptions = useWidgetChrome().openOptions || null;

  // refetchOnMount "always": the widget used to serve a stale (sometimes
  // empty) cache until the Recurring-tasks page happened to refetch the
  // same keys — configured tasks "didn't load" on the home screen until
  // that page was visited (long-standing owner report).
  const { data: templates = [] } = useQuery({
    queryKey: ["dailyTaskTemplates"],
    queryFn: () => base44.entities.DailyTaskTemplate.list("sort_order", 200),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: allProgress = [] } = useQuery({
    queryKey: ["dailyProgress"],
    queryFn: () => base44.entities.DailyProgress.list("-date", 200),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const ticks = useTaskTicks();

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
    // Custom-reset tasks (rolling "N days after completed", or a weekly
    // task anchored to a non-Monday weekday) derive doneness from their
    // latest completion across ALL records — the calendar-period record
    // alone shows them wrongly (e.g. a rolling weekly task looked reset
    // at the calendar week boundary). Same rule as the board's
    // Recurring-tasks widget.
    if (hasCustomReset(template)) return isCustomResetDone(template, allProgress);
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
    const done = isDone(template);
    const templatesFor = activeTemplates.filter((t) => (t.frequency || "daily") === f);
    // Shared writer: refetch-before-write + XP recompute over the FULL
    // active template list for this frequency (the old MANUAL-only recompute
    // silently dropped auto-task XP from the record on every pin toggle).
    if (done && hasCustomReset(template)) {
      // Un-doing a custom-reset task clears it from the record that holds
      // its latest completion (which may not be this period's) — same as
      // the board's Recurring-tasks widget.
      const last = lastCompletionOf(template.id, allProgress);
      const rec = last?.record;
      await toggleDailyProgressTasks({
        periodKey: rec?.period_key || slot.periodKey,
        dateKey: rec?.date || undefined,
        frequency: f,
        setIds: [],
        clearIds: [template.id],
        templates: templatesFor,
      });
    } else {
      await toggleDailyProgressTasks({
        periodKey: slot.periodKey,
        frequency: f,
        setIds: done ? [] : [template.id],
        clearIds: done ? [template.id] : [],
        templates: templatesFor,
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
          {openOptions && (
            <button
              type="button"
              onClick={openOptions}
              aria-label="Pinned tasks settings"
              title="Configure pinned tasks"
              className="text-muted-foreground hover:text-foreground"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
            </button>
          )}
          <Link to="/tasks" className="text-xs text-muted-foreground hover:text-foreground">
            See all
          </Link>
        </div>
      </div>

      {visibleTasks.length === 0 ? (
        <EmptyState
          mode={prefs.mode}
          onConfigure={openOptions}
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
              ticks={ticks}
              onToggle={() => toggleManualDone(t)}
            />
          ))}
        </div>
      )}

    </div>
  );
}

function TaskRow({ template, done, terms, ticks, onToggle }) {
  const navigate = useNavigate();
  const f = template.frequency || "daily";
  const isAuto = template.mode === "AUTO";
  // Counted tasks (several times / tally / steps) tick themselves off from
  // their count — the chip adds one; the circle just shows done.
  const counted = isCountedTask(template);
  const Icon = done ? CheckCircle2 : Circle;
  // Tapping a row jumps to the task's associated page — same as
  // clicking it on the Daily Tasks page (TaskCard navigates to
  // task.nav_path). AUTO tasks without an explicit nav_path fall back
  // to the Daily Tasks page so the auto state can be refreshed there.
  // A task with an activity asks to begin it first (openDailyTask).
  const navPath = template.nav_path || (isAuto ? "/tasks" : null);
  const opens = !!navPath || isDailyTaskOpenable(template);
  const goToPage = () => (isDailyTaskOpenable(template) ? openDailyTask(template, navigate) : followTaskNavPath(navPath, navigate));
  return (
    <div
      onClick={opens ? goToPage : undefined}
      role={opens ? "link" : undefined}
      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors ${opens ? "cursor-pointer" : ""} ${
        done
          ? "border-border/30 bg-muted/20 opacity-60"
          : "border-border/50 bg-card hover:bg-muted/20"
      }`}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        disabled={isAuto || counted}
        aria-label={done ? "Mark not done" : "Mark done"}
        className={`flex-shrink-0 ${isAuto || counted ? "cursor-default" : "cursor-pointer text-muted-foreground hover:text-primary"} ${
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
      {counted && (
        <TaskCountChip task={{ ...template, title: applyTerms(template.title, terms) }} ticks={ticks} />
      )}
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
      {onConfigure && (
        <Button variant="outline" size="sm" onClick={onConfigure}>
          <SettingsIcon className="w-3.5 h-3.5 mr-1" /> Configure
        </Button>
      )}
    </div>
  );
}

// The widget's options, live (v0.333.0): lives on the Content tab of the
// widget's options sheet. Each change saves at once, like every other row
// there — the old Save/Cancel dialog behind the cog is gone.
export function PinnedTasksOptions() {
  const terms = useTerms();
  const prefsJson = usePinnedPrefs();
  const prefs = useMemo(() => JSON.parse(prefsJson), [prefsJson]);
  const { data: templates = [] } = useQuery({
    queryKey: ["dailyTaskTemplates"],
    queryFn: () => base44.entities.DailyTaskTemplate.list("sort_order", 200),
  });
  const active = templates.filter((t) => t.is_active !== false);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  // Read fresh from storage on every change so two quick taps both land.
  const update = (fn) => savePrefs(fn(loadPrefs()));
  const moveIn = (arr, i, dir) => {
    const next = [...arr]; const j = i + dir;
    if (j < 0 || j >= next.length) return next;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  const freqLabel = (f) => FREQUENCY_LABELS?.[f] || f;
  const arrows = (i, len, onMove, name) => (
    <>
      <button type="button" onClick={() => onMove(-1)} disabled={i === 0} aria-label={`Move ${name} up`}
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground disabled:opacity-30">
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => onMove(1)} disabled={i === len - 1} aria-label={`Move ${name} down`}
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground disabled:opacity-30">
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    </>
  );
  const matches = active.filter((t) => applyTerms(t.title || "", terms).toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <Group title="Which tasks" first>
        <ChoiceRow label="Pick" value={prefs.mode}
          onChange={(v) => update((d) => ({ ...d, mode: v }))}
          options={[{ value: "auto", label: "By how often" }, { value: "manual", label: "Hand-pick" }]} />
        {prefs.mode === "auto" && (
          <>
            <StackedRow label="Include">
              <Chips multiple label="Include" value={prefs.enabledFrequencies}
                onChange={(next) => update((d) => ({ ...d, enabledFrequencies: next }))}
                options={FREQUENCIES.map((f) => ({ value: f, label: freqLabel(f) }))} />
            </StackedRow>
            <StackedRow label="Shown first" hint="Top of the list shows first">
              <div className="space-y-1">
                {prefs.priorityOrder.map((f, i) => (
                  <div key={f} className="flex items-center gap-2 px-2 py-1 rounded-lg border border-border/40">
                    <span className="text-xs text-muted-foreground tabular-nums w-4">{i + 1}.</span>
                    <span className="text-sm flex-1">{freqLabel(f)}</span>
                    {arrows(i, prefs.priorityOrder.length,
                      (dir) => update((d) => ({ ...d, priorityOrder: moveIn(d.priorityOrder, i, dir) })), freqLabel(f))}
                  </div>
                ))}
              </div>
            </StackedRow>
            <SwitchRow label="Hide tasks once they're done" checked={prefs.hideCompleted}
              onChange={(on) => update((d) => ({ ...d, hideCompleted: on }))} />
          </>
        )}
        {prefs.mode === "manual" && (
          <>
            <Row label={picking ? "Tap to add or take off" : `${prefs.pickedIds.length} picked`}
              hint={!picking && prefs.pickedIds.length > 1 ? "Arrows change the order" : undefined}>
              <button type="button" onClick={() => { setPicking((v) => !v); setSearch(""); }} aria-expanded={picking}
                className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">
                {picking ? "Done" : "Add / remove"}
              </button>
            </Row>
            {picking ? (
              <div className="space-y-1.5 py-1.5">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks…"
                  className="w-full px-3 h-9 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                <div className="max-h-56 overflow-y-auto overscroll-contain space-y-1">
                  {active.length === 0 && <p className="text-xs text-muted-foreground p-2">No recurring tasks yet. Add some on the Recurring tasks page.</p>}
                  {matches.map((t) => {
                    const on = prefs.pickedIds.includes(t.id);
                    return (
                      <button key={t.id} type="button" aria-pressed={on}
                        onClick={() => update((d) => ({ ...d, pickedIds: on ? d.pickedIds.filter((x) => x !== t.id) : [...d.pickedIds, t.id] }))}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left ${on ? "border-primary/50 bg-primary/5" : "border-border/50 hover:bg-muted/30"}`}>
                        {on ? <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                        <span className="text-sm flex-1 truncate">{applyTerms(t.title, terms)}</span>
                        <span className="text-[0.65rem] text-muted-foreground">{freqLabel(t.frequency || "daily")}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-1 py-1.5">
                {prefs.pickedIds.length === 0 && <p className="text-xs text-muted-foreground">Nothing picked yet.</p>}
                {prefs.pickedIds.map((id, i) => {
                  const t = active.find((x) => x.id === id);
                  if (!t) return null;
                  const name = applyTerms(t.title, terms);
                  return (
                    <div key={id} className="flex items-center gap-2 px-2 py-1 rounded-lg border border-border/40">
                      <span className="text-sm flex-1 truncate">{name}</span>
                      {arrows(i, prefs.pickedIds.length,
                        (dir) => update((d) => ({ ...d, pickedIds: moveIn(d.pickedIds, i, dir) })), name)}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Group>
      <Group title="Size">
        <SliderRow label="List height" hint="Taller lists scroll inside the widget" value={prefs.maxHeight}
          fallback={DEFAULT_PREFS.maxHeight} min={140} max={800} step={10}
          onChange={(v) => update((d) => ({ ...d, maxHeight: Math.round(v) }))} />
      </Group>
    </div>
  );
}
