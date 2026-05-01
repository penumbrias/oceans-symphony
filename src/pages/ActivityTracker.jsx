import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, addDays } from "date-fns";
import { useDeepLinkHighlight } from "@/lib/useDeepLinkHighlight";
import ActivityWeeklyGrid from "@/components/activities/ActivityWeeklyGrid";
import ActivityTimeRangeModal from "@/components/activities/ActivityTimeRangeModal";
import ActivityDetailsModal from "@/components/activities/ActivityDetailsModal";
import ActivityTallyTracker from "@/components/activities/ActivityTallyTracker";
import ActivityGoalsPanel from "@/components/activities/ActivityGoalsPanel";
import ActivityDayView from "@/components/activities/ActivityDayView";

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
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-foreground">Activity Tracker</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(addDays(currentDate, -7))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-fit">
              {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(addDays(currentDate, 7))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

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

        <div className="mt-6">
          <ActivityGoalsPanel weekStart={weekStart} />
        </div>
        <div className="mt-6">
          <ActivityTallyTracker activities={activities} />
        </div>
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