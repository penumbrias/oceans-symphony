import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import ReminderInstanceCard from "./ReminderInstanceCard";
import { useUiLook, UI_LOOKS } from "@/lib/uiLook";
import { inboxBuckets } from "@/lib/reminderForm";
import { useReminderActions } from "./useReminderActions";

export default function RemindersInbox({ autoTriggerAction = null }) {
  const pixel = useUiLook() === UI_LOOKS.PIXEL;
  const [showHandled, setShowHandled] = useState(false);
  // The answers (and the sheets a button opens) are shared with the new
  // house's Reminders room: useReminderActions.jsx.
  const acts = useReminderActions({ notify: (kind, words) => (kind === "done" ? toast.success(words) : toast.info(words)) });

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
  const consumedTriggerRef = useRef(null);
  useEffect(() => {
    if (!autoTriggerAction || !instances.length) return;
    const { instanceId, actionType } = autoTriggerAction;
    // Once per deep link: `instances` refetches every 60 s and after every
    // update, and the instance is still in the list — this used to re-open
    // the check-in modal on every refetch.
    if (consumedTriggerRef.current === instanceId) return;
    const instance = instances.find(i => i.id === instanceId);
    if (!instance) return;
    consumedTriggerRef.current = instanceId;
    // Trigger the action as if the user tapped it
    handleAction(instance, { action_type: actionType });
  }, [autoTriggerAction, instances]);

  const { due: active, handled } = inboxBuckets(instances);
  const handleAction = acts.run;
  const handleSnoozeWithToast = acts.snooze;
  const handleUnsnooze = acts.unsnooze;
  const handleDone = acts.done;
  const handleDismiss = acts.dismiss;
  const modals = acts.modals;

  const card = (instance, readOnly = false) => {
    const reminder = reminderMap[instance.reminder_id];
    return (
      <ReminderInstanceCard
        key={instance.id}
        instance={instance}
        reminder={reminder}
        alter={reminder?.alter_id ? alterMap[reminder.alter_id] : null}
        readOnly={readOnly}
        onAction={(action) => handleAction(instance, action)}
        onSnooze={(opt) => handleSnoozeWithToast(instance, opt)}
        onUnsnooze={() => handleUnsnooze(instance)}
        onDone={() => handleDone(instance)}
        onDismiss={() => handleDismiss(instance)}
      />
    );
  };

  // Pixel look: the "Due now" panel of the Reminders board, with the
  // recently handled ones folded at its foot.
  if (pixel) {
    return (
      <section className="prm-pn" aria-label="Due now">
        <div className="prm-ttl"><span>Due now</span><span className="prm-mut">{active.length}</span></div>
        {active.length === 0 ? (
          <div className="prm-empty">Nothing due right now. When a reminder fires, it waits here until you act on it. Snoozed ones wait here too.</div>
        ) : active.map((i) => card(i))}
        {handled.length > 0 && (
          <>
            <button type="button" className="prm-fold" aria-expanded={showHandled} onClick={() => setShowHandled(o => !o)}>
              {showHandled ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Recently handled ({handled.length})
            </button>
            {showHandled && handled.map((i) => card(i, true))}
          </>
        )}
        {modals}
      </section>
    );
  }

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

      {modals}
    </div>
  );
}