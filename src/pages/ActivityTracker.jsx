import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, addDays } from "date-fns";
import ActivityWeeklyGrid from "@/components/activities/ActivityWeeklyGrid";
import ActivityTimeRangeModal from "@/components/activities/ActivityTimeRangeModal";
import ActivityDetailsModal from "@/components/activities/ActivityDetailsModal";
import ActivityTallyTracker from "@/components/activities/ActivityTallyTracker";
import ActivityGoalsPanel from "@/components/activities/ActivityGoalsPanel";

export default function ActivityTracker() {
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedStartHour, setSelectedStartHour] = useState(undefined);
  const [selectedEndHour, setSelectedEndHour] = useState(undefined);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [addMode, setAddMode] = useState(false);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
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

  const handleTimeRangeSelect = (date, startHour, endHour) => {
    setSelectedDate(date);
    setSelectedStartHour(startHour);
    setSelectedEndHour(endHour);
    setIsModalOpen(true);
    setAddMode(false);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedDate(null);
    setSelectedStartHour(undefined);
    setSelectedEndHour(undefined);
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-full mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-foreground">Activity Tracker</h1>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate(addDays(currentDate, -7))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-fit">
              {format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "MMM d, yyyy")}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate(addDays(currentDate, 7))}
            >
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
          onToggleAddMode={() => setAddMode((v) => !v)}
        />

        <div className="mt-8">
          <ActivityGoalsPanel weekStart={weekStart} />
        </div>

        <div className="mt-8">
          <ActivityTallyTracker activities={activities} />
        </div>
      </div>

      <ActivityTimeRangeModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        startDate={selectedDate}
        startHour={selectedStartHour}
        endHour={selectedEndHour}
        allActivities={activities}
        alters={alters}
        frontingHistory={frontingHistory}
        onSave={() => {
          handleCloseModal();
          handleActivitySave();
        }}
      />

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