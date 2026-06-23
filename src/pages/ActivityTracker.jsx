import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarPlus, Plus, Settings as SettingsIcon } from "lucide-react";
import { format, startOfWeek, addDays, addMonths, addYears } from "date-fns";
import { useDeepLinkHighlight } from "@/lib/useDeepLinkHighlight";
import ActivityWeeklyGrid from "@/components/activities/ActivityWeeklyGrid";
import ActivityMonthView from "@/components/activities/ActivityMonthView";
import { collectAlterDates } from "@/lib/importantDates";
import ActivityYearView from "@/components/activities/ActivityYearView";
import ActivityLogModal from "@/components/activities/ActivityLogModal";
import CurrentActivities from "@/components/activities/CurrentActivities";
import ActivityPlanModal from "@/components/activities/ActivityPlanModal";
import RecurrenceBranchDialog from "@/components/activities/RecurrenceBranchDialog";
import ActivityDetailsModal from "@/components/activities/ActivityDetailsModal";
import ActivityTallyTracker from "@/components/activities/ActivityTallyTracker";
import ActivityGoalsPanel from "@/components/activities/ActivityGoalsPanel";
import ActivityDayView from "@/components/activities/ActivityDayView";
import PlannedActivitiesList from "@/components/activities/PlannedActivitiesList";
import PlanCompletionTracker from "@/components/activities/PlanCompletionTracker";
import ActivityCustomizationMenu from "@/components/activities/ActivityCustomizationMenu";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import ActivityNestingRecovery from "@/components/activities/ActivityNestingRecovery";

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

