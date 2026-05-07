import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, AlarmClock, Cloud, ZapOff, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import SleepLogModal from "@/components/sleep/SleepLogModal";
import SleepEditModal from "@/components/sleep/SleepEditModal";

export default function SleepTracker() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingSleep, setEditingSleep] = useState(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const { data: sleepRecords = [] } = useQuery({
    queryKey: ["sleep", format(currentDate, "yyyy-MM")],
    queryFn: () => base44.entities.Sleep.list(),
  });

  const getSleepForDate = (date) => {
    return sleepRecords.find(
      (s) => format(parseISO(s.date), "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
    );
  };

  const calculateDuration = (sleep) => {
    if (!sleep.bedtime || !sleep.wake_time) return 0;
    const bedTime = parseISO(sleep.bedtime);
    const wakeTime = parseISO(sleep.wake_time);
    return (wakeTime - bedTime) / (1000 * 60 * 60); // hours
  };

  const handleDelete = async (sleepId) => {
    try {
      await base44.entities.Sleep.delete(sleepId);
      queryClient.invalidateQueries({ queryKey: ["sleep"] });
      toast.success("🗑 Sleep record deleted");
    } catch (err) {
      toast.error(err.message || "Failed to delete sleep record");
    }
  };

  const handleAddSleep = (date) => {
    setSelectedDate(date);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    queryClient.invalidateQueries({ queryKey: ["sleep"] });
    setIsModalOpen(false);
    toast.success("✅ Sleep logged!");
  };

  const averageQuality =
    sleepRecords.length > 0
      ? (sleepRecords.reduce((sum, s) => sum + (s.quality || 0), 0) /
          sleepRecords.length).toFixed(1)
      : 0;

  const averageDuration =
    sleepRecords.length > 0
      ? (sleepRecords.reduce((sum, s) => sum + calculateDuration(s), 0) /
          sleepRecords.length).toFixed(1)
      : 0;

  return (
    <div className="py-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Sleep Tracker</h1>
          <p className="text-muted-foreground">Track your sleep patterns and quality</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {sleepRecords.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  Records this month
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {averageDuration}h
                </div>
                <div className="text-xs text-muted-foreground">
                  Average duration
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {averageQuality}
                </div>
                <div className="text-xs text-muted-foreground">
                  Average quality (1-10)
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Button
                onClick={() => handleAddSleep(new Date())}
                className="w-full bg-primary hover:bg-primary/90"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Record
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Sleep records list */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recent Records</p>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          {sleepRecords.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="text-4xl mb-2">😴</div>
              <p className="text-sm font-medium text-foreground mb-1">No sleep records yet</p>
              <p className="text-xs text-muted-foreground">Log your first night to start tracking patterns.</p>
            </div>
          ) : (
            sleepRecords
              .sort(
                (a, b) =>
                  parseISO(b.bedtime || "") - parseISO(a.bedtime || "")
              )
              .map((sleep) => {
                const duration = calculateDuration(sleep);
                return (
                  <Card key={sleep.id} className="hover:bg-muted/30 transition-colors">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="font-semibold text-foreground">
                            {format(parseISO(sleep.date), "EEEE, MMMM d")}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {format(parseISO(sleep.bedtime), "h:mm a")} -{" "}
                            {format(parseISO(sleep.wake_time), "h:mm a")}
                          </div>
                          <div className="text-sm mt-2 flex gap-4">
                            <span className="text-primary font-medium">
                              {duration.toFixed(1)} hours
                            </span>
                            {sleep.quality && (
                              <span className="text-accent-foreground">
                                Quality: {sleep.quality}/10
                              </span>
                            )}
                          </div>
                          {(sleep.is_interrupted || sleep.dreamed || sleep.had_nightmare) && (
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {sleep.is_interrupted && (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20">
                                  <AlarmClock className="w-3 h-3" />
                                  {(() => { const n = sleep.interruption_count || sleep.interruption_times?.length; return n ? `Interrupted ×${n}` : "Interrupted"; })()}
                                </span>
                              )}
                              {sleep.dreamed && !sleep.had_nightmare && (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                  <Cloud className="w-3 h-3" /> Dreamed
                                </span>
                              )}
                              {sleep.had_nightmare && (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                                  <ZapOff className="w-3 h-3" /> Nightmare
                                </span>
                              )}
                            </div>
                          )}
                          {sleep.is_interrupted && sleep.interruption_times?.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Woke at: {sleep.interruption_times.join(", ")}
                            </p>
                          )}
                          {sleep.notes && (
                            <p className="text-sm text-muted-foreground mt-2">
                              {sleep.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingSleep(sleep)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(sleep.id)}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
          )}
        </div>
      </div>

      <SleepLogModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        selectedDate={selectedDate}
      />

      {editingSleep && (
        <SleepEditModal
          sleep={editingSleep}
          onClose={() => setEditingSleep(null)}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ["sleep"] });
            setEditingSleep(null);
          }}
        />
      )}
    </div>
  );
}