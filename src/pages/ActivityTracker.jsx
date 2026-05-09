import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarPlus } from "lucide-react";
import { format, startOfWeek, addDays, addMonths, addYears, startOfMonth, startOfYear } from "date-fns";
import { useDeepLinkHighlight } from "@/lib/useDeepLinkHighlight";
import ActivityWeeklyGrid from "@/components/activities/ActivityWeeklyGrid";
import ActivityMonthView from "@/components/activities/ActivityMonthView";
import ActivityYearView from "@/components/activities/ActivityYearView";
import ActivityTimeRangeModal from "@/components/activities/ActivityTimeRangeModal";
import ActivityDetailsModal from "@/components/activities/ActivityDetailsModal";
import ActivityTallyTracker from "@/components/activities/ActivityTallyTracker";
import ActivityGoalsPanel from "@/components/activities/ActivityGoalsPanel";
import ActivityDayView from "@/components/activities/ActivityDayView";
import PlannedActivitiesList from "@/components/activities/PlannedActivitiesList";

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

export default function ActivityTracker() {
  const qc = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const jumpDate = urlParams.get("date") || null;
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
  const [tab, setTab] = useState("logged"); // "logged" | "planned"
  const [viewMode, setViewMode] = useState(() => lsGet("symphony_act_view_mode", "week")); // "week" | "month" | "year"
  const [planModalOpen, setPlanModalOpen] = useState(false);

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

  const { data: activities = [] } = useQuery({
    queryKey: ["activities", format(weekStart, "yyyy-MM-dd")],
    queryFn: () => base44.entities.Activity.list(),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: frontingHistory = [] } = useQuery({
    queryKey: ["frontingHistory", format(weekStart, "yyyy-MM-dd")],
    queryFn: () => base44.entities.FrontingSession.list(),
  });

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
    setIsModalOpen(true);
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
    setSelectedActivity(activityOrActivities);
    setIsDetailsOpen(true);
  };
  const handleDetailsClose = () => {
    setIsDetailsOpen(false);
    setSelectedActivity(null);
  };
  const handleActivitySave = () => {
    qc.invalidateQueries({ queryKey: ["activities"] });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div data-tour="activities-log" className="max-w-full mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-foreground">Activity Tracker</h1>
          {tab === "logged" && (
            <div className="flex items-center gap-2">
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
        </div>

        {/* View mode toggle */}
        {tab === "logged" && (
          <div className="flex gap-1 p-1 mb-3 bg-muted/30 rounded-xl w-fit">
            {[{ id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "year", label: "Year" }].map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => setViewMode(v.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  viewMode === v.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >{v.label}</button>
            ))}
          </div>
        )}

        {/* Tab switcher + Plan Activity button */}
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex gap-1 p-1 bg-muted/30 rounded-xl w-fit">
            {[{ id: "logged", label: "Logged" }, { id: "planned", label: "Planned" }].map(t => (
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
          <Button size="sm" variant="outline" onClick={() => setPlanModalOpen(true)} className="gap-1.5 h-8">
            <CalendarPlus className="w-3.5 h-3.5" /> Plan Activity
          </Button>
        </div>

        {tab === "logged" ? (
          <>
            {viewMode === "week" && (
              <ActivityWeeklyGrid
                weekDays={weekDays}
                activities={activities}
                alters={alters}
                frontingHistory={frontingHistory}
                onTimeRangeSelect={handleTimeRangeSelect}
                onActivityClick={handleActivityClick}
                addMode={addMode}
                onToggleAddMode={() => setAddMode(v => !v)}
                highlightActivityId={highlightId}
                onWeekStartChange={setWeekStartsOn}
                onDayClick={setZoomedDate}
              />
            )}
            {viewMode === "month" && (
              <ActivityMonthView
                monthDate={currentDate}
                activities={activities}
                alters={alters}
                weekStartsOn={weekStartsOn}
                onDayClick={setZoomedDate}
                onActivityClick={handleActivityClick}
              />
            )}
            {viewMode === "year" && (
              <ActivityYearView
                yearDate={currentDate}
                activities={activities}
                weekStartsOn={weekStartsOn}
                onMonthClick={(d) => { setCurrentDate(d); setViewMode("month"); }}
                onDayClick={setZoomedDate}
              />
            )}

            <div className="mt-6">
              <ActivityGoalsPanel weekStart={weekStart} />
            </div>
            <div className="mt-6">
              <ActivityTallyTracker activities={activities} />
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

      <ActivityTimeRangeModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        startDate={selectedDate}
        endDate={selectedEndDate}
        startHour={selectedStartHour}
        endHour={selectedEndHour}
        startMinute={selectedStartMinute}
        endMinute={selectedEndMinute}
        allActivities={activities}
        alters={alters}
        frontingHistory={frontingHistory}
        onSave={() => { handleCloseModal(); handleActivitySave(); }}
      />
      <ActivityTimeRangeModal
        isOpen={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        planMode
        alters={alters}
        frontingHistory={frontingHistory}
        onSave={() => { setPlanModalOpen(false); handleActivitySave(); setTab("planned"); }}
      />
      {zoomedDate && (
        <ActivityDayView
          date={zoomedDate}
          activities={activities}
          alters={alters}
          frontingHistory={frontingHistory}
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
      />
    </div>
  );
}