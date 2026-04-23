import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { X, ChevronDown, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_ICONS } from "./reminderHelpers";
import { usePendingReminderInstances } from "@/lib/remindersScheduler";
import { formatSnoozeLabel, snoozeUntilDate } from "./snoozeHelpers";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import QuickCheckInModal from "@/components/emotions/QuickCheckInModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SESSION_KEY = "symphony_shown_toast_ids";

function getShownIds() {
  try { return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]")); }
  catch { return new Set(); }
}
function addShownId(id) {
  const ids = getShownIds();
  ids.add(id);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify([...ids]));
}
function removeShownId(id) {
  const ids = getShownIds();
  ids.delete(id);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify([...ids]));
}

const DEFAULT_SNOOZE = [10, 60, 240, "tomorrow"];

export default function ReminderToast() {
  const { data: pendingInstances = [] } = usePendingReminderInstances();
  const [visible, setVisible] = useState([]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const reminderCacheRef = useRef({});
  const [setFrontOpen, setSetFrontOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [pendingActInstance, setPendingActInstance] = useState(null);

  // Load reminder data for each instance we need
  useEffect(() => {
    const shownIds = getShownIds();
    const newOnes = pendingInstances.filter(i => !shownIds.has(i.id) && i.status === "fired");
    if (!newOnes.length) return;

    Promise.all(newOnes.map(async inst => {
      let reminder = reminderCacheRef.current[inst.reminder_id];
      if (!reminder) {
        try {
          const list = await base44.entities.Reminder.filter({ id: inst.reminder_id });
          reminder = list?.[0];
          if (reminder) reminderCacheRef.current[inst.reminder_id] = reminder;
        } catch {}
      }
      return reminder ? { instance: inst, reminder } : null;
    })).then(results => {
      const valid = results.filter(Boolean);
      valid.forEach(({ instance }) => addShownId(instance.id));
      setVisible(prev => [...prev, ...valid]);
    });
  }, [pendingInstances]);

  const dismiss = (instanceId) => {
    setVisible(prev => prev.filter(v => v.instance.id !== instanceId));
  };

  const updateInstance = async (id, data) => {
    await base44.entities.ReminderInstance.update(id, data);
    queryClient.invalidateQueries({ queryKey: ["reminderInstances"] });
    dismiss(id);
  };

  const handleAction = async ({ instance, reminder }, action) => {
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
      navigate("/diary");
    } else if (type === "open_symptom_check_in") {
      navigate("/diary?openSymptoms=1");
    } else if (type === "open_system_map") {
      navigate("/system-map");
    } else if (type === "open_timeline") {
      navigate("/timeline");
    } else if (type === "open_todo") {
      navigate("/todo");
    } else if (type === "open_route") {
      navigate(action.payload?.path || "/");
    } else if (type === "log_symptom") {
      await base44.entities.SymptomCheckIn.create({ symptom_id: action.payload?.symptom_id, timestamp: new Date().toISOString() });
    } else if (type === "dismiss") {
      await updateInstance(instance.id, { status: "dismissed" });
      return;
    }
    await updateInstance(instance.id, { status: "acted", acted_action: type });
  };

  const handleSnooze = async ({ instance }, opt) => {
    removeShownId(instance.id);
    await updateInstance(instance.id, { status: "snoozed", snoozed_until: snoozeUntilDate(opt) });
    queryClient.invalidateQueries({ queryKey: ["reminderInstances", "pending"] });
  };

  if (!visible.length) return null;

  return (
    <>
      <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 left-4 sm:left-auto z-[200] pointer-events-none flex flex-col-reverse gap-2 max-w-sm sm:max-w-xs mx-auto sm:mx-0">
      {visible.slice(0, 3).map(({ instance, reminder }) => {
        const Icon = CATEGORY_ICONS[reminder.category] || CATEGORY_ICONS.custom;
        const inlineActions = reminder.inline_actions || [];
        const visibleActions = inlineActions.slice(0, 2);
        const moreActions = inlineActions.slice(2);
        const snoozeOptions = reminder.snooze_options || DEFAULT_SNOOZE;

        return (
          <div key={instance.id}
            className="bg-card border border-border shadow-xl rounded-2xl p-4 space-y-3 animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
            {/* Header */}
            <div className="flex items-start gap-3">
              <span className="text-xl flex-shrink-0 mt-0.5">{Icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground leading-tight">{reminder.title}</p>
                {reminder.body && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{reminder.body}</p>
                )}
              </div>
              <button onClick={() => dismiss(instance.id)}
                className="text-muted-foreground hover:text-foreground transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inline actions */}
            {(visibleActions.length > 0 || moreActions.length > 0) && (
              <div className="flex items-center gap-2">
                {visibleActions.map((action, i) => (
                  <Button key={i} size="sm" variant="outline" className="text-xs h-7 flex-1"
                    onClick={() => handleAction({ instance, reminder }, action)}>
                    {action.label}
                  </Button>
                ))}
                {moreActions.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="outline" className="h-7 w-7">
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[210]">
                      {moreActions.map((action, i) => (
                        <DropdownMenuItem key={i} onClick={() => handleAction({ instance, reminder }, action)}>
                          {action.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}

            {/* Done / Snooze / Dismiss */}
            <div className="flex items-center gap-2">
              <Button size="sm" className="text-xs h-7 flex-1"
                onClick={() => updateInstance(instance.id, { status: "acted", acted_action: "done" })}>
                Done
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="text-xs h-7 gap-1">
                    Snooze <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[210]">
                  {snoozeOptions.map((opt, i) => (
                    <DropdownMenuItem key={i} onClick={() => handleSnooze({ instance, reminder }, opt)}>
                      {formatSnoozeLabel(opt)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground"
                onClick={() => updateInstance(instance.id, { status: "dismissed" })}>
                Dismiss
              </Button>
            </div>
          </div>
        );
      })}
      </div>

      {setFrontOpen && (
        <SetFrontModal
          open={setFrontOpen}
          onClose={() => {
            setSetFrontOpen(false);
            if (pendingActInstance) {
              updateInstance(pendingActInstance.id, { status: "acted", acted_action: "open_set_front" });
            }
            setPendingActInstance(null);
          }}
        />
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
    </>
  );
}