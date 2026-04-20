import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { zonedFireInstant, getUserLocalDate, getCurrentMinutesInZone } from "@/lib/timezoneHelpers";

// ── helpers ───────────────────────────────────────────────────────────────────

function parseHHMM(str) {
  const [h, m] = (str || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function inQuietWindow(minuteOfDay, start, end) {
  if (start <= end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
}

const WINDOW = 60 * 1000;

// ── client-side evaluator (mirrors backend logic, no push) ───────────────────

function evaluateReminderDue(reminder, now, existingInstances, cachedData, userTz = 'UTC') {
  const { trigger_type, trigger_config: cfg, last_fired_at } = reminder;
  const nowMs = now.getTime();

  if (trigger_type === "scheduled") {
    const times = cfg?.times || [];
    const days = cfg?.days;
    
    // Get user's local date and day-of-week
    const userLocalDate = getUserLocalDate(now, userTz);
    const localNow = new Date(now);
    // Note: in browser, we can use local time directly for day-of-week
    // But for consistency with backend, use the userLocalDate
    const [y, m, d] = userLocalDate.split('-').map(Number);
    const localDateObj = new Date(y, m - 1, d);
    const todayDow = localDateObj.getDay();
    
    if (days && !days.includes(todayDow)) return null;

    for (const timeStr of times) {
      const fireInstant = zonedFireInstant(userLocalDate, timeStr, userTz);
      const diff = nowMs - fireInstant.getTime();
      if (diff >= 0 && diff < WINDOW) {
        const alreadyFired = existingInstances.some(i =>
          i.reminder_id === reminder.id &&
          Math.abs(new Date(i.scheduled_for).getTime() - fireInstant.getTime()) < WINDOW
        );
        if (!alreadyFired) return { scheduled_for: fireInstant.toISOString() };
      }
    }
    return null;
  }

  if (trigger_type === "interval") {
    const everyMs = (cfg?.every_minutes || 60) * 60 * 1000;
    let baseline = last_fired_at ? new Date(last_fired_at) : null;

    if (cfg?.after_last === "check_in") {
      const checkIns = cachedData?.emotionCheckIns || [];
      if (checkIns.length) {
        baseline = new Date(checkIns[0].timestamp || checkIns[0].created_date);
      }
    }

    if (!baseline) return { scheduled_for: now.toISOString() };

    const elapsed = nowMs - baseline.getTime();
    if (elapsed < everyMs) return null;

    if (cfg?.active_window) {
      const winStart = parseHHMM(cfg.active_window.start);
      const winEnd = parseHHMM(cfg.active_window.end);
      if (!inQuietWindow(getCurrentMinutesInZone(now, userTz), winStart, winEnd)) return null;
    }

    return { scheduled_for: now.toISOString() };
  }

  if (trigger_type === "contextual") {
    const on = cfg?.on;

    if (on === "no_front_update") {
      const threshold = (cfg?.threshold_minutes || 120) * 60 * 1000;
      const sessions = cachedData?.sessions || [];
      if (!sessions.length) return null;
      const s = sessions[0];
      const lastActivity = Math.max(
        new Date(s.start_time || 0).getTime(),
        new Date(s.end_time || 0).getTime(),
        new Date(s.created_date || 0).getTime()
      );
      if (nowMs - lastActivity >= threshold) {
        const alreadyFired = existingInstances.some(i =>
          i.reminder_id === reminder.id &&
          nowMs - new Date(i.scheduled_for).getTime() < threshold
        );
        if (!alreadyFired) return { scheduled_for: now.toISOString() };
      }
      return null;
    }

    if (on === "emotion_logged") {
      const delayMs = (cfg?.delay_minutes || 0) * 60 * 1000;
      const matches = cfg?.matches || [];
      const windowStart = nowMs - delayMs - WINDOW;
      const checkIns = cachedData?.emotionCheckIns || [];
      for (const ci of checkIns) {
        const ciTime = new Date(ci.timestamp || ci.created_date).getTime();
        if (ciTime < windowStart) break;
        const hasMatch = matches.length === 0 || (ci.emotions || []).some(e => matches.includes(e));
        if (!hasMatch) continue;
        const fireAt = ciTime + delayMs;
        if (nowMs >= fireAt && nowMs - fireAt < WINDOW) {
          const alreadyFired = existingInstances.some(i =>
            i.reminder_id === reminder.id &&
            Math.abs(new Date(i.scheduled_for).getTime() - fireAt) < WINDOW
          );
          if (!alreadyFired) return { scheduled_for: new Date(fireAt).toISOString() };
        }
      }
      return null;
    }

    if (on === "sleep_ended") {
      const activities = cachedData?.activities || [];
      for (const act of activities) {
        const name = (act.activity_name || "").toLowerCase();
        if (!name.includes("sleep")) continue;
        const startMs = new Date(act.timestamp).getTime();
        const endMs = startMs + (act.duration_minutes || 0) * 60 * 1000;
        if (nowMs - endMs >= 0 && nowMs - endMs < WINDOW) {
          const alreadyFired = existingInstances.some(i =>
            i.reminder_id === reminder.id &&
            Math.abs(new Date(i.scheduled_for).getTime() - endMs) < WINDOW
          );
          if (!alreadyFired) return { scheduled_for: new Date(endMs).toISOString() };
        }
      }
      return null;
    }

    if (on === "alter_fronts") {
      const alterId = cfg?.alter_id;
      if (!alterId) return null;
      const delayMs = (cfg?.delay_minutes || 0) * 60 * 1000;
      const lookback = delayMs + 60 * 60 * 1000; // delay + 1h
      const sessions = cachedData?.sessions || [];
      for (const s of sessions) {
        if ((s.alter_id || s.primary_alter_id) !== alterId) continue;
        const createdMs = new Date(s.created_date || s.start_time).getTime();
        if (nowMs - createdMs > lookback) break;
        const fireAt = createdMs + delayMs;
        if (nowMs >= fireAt && nowMs - fireAt < WINDOW) {
          const alreadyFired = existingInstances.some(i =>
            i.reminder_id === reminder.id &&
            Math.abs(new Date(i.scheduled_for).getTime() - fireAt) < WINDOW
          );
          if (!alreadyFired) return { scheduled_for: new Date(fireAt).toISOString() };
        }
      }
      return null;
    }

    if (on === "symptom_logged") {
      const symptomIds = cfg?.symptom_ids || [];
      if (!symptomIds.length) return null;
      const delayMs = (cfg?.delay_minutes || 0) * 60 * 1000;
      const lookback = delayMs + 60 * 60 * 1000;
      const checkIns = cachedData?.symptomCheckIns || [];
      for (const ci of checkIns) {
        if (!symptomIds.includes(ci.symptom_id)) continue;
        const ciMs = new Date(ci.timestamp || ci.created_date).getTime();
        if (nowMs - ciMs > lookback) break;
        const fireAt = ciMs + delayMs;
        if (nowMs >= fireAt && nowMs - fireAt < WINDOW) {
          const alreadyFired = existingInstances.some(i =>
            i.reminder_id === reminder.id &&
            Math.abs(new Date(i.scheduled_for).getTime() - fireAt) < WINDOW
          );
          if (!alreadyFired) return { scheduled_for: new Date(fireAt).toISOString() };
        }
      }
      return null;
    }

    return null;
  }

  if (trigger_type === "event") {
    const when = cfg?.when ? new Date(cfg.when).getTime() : null;
    if (!when) return null;
    const preAlerts = [0, ...(cfg?.pre_alerts || [])];
    for (const offsetMins of preAlerts) {
      const fireAt = when - offsetMins * 60 * 1000;
      if (nowMs >= fireAt && nowMs - fireAt < WINDOW) {
        const alreadyFired = existingInstances.some(i =>
          i.reminder_id === reminder.id &&
          Math.abs(new Date(i.scheduled_for).getTime() - fireAt) < WINDOW
        );
        if (!alreadyFired) return { scheduled_for: new Date(fireAt).toISOString() };
      }
    }
    return null;
  }

  return null;
}

function checkAutoResolveClient(reminder, cachedData, fireTime) {
  const rule = reminder.auto_resolve_rule;
  if (!rule) return false;

  const fireMs = fireTime ? new Date(fireTime).getTime() : Date.now();
  const lookbackMs = (rule.lookback_minutes || 120) * 60 * 1000;
  const windowStart = new Date(fireMs - lookbackMs);

  if (rule.on === "check_in") {
    return (cachedData?.emotionCheckIns || []).some(i => new Date(i.timestamp || i.created_date) >= windowStart);
  }
  if (rule.on === "symptom_checkin") {
    return (cachedData?.symptomCheckIns || []).some(i =>
      i.symptom_id === rule.symptom_id && new Date(i.timestamp || i.created_date) >= windowStart
    );
  }
  if (rule.on === "activity") {
    return (cachedData?.activities || []).some(i =>
      (i.activity_category_ids || []).includes(rule.category_id) && new Date(i.timestamp || i.created_date) >= windowStart
    );
  }
  if (rule.on === "front_update") {
    return (cachedData?.sessions || []).some(i =>
      new Date(i.created_date) >= windowStart || (i.end_time && new Date(i.end_time) >= windowStart)
    );
  }
  return false;
}

// ── main client scheduler ─────────────────────────────────────────────────────

export async function runClientScheduler(queryClient) {
  try {
    const now = new Date();
    const nowMs = now.getTime();

    // Fetch fresh data
    const [reminders, allInstances, settingsList, emotionCheckIns, sessions, activities, symptomCheckIns] =
      await Promise.all([
        base44.entities.Reminder.filter({ is_active: true }),
        base44.entities.ReminderInstance.list("-created_date", 500),
        base44.entities.SystemSettings.list(),
        base44.entities.EmotionCheckIn.list("-created_date", 50),
        base44.entities.FrontingSession.list("-start_time", 20),
        base44.entities.Activity.list("-created_date", 50),
        base44.entities.SymptomCheckIn.list("-created_date", 50),
      ]);

    const activeReminders = (reminders || []).filter(r => {
      if (!r.is_active) return false;
      if (r.end_date && new Date(r.end_date) <= now) return false;
      return true;
    });

    const cutoff = nowMs - 25 * 60 * 60 * 1000;
    const recentInstances = (allInstances || []).filter(i =>
      new Date(i.created_date || 0).getTime() >= cutoff
    );

    const settings = settingsList?.[0] || {};
    if (settings.reminders_paused) return []; // kill switch

    const quietHours = settings.quiet_hours || {};

    // Load alters for archived check and scope check
    const alters = await base44.entities.Alter.list();
    const alterMap = Object.fromEntries((alters || []).map(a => [a.id, a]));
    // Active fronting sessions for alter scope gate
    const activeFrontingSessions = (sessions || []).filter(s => s.is_active);

    const cachedData = { emotionCheckIns, sessions, activities, symptomCheckIns };
    const newInstances = [];

    // Re-fire snoozed instances whose snoozed_until has passed
    const snoozedDue = (allInstances || []).filter(i =>
      i.status === "snoozed" && i.snoozed_until && new Date(i.snoozed_until).getTime() <= nowMs
    );
    for (const inst of snoozedDue) {
      await base44.entities.ReminderInstance.update(inst.id, { status: "fired", fired_at: now.toISOString() });
      newInstances.push({ ...inst, status: "fired" });
    }

    // Check pending catchup instances — fire if their alter is now fronting
    const catchupInstances = (allInstances || []).filter(i =>
      i.status === "pending" && i.pending_note === "waiting_for_alter_front"
    );
    for (const inst of catchupInstances) {
      const reminder = (reminders || []).find(r => r.id === inst.reminder_id);
      if (!reminder?.alter_id) continue;
      // Expire after 24h
      const createdMs = new Date(inst.created_date || 0).getTime();
      if (nowMs - createdMs > 24 * 60 * 60 * 1000) {
        await base44.entities.ReminderInstance.update(inst.id, {
          status: "auto_resolved",
          skipped_reason: "alter_not_fronting",
        });
        continue;
      }
      const isNowFronting = activeFrontingSessions.some(s => {
        if (s.alter_id) return s.alter_id === reminder.alter_id;
        return s.primary_alter_id === reminder.alter_id || (s.co_fronter_ids || []).includes(reminder.alter_id);
      });
      if (isNowFronting) {
        await base44.entities.ReminderInstance.update(inst.id, {
          status: "fired",
          fired_at: now.toISOString(),
          delivery_attempted: ["in_app"],
          pending_note: null,
        });
        newInstances.push({ ...inst, status: "fired" });
      }
    }

    for (const reminder of activeReminders) {
       try {
         // Skip if scoped to an archived alter
         if (reminder.alter_id) {
           const alter = alterMap[reminder.alter_id];
           if (alter?.is_archived) continue;
         }

         const userTz = settings.timezone || 'UTC';
         const due = evaluateReminderDue(reminder, now, recentInstances, cachedData, userTz);
         if (!due) continue;

        const autoResolved = checkAutoResolveClient(reminder, cachedData, due.scheduled_for);
        if (autoResolved) {
          const inst = await base44.entities.ReminderInstance.create({
            reminder_id: reminder.id,
            scheduled_for: due.scheduled_for,
            fired_at: now.toISOString(),
            status: "auto_resolved",
            skipped_reason: "auto_resolved_rule",
            delivery_attempted: [],
          });
          recentInstances.push(inst);
          continue;
        }

        // Alter scope gate — check if alter is fronting
        if (reminder.alter_id && reminder.alter_scope === "when_fronting") {
          const isAlterFronting = activeFrontingSessions.some(s => {
            if (s.alter_id) return s.alter_id === reminder.alter_id;
            return s.primary_alter_id === reminder.alter_id || (s.co_fronter_ids || []).includes(reminder.alter_id);
          });
          if (!isAlterFronting) {
            if (reminder.alter_scope_catchup) {
              // Create a pending catchup instance
              const alreadyPending = (allInstances || []).some(i =>
                i.reminder_id === reminder.id &&
                i.status === "pending" &&
                i.pending_note === "waiting_for_alter_front"
              );
              if (!alreadyPending) {
                const inst = await base44.entities.ReminderInstance.create({
                  reminder_id: reminder.id,
                  scheduled_for: due.scheduled_for,
                  status: "pending",
                  pending_note: "waiting_for_alter_front",
                  delivery_attempted: [],
                });
                recentInstances.push(inst);
              }
            } else {
              // Auto-resolve with skipped reason
              const inst = await base44.entities.ReminderInstance.create({
                reminder_id: reminder.id,
                scheduled_for: due.scheduled_for,
                fired_at: now.toISOString(),
                status: "auto_resolved",
                skipped_reason: "alter_not_fronting",
                delivery_attempted: [],
              });
              await base44.entities.Reminder.update(reminder.id, { last_fired_at: now.toISOString() });
              recentInstances.push(inst);
            }
            continue;
          }
        }

        // Quiet hours — defer
         if (reminder.quiet_hours_respect && quietHours.enabled) {
           const qStart = parseHHMM(quietHours.start || "22:00");
           const qEnd = parseHHMM(quietHours.end || "08:00");
           const userTz = settings.timezone || 'UTC';
           if (inQuietWindow(getCurrentMinutesInZone(now, userTz), qStart, qEnd)) {
             // Compute quiet end in user's timezone
             const userLocalDate = getUserLocalDate(now, userTz);
             const quietEndTime = quietHours.end || "08:00";
             let deferredInstant = zonedFireInstant(userLocalDate, quietEndTime, userTz);
             // If that time has already passed today, defer to tomorrow
             if (deferredInstant <= now) {
               const nextDay = new Date(userLocalDate);
               nextDay.setDate(nextDay.getDate() + 1);
               const nextDayStr = nextDay.toISOString().split('T')[0];
               deferredInstant = zonedFireInstant(nextDayStr, quietEndTime, userTz);
             }
             const inst = await base44.entities.ReminderInstance.create({
               reminder_id: reminder.id,
               scheduled_for: deferredInstant.toISOString(),
               status: "pending",
               delivery_attempted: [],
             });
             recentInstances.push(inst);
             continue;
           }
         }

        const inst = await base44.entities.ReminderInstance.create({
          reminder_id: reminder.id,
          scheduled_for: due.scheduled_for,
          fired_at: now.toISOString(),
          status: "fired",
          delivery_attempted: ["in_app"],
        });

        await base44.entities.Reminder.update(reminder.id, {
          last_fired_at: now.toISOString(),
        });

        recentInstances.push(inst);
        newInstances.push(inst);
      } catch (err) {
        console.warn(`[remindersScheduler] reminder ${reminder.id} error:`, err.message);
      }
    }

    // Invalidate so usePendingReminderInstances refreshes
    if (newInstances.length > 0 && queryClient) {
      queryClient.invalidateQueries({ queryKey: ["reminderInstances", "pending"] });
    }

    return newInstances;
  } catch (err) {
    console.warn("[remindersScheduler] scheduler error:", err.message);
    return [];
  }
}

// ── hook: pending + recently-fired instances ──────────────────────────────────

export function usePendingReminderInstances() {
  return useQuery({
    queryKey: ["reminderInstances", "pending"],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // last hour
      const all = await base44.entities.ReminderInstance.list("-scheduled_for", 200);
      return (all || []).filter(i =>
        (i.status === "fired" || i.status === "pending") &&
        (i.scheduled_for || "") >= cutoff
      );
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

// ── one-time migration: open_route paths → named action types ────────────────

const PATH_TO_ACTION = {
  "/journals": "open_journal",
  "/grounding": "open_grounding",
  "/diary": "open_diary",
  "/timeline": "open_timeline",
  "/todo": "open_todo",
};

export async function runSnoozeOptionsMigration(defaultSnoozeOptions) {
  const FLAG = "reminders_snooze_migration_v1_done";
  if (localStorage.getItem(FLAG)) return;
  try {
    const reminders = await base44.entities.Reminder.list();
    const defaults = defaultSnoozeOptions?.length ? defaultSnoozeOptions : [10, 60, 240, "tomorrow"];
    for (const r of reminders || []) {
      if (!r.snooze_options || !r.snooze_options.length) {
        await base44.entities.Reminder.update(r.id, { snooze_options: defaults });
      }
    }
    localStorage.setItem(FLAG, "1");
  } catch (e) {
    console.warn("[remindersScheduler] snooze migration error:", e.message);
  }
}

export async function runReminderMigration() {
  const FLAG = "reminders_migration_v1_done";
  if (localStorage.getItem(FLAG)) return;
  try {
    const reminders = await base44.entities.Reminder.list();
    for (const r of reminders || []) {
      const actions = r.inline_actions || [];
      let changed = false;
      const migrated = actions.map(a => {
        if (a.action_type !== "open_route") return a;
        const path = a.payload?.path || "";
        // open_set_front detection
        if (path.includes("openSetFront") || path.includes("set_front")) {
          changed = true;
          return { ...a, action_type: "open_set_front", payload: {} };
        }
        const mapped = PATH_TO_ACTION[path] || PATH_TO_ACTION[path.split("?")[0]];
        if (mapped) {
          changed = true;
          return { ...a, action_type: mapped, payload: {} };
        }
        return a;
      });
      if (changed) {
        await base44.entities.Reminder.update(r.id, { inline_actions: migrated });
      }
    }
    localStorage.setItem(FLAG, "1");
  } catch (e) {
    console.warn("[remindersScheduler] migration error:", e.message);
  }
}

// ── hook: mount + interval scheduler ─────────────────────────────────────────

export function useRemindersScheduler() {
  const queryClient = useQueryClient();
  const intervalRef = useRef(null);

  useEffect(() => {
    // Run migrations once
    runReminderMigration();
    base44.entities.SystemSettings.list().then(list => {
      runSnoozeOptionsMigration(list?.[0]?.default_snooze_options);
    }).catch(() => {});
    // Run immediately on mount
    runClientScheduler(queryClient);

    // Run every 60 seconds
    intervalRef.current = setInterval(() => {
      runClientScheduler(queryClient);
    }, 60 * 1000);

    return () => clearInterval(intervalRef.current);
  }, [queryClient]);
}