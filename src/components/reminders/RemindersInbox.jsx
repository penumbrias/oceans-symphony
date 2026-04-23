import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import ReminderInstanceCard from "./ReminderInstanceCard";
import QuickCheckInModal from "@/components/emotions/QuickCheckInModal";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import { snoozeUntilDate } from "./snoozeHelpers";

export default function RemindersInbox({ autoTriggerAction = null }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showHandled, setShowHandled] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [setFrontOpen, setSetFrontOpen] = useState(false);
  const [pendingActInstance, setPendingActInstance] = useState(null);

  const { data: instances = [] } = useQuery({
    queryKey: ["reminderInstances", "inbox"],
    queryFn: () => base44.entities.ReminderInstance.list("-scheduled_for", 200),
    refetchInterval: 60000,
  });

  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders", "all"],
    queryFn: () => base44.entities.Reminder.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const reminderMap = Object.fromEntries(reminders.map(r => [r.id, r]));
  const alterMap = Object.fromEntries(alters.map(a => [a.id, a]));

  // Fire deep-link action once instances are loaded
  useEffect(() => {
    if (!autoTriggerAction || !instances.length) return;
    const { instanceId, actionType } = autoTriggerAction;
    const instance = instances.find(i => i.id === instanceId);
    if (!instance) return;
    // Trigger the action as if the user tapped it
    handleAction(instance, { action_type: actionType });
  }, [autoTriggerAction, instances]);

  const active = instances.filter(i => {
    if (i.status === "snoozed") return true; // always show snoozed so user can unsnooze
    return ["fired", "pending"].includes(i.status);
  }).sort((a, b) => {
    const aTime = a.fired_at || a.scheduled_for;
    const bTime = b.fired_at || b.scheduled_for;
    return new Date(bTime) - new Date(aTime);
  });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const handled = instances
    .filter(i => ["acted", "dismissed", "auto_resolved"].includes(i.status) && (i.updated_date || i.created_date) >= sevenDaysAgo)
    .sort((a, b) => new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date))
    .slice(0, 10);

  const updateInstance = async (id, data) => {
    await base44.entities.ReminderInstance.update(id, data);
    queryClient.invalidateQueries({ queryKey: ["reminderInstances"] });
  };

  const handleAction = async (instance, action) => {
    const reminder = reminderMap[instance.reminder_id];
    if (!reminder) return;
    const type = action.action_type;

    if (type === "open_set_front") {
      setPendingActInstance(instance);
      setSetFrontOpen(true);
      return; // status updated on modal close
    } else if (type === "open_check_in") {
      setPendingActInstance(instance);
      setCheckInOpen(true);
      return; // status updated on modal close
    } else if (type === "open_grounding") {
      navigate("/grounding");
    } else if (type === "open_journal") {
      navigate("/journals");
    } else if (type === "open_diary") {
      navigate("/checkin-log");
    } else if (type === "open_symptom_check_in") {
      setPendingActInstance(instance);
      setCheckInOpen(true);
      return; // status updated on modal close
    } else if (type === "open_system_map") {
      navigate("/system-map");
    } else if (type === "open_timeline") {
      navigate("/timeline");
    } else if (type === "open_todo") {
      navigate("/todo");
    } else if (type === "open_route") {
      navigate(action.payload?.path || "/");
    } else if (type === "log_symptom") {
      setPendingActInstance(instance);
      setCheckInOpen(true);
      return; // open check-in modal so user can log symptoms with context
    } else if (type === "dismiss") {
      await updateInstance(instance.id, { status: "dismissed" });
      return;
    }
    await updateInstance(instance.id, { status: "acted", acted_action: type });
  };

  const handleSnooze = async (instance, option) => {
    await updateInstance(instance.id, { status: "snoozed", snoozed_until: snoozeUntilDate(option) });
  };

  const handleUnsnooze = async (instance) => {
    await updateInstance(instance.id, { status: "fired", snoozed_until: null });
  };

  const handleDone = async (instance) => {
    await updateInstance(instance.id, { status: "acted", acted_action: "done" });
    toast.success("Marked done");
  };
  const handleDismiss = async (instance) => {
    await updateInstance(instance.id, { status: "dismissed" });
    toast("Dismissed");
  };
  const handleSnoozeWithToast = async (instance, option) => {
    await handleSnooze(instance, option);
    const { formatSnoozeLabel } = await import("./snoozeHelpers");
    toast(`Snoozed for ${formatSnoozeLabel(option)}`);
  };

  return (
    <div className="space-y-4">
      {active.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <div className="text-4xl">🤍</div>
          <p className="text-sm font-medium">No reminders right now</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            When your reminders fire, they'll appear here. Head to the Manage tab to create or adjust reminder rules.
          </p>
        </div>
      ) : (
        active.map(instance => {
          const reminder = reminderMap[instance.reminder_id];
          return (
            <ReminderInstanceCard
              key={instance.id}
              instance={instance}
              reminder={reminder}
              alter={reminder?.alter_id ? alterMap[reminder.alter_id] : null}
              onAction={(action) => handleAction(instance, action)}
              onSnooze={(opt) => handleSnoozeWithToast(instance, opt)}
              onUnsnooze={() => handleUnsnooze(instance)}
              onDone={() => handleDone(instance)}
              onDismiss={() => handleDismiss(instance)}
            />
          );
        })
      )}

      {handled.length > 0 && (
        <div>
          <button
            onClick={() => setShowHandled(o => !o)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            {showHandled ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Recently handled ({handled.length})
          </button>
          {showHandled && (
            <div className="space-y-2 mt-2 opacity-60">
              {handled.map(instance => {
                const reminder = reminderMap[instance.reminder_id];
                return (
                  <ReminderInstanceCard
                    key={instance.id}
                    instance={instance}
                    reminder={reminder}
                    alter={reminder?.alter_id ? alterMap[reminder.alter_id] : null}
                    readOnly
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {checkInOpen && (
        <QuickCheckInModal
          isOpen={checkInOpen}
          onClose={(saved) => {
            setCheckInOpen(false);
            if (saved && pendingActInstance) {
              updateInstance(pendingActInstance.id, { status: "acted", acted_action: "open_check_in" });
            }
            setPendingActInstance(null);
          }}
        />
      )}

      {setFrontOpen && (
        <SetFrontModal
          open={setFrontOpen}
          alters={alters}
          onClose={() => {
            setSetFrontOpen(false);
            if (pendingActInstance) {
              updateInstance(pendingActInstance.id, { status: "acted", acted_action: "open_set_front" });
            }
            setPendingActInstance(null);
          }}
        />
      )}
    </div>
  );
}