import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bell, X } from "lucide-react";
import { motion } from "framer-motion";
import RemindersInbox from "@/components/reminders/RemindersInbox";
import RemindersManage from "@/components/reminders/RemindersManage";
import RemindersOnboarding from "@/components/reminders/RemindersOnboarding";

export default function Reminders() {
  const [tab, setTab] = useState("inbox");
  const [helperDismissed, setHelperDismissed] = useState(() => {
    return localStorage.getItem("reminders_helper_dismissed") === "true";
  });
  const [autoTriggerAction, setAutoTriggerAction] = useState(null);
  const queryClient = useQueryClient();

  // Handle notification click deep-link: /reminders?act=<id>&action=<type>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const instanceId = params.get("act");
    const actionType = params.get("action");
    if (instanceId && actionType) {
      // Update the instance status
      const statusMap = { dismiss: "dismissed" };
      const status = statusMap[actionType] || "acted";
      base44.entities.ReminderInstance.update(instanceId, { status, acted_action: actionType })
        .then(() => queryClient.invalidateQueries({ queryKey: ["reminderInstances"] }));
      // Clean URL and switch to inbox tab
      window.history.replaceState({}, "", "/reminders");
      setTab("inbox");
      // Pass action to inbox so it can trigger the correct behavior
      if (actionType !== "dismiss") {
        setAutoTriggerAction({ instanceId, actionType });
      }
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

          {!helperDismissed && (
            <div className="flex items-start justify-between gap-3 px-3 py-2 bg-muted/20 rounded-lg border border-border/30">
              <p className="text-xs text-muted-foreground">
                {tab === "inbox"
                  ? "Reminders that have fired and are waiting for you to act on them. Snoozed reminders live here until their wake time."
                  : "Your reminder rules. Edit, pause, or delete. New instances are created automatically based on each rule's schedule."}
              </p>
              <button
                onClick={() => {
                  setHelperDismissed(true);
                  localStorage.setItem("reminders_helper_dismissed", "true");
                }}
                className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {tab === "inbox" ? (
            <RemindersInbox autoTriggerAction={autoTriggerAction} />
          ) : (
            <RemindersManage />
          )}
        </>
      )}
    </motion.div>
  );
}