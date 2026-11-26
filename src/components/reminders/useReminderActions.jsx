// Answering a fired reminder, in one place for both houses: the old inbox
// (RemindersInbox) and the new house's Reminders room
// (src/house/reminders/). The writes are src/lib/reminderInstanceActions.js;
// this decides which sheet or page a reminder's button opens, and marks the
// reminder done when the check-in is saved or the front picker closes.
//
//   const acts = useReminderActions({ notify });
//   acts.run(instance, action) · acts.done(i) · acts.dismiss(i) · acts.snooze(i, opt) · acts.unsnooze(i)
//   {acts.modals}   — render once (the check-in and front sheets)
//
// `notify(kind, words)` says what happened ("done" | "info"); the old inbox
// passes sonner, the house its own toasts.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import QuickCheckInModal from "@/components/emotions/QuickCheckInModal";
import SetFrontSheet from "@/components/fronting/SetFrontSheet";
import { markReminderDone, dismissReminder, snoozeReminder, unsnoozeReminder } from "@/lib/reminderInstanceActions";
import { actionRoute, formatSnoozeLabel } from "@/lib/reminderForm";

// The buttons that open the check-in sheet (and are done when it's saved).
const CHECK_IN_TYPES = new Set(["open_check_in", "open_symptom_check_in", "log_symptom"]);

export function useReminderActions({ notify } = {}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [setFrontOpen, setSetFrontOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["reminderInstances"] });
  const say = (kind, words) => { try { notify?.(kind, words); } catch { /* words only */ } };

  const run = async (instance, action) => {
    const type = action?.action_type;
    if (type === "open_set_front") { setPending(instance); setSetFrontOpen(true); return; }
    if (CHECK_IN_TYPES.has(type)) { setPending(instance); setCheckInOpen(true); return; }
    if (type === "dismiss") { await dismissReminder(instance); refresh(); return; }
    if (type === "open_route") {
      const path = actionRoute(action);
      if (!path) return; // no valid path: don't mark as acted
      navigate(path);
    } else {
      const path = actionRoute(action);
      if (path) navigate(path);
    }
    await markReminderDone(instance, type); refresh();
  };

  const done = async (instance) => { await markReminderDone(instance); refresh(); say("done", "Marked done"); };
  const dismiss = async (instance) => { await dismissReminder(instance); refresh(); say("info", "Dismissed"); };
  const snooze = async (instance, option) => { await snoozeReminder(instance, option); refresh(); say("info", `Snoozed for ${formatSnoozeLabel(option)}`); };
  const unsnooze = async (instance) => { await unsnoozeReminder(instance); refresh(); };

  const modals = (
    <>
      <QuickCheckInModal
        isOpen={checkInOpen}
        onClose={(saved) => {
          setCheckInOpen(false);
          if (saved && pending) markReminderDone(pending, "open_check_in").then(refresh);
          setPending(null);
        }}
      />
      <SetFrontSheet
        open={setFrontOpen}
        alters={alters}
        onClose={() => {
          setSetFrontOpen(false);
          if (pending) markReminderDone(pending, "open_set_front").then(refresh);
          setPending(null);
        }}
      />
    </>
  );

  return { run, done, dismiss, snooze, unsnooze, modals };
}

export default useReminderActions;
