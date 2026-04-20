import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bell } from "lucide-react";
import { useEffect } from "react";
import { useQueryClient as _useQC } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import RemindersInbox from "@/components/reminders/RemindersInbox";
import RemindersManage from "@/components/reminders/RemindersManage";
import RemindersOnboarding from "@/components/reminders/RemindersOnboarding";

export default function Reminders() {
  const [tab, setTab] = useState("inbox");
  const queryClient = useQueryClient();

  // Handle notification click deep-link: /reminders?act=<id>&action=<type>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const instanceId = params.get("act");
    const action = params.get("action");
    if (instanceId && action) {
      import("@/api/base44Client").then(({ base44 }) => {
        const statusMap = { dismiss: "dismissed", open_grounding: "acted", open_route: "acted", open_check_in: "acted", log_symptom: "acted" };
        const status = statusMap[action] || "acted";
        base44.entities.ReminderInstance.update(instanceId, { status, acted_action: action })
          .then(() => queryClient.invalidateQueries({ queryKey: ["reminderInstances"] }));
      });
      // Clean URL
      window.history.replaceState({}, "", "/reminders");
    }
  }, []);

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ["reminders"],
    queryFn: () => base44.entities.Reminder.filter({ is_active: true }),
  });

  const { data: allReminders = [] } = useQuery({
    queryKey: ["reminders", "all"],
    queryFn: () => base44.entities.Reminder.list(),
  });

  const showOnboarding = !isLoading && allReminders.length === 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reminders</h1>
            <p className="text-xs text-muted-foreground">Stay on track with gentle nudges</p>
          </div>
        </div>
      </div>

      {showOnboarding ? (
        <RemindersOnboarding onDone={() => queryClient.invalidateQueries({ queryKey: ["reminders"] })} />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-muted/30 rounded-xl w-fit">
            {["inbox", "manage"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                  tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {t}
              </button>
            ))}
          </div>

          {tab === "inbox" ? (
            <RemindersInbox />
          ) : (
            <RemindersManage />
          )}
        </>
      )}
    </motion.div>
  );
}