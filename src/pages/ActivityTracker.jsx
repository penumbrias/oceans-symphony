import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, addDays, parseISO } from "date-fns";
import ActivityLogModal from "@/components/activities/ActivityLogModal";

export default function ActivityTracker() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

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

  const groupedActivities = weekDays.map((day) => ({
    date: day,
    activities: activities.filter(
      (a) =>
        format(parseISO(a.timestamp), "yyyy-MM-dd") ===
        format(day, "yyyy-MM-dd")
    ),
  }));

  const handleAddActivity = (date) => {
    setSelectedDate(date);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    queryClient.invalidateQueries({ queryKey: ["activities"] });
    setIsModalOpen(false);
    toast.success("Activity logged!");
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
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

        {/* Hobonichi-style weekly grid */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2 bg-card rounded-lg p-4 border border-border">
          {groupedActivities.map(({ date, activities: dayActivities }) => (
            <div key={format(date, "yyyy-MM-dd")} className="flex flex-col">
              {/* Day header */}
              <div className="text-center pb-3 border-b border-border mb-3">
                <div className="text-xs font-semibold text-muted-foreground">
                  {format(date, "EEE")}
                </div>
                <div className="text-lg font-bold text-foreground">
                  {format(date, "d")}
                </div>
              </div>

              {/* Activities list for the day */}
              <div className="space-y-2 flex-1">
                {dayActivities.map((activity) => {
                  const altersInActivity = activity.fronting_alter_ids
                    ?.map((id) => alters.find((a) => a.id === id)?.alias || "Unknown")
                    .join(", ");
                  
                  return (
                    <div
                      key={activity.id}
                      className="p-2 bg-muted/50 rounded text-xs space-y-1"
                    >
                      <div className="font-medium text-foreground">
                        {activity.activity_name}
                      </div>
                      {activity.duration_minutes && (
                        <div className="text-muted-foreground">
                          {activity.duration_minutes}m
                        </div>
                      )}
                      {altersInActivity && (
                        <div className="text-muted-foreground">
                          {altersInActivity}
                        </div>
                      )}
                      {activity.category !== "other" && (
                        <div className="inline-block px-1.5 py-0.5 bg-primary/20 text-primary rounded text-xs">
                          {activity.category}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={() => handleAddActivity(date)}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <ActivityLogModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        selectedDate={selectedDate}
        alters={alters}
      />
    </div>
  );
}