export default function ActivityTracker() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const jumpDate = urlParams.get("date") || null;
  // Deep-link target for the Activity Details modal — used by the
  // dashboard's pinned-critical-plan cards (double-tap → /activities?activityId=…).
  const [focusActivityId, setFocusActivityId] = useState(() => urlParams.get("activityId") || null);
  const [highlightId, setHighlightId] = useState(() => urlParams.get("highlight") || null);
  const [currentDate, setCurrentDate] = useState(() => jumpDate ? new Date(jumpDate + "T00:00:00") : new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedStartHour, setSelectedStartHour] = useState(undefined);
  const [selectedEndHour, setSelectedEndHour] = useState(undefined);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [addMode, setAddMode] = useState(false);
  const [zoomedDate, setZoomedDate] = useState(null);
  const [weekStartsOn, setWeekStartsOn] = useState(() => lsGet("symphony_act_week_start", 0));
  const [selectedStartMinute, setSelectedStartMinute] = useState(0);
  const [selectedEndMinute, setSelectedEndMinute] = useState(0);
  const [selectedEndDate, setSelectedEndDate] = useState(null);
  const [tab, setTab] = useState("logged"); // "logged" | "planned" | "insights"
  const [viewMode, setViewMode] = useState(() => lsGet("symphony_act_view_mode", "week")); // "week" | "month" | "year"
  const [planModalOpen, setPlanModalOpen] = useState(false);
  // When set, the Plan Activity modal opens pre-filled to edit this
  // existing plan instead of creating a new one. Cleared on close.
  const [editingPlan, setEditingPlan] = useState(null);
  // Branch resolution for editing a recurring plan. Set by the
  // RecurrenceBranchDialog before the Plan modal opens. The Plan modal
  // honours it on save (this-only splits the pivot off, the others
  // sweep the relevant slice of the series).
  const [editBranch, setEditBranch] = useState(null);
  // Pivot activity awaiting a recurrence-branch choice. While set, the
  // Recurrence chooser is open and the Plan modal stays closed.
  const [pendingEditPivot, setPendingEditPivot] = useState(null);
  // Manage Activities modal — promoted to a primary header action in
  // 0.17.3 so it's reachable from every tab (Logged / Planned / Plan
  // tracker), not just from inside the week grid.
  const [showCustomMenu, setShowCustomMenu] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("symphony_act_view_mode", JSON.stringify(viewMode)); } catch {}
  }, [viewMode]);

  // Handle deep link highlight
  useDeepLinkHighlight("highlight", "activity-");

  useEffect(() => {
    if (highlightId) {
      const timer = setTimeout(() => setHighlightId(null), 5500);
      return () => clearTimeout(timer);
    }
  }, [highlightId]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Stable keys — the queryFn loads the full set regardless of week, so keying
  // by weekStart used to refetch (full in-memory scan + sort) AND store a
  // duplicate copy in the cache on EVERY week navigation. A stable key fetches
  // once and shares the result across all weeks/months/years, so paging is
  // instant. Existing ["activities"] / ["frontingHistory"] invalidations still
  // match (react-query does prefix matching).
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: customFields = [] } = useQuery({
    queryKey: ["customFields"],
    queryFn: () => base44.entities.CustomField.list(),
  });
  // Annual important dates from alters' "date" custom fields (birthdays etc.),
  // surfaced as markers on the month calendar.
  const importantDates = useMemo(() => collectAlterDates(alters, customFields), [alters, customFields]);
  const { data: frontingHistory = [] } = useQuery({
    queryKey: ["frontingHistory"],
    queryFn: () => base44.entities.FrontingSession.list(),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list(),
  });

  // Open the Activity Details modal automatically when this page is
  // entered via /activities?activityId=<id> — used by the Dashboard's
  // critical-pinned-plan cards (double-tap → straight into details).
  // Clear the param after opening so back-button doesn't re-open the
  // modal in a loop.
  useEffect(() => {
    if (!focusActivityId) return;
    const target = activities.find((a) => a.id === focusActivityId);
    if (!target) return;
    setSelectedActivity(target);
    setIsDetailsOpen(true);
    setFocusActivityId(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("activityId");
      window.history.replaceState(null, "", url.toString());
    } catch { /* non-fatal */ }
  }, [focusActivityId, activities]);

  // Surface open to-dos with a scheduled-at or due-date on the week grid.
  // Synthetic records share the Activity shape so the grid renders them
  // without further changes. They carry _isTask + _task so click handlers
  // can route to the to-do editor instead of the activity-details modal.
  const taskActivities = React.useMemo(() => {
    return tasks
      .filter(t => !t.completed && (t.scheduled_at || t.due_date))
      .map(t => {
        // Robust date parse: scheduled_at is always a full ISO. due_date
        // can be either a YYYY-MM-DD string (newer tasks created via the
        // form) or a full ISO (Tapestry preview + older imports). Bare
        // string-concat of "T08:00:00" only works for the date-only
        // shape — for full ISO it produced garbage like "…ZT08:00:00"
        // and Invalid Date, which crashed the activity tracker.
        let ts;
        if (t.scheduled_at) {
          ts = new Date(t.scheduled_at);
        } else if (typeof t.due_date === "string" && !t.due_date.includes("T")) {
          ts = new Date(`${t.due_date}T08:00:00`);
        } else {
          ts = new Date(t.due_date);
        }
        if (Number.isNaN(ts.getTime())) return null;
        return {
          id: `task-${t.id}`,
          _isTask: true,
          _task: t,
          timestamp: ts.toISOString(),
          activity_name: t.title,
          activity_category_ids: t.activity_category_ids || [],
          // Scheduled gets a 60-min duration so it draws as a block;
          // deadline-only ones render as a small pill (null duration).
          duration_minutes: t.scheduled_at ? 60 : null,
          is_planned: ts.getTime() > Date.now(),
          is_critical: !!t.is_urgent,
          // Visual tint — amber for urgent, indigo otherwise, so to-dos
          // are distinguishable from real logged activities at a glance.
          color: t.is_urgent ? "#f59e0b" : "#6366f1",
          fronting_alter_ids: [],
        };
      })
      .filter(Boolean);
  }, [tasks]);
  const activitiesWithTasks = React.useMemo(
    () => [...activities, ...taskActivities],
    [activities, taskActivities],
  );

  useEffect(() => {
    const unsub = base44.entities.Activity.subscribe(() => {
      qc.invalidateQueries({ queryKey: ["activities"] });
    });
    return unsub;
  }, [qc]);

  const handleTimeRangeSelect = (date, startHour, endHour, startMinute = 0, endMinute = 0, endDate = null) => {
    setSelectedDate(date);
    setSelectedStartHour(startHour);
    setSelectedEndHour(endHour);
    setSelectedStartMinute(startMinute);
    setSelectedEndMinute(endMinute);
    setSelectedEndDate(endDate || date);
    // If the selected range starts in the future, open the Plan modal so
    // users get the planning-specific fields (title / location / critical /
    // task-link) instead of the leaner "log a past activity" form.
    const startDt = new Date(date);
    startDt.setHours(startHour ?? 0, startMinute ?? 0, 0, 0);
    if (startDt.getTime() > Date.now()) {
      setPlanModalOpen(true);
    } else {
      setIsModalOpen(true);
    }
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedDate(null);
    setSelectedStartHour(undefined);
    setSelectedEndHour(undefined);
    setSelectedStartMinute(0);
    setSelectedEndMinute(0);
    setSelectedEndDate(null);
  };
  const handleActivityClick = (activityOrActivities) => {
    // If the user tapped a synthetic to-do pill on the grid, route them to
    // the To-Do list (deep-linked to the task) instead of the activity
    // details modal — that modal doesn't know about tasks.
    const list = Array.isArray(activityOrActivities) ? activityOrActivities : [activityOrActivities];
    const onlyTasks = list.every(x => x?._isTask);
    if (onlyTasks && list.length > 0) {
      const t = list[0]._task;
      navigate(`/todo?id=${t.id}`);
      return;
    }
    // Mixed list: filter out the synthetic to-do rows so the details modal
    // gets only real activities. (If everything was filtered out, we
    // already early-returned above.)
    const realOnly = list.filter(x => !x?._isTask);
    setSelectedActivity(realOnly.length === 1 ? realOnly[0] : realOnly);
    setIsDetailsOpen(true);
  };
  const handleDetailsClose = () => {
    setIsDetailsOpen(false);
    setSelectedActivity(null);
  };
  // Open the full Plan editor (ActivityPlanModal) for a plan. Used by the
  // Details modal's "Edit" button AND handed down to the week grid (which
  // mounts its own Details modal) so its Edit-plan button opens the real
  // editor instead of dead-ending into the Manage/lifecycle popover.
  // For recurring plans, route through the recurrence-branch chooser first.
  const openPlanEditor = (act) => {
    setIsDetailsOpen(false);
    setSelectedActivity(null);
    if (act?.recurrence_group_id) {
      setPendingEditPivot(act);
      return;
    }
    setEditingPlan(act);
    setEditBranch(null);
    setPlanModalOpen(true);
  };
  const handleActivitySave = () => {
    qc.invalidateQueries({ queryKey: ["activities"] });
  };

  // Clear any leftover range from a previous grid selection. Used by the
  // primary "Log Activity" and "New Plan" buttons so their modals open
  // fresh (defaults to current time / tomorrow noon respectively) instead
  // of inheriting a stale range from a prior grid drag.
  const clearSelectedRange = () => {
    setSelectedDate(null);
    setSelectedEndDate(null);
    setSelectedStartHour(undefined);
    setSelectedEndHour(undefined);
    setSelectedStartMinute(0);
    setSelectedEndMinute(0);
  };

  return (
    // Edge-to-edge safe-area top inset — AppLayout's sticky header
    // already applies safe-area-inset-top for the chrome itself, but on
    // Android with edge-to-edge (targetSdk 36) some WebView paint paths
    // let the page content's first row visually crowd the status pills
    // when the user has scrolled to the absolute top. Reserving the
    // inset here keeps the page header below the status bar even in
    // that corner case, and is a no-op on web/TWA where the env
    // evaluates to 0.
    <div
      className="min-h-screen p-4"
      style={{
        // AppLayout's header + <main> already reserve safe-area-inset-top;
        // adding it again here stacked a redundant gap below the page
        // header on devices where the inset is non-zero. Only the bottom
        // inset is repeated as defence-in-depth so the Planned list's
        // tail rows clear the bottom-nav.
        paddingBottom: "calc(1rem + var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <ErrorBoundary
        fallback={(err, reset) => (
          <div className="max-w-2xl mx-auto">
            <ActivityNestingRecovery error={err} onReset={reset} />
          </div>
        )}
        resetKeys={[activities.length, tab, viewMode]}
      >
      <div data-tour="activities-log" className="max-w-full mx-auto">
        {/* Title row: page title on the left, Week/Month/Year view-mode
            switcher tucked into the top-right (Logged tab only — Month
            and Year don't apply to Planned or the Plan tracker). The
            view-mode pills are intentionally small here; they're a
            view chooser, not a primary action. */}
        <div className="flex items-center justify-between mb-2 gap-2">
          <h1 className="font-display text-3xl font-semibold text-foreground">Activity Tracker</h1>
          {tab === "logged" && (
            <div className="flex gap-0.5 p-0.5 bg-muted/30 rounded-lg">
              {[{ id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "year", label: "Year" }].map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setViewMode(v.id)}
                  className={`px-2 py-0.5 rounded-md text-[0.6875rem] font-medium transition-colors ${
                    viewMode === v.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >{v.label}</button>
              ))}
            </div>
          )}
        </div>

        {/* In-progress activity timers (started via the Log modal's "Active"
            toggle) — same pills/menu as the dashboard "Active activities". */}
        {tab === "logged" && <CurrentActivities />}

        {/* Date range nav — kept on its own row so the chevrons stay
            big enough to tap comfortably on a phone. */}
        {tab === "logged" && (
          <div className="flex items-center gap-2 mb-3">
            <Button variant="outline" size="icon" onClick={() => {
              if (viewMode === "year") setCurrentDate(addYears(currentDate, -1));
              else if (viewMode === "month") setCurrentDate(addMonths(currentDate, -1));
              else setCurrentDate(addDays(currentDate, -7));
            }}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-fit">
              {viewMode === "year" && format(currentDate, "yyyy")}
              {viewMode === "month" && format(currentDate, "MMMM yyyy")}
              {viewMode === "week" && `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d, yyyy")}`}
            </span>
            <Button variant="outline" size="icon" onClick={() => {
              if (viewMode === "year") setCurrentDate(addYears(currentDate, 1));
              else if (viewMode === "month") setCurrentDate(addMonths(currentDate, 1));
              else setCurrentDate(addDays(currentDate, 7));
            }}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Logged / Planned / Plan tracker tabs — the page's primary
            structure, kept right where users expect it. */}
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex gap-1 p-1 bg-muted/30 rounded-xl w-fit" data-tour="activities-tabs">
            {[
              { id: "logged", label: "Logged" },
              { id: "planned", label: "Planned" },
              { id: "insights", label: "Plan tracker" },
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {/* Primary actions — New Plan / Log Activity / Manage Activities
            collapsed onto a single row. Previously these were spread
            across three separate rows (Plan Activity on its own row, the
            grid's Add button two rows below, Manage Activities on yet
            another row), which ate roughly half the screen before the
            grid even rendered. */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => {
            clearSelectedRange();
            setPlanModalOpen(true);
          }} className="gap-1.5 h-8">
            <CalendarPlus className="w-3.5 h-3.5" /> New Plan
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            clearSelectedRange();
            setIsModalOpen(true);
          }} className="gap-1.5 h-8">
            <Plus className="w-3.5 h-3.5" /> Log Activity
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowCustomMenu(true)} className="gap-1.5 h-8">
            <SettingsIcon className="w-3.5 h-3.5" /> Manage Activities
          </Button>
        </div>

        {tab === "insights" ? (
          <ErrorBoundary
            fallback={(err, reset) => (
              <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5 text-xs text-destructive">
                The plan tracker hit an error.
                <button type="button" onClick={reset} className="ml-2 underline hover:no-underline">Retry</button>
              </div>
            )}
            resetKeys={[activities.length]}
          >
            <PlanCompletionTracker />
          </ErrorBoundary>
        ) : tab === "logged" ? (
          <>
            {viewMode === "week" && (
              <ActivityWeeklyGrid
                weekDays={weekDays}
                activities={activitiesWithTasks}
                alters={alters}
                frontingHistory={frontingHistory}
                onTimeRangeSelect={handleTimeRangeSelect}
                onActivityClick={handleActivityClick}
                addMode={addMode}
                onToggleAddMode={() => setAddMode(v => !v)}
                highlightActivityId={highlightId}
                onWeekStartChange={setWeekStartsOn}
                onDayClick={setZoomedDate}
                onEditPlan={openPlanEditor}
                importantDates={importantDates}
              />
            )}
            {viewMode === "month" && (
              <ActivityMonthView
                monthDate={currentDate}
                activities={activitiesWithTasks}
                alters={alters}
                weekStartsOn={weekStartsOn}
                onDayClick={setZoomedDate}
                onActivityClick={handleActivityClick}
                importantDates={importantDates}
              />
            )}
            {viewMode === "year" && (
              <ActivityYearView
                yearDate={currentDate}
                activities={activitiesWithTasks}
                weekStartsOn={weekStartsOn}
                onMonthClick={(d) => { setCurrentDate(d); setViewMode("month"); }}
                onDayClick={setZoomedDate}
              />
            )}

            <div className="mt-6">
              <ErrorBoundary
                fallback={(err, reset) => (
                  <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5 text-xs text-destructive">
                    The activity goals panel hit an error.
                    <button type="button" onClick={reset} className="ml-2 underline hover:no-underline">Retry</button>
                  </div>
                )}
                resetKeys={[activities.length, alters.length]}
              >
                <ActivityGoalsPanel weekStart={weekStart} />
              </ErrorBoundary>
            </div>
            <div className="mt-6">
              {/*
                Tally is the riskiest subtree on this page — it walks the
                full activity-category tree on every render. A single bad
                parent_category_id edge used to crash the entire page with
                no in-app recovery. The specialised fallback offers a
                non-destructive flatten action so users can un-brick.
              */}
              <ErrorBoundary
                fallback={(err, reset) => (
                  <ActivityNestingRecovery error={err} onReset={reset} />
                )}
                resetKeys={[activities.length]}
              >
                <ActivityTallyTracker activities={activities} />
              </ErrorBoundary>
            </div>
          </>
        ) : (
          <PlannedActivitiesList
            activities={activities}
            alters={alters}
            onClick={handleActivityClick}
          />
        )}
      </div>

      {showCustomMenu && <ActivityCustomizationMenu onClose={() => setShowCustomMenu(false)} />}

      <ActivityLogModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        startDate={selectedDate}
        endDate={selectedEndDate}
        startHour={selectedStartHour}
        endHour={selectedEndHour}
        startMinute={selectedStartMinute}
        endMinute={selectedEndMinute}
        alters={alters}
        frontingHistory={frontingHistory}
        onSave={() => { handleCloseModal(); handleActivitySave(); }}
      />
      <ActivityPlanModal
        isOpen={planModalOpen}
        onClose={() => { setPlanModalOpen(false); setEditingPlan(null); setEditBranch(null); handleCloseModal(); }}
        editingPlan={editingPlan}
        editBranch={editBranch}
        allActivities={activities}
        startDate={selectedDate}
        endDate={selectedEndDate}
        startHour={selectedStartHour}
        endHour={selectedEndHour}
        startMinute={selectedStartMinute}
        endMinute={selectedEndMinute}
        alters={alters}
        frontingHistory={frontingHistory}
        onSave={() => { setPlanModalOpen(false); setEditingPlan(null); setEditBranch(null); handleCloseModal(); handleActivitySave(); setTab("planned"); }}
      />
      <RecurrenceBranchDialog
        isOpen={!!pendingEditPivot}
        actionLabel="edit"
        subject={pendingEditPivot?.activity_name || null}
        onClose={() => setPendingEditPivot(null)}
        onChoose={(branch) => {
          // Resolve the pivot + chosen branch into the Plan modal opening.
          const pivot = pendingEditPivot;
          setPendingEditPivot(null);
          setEditingPlan(pivot);
          setEditBranch(branch);
          setPlanModalOpen(true);
        }}
      />
      {zoomedDate && (
        <ActivityDayView
          date={zoomedDate}
          activities={activities}
          alters={alters}
          frontingHistory={frontingHistory}
          importantDates={importantDates}
          onClose={() => setZoomedDate(null)}
          onActivityClick={handleActivityClick}
          onTimeRangeSelect={(date, startHour, endHour, startMinute, endMinute) => {
            setZoomedDate(null);
            handleTimeRangeSelect(date, startHour, endHour, startMinute, endMinute);
          }}
        />
      )}
      <ActivityDetailsModal
        isOpen={isDetailsOpen}
        onClose={handleDetailsClose}
        activity={selectedActivity}
        alters={alters}
        onSave={handleActivitySave}
        onEditPlan={openPlanEditor}
      />
      </ErrorBoundary>
    </div>
  );
}